import { createQueryKeyStore } from '@lukemorales/query-key-factory'

import { getAuthContact, getAuthDocs, getManifest } from '@/api/openstf'
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
} from '@/api/openstf-api'
import { getAuthUrl } from '@/api/auth'

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
})

export type QueryKeys = inferQueryKeyStore<typeof queries>
