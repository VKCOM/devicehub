import syrup from '@devicefarmer/stf-syrup'
import {WireRouter} from '../../../wire/router.js'
import transport from './transport.js'
export default syrup.serial()
    .dependency(transport)
    .define((options, transport) => {
        const router = new WireRouter()
        transport.on('message', router.handler())
        return router
    })
