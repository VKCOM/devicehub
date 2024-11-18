import { createColumnHelper } from '@tanstack/react-table'

import { ColumnGroup } from '@/types/column-group.type'

import { capitalizeFirstLetter } from '@/lib/utils/capitalize-first-letter.util'
import { deviceServiceToString } from '@/lib/utils/device-service-to-string.util'
import { dateToFormattedString } from '@/lib/utils/date-to-formatted-string.util'
import { getDeviceState } from '@/lib/utils/get-device-state.util'
import { isDeviceInactive } from '@/lib/utils/is-device-inactive.util'

import { HeaderWithTranslation } from './header-with-translation'
import { DeviceStatusCell, BookedBeforeCell, BrowserCell, ProductCell, ModelCell, NotesCell, LinkCell } from './cells'
import {
  browserAppsFilter,
  browserAppsSorting,
  deviceStatusSorting,
  getBatteryLevelString,
  getNetworkString,
  startsWithFilter,
  textColumnDef,
} from './helpers'
import { DeviceTableColumnIds } from './types'

import type { Device } from '@/generated/types'

const columnHelper = createColumnHelper<Device>()

export const DEVICE_COLUMNS = [
  /* NOTE: Device Info Group */
  columnHelper.accessor((row) => row.model || row.serial, {
    header: () => <HeaderWithTranslation name='Model' />,
    id: DeviceTableColumnIds.MODEL,
    meta: {
      columnName: 'Model',
      columnGroup: ColumnGroup.DEVICE_INFO,
    },
    filterFn: startsWithFilter,
    sortingFn: 'basic',
    cell: ({ getValue, row }) => <ModelCell model={getValue()} platform={row.original.platform} />,
  }),
  columnHelper.accessor(
    (row) => row.serial,
    textColumnDef({ columnId: DeviceTableColumnIds.SERIAL, columnName: 'Serial', columnGroup: ColumnGroup.DEVICE_INFO })
  ),
  columnHelper.accessor(
    (row) => row.macAddress,
    textColumnDef({
      columnId: DeviceTableColumnIds.MAC_ADDRESS,
      columnName: 'MAC Address',
      columnGroup: ColumnGroup.DEVICE_INFO,
    })
  ),
  columnHelper.accessor((row) => row.product || row.model || row.serial, {
    header: () => <HeaderWithTranslation name='Product' />,
    id: DeviceTableColumnIds.PRODUCT,
    meta: {
      columnName: 'Product',
      columnGroup: ColumnGroup.DEVICE_INFO,
    },
    filterFn: startsWithFilter,
    sortingFn: 'basic',
    cell: ({ getValue, row }) => (
      <ProductCell
        isDisabled={isDeviceInactive(row.getValue('state'))}
        product={getValue()}
        serial={row.original.serial}
      />
    ),
  }),
  columnHelper.accessor(
    (row) => row.platform,
    textColumnDef({
      columnId: DeviceTableColumnIds.PLATFORM,
      columnName: 'Platform',
      columnGroup: ColumnGroup.DEVICE_INFO,
    })
  ),
  columnHelper.accessor(
    (row) => row.marketName,
    textColumnDef({
      columnId: DeviceTableColumnIds.MARKET_NAME,
      columnName: 'Market Name',
      columnGroup: ColumnGroup.DEVICE_INFO,
    })
  ),
  columnHelper.accessor(
    (row) => row.manufacturer,
    textColumnDef({
      columnId: DeviceTableColumnIds.MANUFACTURER,
      columnName: 'Manufacturer',
      columnGroup: ColumnGroup.DEVICE_INFO,
    })
  ),
  columnHelper.accessor(
    (row) => (row.display ? `${row.display?.width}x${row.display?.height}` : null),
    textColumnDef({ columnId: DeviceTableColumnIds.SCREEN, columnName: 'Screen', columnGroup: ColumnGroup.DEVICE_INFO })
  ),
  columnHelper.accessor((row) => getDeviceState(row), {
    header: () => <HeaderWithTranslation name='Status' />,
    id: DeviceTableColumnIds.STATE,
    meta: {
      columnName: 'Status',
      columnGroup: ColumnGroup.DEVICE_INFO,
    },
    filterFn: startsWithFilter,
    sortingFn: deviceStatusSorting,
    cell: ({ getValue, row }) => {
      const { present, ready, owner, using, serial, status } = row.original

      return (
        <DeviceStatusCell
          deviceState={getValue()}
          hasOwner={!!owner}
          present={present}
          ready={ready}
          serial={serial}
          status={status}
          using={using}
        />
      )
    },
  }),
  /* NOTE: OS & Hardware Group */
  columnHelper.accessor(
    (row) => row.version,
    textColumnDef({ columnId: DeviceTableColumnIds.VERSION, columnName: 'OS', columnGroup: ColumnGroup.OS_HARDWARE })
  ),
  columnHelper.accessor(
    (row) => row.sdk,
    textColumnDef({ columnId: DeviceTableColumnIds.SDK, columnName: 'SDK', columnGroup: ColumnGroup.OS_HARDWARE })
  ),
  columnHelper.accessor(
    (row) => row.cpuPlatform,
    textColumnDef({
      columnId: DeviceTableColumnIds.CPU_PLATFORM,
      columnName: 'CPU Platform',
      columnGroup: ColumnGroup.OS_HARDWARE,
    })
  ),
  columnHelper.accessor(
    (row) => row.abi,
    textColumnDef({ columnId: DeviceTableColumnIds.ABI, columnName: 'ABI', columnGroup: ColumnGroup.OS_HARDWARE })
  ),
  columnHelper.accessor(
    (row) => row.openGLESVersion,
    textColumnDef({
      columnId: DeviceTableColumnIds.OPEN_GL_ES_VERSION,
      columnName: 'OpenGL ES version',
      columnGroup: ColumnGroup.OS_HARDWARE,
    })
  ),
  columnHelper.accessor((row) => row.browser?.apps, {
    header: () => <HeaderWithTranslation name='Browser' />,
    id: DeviceTableColumnIds.BROWSER,
    meta: {
      columnName: 'Browser',
      columnGroup: ColumnGroup.OS_HARDWARE,
    },
    filterFn: browserAppsFilter,
    sortingFn: browserAppsSorting,
    cell: ({ getValue }) => <BrowserCell apps={getValue()} />,
  }),
  /* NOTE: Network & Connectivity Group */
  columnHelper.accessor(
    (row) => row.operator,
    textColumnDef({
      columnId: DeviceTableColumnIds.OPERATOR,
      columnName: 'Carrier',
      columnGroup: ColumnGroup.NETWORK_CONNECTIVITY,
    })
  ),
  columnHelper.accessor(
    (row) => getNetworkString(row.network?.type, row.network?.subtype),
    textColumnDef({
      columnId: DeviceTableColumnIds.NETWORK,
      columnName: 'Network',
      columnGroup: ColumnGroup.NETWORK_CONNECTIVITY,
    })
  ),
  columnHelper.accessor(
    (row) => deviceServiceToString(row.service),
    textColumnDef({
      columnId: DeviceTableColumnIds.MOBILE_SERVICE,
      columnName: 'Mobile Service',
      columnGroup: ColumnGroup.NETWORK_CONNECTIVITY,
      filterFn: 'includesString',
    })
  ),
  columnHelper.accessor(
    (row) => row.phone?.phoneNumber,
    textColumnDef({
      columnId: DeviceTableColumnIds.PHONE,
      columnName: 'Phone',
      columnGroup: ColumnGroup.NETWORK_CONNECTIVITY,
    })
  ),
  columnHelper.accessor(
    (row) => row.phone?.imei,
    textColumnDef({
      columnId: DeviceTableColumnIds.PHONE_IMEI,
      columnName: 'Phone IMEI',
      columnGroup: ColumnGroup.NETWORK_CONNECTIVITY,
    })
  ),
  columnHelper.accessor(
    (row) => row.phone?.imsi,
    textColumnDef({
      columnId: DeviceTableColumnIds.PHONE_IMSI,
      columnName: 'Phone IMSI',
      columnGroup: ColumnGroup.NETWORK_CONNECTIVITY,
    })
  ),
  columnHelper.accessor(
    (row) => row.phone?.iccid,
    textColumnDef({
      columnId: DeviceTableColumnIds.PHONE_ICCID,
      columnName: 'Phone ICCID',
      columnGroup: ColumnGroup.NETWORK_CONNECTIVITY,
    })
  ),
  /* NOTE: Battery Group */
  columnHelper.accessor(
    (row) => capitalizeFirstLetter(row.battery?.health),
    textColumnDef({
      columnId: DeviceTableColumnIds.BATTERY_HEALTH,
      columnName: 'Battery Health',
      columnGroup: ColumnGroup.BATTERY,
    })
  ),
  columnHelper.accessor(
    (row) => row.battery?.source?.toUpperCase(),
    textColumnDef({
      columnId: DeviceTableColumnIds.BATTERY_SOURCE,
      columnName: 'Battery Source',
      columnGroup: ColumnGroup.BATTERY,
    })
  ),
  columnHelper.accessor(
    (row) => capitalizeFirstLetter(row.battery?.status),
    textColumnDef({
      columnId: DeviceTableColumnIds.BATTERY_STATUS,
      columnName: 'Battery Status',
      columnGroup: ColumnGroup.BATTERY,
    })
  ),
  columnHelper.accessor(
    (row) => getBatteryLevelString(row.battery?.level, row.battery?.scale),
    textColumnDef({
      columnId: DeviceTableColumnIds.BATTERY_LEVEL,
      columnName: 'Battery Level',
      columnGroup: ColumnGroup.BATTERY,
      sortingFn: 'alphanumeric',
    })
  ),
  columnHelper.accessor(
    (row) => row.battery?.temp + '°C',
    textColumnDef({
      columnId: DeviceTableColumnIds.BATTERY_TEMP,
      columnName: 'Battery Temp',
      columnGroup: ColumnGroup.BATTERY,
    })
  ),
  /* NOTE: Location & ID Group */
  columnHelper.accessor(
    (row) => row.place,
    textColumnDef({
      columnId: DeviceTableColumnIds.PLACE,
      columnName: 'Physical Place',
      columnGroup: ColumnGroup.LOCATION_ID,
    })
  ),
  columnHelper.accessor(
    (row) => row.storageId,
    textColumnDef({
      columnId: DeviceTableColumnIds.STORAGE_ID,
      columnName: 'Storage ID',
      columnGroup: ColumnGroup.LOCATION_ID,
    })
  ),
  columnHelper.accessor(
    (row) => row.provider?.name,
    textColumnDef({
      columnId: DeviceTableColumnIds.PROVIDER_NAME,
      columnName: 'Provider name',
      columnGroup: ColumnGroup.LOCATION_ID,
    })
  ),
  /* NOTE: Group & User Details Group */
  columnHelper.accessor((row) => row.group?.name, {
    header: () => <HeaderWithTranslation name='Group Name' />,
    id: DeviceTableColumnIds.GROUP_NAME,
    meta: {
      columnName: 'Group Name',
      columnGroup: ColumnGroup.GROUP_USER_DETAILS,
    },
    filterFn: startsWithFilter,
    sortingFn: 'basic',
    cell: ({ getValue, row }) => <LinkCell text={getValue()} url={row.original.group?.runUrl} />,
  }),
  columnHelper.accessor(
    (row) => capitalizeFirstLetter(row.group?.class),
    textColumnDef({
      columnId: DeviceTableColumnIds.GROUP_CLASS,
      columnName: 'Group Class',
      columnGroup: ColumnGroup.GROUP_USER_DETAILS,
    })
  ),
  columnHelper.accessor(
    (row) => row.group?.lifeTime?.start && dateToFormattedString(row.group.lifeTime.start, true),
    textColumnDef({
      columnId: DeviceTableColumnIds.GROUP_STARTING_DATE,
      columnName: 'Group Starting Date',
      columnGroup: ColumnGroup.GROUP_USER_DETAILS,
    })
  ),
  columnHelper.accessor(
    (row) => row.group?.lifeTime?.stop && dateToFormattedString(row.group.lifeTime.stop, true),
    textColumnDef({
      columnId: DeviceTableColumnIds.GROUP_EXPIRATION_DATE,
      columnName: 'Group Expiration Date',
      columnGroup: ColumnGroup.GROUP_USER_DETAILS,
    })
  ),
  columnHelper.accessor((row) => row.group?.repetitions, {
    header: () => <HeaderWithTranslation name='Group Repetitions' />,
    id: DeviceTableColumnIds.REPETITIONS,
    meta: {
      columnName: 'Group Repetitions',
      columnGroup: ColumnGroup.GROUP_USER_DETAILS,
    },
    filterFn: startsWithFilter,
    sortingFn: 'basic',
    cell: ({ getValue }) => getValue(),
  }),
  columnHelper.accessor((row) => row.group?.owner?.name, {
    header: () => <HeaderWithTranslation name='Group Owner' />,
    id: DeviceTableColumnIds.GROUP_OWNER,
    meta: {
      columnName: 'Group Owner',
      columnGroup: ColumnGroup.GROUP_USER_DETAILS,
    },
    filterFn: startsWithFilter,
    sortingFn: 'basic',
    cell: ({ getValue, row }) => {
      const email = row.original.group?.owner?.email
      const url = email?.indexOf('@') !== -1 ? `mailto:${email}` : `/user/${email}`

      return <LinkCell text={getValue()} url={url} />
    },
  }),
  columnHelper.accessor(
    (row) => row.group?.originName,
    textColumnDef({
      columnId: DeviceTableColumnIds.GROUP_ORIGIN,
      columnName: 'Group Origin',
      columnGroup: ColumnGroup.GROUP_USER_DETAILS,
    })
  ),
  columnHelper.accessor((row) => row.bookedBefore, {
    header: () => <HeaderWithTranslation name='Booked before' />,
    id: DeviceTableColumnIds.BOOKED_BEFORE,
    meta: {
      columnName: 'Booked before',
      columnGroup: ColumnGroup.GROUP_USER_DETAILS,
    },
    filterFn: startsWithFilter,
    sortingFn: 'basic',
    cell: ({ getValue, row }) => (
      <BookedBeforeCell bookedBefore={getValue()} statusChangedAt={row.original?.statusChangedAt} />
    ),
  }),
  // TODO: Add released date
  columnHelper.accessor(
    (row) => row.createdAt && dateToFormattedString(row.createdAt),
    textColumnDef({
      columnId: DeviceTableColumnIds.RELEASED,
      columnName: 'Released',
      columnGroup: ColumnGroup.GROUP_USER_DETAILS,
    })
  ),
  columnHelper.accessor(
    (row) => row.owner?.name,
    textColumnDef({
      columnId: DeviceTableColumnIds.OWNER_NAME,
      columnName: 'User',
      columnGroup: ColumnGroup.GROUP_USER_DETAILS,
    })
  ),
  columnHelper.accessor((row) => row.notes, {
    header: () => <HeaderWithTranslation name='Notes' />,
    id: DeviceTableColumnIds.NOTES,
    meta: {
      columnName: 'Notes',
      columnGroup: ColumnGroup.GROUP_USER_DETAILS,
    },
    filterFn: startsWithFilter,
    sortingFn: 'basic',
    cell: ({ getValue, row }) => <NotesCell notes={getValue()} serial={row.original.serial} />,
  }),
]
