import axios from 'axios'

import { variablesConfig } from '@/config/variables-config'

export const openstfClient = axios.create({
  baseURL: variablesConfig[import.meta.env.MODE].openStfApiHostUrl,
})
