import timeutil from '../../../util/timeutil.js'
import apiutil from '../../../util/apiutil.js'
import wireutil from '../../../wire/util.js'
import wire from '../../../wire/index.js'
import dbapi from '../../api.js'
import {WireRouter} from '../../../wire/router.js'

class UserChangeHandler {

    isPrepared = false

    init(pushdev) {
        this.pushdev = pushdev
        this.isPrepared = !!this.pushdev
    }

}

// Temporary solution needed to avoid situations
// where a unit may not initialize the change handler,
// but use the db module. In this case, any methods of this handler
// do nothing and will not cause an error.
/** @type {UserChangeHandler} */
export default new Proxy(new UserChangeHandler(), {

    /** @param {string} prop */
    get(target, prop) {
        if (target.isPrepared || prop === 'init' || typeof target[prop] !== 'function') {
            return target[prop]
        }

        return () => {}
    }
})
