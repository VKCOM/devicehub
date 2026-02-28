import logger from './logger.js'
import * as procutil from './procutil.js'
import { ChildProcess } from 'node:child_process'

/**
 * Resource pool for managing reusable resources (e.g., ports)
 */
export class ResourcePool<T> {
    private available: T[]

    constructor(resources: T[]) {
        this.available = [...resources]
    }

    // Allocate resources from the pool
    allocate(count: number): T[] | null {
        if (this.available.length < count) {
            return null
        }
        return this.available.splice(0, count)
    }

    // Return resources back to the pool
    release(resources: T[]): void {
        this.available.push(...resources)
    }

    // Get the number of available resources
    get availableCount(): number {
        return this.available.length
    }
}

export type ProcessState = 'waiting' | 'starting' | 'running'

export interface HealthCheckConfig {
    startupTimeoutMs: number
}

/**
 * Callbacks for process lifecycle events
 */
export interface ProcessCallbacks<TContext = {}, TResources = any> {
    onReady?: (id: string, context: TContext) => void | Promise<void>

    onError?: (id: string, context: TContext, error: Error) => void | Promise<void>

    // Called before process cleanup
    onCleanup?: (id: string, context: TContext) => void | Promise<void>

    // Factory function to spawn the actual child process
    spawn: (id: string, context: TContext, resources: TResources[]) => ChildProcess | Promise<ChildProcess>
}

export interface ManagedProcess<TContext, TResources> {
    id: string
    state: ProcessState
    startTime: number
    context: TContext
    resources: TResources[]

    // Safe timer - self-clear on process remove or state changes
    timer?: NodeJS.Timeout
}

export interface ProcessStats {
    total: number
    waiting: string[]
    starting: string[]
    running: string[]
}

/**
 * Generic process manager that handles process lifecycle, state management, and resource allocation
 */
export class ProcessManager<TContext = any, TResources = any> {
    private log = logger.createLogger('process-manager')
    private processes = new Map<string, ManagedProcess<TContext, TResources>>()
    private callbacks: ProcessCallbacks<TContext, TResources>
    private killTimeout: number
    private healthCheckConfig?: HealthCheckConfig
    private resourcePool?: ResourcePool<TResources>

    constructor(
        callbacks: ProcessCallbacks<TContext, TResources>,
        options: {
            killTimeout: number
            healthCheckConfig?: HealthCheckConfig
            resourcePool?: ResourcePool<TResources>
        }
    ) {
        this.callbacks = callbacks
        this.killTimeout = options.killTimeout
        this.healthCheckConfig = options.healthCheckConfig
        this.resourcePool = options.resourcePool
    }

    // Create a new managed process
    async create(
        id: string,
        context: TContext,
        options: {
            initialState?: ProcessState
            resourceCount?: number
        } = {}
    ) {
        if (this.processes.has(id)) {
            this.log.warn('Process "%s" already exists', id)
            return false
        }

        // Allocate resources if pool is available
        let resources: TResources[] = []
        if (this.resourcePool && options.resourceCount) {
            const allocated = this.resourcePool.allocate(options.resourceCount)
            if (!allocated) {
                // TODO: emit resource allocation error event
                this.log.error(`Failed to allocate ${options.resourceCount} resources for process "${id}"`)
                return null
            }
            resources = allocated
        }

        const process: ManagedProcess<TContext, TResources> = {
            id,
            state: options.initialState || 'waiting',
            startTime: Date.now(),
            context,
            resources
        }

        this.processes.set(id, process)
        this.log.info('Created process "%s" with state "%s"', id, process.state)

        return process
    }

    // Start a process (spawn child process)
    async start(id: string, force = false): Promise<boolean> {
        const process = this.processes.get(id)
        if (!process) {
            this.log.error('Process "%s" not found', id)
            return false
        }

        if (!force && process.state === 'running') {
            this.log.warn('Process "%s" is already running', id)
            return true
        }

        if (process.timer) {
            clearTimeout(process.timer)
            process.timer = undefined
        }

        this.log.info('Starting process "%s"', id)
        process.state = 'starting'
        process.startTime = Date.now()

        return new Promise<boolean>(async(resolve) => {
            let childProcess: ChildProcess | null = null
            let isResolved = false

            const resolveOnce = (value: boolean) => {
                if (!isResolved) {
                    isResolved = true
                    resolve(value)
                }
            }

            const cleanup = () => {
                if (childProcess) {
                    childProcess.removeAllListeners('exit')
                    childProcess.removeAllListeners('error')
                    childProcess.removeAllListeners('message')
                }
            }

            const handleError = async (err: any) => {
                this.log.error('Process "%s" error: %s', id, err.message)
                cleanup()

                if (this.callbacks.onError) {
                    await this.callbacks.onError(id, process.context, err)
                }

                // Check if process still exists (might have been removed)
                if (!this.processes.has(id)) {
                    resolveOnce(false)
                    return
                }

                // Handle exit errors with restart logic
                if (err instanceof procutil.ExitError) {
                    this.log.error('Process "%s" died with code %s', id, err.code)
                    this.log.info('Restarting process "%s" in 2 seconds', id)

                    await new Promise(r => setTimeout(r, 2000))

                    if (!this.processes.has(id)) {
                        this.log.info('Restart of process "%s" cancelled (process removed)', id)
                        resolveOnce(false)
                        return
                    }

                    // Restart the process
                    this.start(id, true).then(resolveOnce)
                    return
                }

                resolveOnce(false)
            }

            const handleReady = async () => {
                const currentProcess = this.processes.get(id)
                if (!currentProcess) {
                    resolveOnce(false)
                    return
                }

                if (currentProcess.timer) {
                    clearTimeout(currentProcess.timer)
                    currentProcess.timer = undefined
                }

                currentProcess.state = 'running'
                this.log.info('Process "%s" is now running', id)

                if (this.callbacks.onReady) {
                    await this.callbacks.onReady(id, currentProcess.context)
                }

                resolveOnce(true)
            }

            try {
                // Spawn the child process
                childProcess = await this.callbacks.spawn(id, process.context, [...process.resources])
                this.log.info('Spawned process "%s"', id)

                // Set up event listeners
                childProcess.on('exit', (code?: number, signal?: string) => {
                    cleanup()

                    // TODO: if (isResolved) then emit error
                    if (signal) {
                        this.log.warn('Process "%s" was killed with signal %s', id, signal)
                        resolveOnce(false)
                        return
                    }

                    if (code === 0) {
                        this.log.info('Process "%s" stopped cleanly', id)
                        resolveOnce(true)
                    } else {
                        handleError(new procutil.ExitError(code))
                    }
                })

                childProcess.on('error', (err: Error) => {
                    handleError(err)
                })

                const messageHandler = (message: string) => {
                    if (message === 'ready') {
                        handleReady()
                        childProcess?.removeListener('message', messageHandler)
                    } else {
                        this.log.warn('Unknown message from process "%s": "%s"', id, message)
                    }
                }

                childProcess.on('message', messageHandler)

                // Store kill function for later
                const originalChildProcess = childProcess
                this.updateTerminateHandler(id, async () => {
                    cleanup()
                    this.log.info('Gracefully killing process "%s"', id)
                    await procutil.gracefullyKill(originalChildProcess, this.killTimeout)
                })
            } catch (err: any) {
                this.log.error('Failed to spawn process "%s": %s', id, err.message)
                resolveOnce(false)
            }
        })
    }

