import { authClient } from './auth-client'

import { AUTH_ROUTES } from './routes'

import type { LdapAuthArgs, MockAuthArgs, AuthResponse, GetAuthUrlResponse } from './types'

export const mockAuth = async (body: MockAuthArgs): Promise<string> => {
  const { data } = await authClient.post<AuthResponse>(AUTH_ROUTES.mock, body)

  return data.redirect
}

export const ldapAuth = async (body: LdapAuthArgs): Promise<string> => {
  const { data } = await authClient.post<AuthResponse>(AUTH_ROUTES.ldap, body)

  return data.redirect
}

export const getAuthUrl = async (): Promise<string> => {
  const { data } = await authClient.get<GetAuthUrlResponse>(AUTH_ROUTES.authUrl)

  return data.authUrl
}
