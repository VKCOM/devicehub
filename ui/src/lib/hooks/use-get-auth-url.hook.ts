import { useQuery } from '@tanstack/react-query'

import { queries } from '@/config/queries/query-key-store'

import type { UseQueryResult } from '@tanstack/react-query'

export const useGetAuthUrl = (): UseQueryResult<string> => useQuery({ ...queries.auth.url, staleTime: Infinity })
