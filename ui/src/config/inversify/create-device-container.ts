import { Container } from 'inversify'

import { InfoService } from '@/services/info-service'
import { LogcatService } from '@/services/logcat-service'
import { BookingService } from '@/services/booking-service'
import { TouchService } from '@/services/touch-service/touch-service'
import { FileExplorerService } from '@/services/file-explorer-service'
import { ScalingService } from '@/services/scaling-service/scaling-service'
import { DeviceLifecycleService } from '@/services/device-lifecycle-service'
import { KeyboardService } from '@/services/keyboard-service/keyboard-service'
import { SaveLogsService } from '@/services/save-logs-service/save-logs-service'
import { ApplicationInstallationService } from '@/services/application-installation/application-installation-service'

import { LinkOpenerStore } from '@/store/link-opener-store'
import { DeviceConnection } from '@/store/device-connection'
import { ShellControlStore } from '@/store/shell-control-store'
import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { DeviceControlStore } from '@/store/device-control-store'
import { DeviceBySerialStore } from '@/store/device-by-serial-store'
import { DeviceScreenStore } from '@/store/device-screen-store/device-screen-store'

/* NOTE:
  Creating a container for a specific device, isolating its dependencies, and ensuring that the
  `serial` value is available within the container's scope. This allows services to be resolved
  specifically for the corresponding device, enabling scoped dependency management in multi-device scenarios
*/
export const createDeviceContainer = (serial: string): Container => {
  /* NOTE:
    Inversify-react automatically establishes a hierarchy of containers
    (https://github.com/inversify/InversifyJS/blob/master/wiki/hierarchical_di.md)
    within the React tree when multiple Providers are used.
    This means that if the device container lacks bindings, it passes the request up to its parent
    container (in our case, globalContainer)
  */
  const deviceContainer = new Container({ defaultScope: 'Singleton' })

  deviceContainer.bind<string>(CONTAINER_IDS.deviceSerial).toConstantValue(serial)

  deviceContainer.bind(CONTAINER_IDS.infoService).to(InfoService)
  deviceContainer.bind(CONTAINER_IDS.touchService).to(TouchService)
  deviceContainer.bind(CONTAINER_IDS.logcatService).to(LogcatService)
  deviceContainer.bind(CONTAINER_IDS.scalingService).to(ScalingService)
  deviceContainer.bind(CONTAINER_IDS.bookingService).to(BookingService)
  deviceContainer.bind(CONTAINER_IDS.linkOpenerStore).to(LinkOpenerStore)
  deviceContainer.bind(CONTAINER_IDS.keyboardService).to(KeyboardService)
  deviceContainer.bind(CONTAINER_IDS.saveLogsService).to(SaveLogsService)
  deviceContainer.bind(CONTAINER_IDS.deviceConnection).to(DeviceConnection)
  deviceContainer.bind(CONTAINER_IDS.shellControlStore).to(ShellControlStore)
  deviceContainer.bind(CONTAINER_IDS.deviceScreenStore).to(DeviceScreenStore)
  deviceContainer.bind(CONTAINER_IDS.deviceControlStore).to(DeviceControlStore)
  deviceContainer.bind(CONTAINER_IDS.deviceBySerialStore).to(DeviceBySerialStore)
  deviceContainer.bind(CONTAINER_IDS.fileExplorerService).to(FileExplorerService)
  deviceContainer.bind(CONTAINER_IDS.deviceLifecycleService).to(DeviceLifecycleService)
  deviceContainer.bind(CONTAINER_IDS.applicationInstallationService).to(ApplicationInstallationService)

  return deviceContainer
}
