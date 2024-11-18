import axios from 'axios'

export const openstfClient = axios.create({
  baseURL: import.meta.env.VITE_OPENSTF_API_HOST_URL,
})
