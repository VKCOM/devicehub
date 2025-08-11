import { useMemo } from 'react'
import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'
import { createColumnHelper } from '@tanstack/react-table'

import { getNetworkString } from '@/components/ui/device-table/helpers'
import { TextWithTranslation } from '@/components/lib/text-with-translation'

import { isRootGroup } from '@/lib/utils/is-root-group.util'
import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { useAddDeviceToGroup } from '@/lib/hooks/use-add-device-to-group.hook'
import { useRemoveDeviceFromGroup } from '@/lib/hooks/use-remove-device-from-group.hook'

import { GroupTable, GroupTopFilters, IsInGroupCell, isInGroupSorting } from '../group-table'

import { GroupDevicesColumnIds } from './types'

import type { ColumnDef } from '@tanstack/react-table'
import type { GroupDevice } from '@/types/group-device.type'
import type { DataWithGroupStatus } from '@/types/data-with-group-status.type'

const columnHelper = createColumnHelper<DataWithGroupStatus<GroupDevice>>()

export const GroupDevicesTable = observer(() => {
  const { mutate: addDevicesToGroup } = useAddDeviceToGroup()
  const { mutate: removeDevicesFromGroup } = useRemoveDeviceFromGroup()

  const groupItemService = useInjection(CONTAINER_IDS.groupItemService)
  const { devicesQueryResult } = groupItemService

  const columns = useMemo(
    () => [
      columnHelper.accessor((row) => row.isInGroup, {
        id: GroupDevicesColumnIds.IS_IN_GROUP,
        sortingFn: isInGroupSorting,
        header: () => (
          <IsInGroupCell
            isInGroup={!groupItemService.isSomeDevicesNotInGroup}
            isAddToGroupDisabled={
              !devicesQueryResult.data?.length ||
              !groupItemService.checkDurationQuota(groupItemService.currentGroup?.devices?.length || 0)
            }
            isRemoveFromGroupDisabled={
              !devicesQueryResult.data?.length || isRootGroup(groupItemService.currentGroup?.privilege)
            }
            onAddToGroup={() => {
              addDevicesToGroup({
                groupClass: groupItemService.currentGroup?.class,
                groupId: groupItemService.currentGroupId,
              })
            }}
            onRemoveFromGroup={() => {
              removeDevicesFromGroup({
                groupClass: groupItemService.currentGroup?.class,
                groupId: groupItemService.currentGroupId,
              })
            }}
          />
        ),
        cell: ({ getValue, row }) => {
          const { serial } = row.original

          return (
            <IsInGroupCell
              isAddToGroupDisabled={!groupItemService.checkDurationQuota(1)}
              isInGroup={getValue()}
              isRemoveFromGroupDisabled={isRootGroup(groupItemService.currentGroup?.privilege)}
              onAddToGroup={() => {
                addDevicesToGroup({
                  groupClass: groupItemService.currentGroup?.class,
                  groupId: groupItemService.currentGroupId,
                  serial,
                })
              }}
              onRemoveFromGroup={() => {
                removeDevicesFromGroup({
                  groupClass: groupItemService.currentGroup?.class,
                  groupId: groupItemService.currentGroupId,
                  serial,
                })
              }}
            />
          )
        },
      }),
      columnHelper.accessor((row) => row.model, {
        header: () => <TextWithTranslation name='Model' />,
        id: GroupDevicesColumnIds.MODEL,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => row.serial, {
        header: () => <TextWithTranslation name='Serial' />,
        id: GroupDevicesColumnIds.SERIAL,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => row.operator, {
        header: () => <TextWithTranslation name='Carrier' />,
        id: GroupDevicesColumnIds.CARRIER,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => row.version, {
        header: () => <TextWithTranslation name='OS' />,
        id: GroupDevicesColumnIds.OS,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => getNetworkString(row.network?.type, row.network?.subtype), {
        header: () => <TextWithTranslation name='Network' />,
        id: GroupDevicesColumnIds.NETWORK,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => (row.display ? `${row.display?.width || 0}x${row.display?.height || 0}` : null), {
        header: () => <TextWithTranslation name='Screen' />,
        id: GroupDevicesColumnIds.SCREEN,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => row.manufacturer, {
        header: () => <TextWithTranslation name='Manufacturer' />,
        id: GroupDevicesColumnIds.MANUFACTURER,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => row.sdk, {
        header: () => <TextWithTranslation name='SDK' />,
        id: GroupDevicesColumnIds.SDK,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => row.abi, {
        header: () => <TextWithTranslation name='ABI' />,
        id: GroupDevicesColumnIds.ABI,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => row.cpuPlatform, {
        header: () => <TextWithTranslation name='CPU Platform' />,
        id: GroupDevicesColumnIds.CPU_PLATFORM,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => row.openGLESVersion, {
        header: () => <TextWithTranslation name='OpenGL ES version' />,
        id: GroupDevicesColumnIds.OPEN_GLES_VERSION,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => row.marketName, {
        header: () => <TextWithTranslation name='Market Name' />,
        id: GroupDevicesColumnIds.MARKET_NAME,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => row.phone?.imei, {
        header: () => <TextWithTranslation name='Phone IMEI' />,
        id: GroupDevicesColumnIds.PHONE_IMEI,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => row.provider?.name, {
        header: () => <TextWithTranslation name='Location' />,
        id: GroupDevicesColumnIds.LOCATION,
        cell: ({ getValue }) => getValue(),
      }),
      columnHelper.accessor((row) => row.group?.originName, {
        header: () => <TextWithTranslation name='Group Origin' />,
        id: GroupDevicesColumnIds.GROUP_ORIGIN,
        cell: ({ getValue }) => getValue(),
      }),
    ],
    [devicesQueryResult]
  ) as ColumnDef<DataWithGroupStatus<GroupDevice>>[]

  return (
    <GroupTable
      columns={columns}
      data={groupItemService.groupDevicesData}
      getRowId={(row) => row.serial}
      isDataLoading={devicesQueryResult.isLoading}
      initialState={{
        sorting: [
          {
            id: GroupDevicesColumnIds.IS_IN_GROUP,
            desc: false,
          },
        ],
      }}
    >
      {(table) => <GroupTopFilters table={table} />}
    </GroupTable>
  )
})
