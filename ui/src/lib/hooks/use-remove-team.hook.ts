import { useMutation } from '@tanstack/react-query'

import { removeTeam } from '@/api/openstf-api'

import { queries } from '@/config/queries/query-key-store'
import { queryClient } from '@/config/queries/query-client'

import type { AxiosError } from 'axios'
import type { UseMutationResult } from '@tanstack/react-query'
import type { Team, UnexpectedErrorResponse } from '@/generated/types'

export const useRemoveTeam = (): UseMutationResult<boolean, AxiosError<UnexpectedErrorResponse>, string> =>
  useMutation({
    mutationFn: (id) => removeTeam(id),
    onMutate: async (removedId) => {
      await queryClient.cancelQueries({ queryKey: queries.teams.all.queryKey })
      const previousTeams = queryClient.getQueryData(queries.teams.all.queryKey)

      queryClient.setQueryData<Team[]>(queries.teams.all.queryKey, (oldData) => {
        if (!oldData) return []

        return oldData.filter((item) => item.id !== removedId)
      })

      return { previousTeams }
    },
    onError: (error, _, context) => {
      queryClient.setQueryData(queries.teams.all.queryKey, context?.previousTeams)

      console.error(error)
    },
  })
