export async function generateToken() {
    const mockUrl = 'http://localhost:7100/auth/api/v1/mock'
    const body = {
        name: 'administrator'
        , email: 'administrator@fakedomain.com'
    }

    const mockResponse = await fetch(mockUrl, {
        method: 'POST'
        , headers: {
            'Content-Type': 'application/json',
        }
        , body: JSON.stringify(body)
    })

    if (!mockResponse.ok) {
        throw new Error(`Ошибка запроса mockUrl: статус ${mockResponse.status}`)
    }

    let respJwt = await mockResponse.json()

    const jwt = respJwt.jwt

    const tokenUrl = 'http://localhost:7100/api/v1/user/accessTokens?title="tokenTitle"'
    const tokenResponse = await fetch(tokenUrl, {
        method: 'POST'
        , headers: {
            Authorization: `Bearer ${jwt.toString().trim()}`,
        }
    })

    if (!tokenResponse.ok) {
        throw new Error(`Ошибка запроса tokenUrl: статус ${tokenResponse.status}`)
    }

    let respToken = await tokenResponse.json()

    const token = respToken.token
    console.log('Using token =', token.toString().trim())
    return token
}
