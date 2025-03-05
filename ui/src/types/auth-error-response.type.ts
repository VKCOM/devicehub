export type AuthErrorResponse = {
  error: string
  success: boolean
  validationErrors: { location: string; msg: string; param: string }[]
}
