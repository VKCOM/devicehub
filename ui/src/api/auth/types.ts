export type MockAuthArgs = {
  name: string
  email: string
}

export type LdapAuthArgs = {
  username: string
  password: string
}

export type AuthResponse = {
  success: boolean
  redirect: string
}

export type GetAuthUrlResponse = {
  authUrl: string
}
