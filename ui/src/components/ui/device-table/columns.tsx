import { createColumnHelper } from '@tanstack/react-table'

import { TextWithTranslation } from '@/components/lib/text-with-translation'

import { ColumnGroup } from '@/types/column-group.type'

import { toSentenceCase } from '@/lib/utils/to-sentence-case.util'
import { deviceServiceToString } from '@/lib/utils/device-service-to-string.util'
import { dateToFormattedString } from '@/lib/utils/date-to-formatted-string.util'
import { getDeviceState } from '@/lib/utils/get-device-state.util'
import { isDeviceInactive } from '@/lib/utils/is-device-inactive.util'
import { getBatteryLevel } from '@/lib/utils/get-battery-level.util'
import { getExpireTime } from '@/lib/utils/get-expire-time.util'
import { startsWithFilter } from '@/lib/utils/starts-with-filter.util'

import { DeviceStatusCell, BookedBeforeCell, BrowserCell, ProductCell, ModelCell, NotesCell, LinkCell } from './cells'
import { browserAppsFilter, browserAppsSorting, deviceStatusSorting, getNetworkString, textColumnDef } from './helpers'
import { DeviceTableColumnIds } from './types'

import type { ListDevice } from '@/types/list-device.type'

const columnHelper = createColumnHelper<ListDevice>()

