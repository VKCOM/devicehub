import { delay, http, HttpResponse } from 'msw'

import { openstfApiClient } from '@/api/openstf-api/openstf-api-client'

import { OPENSTF_API_ROUTES } from '@/api/openstf-api/routes'

import { USER_RESPONSE } from './responses/user-response'
import { DEVICES_WITH_VARIOUS_DATA } from './responses/device-list-response'

export const handlers = [
  http.get(openstfApiClient.defaults.baseURL + OPENSTF_API_ROUTES.devices, async () => {
    await delay()

    return HttpResponse.json(DEVICES_WITH_VARIOUS_DATA)
  }),
  http.get(openstfApiClient.defaults.baseURL + OPENSTF_API_ROUTES.user, async () => {
    await delay()

    return HttpResponse.json(USER_RESPONSE)
  }),
]
