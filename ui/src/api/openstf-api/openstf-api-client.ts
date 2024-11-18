import axios from 'axios'

export const openstfApiClient = axios.create({
  baseURL: `${import.meta.env.VITE_OPENSTF_API_HOST_URL}/api/v1`,
  withCredentials: true,
})