export const DEVICE_COLUMNS = [
  /* NOTE: Device Info Group */
  columnHelper.accessor((row) => row.name || row.model || row.serial, {
    header: () => <TextWithTranslation name='Model' />,
    id: DeviceTableColumnIds.MODEL,
    size: 150,
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
    textColumnDef({
      columnId: DeviceTableColumnIds.SERIAL,
      columnName: 'Serial',
      columnGroup: ColumnGroup.DEVICE_INFO,
      size: 150,
    })
  ),
  columnHelper.accessor(
    (row) => row.macAddress,
    textColumnDef({
      columnId: DeviceTableColumnIds.MAC_ADDRESS,
      columnName: 'MAC Address',
      columnGroup: ColumnGroup.DEVICE_INFO,
      size: 150,
    })
  ),
  columnHelper.accessor((row) => row.name || row.model || row.serial, {
    header: () => <TextWithTranslation name='Product' />,
    id: DeviceTableColumnIds.PRODUCT,
    size: 150,
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
      size: 90,
    })
  ),
  columnHelper.accessor(
    (row) => row.marketName,
    textColumnDef({
      columnId: DeviceTableColumnIds.MARKET_NAME,
      columnName: 'Market Name',
      columnGroup: ColumnGroup.DEVICE_INFO,
      size: 130,
    })
  ),
  columnHelper.accessor(
    (row) => row.manufacturer,
    textColumnDef({
      columnId: DeviceTableColumnIds.MANUFACTURER,
      columnName: 'Manufacturer',
      columnGroup: ColumnGroup.DEVICE_INFO,
      size: 120,
    })
  ),
  columnHelper.accessor(
    (row) => (row.display ? `${row.display?.width || 0}x${row.display?.height || 0}` : null),
    textColumnDef({
      columnId: DeviceTableColumnIds.SCREEN,
      columnName: 'Screen',
      columnGroup: ColumnGroup.DEVICE_INFO,
      size: 100,
    })
  ),
  columnHelper.accessor((row) => getDeviceState(row), {
    header: () => <TextWithTranslation name='Status' />,
    id: DeviceTableColumnIds.STATE,
    size: 150,
    meta: {
      columnName: 'Status',
      columnGroup: ColumnGroup.DEVICE_INFO,
    },
    filterFn: startsWithFilter,
    sortingFn: deviceStatusSorting,
    cell: ({ getValue, row }) => {
      const { serial, channel } = row.original

      return <DeviceStatusCell channel={channel} deviceState={getValue()} serial={serial} />
    },
  }),
  /* NOTE: OS & Hardware Group */
  columnHelper.accessor(
    (row) => row.version,
    textColumnDef({
      columnId: DeviceTableColumnIds.VERSION,
      columnName: 'OS',
      columnGroup: ColumnGroup.OS_HARDWARE,
      size: 60,
    })
  ),
  columnHelper.accessor(
    (row) => row.sdk,
    textColumnDef({
      columnId: DeviceTableColumnIds.SDK,
      columnName: 'SDK',
      columnGroup: ColumnGroup.OS_HARDWARE,
      size: 70,
    })
  ),
  columnHelper.accessor(
    (row) => row.cpuPlatform,
    textColumnDef({
      columnId: DeviceTableColumnIds.CPU_PLATFORM,
      columnName: 'CPU Platform',
      columnGroup: ColumnGroup.OS_HARDWARE,
      size: 120,
    })
  ),
  columnHelper.accessor(
    (row) => row.abi,
    textColumnDef({
      columnId: DeviceTableColumnIds.ABI,
      columnName: 'ABI',
      columnGroup: ColumnGroup.OS_HARDWARE,
      size: 80,
    })
  ),
  columnHelper.accessor(
    (row) => row.openGLESVersion,
    textColumnDef({
      columnId: DeviceTableColumnIds.OPEN_GLES_VERSION,
      columnName: 'OpenGL ES version',
      columnGroup: ColumnGroup.OS_HARDWARE,
      size: 160,
    })
  ),
  columnHelper.accessor((row) => row.browser?.apps, {
    header: () => <TextWithTranslation name='Browser' />,
    id: DeviceTableColumnIds.BROWSER,
    size: 90,
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
      size: 100,
    })
  ),
  columnHelper.accessor(
    (row) => getNetworkString(row.network?.type, row.network?.subtype),
    textColumnDef({
      columnId: DeviceTableColumnIds.NETWORK,
      columnName: 'Network',
      columnGroup: ColumnGroup.NETWORK_CONNECTIVITY,
      size: 90,
    })
  ),
  columnHelper.accessor(
    (row) => deviceServiceToString(row.service),
    textColumnDef({
      columnId: DeviceTableColumnIds.MOBILE_SERVICE,
      columnName: 'Mobile Service',
      columnGroup: ColumnGroup.NETWORK_CONNECTIVITY,
      filterFn: 'includesString',
      size: 130,
    })
  ),
  columnHelper.accessor(
    (row) => row.phone?.phoneNumber,
    textColumnDef({
      columnId: DeviceTableColumnIds.PHONE,
      columnName: 'Phone',
      columnGroup: ColumnGroup.NETWORK_CONNECTIVITY,
      size: 120,
    })
  ),
  columnHelper.accessor(
    (row) => row.phone?.imei,
    textColumnDef({
      columnId: DeviceTableColumnIds.PHONE_IMEI,
      columnName: 'Phone IMEI',
      columnGroup: ColumnGroup.NETWORK_CONNECTIVITY,
      size: 140,
    })
  ),
  columnHelper.accessor(
    (row) => row.phone?.imsi,
    textColumnDef({
      columnId: DeviceTableColumnIds.PHONE_IMSI,
      columnName: 'Phone IMSI',
      columnGroup: ColumnGroup.NETWORK_CONNECTIVITY,
      size: 140,
    })
  ),
  columnHelper.accessor(
    (row) => row.phone?.iccid,
    textColumnDef({
      columnId: DeviceTableColumnIds.PHONE_ICCID,
      columnName: 'Phone ICCID',
      columnGroup: ColumnGroup.NETWORK_CONNECTIVITY,
      size: 140,
    })
  ),
  /* NOTE: Battery Group */
  columnHelper.accessor(
    (row) => toSentenceCase(row.battery?.health || ''),
    textColumnDef({
      columnId: DeviceTableColumnIds.BATTERY_HEALTH,
      columnName: 'Battery Health',
      columnGroup: ColumnGroup.BATTERY,
      size: 130,
    })
  ),
  columnHelper.accessor(
    (row) => row.battery?.source?.toUpperCase(),
    textColumnDef({
      columnId: DeviceTableColumnIds.BATTERY_SOURCE,
      columnName: 'Battery Source',
      columnGroup: ColumnGroup.BATTERY,
      size: 130,
    })
  ),
  columnHelper.accessor(
    (row) => toSentenceCase(row.battery?.status || ''),
    textColumnDef({
      columnId: DeviceTableColumnIds.BATTERY_STATUS,
      columnName: 'Battery Status',
      columnGroup: ColumnGroup.BATTERY,
      size: 130,
    })
  ),
  columnHelper.accessor(
    (row) => {
      if (!row.battery?.level || !row.battery?.scale) return null

      const batteryLevel = getBatteryLevel(row.battery.level, row.battery.scale)

      return `${batteryLevel} %`
    },
    textColumnDef({
      columnId: DeviceTableColumnIds.BATTERY_LEVEL,
      columnName: 'Battery Level',
      columnGroup: ColumnGroup.BATTERY,
      sortingFn: 'alphanumeric',
      size: 120,
    })
  ),
  columnHelper.accessor(
    (row) => row.battery?.temp + ' °C',
    textColumnDef({
      columnId: DeviceTableColumnIds.BATTERY_TEMP,
      columnName: 'Battery Temp',
      columnGroup: ColumnGroup.BATTERY,
      size: 120,
    })
  ),
  /* NOTE: Location & ID Group */
  columnHelper.accessor(
    (row) => row.place,
    textColumnDef({
      columnId: DeviceTableColumnIds.PLACE,
      columnName: 'Physical Place',
      columnGroup: ColumnGroup.LOCATION_ID,
      size: 130,
    })
  ),
  columnHelper.accessor(
    (row) => row.storageId,
    textColumnDef({
      columnId: DeviceTableColumnIds.STORAGE_ID,
      columnName: 'Storage ID',
      columnGroup: ColumnGroup.LOCATION_ID,
      size: 110,
    })
  ),
  columnHelper.accessor(
    (row) => row.provider?.name,
    textColumnDef({
      columnId: DeviceTableColumnIds.PROVIDER_NAME,
      columnName: 'Provider name',
      columnGroup: ColumnGroup.LOCATION_ID,
      size: 150,
    })
  ),
  /* NOTE: Group & User Details Group */
  columnHelper.accessor((row) => row.group?.name, {
    header: () => <TextWithTranslation name='Group Name' />,
    id: DeviceTableColumnIds.GROUP_NAME,
    size: 120,
    meta: {
      columnName: 'Group Name',
      columnGroup: ColumnGroup.GROUP_USER_DETAILS,
    },
    filterFn: startsWithFilter,
    sortingFn: 'basic',
    cell: ({ getValue, row }) => <LinkCell text={getValue()} url={row.original.group?.runUrl} />,
  }),
  columnHelper.accessor(
    (row) => toSentenceCase(row.group?.class || ''),
    textColumnDef({
      columnId: DeviceTableColumnIds.GROUP_CLASS,
      columnName: 'Group Class',
      columnGroup: ColumnGroup.GROUP_USER_DETAILS,
      size: 120,
    })
  ),
  columnHelper.accessor(
    (row) => row.group?.lifeTime?.start && dateToFormattedString({ value: row.group.lifeTime.start, needTime: true }),
    textColumnDef({
      columnId: DeviceTableColumnIds.GROUP_STARTING_DATE,
      columnName: 'Group Starting Date',
      columnGroup: ColumnGroup.GROUP_USER_DETAILS,
      size: 175,
    })
  ),
  columnHelper.accessor(
    (row) => row.group?.lifeTime?.stop && dateToFormattedString({ value: row.group.lifeTime.stop, needTime: true }),
    textColumnDef({
      columnId: DeviceTableColumnIds.GROUP_EXPIRATION_DATE,
      columnName: 'Group Expiration Date',
      columnGroup: ColumnGroup.GROUP_USER_DETAILS,
      size: 175,
    })
  ),
  columnHelper.accessor((row) => row.group?.repetitions, {
    header: () => <TextWithTranslation name='Group Repetitions' />,
    id: DeviceTableColumnIds.REPETITIONS,
    size: 150,
    meta: {
      columnName: 'Group Repetitions',
      columnGroup: ColumnGroup.GROUP_USER_DETAILS,
    },
    filterFn: startsWithFilter,
    sortingFn: 'basic',
    cell: ({ getValue }) => getValue() || 0,
  }),
  columnHelper.accessor((row) => row.group?.owner?.name, {
    header: () => <TextWithTranslation name='Group Owner' />,
    id: DeviceTableColumnIds.GROUP_OWNER,
    size: 130,
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
      size: 120,
    })
  ),
  columnHelper.accessor(
    (row) =>
      row.statusChangedAt && row.bookedBefore
        ? dateToFormattedString({ value: getExpireTime(row.statusChangedAt, row.bookedBefore), needTime: true })
        : undefined,
    {
      header: () => <TextWithTranslation name='Booked before' />,
      id: DeviceTableColumnIds.BOOKED_BEFORE,
      size: 150,
      meta: {
        columnName: 'Booked before',
        columnGroup: ColumnGroup.GROUP_USER_DETAILS,
      },
      filterFn: startsWithFilter,
      sortingFn: 'basic',
      cell: ({ getValue }) => <BookedBeforeCell formattedDate={getValue()} />,
    }
  ),
  // TODO: Add released date
  columnHelper.accessor(
    (row) => row.createdAt && dateToFormattedString({ value: row.createdAt }),
    textColumnDef({
      columnId: DeviceTableColumnIds.RELEASED,
      columnName: 'Released',
      columnGroup: ColumnGroup.GROUP_USER_DETAILS,
      size: 120,
    })
  ),
  columnHelper.accessor(
    (row) => row.owner?.name,
    textColumnDef({
      columnId: DeviceTableColumnIds.OWNER_NAME,
      columnName: 'User',
      columnGroup: ColumnGroup.GROUP_USER_DETAILS,
      size: 100,
    })
  ),
  columnHelper.accessor((row) => row.notes, {
    header: () => <TextWithTranslation name='Notes' />,
    id: DeviceTableColumnIds.NOTES,
    size: 200,
    meta: {
      columnName: 'Notes',
      columnGroup: ColumnGroup.GROUP_USER_DETAILS,
    },
    filterFn: startsWithFilter,
    sortingFn: 'basic',
    cell: ({ getValue, row }) => <NotesCell notes={getValue()} serial={row.original.serial} />,
  }),
]
