// Downloads the scrcpy server used by `--need-scrcpy` and checks its SHA-256.
// Usage: node scripts/fetch-scrcpy-server.mjs
import {createHash} from 'node:crypto'
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {
    SCRCPY_SERVER_PATH,
    SCRCPY_SERVER_SHA256,
    SCRCPY_SERVER_URL
} from '../lib/units/device/resources/scrcpy-release.js'

const target = resolve(dirname(fileURLToPath(import.meta.url)), '..', SCRCPY_SERVER_PATH)
const sha256 = data => createHash('sha256').update(data).digest('hex')

if (existsSync(target) && sha256(readFileSync(target)) === SCRCPY_SERVER_SHA256) {
    console.log(`${SCRCPY_SERVER_PATH} is up to date`)
    process.exit(0)
}

console.log(`Downloading ${SCRCPY_SERVER_URL}`)
const res = await fetch(SCRCPY_SERVER_URL)
if (!res.ok) {
    console.error(`Download failed: HTTP ${res.status}`)
    process.exit(1)
}

const data = Buffer.from(await res.arrayBuffer())
const actual = sha256(data)
if (actual !== SCRCPY_SERVER_SHA256) {
    console.error(`Checksum mismatch: expected ${SCRCPY_SERVER_SHA256}, got ${actual}`)
    process.exit(1)
}

mkdirSync(dirname(target), {recursive: true})
writeFileSync(target, data)
console.log(`Saved ${SCRCPY_SERVER_PATH}`)
