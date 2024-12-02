import { createQueryKeyStore } from '@lukemorales/query-key-factory'

import { getAuthContact, getAuthDocs } from '@/api/openstf'
import { getCurrentUserProfile, getDeviceBySerial, getDevices } from '@/api/openstf-api'

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
})
