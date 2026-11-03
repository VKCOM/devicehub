import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import type {AddressInfo} from 'node:net'
import type {Server} from 'node:http'

vi.mock('../../../../lib/db/api.js', () => ({
    default: {
        loadUser: vi.fn(),
        loadAccessTokenById: vi.fn()
    }
}))

import dbapi from '../../../../lib/db/api.js'
import * as jwtutil from '../../../../lib/util/jwtutil.js'
import {createApp} from '../../../../lib/units/storage/s3.js'

const secret = 'secret'
const user = {email: 'user@example.com', name: 'User', privilege: 'user'}

describe('S3 storage unit', () => {
    let server: Server
    let base: string
    const s3 = {getObject: vi.fn(), putObject: vi.fn()}

    beforeEach(async() => {
        vi.mocked(dbapi.loadUser).mockResolvedValue(user)
        s3.getObject.mockReset().mockResolvedValue({ContentType: 'text/plain', Body: 'content'})
        s3.putObject.mockReset().mockResolvedValue({})

        const app = createApp({
            profile: 'default',
            bucket: 'bucket',
            maxFileSize: 1024,
            port: 0,
            secret
        }, s3 as any)
        server = app.listen(0)
        await new Promise(resolve => server.once('listening', resolve))
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    })

    afterEach(() => new Promise<void>(resolve => server.close(() => resolve())))

    it('does not hand out a file without a token', async() => {
        const res = await fetch(`${base}/s/blob/id/name`)

        expect(res.status).toBe(401)
        expect(s3.getObject).not.toHaveBeenCalled()
    })

    it('does not store a file without a token', async() => {
        const form = new FormData()
        form.append('file', new Blob(['content']), 'file.txt')
        const res = await fetch(`${base}/s/upload/blob`, {method: 'POST', body: form})

        expect(res.status).toBe(401)
        expect(s3.putObject).not.toHaveBeenCalled()
    })

    it('hands out a file to a logged in user', async() => {
        const jwt = jwtutil.encode({payload: {email: user.email, name: user.name}, secret})
        const res = await fetch(`${base}/s/blob/id/name`, {headers: {Authorization: `Bearer ${jwt}`}})

        expect(res.status).toBe(200)
        expect(await res.text()).toBe('content')
        expect(s3.getObject).toHaveBeenCalledWith({Key: 'id', Bucket: 'bucket'})
    })
})
