import url from 'url'
import util from 'util'
import dns from 'dns/promises'
import {SrvRecord} from 'dns'
import _ from 'lodash'
var srv = Object.create(null)
function groupByPriority(records: SrvRecord[]) {
    return records
        .sort((a, b) => a.priority - b.priority)
        .reduce(function(acc, record) {
            if (acc.length) {
                const last = acc[acc.length - 1]
                if (last[0].priority !== record.priority) {
                    acc.push([record])
                }
                else {
                    last.push(record)
                }
            }
            else {
                acc.push([record])
            }
            return acc
        }, [] as SrvRecord[][])
}
function shuffleWeighted(records: SrvRecord[]) {
    function pick(records: SrvRecord[], sum: number): SrvRecord[] {
        const rand = Math.random() * sum
        let counter = 0
        for (var i = 0, l = records.length; i < l; ++i) {
            counter += records[i].weight
            if (rand < counter) {
                const picked = records.splice(i, 1)
                return picked.concat(pick(records, sum - picked[0].weight))
            }
        }
        return []
    }
    const sorted = records.sort((a, b) => b.weight - a.weight)
    const sum = _.sumBy(records, 'weight')
    return pick(sorted, sum)
}
export const sort = function(records: SrvRecord[]) {
    return groupByPriority(records).flatMap(shuffleWeighted)
}
export const resolve = async function(domain: string) {
    const parsedUrl = URL.parse(domain)
    if (!parsedUrl || !parsedUrl.protocol) {
        return Promise.reject(
            new Error(util.format('Must include protocol in "%s"', domain))
        )
    }
    if (/^srv\+/.test(parsedUrl.protocol)) {
        parsedUrl.protocol = parsedUrl.protocol.slice(4)
        const resolved = await dns.resolveSrv(parsedUrl.hostname)
        const records = sort(resolved)
        return records.map(function(record) {
            parsedUrl.host = util.format('%s:%d', record.name, record.port)
            parsedUrl.hostname = record.name
            parsedUrl.port = record.port.toString()
            return {...record, url: url.format(parsedUrl)}
        })
    }
    else {
        return Promise.resolve([
            {
                url: domain,
                name: parsedUrl.hostname,
                port: parsedUrl.port,
            },
        ])
    }
}
export const attempt = <R extends Array<unknown>>(
    records: R,
    fn: (record: R[0]) => Promise<unknown> | unknown
) => {
    async function next(i: number) {
        if (i >= records.length) {
            throw new Error('No more records left to try')
        }
        try {
            await fn(records[i])
        }
        catch (err) {
            next(i + 1)
        }
    }
    return next(0)
}
export default {
    sort,
    resolve,
    attempt,
}
