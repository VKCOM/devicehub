import playwrightConfig from '../playwright.config'

const baseUrl = playwrightConfig?.use?.baseURL

export async function generateAdminToken() {
    const mockUrl = `${baseUrl}/auth/api/v1/mock`
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

    const tokenUrl = `${baseUrl}/api/v1/user/accessTokens?title="tokenTitle"`
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

export async function deleteAllAdminsTokens() {
    const token = await generateAdminToken()
    let tokensResp = await fetch(`${baseUrl}/api/v1/users/administrator@fakedomain.com/accessTokens`, {
        method: 'DELETE'
        , headers: {
            Authorization: `Bearer ${token}`,
        }
    })
    console.log(await tokensResp.json())
}
