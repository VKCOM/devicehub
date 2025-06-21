import { useInjection } from 'inversify-react'
import { useMutation } from '@tanstack/react-query'

import { addDeviceToGroup } from '@/api/openstf-api'

import { queries } from '@/config/queries/query-key-store'
import { queryClient } from '@/config/queries/query-client'
import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import type { AxiosError } from 'axios'
import type { UseMutationResult } from '@tanstack/react-query'
import type { GroupDeviceWithClassArgs } from '@/api/openstf-api/types'
import type { ConflictsResponse, GroupListResponseGroupsItem } from '@/generated/types'

export const useAddDeviceToGroup = (): UseMutationResult<
  boolean,
  AxiosError<ConflictsResponse>,
  GroupDeviceWithClassArgs
> => {
  const groupItemService = useInjection(CONTAINER_IDS.groupItemService)

  return useMutation({
    mutationFn: (data) => addDeviceToGroup(data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: queries.groups.all.queryKey })
      const previousGroups = queryClient.getQueryData(queries.groups.all.queryKey)

      queryClient.setQueryData<GroupListResponseGroupsItem[]>(queries.groups.all.queryKey, (oldData) => {
        if (!oldData) return []

        return oldData.map((item): GroupListResponseGroupsItem => {
          if (item.id === data.groupId) {
            return { ...item, devices: [...(item.devices || []), ...(data.serial ? [data.serial] : [])] }
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

      if (error.response?.status === 409) {
        groupItemService.setConflicts(error.response.data.conflicts)
      }

      console.error(error)
    },
  })
}
