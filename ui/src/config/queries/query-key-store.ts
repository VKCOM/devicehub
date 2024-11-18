import { createQueryKeyStore } from '@lukemorales/query-key-factory'

import { getAuthContact, getAuthDocs } from '@/api/openstf'
import { getCurrentUserProfile, getDevices } from '@/api/openstf-api'

export const queries = createQueryKeyStore({
  devices: {
    all: {
      queryKey: null,
      queryFn: () => getDevices(),
    },
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
