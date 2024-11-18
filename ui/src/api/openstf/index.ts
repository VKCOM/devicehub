import { openstfClient } from './openstf-client'

import { OPENSTF_ROUTES } from './routes'

import type { GetAuthDocsResponse, GetAuthContactResponse } from './types'

export const getAuthDocs = async (): Promise<string> => {
  const { data } = await openstfClient.get<GetAuthDocsResponse>(OPENSTF_ROUTES.authDocs)

  return data.docsUrl
}

export const getAuthContact = async (): Promise<string> => {
  const { data } = await openstfClient.get<GetAuthContactResponse>(OPENSTF_ROUTES.authContact)

  return data.contactUrl
}
