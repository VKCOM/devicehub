import axios from 'axios'

import { variablesConfig } from '@/config/variables.config'

import { extractMessageOnErrorResponse } from '../interceptors'

export const authClient = axios.create({
  baseURL: variablesConfig[import.meta.env.MODE].openStfApiHostUrl,
  withCredentials: true,
})

authClient.interceptors.response.use(
  (response) => response,
  (error) => extractMessageOnErrorResponse(error)
)
