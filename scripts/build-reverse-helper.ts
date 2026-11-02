/**
 * Build vendor/devicehub-reverse/devicehub-reverse.jar, the device side of
 * `adb reverse` for remote connect (lib/units/device/resources/reverse.ts), from
 * its Java source next to it.
 *
 *   node_modules/.bin/tsx scripts/build-reverse-helper.ts
 *
 * Needs a JDK (javac, jar) and the Android SDK: ANDROID_HOME or
 * ANDROID_SDK_ROOT, else ~/Library/Android/sdk or ~/Android/Sdk. The output is a
 * dex jar for app_process, built for the oldest Android d8 supports.
 */

import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const helper = path.join(root, 'vendor/devicehub-reverse')
const output = path.join(helper, 'devicehub-reverse.jar')

const sdk = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), 'Library/Android/sdk'), path.join(os.homedir(), 'Android/Sdk')]
    .find(dir => dir && fs.existsSync(dir))
if (!sdk) {
    throw new Error('Android SDK not found; set ANDROID_HOME')
}

/** The newest installed version under `dir`, by numeric order of its parts */
const newest = (dir: string, filter: (name: string) => boolean = () => true) => {
    const names = fs.readdirSync(dir).filter(filter)
    const key = (name: string) => name.replace(/^\D+/, '').split('.').map(Number)
    names.sort((a, b) => {
        const [x, y] = [key(a), key(b)]
        for (let i = 0; i < Math.max(x.length, y.length); i++) {
            if ((x[i] ?? 0) !== (y[i] ?? 0)) {
                return (x[i] ?? 0) - (y[i] ?? 0)
            }
        }
        return 0
    })
    if (!names.length) {
        throw new Error(`Nothing installed in ${dir}`)
    }
    return path.join(dir, names.at(-1)!)
}

const androidJar = path.join(newest(path.join(sdk, 'platforms'), name => name.startsWith('android-')), 'android.jar')
const d8 = path.join(newest(path.join(sdk, 'build-tools')), 'd8')

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'devicehub-reverse-'))
try {
    const classes = path.join(work, 'classes')
    const sources = fs.readdirSync(path.join(helper, 'src'), {recursive: true, encoding: 'utf8'})
        .filter(file => file.endsWith('.java'))
        .map(file => path.join(helper, 'src', file))
    // Java 8 bytecode: what d8 desugars for every Android release
    execFileSync('javac', ['--release', '8', '-Xlint:-options', '-classpath', androidJar,
        '-d', classes, ...sources], {stdio: 'inherit'})
    const classFiles = fs.readdirSync(classes, {recursive: true, encoding: 'utf8'})
        .filter(file => file.endsWith('.class'))
        .map(file => path.join(classes, file))
    // --min-api 9: app_process and every API used here are older than that
    execFileSync(d8, ['--release', '--min-api', '9', '--lib', androidJar,
        '--output', output, ...classFiles], {stdio: 'inherit'})
    console.log(`Built ${path.relative(root, output)} (${fs.statSync(output).size} bytes)`)
}
finally {
    fs.rmSync(work, {recursive: true, force: true})
}
