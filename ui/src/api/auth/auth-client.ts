import axios from 'axios'

import { variablesConfig } from '@/config/variables.config'

export const authClient = axios.create({
  baseURL: variablesConfig[import.meta.env.MODE].openStfApiHostUrl,
  withCredentials: true,
})
