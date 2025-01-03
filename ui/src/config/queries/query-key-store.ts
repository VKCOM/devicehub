import { createQueryKeyStore } from '@lukemorales/query-key-factory'

import { getAuthContact, getAuthDocs, getManifest } from '@/api/openstf'
import { getCurrentUserProfile, getDeviceBySerial, getDevices } from '@/api/openstf-api'

import type { GetManifestResponse } from '@/api/openstf/types'
import type { Device } from '@/generated/types'

export const queries = createQueryKeyStore({
  devices: {
    all: {
      queryKey: null,
      queryFn: () => getDevices(),
    },
    bySerial: (serial: string) => ({
      queryKey: [serial],
      queryFn: (): Promise<Device> => getDeviceBySerial(serial),
    }),
  },
  user: {
    profile: {
      queryKey: null,
      queryFn: () => getCurrentUserProfile(),
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
  },
  s: {
    apk: (href: string) => ({
      queryKey: [href],
      queryFn: (): Promise<GetManifestResponse> => getManifest(href),
    }),
  },
})
