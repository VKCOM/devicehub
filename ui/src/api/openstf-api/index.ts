import { openstfApiClient } from './openstf-api-client'
import { isOriginGroup } from '@/lib/utils/is-origin-group.util'

import {
  DEVICE_SETTINGS_FIELDS,
  DEVICE_GROUPS_FIELDS,
  DEVICE_LIST_FIELDS,
  USERS_GROUPS_FIELDS,
  DEVICE_SHELL_FIELDS,
  USERS_SETTINGS_FIELDS,
} from '@/constants/request-fields'

import { OPENSTF_API_ROUTES } from './routes'

import type { ShellDevice } from '@/types/shell-device.type'
import type { SettingsUser } from '@/types/settings-user.type'
import type { SettingsDevice } from '@/types/settings-device.type'
import type { GroupUser } from '@/types/group-user.type'
import type {
  GroupUserArgs,
  CreateUserArgs,
  RemoveUserArgs,
  GroupDeviceArgs,
  RemoveUsersArgs,
  RemoveDeviceArgs,
  UpdateDeviceArgs,
  RemoveDevicesArgs,
  ParamsWithoutFields,
  GroupDeviceWithClassArgs,
  UsersWithFieldsListResponse,
  DeviceWithFieldsListResponse,
  UpdateUserGroupQuotaArgs,
} from './types'
import type { GroupDevice } from '@/types/group-device.type'
import type { ListDevice } from '@/types/list-device.type'
import type {
  User,
  Device,
  UserResponse,
  GroupPayload,
  GroupResponse,
  DeviceResponse,
  GetUsersParams,
  GetGroupsParams,
  DefaultResponse,
  AdbPortResponse,
  AdbRangeResponse,
  GetDevicesParams,
  UserListResponse,
  GroupListResponse,
  AccessTokensResponse,
  GetDeviceBySerialParams,
  GroupListResponseGroupsItem,
  UpdateDefaultUserGroupsQuotasParams,
  AlertMessageResponse,
  AlertMessage,
  Token,
} from '@/generated/types'

const getDevices = async <T>(params?: GetDevicesParams): Promise<T[]> => {
  const { data } = await openstfApiClient.get<DeviceWithFieldsListResponse<T>>(OPENSTF_API_ROUTES.devices, { params })

  return data.devices
}

const getUsers = async <T>(params?: GetUsersParams): Promise<T[]> => {
  const { data } = await openstfApiClient.get<UsersWithFieldsListResponse<T>>(OPENSTF_API_ROUTES.users, { params })

  return data.users
}

const addOriginGroupDevice = async ({ serial, groupId }: GroupDeviceArgs): Promise<boolean> => {
  const { data } = await openstfApiClient.put<DeviceResponse>(OPENSTF_API_ROUTES.deviceGroup(groupId, serial))

  return data.success
}

const addTransientGroupDevice = async ({ serial, groupId }: GroupDeviceArgs): Promise<boolean> => {
  const { data } = await openstfApiClient.put<GroupResponse>(OPENSTF_API_ROUTES.groupDevice(groupId, serial))

  return data.success
}

const removeTransientGroupDevice = async ({ serial, groupId }: GroupDeviceArgs): Promise<boolean> => {
  const { data } = await openstfApiClient.delete<GroupResponse>(OPENSTF_API_ROUTES.groupDevice(groupId, serial))

  return data.success
}

const removeOriginGroupDevice = async ({ serial, groupId }: GroupDeviceArgs): Promise<boolean> => {
  const { data } = await openstfApiClient.delete<DeviceResponse>(OPENSTF_API_ROUTES.deviceGroup(groupId, serial))

  return data.success
}

export const getListDevices = (params?: ParamsWithoutFields<GetDevicesParams>): Promise<ListDevice[]> =>
  getDevices({ ...params, fields: DEVICE_LIST_FIELDS })

export const getGroupDevices = (params?: ParamsWithoutFields<GetDevicesParams>): Promise<GroupDevice[]> =>
  getDevices({ ...params, fields: DEVICE_GROUPS_FIELDS })

export const getSettingsDevices = (params?: ParamsWithoutFields<GetDevicesParams>): Promise<SettingsDevice[]> =>
  getDevices({ ...params, fields: DEVICE_SETTINGS_FIELDS })

