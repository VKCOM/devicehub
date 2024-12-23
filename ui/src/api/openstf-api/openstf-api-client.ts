import axios from 'axios'

import config from '@/config/variables-config.json'

export const openstfApiClient = axios.create({
  baseURL: `${config[import.meta.env.MODE as keyof typeof config].openStfApiHostUrl}/api/v1`,
  withCredentials: true,
})
