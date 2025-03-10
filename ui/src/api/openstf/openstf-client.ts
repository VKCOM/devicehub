import axios from 'axios'

import { variablesConfig } from '@/config/variables.config'

import { attachTokenOnRequest, extractMessageOnErrorResponse, logoutOnErrorResponse } from '../interceptors'

export const openstfClient = axios.create({
  baseURL: variablesConfig[import.meta.env.MODE].openStfApiHostUrl,
  withCredentials: true,
})

openstfClient.interceptors.request.use((config) => attachTokenOnRequest(config))
openstfClient.interceptors.response.use((response) => response, logoutOnErrorResponse)
openstfClient.interceptors.response.use(
  (response) => response,
  (error) => extractMessageOnErrorResponse(error)
)
