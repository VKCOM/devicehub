import logger from '../../util/logger.js'
import _ from 'lodash'

const readyModules: string[] = []
const preparingModules: any[] = []

const log = logger.createLogger('device:readyness')

const printReadyness = () => {
    log.info(`Modules ready: ${readyModules}`)
    log.info(`Modules not ready: ${_.difference(preparingModules, readyModules)}`)
}

export const trackModuleReadyness = <T extends {}>(name: string, module: T): T => { // @ts-ignore
    const origBody = module.body // @ts-ignore
    module.body = async(...args: any[]) => {
        preparingModules.push(name)
        printReadyness()

        const res = await origBody(...args)
        readyModules.push(name)
        printReadyness()
        return res
    }
    return module
}
