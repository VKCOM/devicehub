import type { interfaces } from 'inversify'
import type { InfoService } from '@/services/info-service'
import type { GroupService } from '@/services/group-service'
import type { LogcatService } from '@/services/logcat-service'
import type { AdbKeyService } from '@/services/adb-key-service'
import type { DeviceListStore } from '@/store/device-list-store'
import type { LinkOpenerStore } from '@/store/link-opener-store'
import type { BookingService } from '@/services/booking-service'
import type { DeviceConnection } from '@/store/device-connection'
import type { ShellControlStore } from '@/store/shell-control-store'
import type { DeviceControlStore } from '@/store/device-control-store'
import type { DeviceDisconnection } from '@/store/device-disconnection'
import type { MobxQueryFactory } from '@/types/mobx-query-factory.type'
import type { DeviceBySerialStore } from '@/store/device-by-serial-store'
import type { AccessTokenService } from '@/services/access-token-service'
import type { TouchService } from '@/services/touch-service/touch-service'
import type { TransactionFactory } from '@/types/transaction-factory.type'
import type { FileExplorerService } from '@/services/file-explorer-service'
import type { ShellSettingsService } from '@/services/shell-settings-service'
import type { UserSettingsService } from '@/services/user-settings-service'
import type { GroupSettingsService } from '@/services/group-settings-service'
import type { MobxMutationFactory } from '@/types/mobx-mutation-factory.type'
import type { DeviceSettingsService } from '@/services/device-settings-service'
import type { ScalingService } from '@/services/scaling-service/scaling-service'
import type { DeviceLifecycleService } from '@/services/device-lifecycle-service'
import type { CurrentUserProfileStore } from '@/store/current-user-profile-store'
import type { SettingsService } from '@/services/settings-service/settings-service'
import type { KeyboardService } from '@/services/keyboard-service/keyboard-service'
import type { SaveLogsService } from '@/services/save-logs-service/save-logs-service'
import type { GroupItemService } from '@/services/group-item-service/group-item-service'
import type { DeviceScreenStore } from '@/store/device-screen-store/device-screen-store'
import type { LogsTrackerService } from '@/services/logs-tracker-service/logs-tracker-service'
import type { PortForwardingService } from '@/services/port-forwarding-service/port-forwarding-service'
import type { ApplicationInstallationService } from '@/services/application-installation/application-installation-service'
import type { TeamSettingsService } from '@/services/team-settings-service'
import type { TeamItemService } from '@/services/team-item-service'

export const CONTAINER_IDS = {
  groupId: Symbol.for('groupId') as interfaces.ServiceIdentifier<string>,
  teamId: Symbol.for('teamId') as interfaces.ServiceIdentifier<string>,
  deviceSerial: Symbol.for('serial') as interfaces.ServiceIdentifier<string>,
  infoService: Symbol.for('InfoService') as interfaces.ServiceIdentifier<InfoService>,
  touchService: Symbol.for('TouchService') as interfaces.ServiceIdentifier<TouchService>,
  groupService: Symbol.for('GroupService') as interfaces.ServiceIdentifier<GroupService>,
  logcatService: Symbol.for('LogcatService') as interfaces.ServiceIdentifier<LogcatService>,
  adbKeyService: Symbol.for('AdbKeyService') as interfaces.ServiceIdentifier<AdbKeyService>,
  bookingService: Symbol.for('BookingService') as interfaces.ServiceIdentifier<BookingService>,
  scalingService: Symbol.for('ScalingService') as interfaces.ServiceIdentifier<ScalingService>,
  linkOpenerStore: Symbol.for('LinkOpenerStore') as interfaces.ServiceIdentifier<LinkOpenerStore>,
  keyboardService: Symbol.for('KeyboardService') as interfaces.ServiceIdentifier<KeyboardService>,
  deviceListStore: Symbol.for('DeviceListStore') as interfaces.ServiceIdentifier<DeviceListStore>,
  settingsService: Symbol.for('SettingsService') as interfaces.ServiceIdentifier<SettingsService>,
  saveLogsService: Symbol.for('SaveLogsService') as interfaces.ServiceIdentifier<SaveLogsService>,
  groupItemService: Symbol.for('GroupItemService') as interfaces.ServiceIdentifier<GroupItemService>,
  teamItemService: Symbol.for('TeamItemService') as interfaces.ServiceIdentifier<TeamItemService>,
  deviceConnection: Symbol.for('DeviceConnection') as interfaces.ServiceIdentifier<DeviceConnection>,
  factoryMobxQuery: Symbol.for('Factory<MobxQuery>') as interfaces.ServiceIdentifier<MobxQueryFactory>,
  shellControlStore: Symbol.for('ShellControlStore') as interfaces.ServiceIdentifier<ShellControlStore>,
  deviceScreenStore: Symbol.for('DeviceScreenStore') as interfaces.ServiceIdentifier<DeviceScreenStore>,
  accessTokenService: Symbol.for('AccessTokenService') as interfaces.ServiceIdentifier<AccessTokenService>,
  deviceControlStore: Symbol.for('DeviceControlStore') as interfaces.ServiceIdentifier<DeviceControlStore>,
  logsTrackerService: Symbol.for('LogsTrackerService') as interfaces.ServiceIdentifier<LogsTrackerService>,
  deviceBySerialStore: Symbol.for('DeviceBySerialStore') as interfaces.ServiceIdentifier<DeviceBySerialStore>,
  deviceDisconnection: Symbol.for('DeviceDisconnection') as interfaces.ServiceIdentifier<DeviceDisconnection>,
  userSettingsService: Symbol.for('UserSettingsService') as interfaces.ServiceIdentifier<UserSettingsService>,
  fileExplorerService: Symbol.for('FileExplorerService') as interfaces.ServiceIdentifier<FileExplorerService>,
  factoryMobxMutation: Symbol.for('Factory<MobxMutation>') as interfaces.ServiceIdentifier<MobxMutationFactory>,
  shellSettingsService: Symbol.for('ShellSettingsService') as interfaces.ServiceIdentifier<ShellSettingsService>,
  groupSettingsService: Symbol.for('GroupSettingsService') as interfaces.ServiceIdentifier<GroupSettingsService>,
  teamSettingsService: Symbol.for('TeamSettingsService') as interfaces.ServiceIdentifier<TeamSettingsService>,
  portForwardingService: Symbol.for('PortForwardingService') as interfaces.ServiceIdentifier<PortForwardingService>,
  deviceSettingsService: Symbol.for('DeviceSettingsService') as interfaces.ServiceIdentifier<DeviceSettingsService>,
  deviceLifecycleService: Symbol.for('DeviceLifecycleService') as interfaces.ServiceIdentifier<DeviceLifecycleService>,
  factoryTransactionService: Symbol.for(
    'Factory<TransactionService>'
  ) as interfaces.ServiceIdentifier<TransactionFactory>,
  currentUserProfileStore: Symbol.for(
    'CurrentUserProfileStore'
  ) as interfaces.ServiceIdentifier<CurrentUserProfileStore>,
  applicationInstallationService: Symbol.for(
    'ApplicationInstallationService'
  ) as interfaces.ServiceIdentifier<ApplicationInstallationService>,
}
