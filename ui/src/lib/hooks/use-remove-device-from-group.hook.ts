import { useMutation } from '@tanstack/react-query'

import { removeDeviceFromGroup } from '@/api/openstf-api'

import { queries } from '@/config/queries/query-key-store'
import { queryClient } from '@/config/queries/query-client'

import type { AxiosError } from 'axios'
import type { UseMutationResult } from '@tanstack/react-query'
import type { GroupDeviceWithClassArgs } from '@/api/openstf-api/types'
import type { GroupListResponseGroupsItem, UnexpectedErrorResponse } from '@/generated/types'

export const useRemoveDeviceFromGroup = (): UseMutationResult<
  boolean,
  AxiosError<UnexpectedErrorResponse>,
  GroupDeviceWithClassArgs
> =>
  useMutation({
    mutationFn: (data) => removeDeviceFromGroup(data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: queries.groups.all.queryKey })
      const previousGroups = queryClient.getQueryData(queries.groups.all.queryKey)

      queryClient.setQueryData<GroupListResponseGroupsItem[]>(queries.groups.all.queryKey, (oldData) => {
        if (!oldData) return []

        return oldData.map((item): GroupListResponseGroupsItem => {
          if (item.id === data.groupId) {
            return { ...item, devices: item.devices?.filter((device) => device !== data.serial) }
          }

          return item
        })
      })

      return { previousGroups }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queries.devices.group({ target: 'origin' }).queryKey })
    },
    onError: (error, _, context) => {
      queryClient.setQueryData(queries.groups.all.queryKey, context?.previousGroups)

      console.error(error)
    },
  })
