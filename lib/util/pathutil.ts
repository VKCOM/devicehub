import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'
import { existsSync } from 'fs'
import util from 'util'
import {PathLike} from "node:fs";

export function findProjectRoot(startPath: string) {
    let currentPath = startPath

    while (currentPath !== '/') {
        if (existsSync(join(currentPath, 'README.md'))) {
            return currentPath
        }
        currentPath = dirname(currentPath)
    }

    throw new Error('Could not find project root')
}

export const projectRoot = findProjectRoot(dirname(fileURLToPath(import.meta.url)))

export function root(target: string) {
    return resolve(projectRoot, target)
}

export function reactFrontend(target: string) {
    return resolve(projectRoot, 'ui', target)
}

export function vendor(target: string) {
    return resolve(projectRoot, 'vendor', target)
}

export function module(target: string) {
    return resolve(projectRoot, 'node_modules', target)
}

export function match(candidates: PathLike[]) {
    for (let i = 0, l = candidates.length; i < l; ++i) {
        if (existsSync(candidates[i])) {
            return candidates[i]
        }
    }
    return undefined
}

export function requiredMatch(candidates: PathLike[]) {
    let matched = match(candidates)
    if(matched !== undefined) {
        return matched
    }
    else {
        throw new Error(util.format(
            'At least one of these paths should exist: %s'
            , candidates.join(', ')
        ))
    }
}
