import ipaddr from 'ipaddr.js'
function checkManyCIDR(addr, range) {
    if (typeof (range) === 'string') {
        return checkSingleCIDR(addr, range)
    }
    else if (typeof (range) === 'object') {
        for (let i = 0; i < range.length; i++) {
            if (checkSingleCIDR(addr, range[i])) {
                return true
            }
        }
        return false
    }
}
function checkSingleCIDR(addr, cidr) {
    try {
        let parsedAddr = ipaddr.process(addr)
        if (cidr.indexOf('/') === -1) {
            let parsedCIDRasIP = ipaddr.process(cidr)
            if ((parsedAddr.kind() === 'ipv6') && (parsedCIDRasIP.kind() === 'ipv6')) {
                return (parsedAddr.toNormalizedString() === parsedCIDRasIP.toNormalizedString())
            }
            return (parsedAddr.toString() === parsedCIDRasIP.toString())
        }
        else {
            let parsedRange = ipaddr.parseCIDR(cidr)
            return parsedAddr.match(parsedRange)
        }
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.log(e)
        return false
    }
}
export default checkManyCIDR
