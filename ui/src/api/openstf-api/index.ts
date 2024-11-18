import { openstfApiClient } from './openstf-api-client'

import { OPENSTF_API_ROUTES } from './routes'

import type { Device, DeviceListResponse, GetDevicesParams, UserResponse, UserResponseUser } from '@/generated/types'

export const getDevices = async (params?: GetDevicesParams): Promise<Device[]> => {
  const { data } = await openstfApiClient.get<DeviceListResponse>(OPENSTF_API_ROUTES.devices, { params })

  return data.devices
}

export const getCurrentUserProfile = async (): Promise<UserResponseUser> => {
  const { data } = await openstfApiClient.get<UserResponse>(OPENSTF_API_ROUTES.user)

  return data.user
}