export const getShellDevices = (params?: ParamsWithoutFields<GetDevicesParams>): Promise<ShellDevice[]> =>
  getDevices({ ...params, fields: DEVICE_SHELL_FIELDS })

export const getGroupUsers = (params?: ParamsWithoutFields<GetUsersParams>): Promise<GroupUser[]> =>
  getUsers({ ...params, fields: USERS_GROUPS_FIELDS })

export const getSettingsUsers = (params?: ParamsWithoutFields<GetUsersParams>): Promise<SettingsUser[]> =>
  getUsers({ ...params, fields: USERS_SETTINGS_FIELDS })

export const getGroups = async (params?: GetGroupsParams): Promise<GroupListResponseGroupsItem[]> => {
  const { data } = await openstfApiClient.get<GroupListResponse>(OPENSTF_API_ROUTES.groups, { params })

  return data.groups
}

export const getDeviceBySerial = async (serial: string, params?: GetDeviceBySerialParams): Promise<Device> => {
  const { data } = await openstfApiClient.get<DeviceResponse>(`${OPENSTF_API_ROUTES.devices}/${serial}`, { params })

  return data.device
}

export const getCurrentUserProfile = async (): Promise<User> => {
  const { data } = await openstfApiClient.get<UserResponse>(OPENSTF_API_ROUTES.user)

  return data.user
}

export const getAccessTokens = async (): Promise<string[]> => {
  const { data } = await openstfApiClient.get<AccessTokensResponse>(OPENSTF_API_ROUTES.accessTokens)

  return data.titles?.reverse() || []
}

export const getAccessTokensByEmail = async (email: string): Promise<string[]> => {
  const { data } = await openstfApiClient.get<{ success: boolean; titles: string[] }>(
    OPENSTF_API_ROUTES.accessTokensByEmail(email)
  )

  return data.titles || []
}

export const getAccessTokenByTitle = async (title: string): Promise<Token | null> => {
  const { data } = await openstfApiClient.post<{ token: Token }>(OPENSTF_API_ROUTES.accessTokenByTitle, { title })

  return data.token || null
}

export const addUserInGroup = async ({ groupId, userEmail }: GroupUserArgs): Promise<boolean> => {
  const { data } = await openstfApiClient.put<GroupResponse>(OPENSTF_API_ROUTES.groupUser(groupId, userEmail))

  return data.success
}

export const removeUserFromGroup = async ({ groupId, userEmail }: GroupUserArgs): Promise<boolean> => {
  const { data } = await openstfApiClient.delete<GroupResponse>(OPENSTF_API_ROUTES.groupUser(groupId, userEmail))

  return data.success
}

export const addDeviceToGroup = async ({ groupClass, groupId, serial }: GroupDeviceWithClassArgs): Promise<boolean> => {
  if (isOriginGroup(groupClass)) {
    return addOriginGroupDevice({ serial, groupId })
  }

  return addTransientGroupDevice({ serial, groupId })
}

export const removeDeviceFromGroup = async ({
  groupClass,
  groupId,
  serial,
}: GroupDeviceWithClassArgs): Promise<boolean> => {
  if (isOriginGroup(groupClass)) {
    return removeOriginGroupDevice({ serial, groupId })
  }

  return removeTransientGroupDevice({ serial, groupId })
}

export const createGroup = async (): Promise<boolean> => {
  const { data } = await openstfApiClient.post<GroupResponse>(OPENSTF_API_ROUTES.groups, { state: 'pending' })

  return data.success
}

export const removeGroup = async (id: string): Promise<boolean> => {
  const { data } = await openstfApiClient.delete<DefaultResponse>(`${OPENSTF_API_ROUTES.groups}/${id}`)

  return data.success
}

export const removeGroups = async (ids: string): Promise<boolean> => {
  const { data } = await openstfApiClient.delete<DefaultResponse>(OPENSTF_API_ROUTES.groups, {
    params: { _: Date.now() },
    data: ids ? { ids } : undefined,
  })

  return data.success
}

export const updateGroup = async (id: string, data: GroupPayload): Promise<boolean> => {
  const {
    data: { success },
  } = await openstfApiClient.put<GroupResponse>(`${OPENSTF_API_ROUTES.groups}/${id}`, data)

  return success
}

