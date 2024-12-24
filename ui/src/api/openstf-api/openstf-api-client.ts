import axios from 'axios'

import { variablesConfig } from '@/config/variables-config'

export const openstfApiClient = axios.create({
  baseURL: `${variablesConfig[import.meta.env.MODE].openStfApiHostUrl}/api/v1`,
  withCredentials: true,
})
