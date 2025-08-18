import { useMutation } from '@tanstack/react-query'

import { createTeam } from '@/api/openstf-api'

import { queryClient } from '@/config/queries/query-client'
import { queries } from '@/config/queries/query-key-store'

import type { AxiosError } from 'axios'
import type { UseMutationResult } from '@tanstack/react-query'
import type { UnexpectedErrorResponse } from '@/generated/types'

export const useCreateTeam = (): UseMutationResult<boolean, AxiosError<UnexpectedErrorResponse>, void> =>
  useMutation({
    mutationFn: () => createTeam(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queries.teams.all.queryKey })
    },
  })