export const renewAdbPort = async (serial: string): Promise<number> => {
  const { data } = await openstfApiClient.put<AdbPortResponse>(OPENSTF_API_ROUTES.adbPort(serial))

  return data.port
}

export const updateDevice = async ({ serial, ...params }: UpdateDeviceArgs): Promise<boolean> => {
  const { data } = await openstfApiClient.put<DefaultResponse>(
    OPENSTF_API_ROUTES.updateStorageInfo(serial),
    undefined,
    {
      params,
    }
  )

  return data.success
}

export const removeDevice = async ({ serial, ...params }: RemoveDeviceArgs): Promise<boolean> => {
  const { data } = await openstfApiClient.delete<DefaultResponse>(`${OPENSTF_API_ROUTES.devices}/${serial}`, {
    params,
  })

  return data.success
}

export const removeDevices = async ({ ids, ...params }: RemoveDevicesArgs): Promise<boolean> => {
  const { data } = await openstfApiClient.delete<DefaultResponse>(OPENSTF_API_ROUTES.devices, {
    params,
    data: ids ? { ids } : undefined,
  })

  return data.success
}

export const getAdbRange = async (): Promise<string> => {
  const { data } = await openstfApiClient.get<AdbRangeResponse>(OPENSTF_API_ROUTES.adbRange)

  return data.adbRange
}

export const updateDefaultUserGroupsQuota = async (params: UpdateDefaultUserGroupsQuotasParams): Promise<boolean> => {
  const { data } = await openstfApiClient.put<UserResponse>(OPENSTF_API_ROUTES.defaultGroupsQuotas, undefined, {
    params,
  })

  return data.success
}

export const updateUserGroupQuota = async ({ email, ...params }: UpdateUserGroupQuotaArgs): Promise<boolean> => {
  const { data } = await openstfApiClient.put<UserResponse>(OPENSTF_API_ROUTES.userGroupQuota(email), undefined, {
    params,
  })

  return data.success
}

export const createUser = async ({ email, ...params }: CreateUserArgs): Promise<boolean> => {
  const { data } = await openstfApiClient.post<UserResponse>(`${OPENSTF_API_ROUTES.users}/${email}`, undefined, {
    params,
  })

  return data.success
}

export const removeUser = async ({ email, ...params }: RemoveUserArgs): Promise<boolean> => {
  const { data } = await openstfApiClient.delete<DefaultResponse>(`${OPENSTF_API_ROUTES.users}/${email}`, {
    params,
  })

  return data.success
}

export const removeUsers = async ({ emails, ...params }: RemoveUsersArgs): Promise<boolean> => {
  const { data } = await openstfApiClient.delete<DefaultResponse>(OPENSTF_API_ROUTES.users, {
    params,
    data: emails ? { emails } : undefined,
  })

  return data.success
}

export const grantAdmin = async (email: string): Promise<boolean> => {
  const { data } = await openstfApiClient.post<UserListResponse>(OPENSTF_API_ROUTES.grantAdmin(email))

  return data.success
}

export const revokeAdmin = async (email: string): Promise<boolean> => {
  const { data } = await openstfApiClient.delete<UserListResponse>(OPENSTF_API_ROUTES.revokeAdmin(email))

  return data.success
}

export const getAlertMessage = async (): Promise<AlertMessage> => {
  const { data } = await openstfApiClient.get<AlertMessageResponse>(OPENSTF_API_ROUTES.alertMessage)

  return data.alertMessage
}

export const addUserAsModerator = async ({ groupId, userEmail }: GroupUserArgs): Promise<boolean> => {
  if (!userEmail) throw new Error('User email is required to add moderator')

  const { data } = await openstfApiClient.put<GroupResponse>(OPENSTF_API_ROUTES.groupModerator(groupId, userEmail))

  return data.success
}

export const removeUserAsModerator = async ({ groupId, userEmail }: GroupUserArgs): Promise<boolean> => {
  if (!userEmail) throw new Error('User email is required to remove moderator')

  const { data } = await openstfApiClient.delete<GroupResponse>(OPENSTF_API_ROUTES.groupModerator(groupId, userEmail))

  return data.success
}
