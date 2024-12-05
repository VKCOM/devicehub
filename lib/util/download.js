import fs from 'node:fs'
import request from 'postman-request'
import * as temp from 'temp'
export default (async function download(url, options, headers) {
    const path = temp.path(options)
    return new Promise((resolve, reject) => {
        request(url, {headers}, (error, response, body) => {
            if (error || (response && response.statusCode >= 400)) {
                reject(error || (response.text))
            }
            else {
                resolve({
                    path: path
                })
            }
        }).pipe(fs.createWriteStream(path))
    })
})