    /**
     * Update the terminate handler for a process.
     * We don't expose the property via TypeScript API,
     * so we access a "non-existent" property.
     */
    private updateTerminateHandler(id: string, handler: () => Promise<void>): void {
        const process = this.processes.get(id)
        if (process) {
            (process as any).terminateHandler = handler
        }
    }

    // Stop a process
    async stop(id: string): Promise<void> {
        const process = this.processes.get(id)
        if (!process) {
            this.log.warn('Process "%s" not found, cannot stop', id)
            return
        }

        this.log.info('Stopping process "%s"', id)

        await this.callbacks.onCleanup?.(id, process.context)

        // Call the terminate handler if available
        // We don't expose the property via TypeScript API, so we access a "non-existent" property.
        ;(process as any).terminateHandler?.()
    }

    // Remove a process and release its resources
    async remove(id: string): Promise<void> {
        const process = this.processes.get(id)
        if (!process) {
            this.log.warn('Process "%s" not found, cannot remove', id)
            return
        }

        // Stop the process first
        await this.stop(id)

        // Clear any timers
        if (process.timer) {
            clearTimeout(process.timer)
            process.timer = undefined
        }

        // Release resources
        if (this.resourcePool && process.resources.length > 0) {
            this.resourcePool.release(process.resources)
            this.log.info(`Released ${process.resources.length} resources from process "${id}"`)
        }

        // Remove from map
        this.processes.delete(id)
        this.log.info('Removed process "%s"', id)
    }

    // Get a process by ID
    get(id: string): ManagedProcess<TContext, TResources> | undefined {
        return this.processes.get(id)
    }

    // Check if a process exists
    has(id: string): boolean {
        return this.processes.has(id)
    }

    // Update process state
    setState(id: string, state: ProcessState): void {
        const process = this.processes.get(id)
        if (process) {
            if (process.timer) {
                clearTimeout(process.timer)
                process.timer = undefined
            }

            process.state = state
            if (state === 'starting' || state === 'waiting') {
                process.startTime = Date.now()
            }
        }
    }

    // Set a safe timer for a process
    setTimer(id: string, timer: NodeJS.Timeout): void {
        const process = this.processes.get(id)
        if (process) {
            if (process.timer) {
                clearTimeout(process.timer)
            }
            process.timer = timer
        }
    }

    // Clear a safe timer for a process
    clearTimer(id: string): void {
        const process = this.processes.get(id)
        if (process?.timer) {
            clearTimeout(process.timer)
            process.timer = undefined
        }
    }

    // Get statistics about all processes
    getStats(): ProcessStats {
        const stats: ProcessStats = {
            total: this.processes.size,
            waiting: [],
            starting: [],
            running: []
        }

        for (const [id, process] of this.processes.entries()) {
            if (process.state === 'running') {
                stats.running.push(id)
            } else if (process.state === 'starting') {
                stats.starting.push(id)
            } else {
                stats.waiting.push(id)
            }
        }

        return stats
    }

    // Check health of all processes and return stuck process IDs
    checkHealth(): string[] {
        if (!this.healthCheckConfig) {
            return []
        }

        const now = Date.now()
        const stuckProcesses: string[] = []

        for (const [id, process] of this.processes.entries()) {
            if (
                process.state === 'starting' &&
                (now - process.startTime) > this.healthCheckConfig.startupTimeoutMs
            ) {
                this.log.warn(
                    'Process "%s" has been stuck in starting state for %s ms',
                    id,
                    now - process.startTime
                )
                stuckProcesses.push(id)
            }
        }

        return stuckProcesses
    }

    // Stop and remove all processes
    async cleanup(): Promise<void> {
        this.log.info('Cleaning up all processes')

        const ids = Array.from(this.processes.keys())
        await Promise.all(ids.map(id => this.remove(id)))

        this.log.info('All processes cleaned up')
    }

    get count(): number {
        return this.processes.size
    }

    get ids(): string[] {
        return Array.from(this.processes.keys())
    }
}
