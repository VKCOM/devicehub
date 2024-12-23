import axios from 'axios'

import config from '@/config/variables-config.json'

export const openstfClient = axios.create({
  baseURL: config[import.meta.env.MODE as keyof typeof config].openStfApiHostUrl,
})
