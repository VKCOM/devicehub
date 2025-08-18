import { useMutation } from '@tanstack/react-query'

import { removeGroupFromTeam } from '@/api/openstf-api'

import { queries } from '@/config/queries/query-key-store'
import { queryClient } from '@/config/queries/query-client'

import type { AxiosError } from 'axios'
import type { TeamGroupArgs } from '@/api/openstf-api/types'
import type { UseMutationResult } from '@tanstack/react-query'
import type { Team, UnexpectedErrorResponse } from '@/generated/types'

export const useRemoveGroupFromTeam = (): UseMutationResult<
  boolean,
  AxiosError<UnexpectedErrorResponse>,
  TeamGroupArgs
> =>
  useMutation({
    mutationFn: (data) => removeGroupFromTeam(data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: queries.teams.all.queryKey })
      const previousTeams = queryClient.getQueryData(queries.teams.all.queryKey)

      queryClient.setQueryData<Team[]>(queries.teams.all.queryKey, (oldData) => {
        if (!oldData) return []

        return oldData.map((item): Team => {
          if (item.id === data.teamId) {
            return {
              ...item,
              groups: item.groups?.filter((groupId) => groupId !== data.groupId),
            }
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
