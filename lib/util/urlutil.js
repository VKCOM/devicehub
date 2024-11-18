import url from 'url'
export const addParams = function(originalUrl, params) {
    var parsed = url.parse(originalUrl, true)
    parsed.search = null
    for (const [key, value] of Object.entries(params)) {
        parsed.query[key] = value
    }
    return url.format(parsed)
}
export const removeParam = function(originalUrl, param) {
    var parsed = url.parse(originalUrl, true)
    parsed.search = null
    delete parsed.query[param]
    return url.format(parsed)
}
