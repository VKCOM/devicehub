import { getControlLogsRoute, getControlRoute } from '@/constants/route-paths'

import { isSamePath } from './is-same-path.util'

describe('isSamePath util', () => {
  it('matches a silent control route opened by an unencoded link', () => {
    expect(isSamePath('/silent-control/my provider/127.0.0.1:5557', getControlRoute('127.0.0.1:5557', 'my provider'))).toBe(
      true
    )
  })

  it('matches differently encoded segments', () => {
    expect(isSamePath('/silent-control/p/127.0.0.1%3a5557/logs', getControlLogsRoute('127.0.0.1:5557', 'p'))).toBe(true)
  })

  it('does not treat an encoded slash as a separator', () => {
    expect(isSamePath('/control/a%2Fb', '/control/a/b')).toBe(false)
  })

  it('tells different routes apart', () => {
    expect(isSamePath('/silent-control/p/s/logs', getControlRoute('s', 'p'))).toBe(false)
  })

  it('keeps malformed encoding as is', () => {
    expect(isSamePath('/control/100%/x', '/control/100%25/x')).toBe(true)
    expect(isSamePath('/control/%E0%A4%A', '/control/x')).toBe(false)
  })
})
