import logger from '../../util/logger.js'
import _ from 'lodash'

const readyModules = []
const preparingModules = []

const log = logger.createLogger('device:readyness')

const printReadyness = () => {
    log.info(`Modules ready: ${readyModules}`)
    log.info(`Modules not ready: ${_.difference(preparingModules, readyModules)}`)
}

export const trackModuleReadyness = (name, module) => {
    const origBody = module.body
    module.body = async(...args) => {
        preparingModules.push(name)
        printReadyness()
        const res = await origBody(...args)
        readyModules.push(name)
        printReadyness()
        return res
    }
    return module
}
