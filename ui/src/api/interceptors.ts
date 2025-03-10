import { authStore } from '@/store/auth-store'
import { globalToast } from '@/store/global-toast'

import type { AxiosError, InternalAxiosRequestConfig } from 'axios'
import type { ErrorResponse, UnexpectedErrorResponse } from '@/generated/types'

export const attachTokenOnRequest = (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
  const { jwt } = authStore

  config.headers.Authorization = `Bearer ${jwt}`

  return config
}

export const logoutOnErrorResponse = async (error: AxiosError<ErrorResponse>): Promise<AxiosError<ErrorResponse>> => {
  const originalRequest = error.config

  if (originalRequest && error.response?.status === 401) {
    authStore.logout()
  }

  return Promise.reject(error)
}

export const extractMessageOnErrorResponse = async (
  error: AxiosError<UnexpectedErrorResponse | ErrorResponse>
): Promise<AxiosError<UnexpectedErrorResponse | ErrorResponse>> => {
  const { response } = error

  // NOTE: Errors can be filtered
  if (response?.data && 'description' in response.data) {
    globalToast.setMessage(response.data.description)
  }

  if (response?.data && 'message' in response.data) {
    globalToast.setMessage(response.data.message)
  }

  if (response) {
    return Promise.reject(response)
  }

  return Promise.reject(error)
}
