import { createQueryKeyStore } from '@lukemorales/query-key-factory'

import { getAuthContact, getAuthDocs, getManifest, additionalUrl } from '@/api/openstf'
import {
  getAccessTokens,
  getAdbRange,
  getAlertMessage,
  getCurrentUserProfile,
  getDeviceBySerial,
  getGroupDevices,
  getGroups,
  getGroupUsers,
  getListDevices,
  getSettingsDevices,
  getShellDevices,
  getSettingsUsers,
  getAccessTokensByEmail,
  getUsersInGroup,
  getTeams,
  getTeamUsers,
  getTeamGroups,
} from '@/api/openstf-api'
import { getAuthUrl } from '@/api/auth'

import type { GroupUser } from '@/types/group-user.type'
import type { GroupDevice } from '@/types/group-device.type'
import type { ParamsWithoutFields } from '@/api/openstf-api/types'
import type { inferQueryKeyStore } from '@lukemorales/query-key-factory'
import type { GetManifestResponse } from '@/api/openstf/types'
import type { Device, GetDevicesParams } from '@/generated/types'

export const queries = createQueryKeyStore({
  devices: {
    list: {
      queryKey: null,
      queryFn: () => getListDevices(),
    },
    group: (params?: ParamsWithoutFields<GetDevicesParams>) => ({
      queryKey: [params],
      queryFn: (): Promise<GroupDevice[]> => getGroupDevices(params),
    }),
    settings: {
      queryKey: null,
      queryFn: () => getSettingsDevices({ target: 'user' }),
    },
    shell: {
      queryKey: null,
      queryFn: () => getShellDevices({ target: 'user' }),
    },
    bySerial: (serial: string) => ({
      queryKey: [serial],
      queryFn: (): Promise<Device> => getDeviceBySerial(serial),
    }),
    adbRange: {
      queryKey: null,
      queryFn: () => getAdbRange(),
    },
  },
  users: {
    group: {
      queryKey: null,
      queryFn: () => getGroupUsers(),
    },
    settings: {
      queryKey: null,
      queryFn: () => getSettingsUsers(),
    },
    alertMessage: {
      queryKey: null,
      queryFn: () => getAlertMessage(),
    },
    accessTokens: (email: string) => ({
      queryKey: [email],
      queryFn: (): Promise<string[]> => getAccessTokensByEmail(email),
    }),
  },
  user: {
    profile: {
      queryKey: null,
      queryFn: () => getCurrentUserProfile(),
    },
    accessTokens: {
      queryKey: null,
      queryFn: () => getAccessTokens(),
    },
  },
  groups: {
    all: {
      queryKey: null,
      queryFn: () => getGroups(),
    },
  },
  group: {
    users: (groupId: string) => ({
      queryKey: [groupId],
      queryFn: (): Promise<GroupUser[]> => getUsersInGroup({ groupId }),
    }),
  },
  teams: {
    all: {
      queryKey: null,
      queryFn: () => getTeams(),
    },
    users: {
      queryKey: null,
      queryFn: () => getTeamUsers(),
    },
    groups: {
      queryKey: null,
      queryFn: () => getTeamGroups(),
    },
  },
  auth: {
    docs: {
      queryKey: null,
      queryFn: () => getAuthDocs(),
    },
    contact: {
      queryKey: null,
      queryFn: () => getAuthContact(),
    },
    url: {
      queryKey: null,
      queryFn: () => getAuthUrl(),
    },
  },
  s: {
    apk: (href: string) => ({
      queryKey: [href],
      queryFn: (): Promise<GetManifestResponse> => getManifest(href),
    }),
  },
  service: {
    additionalUrl: {
      queryKey: null,
      queryFn: () => additionalUrl(),
    },
  },
})

export type QueryKeys = inferQueryKeyStore<typeof queries>
