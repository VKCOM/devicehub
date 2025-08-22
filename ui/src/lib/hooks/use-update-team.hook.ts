import { useMutation } from '@tanstack/react-query'

import { updateTeam } from '@/api/openstf-api'

import { queries } from '@/config/queries/query-key-store'
import { queryClient } from '@/config/queries/query-client'

import type { AxiosError } from 'axios'
import type { UseMutationResult } from '@tanstack/react-query'
import type { Team, TeamPayload, UnexpectedErrorResponse } from '@/generated/types'

export const useUpdateTeam = (
  teamId: string
): UseMutationResult<boolean, AxiosError<UnexpectedErrorResponse>, Partial<TeamPayload>> =>
  useMutation({
    mutationFn: (data) => updateTeam(teamId, data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: queries.teams.all.queryKey })
      const previousTeams = queryClient.getQueryData(queries.teams.all.queryKey)

      queryClient.setQueryData<Team[]>(queries.teams.all.queryKey, (oldData) => {
        if (!oldData) return []

        return oldData.map((item): Team => {
          if (item.id === teamId) {
            const changedData: Partial<Team> = {
              ...(data.name && { name: data.name }),
              ...(data.users && { users: data.users }),
              ...(data.groups && { groups: data.groups }),
            }

            return { ...item, ...changedData }
          }

          return item
        })
      })

      return { previousTeams }
    },
    onError: (error, _, context) => {
      queryClient.setQueryData(queries.teams.all.queryKey, context?.previousTeams)

      console.error(error)
    },
  })
