import { useMutation } from '@tanstack/react-query'

import { removeUserFromGroup } from '@/api/openstf-api'

import { queries } from '@/config/queries/query-key-store'
import { queryClient } from '@/config/queries/query-client'

import type { AxiosError } from 'axios'
import type { GroupUserArgs } from '@/api/openstf-api/types'
import type { UseMutationResult } from '@tanstack/react-query'
import type { GroupListResponseGroupsItem, UnexpectedErrorResponse } from '@/generated/types'

export const useRemoveUserFromGroup = (): UseMutationResult<
  boolean,
  AxiosError<UnexpectedErrorResponse>,
  GroupUserArgs
> =>
  useMutation({
    mutationFn: (data) => removeUserFromGroup(data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: queries.groups.all.queryKey })
      const previousGroups = queryClient.getQueryData(queries.groups.all.queryKey)

      queryClient.setQueryData<GroupListResponseGroupsItem[]>(queries.groups.all.queryKey, (oldData) => {
        if (!oldData) return []

        return oldData.map((item): GroupListResponseGroupsItem => {
          if (item.id === data.groupId) {
            return {
              ...item,
              users: item.users?.filter((email) => email !== data.userEmail),
              moderators: item.moderators?.filter((email) => email !== data.userEmail),
            }
          }

          return item
        })
      })

      return { previousGroups }
    },
    onError: (error, _, context) => {
      queryClient.setQueryData(queries.groups.all.queryKey, context?.previousGroups)

      console.error(error)
    },
  })
