import {readFileSync, writeFileSync} from 'node:fs'

// protobuf-ts 2.x omits extensions, but the compiled server runs as native ESM.
const path = new URL('../lib/wire/wire.ts', import.meta.url)
const source = readFileSync(path, 'utf8')
const updated = source
    .replace(
        /(from ["']\.\.?\/[^"']+)(["'])/g,
        (match, specifier, quote) => /\.(?:js|mjs|json)$/.test(specifier) ? match : `${specifier}.js${quote}`
    )

if (updated !== source) writeFileSync(path, updated)
