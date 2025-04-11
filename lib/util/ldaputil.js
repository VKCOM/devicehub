import util from 'util'
import ldap from 'ldapjs'
import Promise from 'bluebird'
function InvalidCredentialsError(user) {
    Error.call(this, util.format('Invalid credentials for user "%s"', user))
    this.name = 'InvalidCredentialsError'
    this.user = user
    Error.captureStackTrace(this, InvalidCredentialsError)
}
util.inherits(InvalidCredentialsError, Error)
export const login = function(options, username, password) {
    function tryConnect() {
        var resolver = Promise.defer()
        var client = ldap.createClient({
            url: options.url
            , timeout: options.timeout
            , maxConnections: 1
        })
        if (options.bind.dn) {
            client.bind(options.bind.dn, options.bind.credentials, function(err) {
                if (err) {
                    resolver.reject(err)
                }
                else {
                    resolver.resolve(client)
                }
            })
        }
        else {
            resolver.resolve(client)
        }
        return resolver.promise
    }
    function tryFind(client) {
        var resolver = Promise.defer()
        var query = {
            scope: options.search.scope
            , filter: new ldap.AndFilter({
                filters: [
                    new ldap.EqualityFilter({
                        attribute: 'objectClass'
                        , value: options.search.objectClass
                    })
                    , new ldap.EqualityFilter({
                        attribute: options.search.field
                        , value: username
                    })
                ]
            })
        }
        if (options.search.filter) {
            var parsedFilter = ldap.parseFilter(options.search.filter)
            query.filter.filters.push(parsedFilter)
        }
        client.search(options.search.dn, query, function(err, search) {
            if (err) {
                return resolver.reject(err)
            }
            function entryListener(entry) {
                resolver.resolve(entry)
            }
            function endListener() {
                resolver.reject(new InvalidCredentialsError(username))
            }
            function errorListener(err) {
                resolver.reject(err)
            }
            search.on('searchEntry', entryListener)
            search.on('end', endListener)
            search.on('error', errorListener)
            resolver.promise.finally(function() {
                search.removeListener('searchEntry', entryListener)
                search.removeListener('end', endListener)
                search.removeListener('error', errorListener)
            })
        })
        return resolver.promise
    }
    function findUserGroups(client, userDN) {
        const resolver = Promise.defer()

        const groupFilter = new ldap.OrFilter({
            filters: [
                new ldap.EqualityFilter({
                    attribute: 'member'
                    , value: userDN
                })
                , new ldap.EqualityFilter({
                    attribute: 'uniqueMember'
                    , value: userDN
                })
            ]
        })

        const rootDN = options.search.dn.split(',').reduce((result, part) => {
            if (part.toLowerCase().startsWith('dc=')) {
                result.push(part)
            }
            return result
        }, []).join(',')

        const groupsSearchBase = rootDN || options.search.dn

        const groupQuery = {
            scope: 'sub'
            , filter: groupFilter
        }

        client.search(groupsSearchBase, groupQuery, function(err, search) {
            if (err) {
                resolver.resolve([])
                return
            }

            const groups = []
            search.on('searchEntry', entry => groups.push(entry.object.dn))
            search.on('end', () => resolver.resolve(groups))
            search.on('error', () => resolver.resolve(groups))

            resolver.promise.finally(function() {
                search.removeAllListeners('searchEntry')
                search.removeAllListeners('end')
                search.removeAllListeners('error')
            })
        })

        return resolver.promise
    }
    function tryBind(client, entry) {
        return new Promise(function(resolve, reject) {
            client.bind(entry.object.dn, password, async(err) => {
                if (err) {
                    reject(new InvalidCredentialsError(username))
                    return
                }

                try {
                    const groups = await findUserGroups(client, entry.object.dn)
                    resolve({...entry.object, memberOf: groups})
                }
                catch (err) {
                    resolve(entry.object)
                }
            })
        })
    }
    return tryConnect().then((client) => tryFind(client)
        .then(function(entry) {
            return tryBind(client, entry)
        })
        .then(function(userWithGroups) {
            if (!userWithGroups.memberOf && userWithGroups.groups) {
                userWithGroups.memberOf = userWithGroups.groups
                delete userWithGroups.groups
            }
            return userWithGroups
        })
        .finally(function() {
            client.unbind()
        }))
}
export const email = function(user) {
    const userEmail = user.mail || user.email || user.userPrincipalName
    if (userEmail) {
        return userEmail
    }

    // If an LDAP user does not have a mail, we try to make one up.
    // A unique email must be specified for all users.
    let username

    if (user.uid) {
        username = Array.isArray(user.uid) ? user.uid[user.uid.length - 1] : user.uid
    }
    else if (user.cn) {
        username = Array.isArray(user.cn) ? user.cn[user.cn.length - 1] : user.cn
    }
    else {
        const dnMatch = (user.dn || '').match(/cn=([^,]+)/i)
        username = dnMatch ? dnMatch[1] : Math.random().toString(20).substring(2, 8)
    }

    return `${username}@ldap.ru`
}

export const determinePrivilege = function(user, privilegeMapping) {
    if (!privilegeMapping || !Object.keys(privilegeMapping)?.length || !user.memberOf) {
        return 'user'
    }

    const normalizedMapping = {}
    for (const key in privilegeMapping) {
        normalizedMapping[key.toLowerCase()] = privilegeMapping[key]
    }

    const memberOf = Array.isArray(user.memberOf) ? user.memberOf : [user.memberOf]

    for (const dn of memberOf) {
        const cnMatch = dn.match(/cn=([^,]+)/i)
        const groupCN = cnMatch ? cnMatch[1].toLowerCase() : ''

        if (groupCN && normalizedMapping[groupCN] === 'admin') {
            return 'admin'
        }
    }

    return 'user'
}

export {InvalidCredentialsError}
