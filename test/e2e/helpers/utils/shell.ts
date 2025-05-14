import {exec as exec$0} from 'child_process'

const exec = {exec: exec$0}.exec
export function execShellCommand(cmd: string) {
    return new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                reject(error)
            }
            resolve(stdout)
        })
    })
}
