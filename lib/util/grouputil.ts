import util from 'util'
import semver from 'semver' // @ts-ignore
import minimatch from 'minimatch' // TODO: update
import wire from '../wire/index.js'

export class RequirementMismatchError extends Error {
    constructor(name: string) {
        super()
        this.name = 'RequirementMismatchError'
        this.message = util.format('Requirement mismatch for "%s"', name)
        Error.captureStackTrace(this, RequirementMismatchError)
    }
}

export class AlreadyGroupedError extends Error {
    constructor() {
        super()
        this.name = 'AlreadyGroupedError'
        this.message = 'Already a member of another group'
        Error.captureStackTrace(this, AlreadyGroupedError)
    }
}

export class NoGroupError extends Error {
    constructor() {
        super()
        this.name = 'NoGroupError'
        this.message = 'Not a member of any group'
        Error.captureStackTrace(this, NoGroupError)
    }
}

enum RequirementType {
    SEMVER = 1,
    GLOB,
    EXACT
}

interface Requirements {
    name: string
    value: string
    type: RequirementType
}

export const match = async(capabilities: any, requirements: Requirements[]) => {
    return requirements.every((req) => {
        const capability = capabilities[req.name]
        if (!capability) {
            throw new RequirementMismatchError(req.name)
        }

        switch (req.type) {
        case wire.RequirementType.SEMVER:
            if (!semver.satisfies(capability, req.value)) {
                throw new RequirementMismatchError(req.name)
            }
            break
        case wire.RequirementType.GLOB:
            if (!minimatch(capability, req.value)) {
                throw new RequirementMismatchError(req.name)
            }
            break
        case wire.RequirementType.EXACT:
            if (capability !== req.value) {
                throw new RequirementMismatchError(req.name)
            }
            break
        default:
            throw new RequirementMismatchError(req.name)
        }
        return true
    })
}
