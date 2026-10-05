import {describe, expect, it} from 'vitest'
import {readFileSync, existsSync} from 'node:fs'
import {resolve, dirname, extname} from 'node:path'

describe('worker architecture', () => {
    it.each(['device', 'ios-device'])('%s has no direct or transitive Mongo dependency', worker => {
        const queue = [resolve(`lib/units/${worker}/index.ts`)]
        const visited = new Set<string>()
        while (queue.length) {
            const source = queue.shift()!
            if (visited.has(source)) continue
            visited.add(source)
            const imports = readFileSync(source, 'utf8').matchAll(/(?:\bfrom\s*|\brequire\(\s*|\bimport\s*\(\s*|\bimport\s*)['"]([^'"]+)['"]/g)
            for (const [, name] of imports) {
                expect(name, `DB dependency from ${source}`).not.toMatch(/^(mongodb|mongoose)$|\/db\//)
                if (!name.startsWith('.')) continue
                const target = resolve(dirname(source), name)
                const candidates = [target, target.replace(/\.js$/, '.ts'), `${target}/index.ts`, `${target}/index.js`]
                if (!extname(target)) candidates.push(`${target}.ts`, `${target}.js`)
                const found = candidates.find(file => /\.[cm]?[jt]sx?$/.test(file) && existsSync(file))
                if (found) queue.push(found)
            }
        }
        expect(visited.size).toBeGreaterThan(30)
    })
})
