import EventEmitter from 'events'
import fs from 'fs'
import {v4 as uuidv4} from 'uuid'

class Storage extends EventEmitter {
    constructor() {
        super()
        this.files = {}
        this.timer = setInterval(() => this.check(), 60000)
    }

    store(file) {
        const id = uuidv4()
        this.set(id, file)
        return id
    }

    set(id, file) {
        this.files[id] = {
            timeout: 600000,
            lastActivity: Date.now(),
            data: file
        }
        return file
    }

    remove(id) {
        const file = this.files[id]
        if (file) {
            delete this.files[id]
            fs.unlink(file.data.path, () => {})
        }
    }

    retrieve(id) {
        const file = this.files[id]
        if (file) {
            file.lastActivity = Date.now()
            return file.data
        }
        return null
    }

    check() {
        const now = Date.now()
        Object.keys(this.files).forEach(id => {
            const file = this.files[id]
            const inactivePeriod = now - file.lastActivity
            if (inactivePeriod >= file.timeout) {
                this.remove(id)
                this.emit('timeout', id, file.data)
            }
        })
    }

    stop() {
        clearInterval(this.timer)
    }
}

export default Storage
