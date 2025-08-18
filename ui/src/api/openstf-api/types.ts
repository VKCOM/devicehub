import type {
  DeleteDeviceParams,
  DeviceListResponse,
  GroupPayloadClass,
  UserListResponse,
  UpdateStorageInfoParams,
  UpdateUserGroupsQuotasParams,
  CreateUserParams,
  DeleteUserParams,
  DeleteUsersParams,
} from '@/generated/types'

export type ParamsWithoutFields<T> = Omit<T, 'fields'>
export type UsersWithFieldsListResponse<T> = Omit<UserListResponse, 'users'> & { users: T[] }
export type DeviceWithFieldsListResponse<T> = Omit<DeviceListResponse, 'devices'> & { devices: T[] }

export type GroupUserArgs = {
  groupId: string
  userEmail?: string
}

export type GroupDeviceArgs = {
  groupId: string
  serial?: string
}

export type TeamUserArgs = {
  teamId: string
  userEmail?: string
}

export type TeamGroupArgs = {
  teamId: string
  groupId: string
}

export type CreateUserArgs = { email: string } & CreateUserParams
export type RemoveUserArgs = { email: string } & DeleteUserParams
export type RemoveUsersArgs = { emails: string } & DeleteUsersParams
export type RemoveDevicesArgs = { ids: string } & DeleteDeviceParams
export type RemoveDeviceArgs = { serial: string } & DeleteDeviceParams
export type UpdateDeviceArgs = { serial: string } & UpdateStorageInfoParams
export type UpdateUserGroupQuotaArgs = { email: string } & UpdateUserGroupsQuotasParams
export type GroupDeviceWithClassArgs = { groupClass?: GroupPayloadClass } & GroupDeviceArgs
