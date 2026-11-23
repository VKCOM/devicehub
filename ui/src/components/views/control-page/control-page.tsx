import { useEffect, useState } from 'react'
import Split from 'react-split'
import { useParams } from 'react-router'
import { Provider as DIContainerProvider, useInjection } from 'inversify-react'
import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'

import { Device } from '@/components/ui/device'
import { DeviceControlPanel } from '@/components/ui/device-control-panel'
import { DeviceAccessScreen } from '@/components/ui/device-access-screen'
import { MobileControl } from '@/components/ui/mobile-control'
import { ErrorModal } from '@/components/ui/modals'
import { ConditionalRender } from '@/components/lib/conditional-render'

import { deviceAccessStore } from '@/store/device-access-store'
import { deviceErrorModalStore } from '@/store/device-error-modal-store'
import { mobileControlLayoutState } from '@/store/mobile-control-layout-state'
import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { createDeviceContainer } from '@/config/inversify/create-device-container'
import { useIsMobileControl } from '@/lib/hooks/use-is-mobile-control.hook'
import { useDeviceLifecycle } from '@/lib/hooks/use-device-lifecycle.hook'

import styles from './control-page.module.css'

type ControlPageLayoutProps = {
  onTakeAgain: () => void
}

const ControlPageLayout = observer(({ onTakeAgain }: ControlPageLayoutProps) => {
  const { t } = useTranslation()
  const isMobileControl = useIsMobileControl()

  const deviceBySerialStore = useInjection(CONTAINER_IDS.deviceBySerialStore)

  // NOTE: Owned by the page, not a layout: switching layouts never takes the device again
  useDeviceLifecycle()

  const { data: device } = deviceBySerialStore.deviceQueryResult()
  // NOTE: Tizen has no video, its web inspector keeps the desktop layout
  const isMobileLayout = isMobileControl && device?.platform !== 'Tizen'

  useEffect(() => {
    mobileControlLayoutState.setActive(isMobileLayout)

    return () => mobileControlLayoutState.setActive(false)
  }, [isMobileLayout])

  return (
    <>
      {isMobileLayout ? (
        <MobileControl onTakeAgain={onTakeAgain} />
      ) : (
        <div className={styles.controlPage}>
          <Split
            className={styles.split}
            direction='horizontal'
            gutterSize={4}
            minSize={[200, 0]}
            sizes={[30, 70]}
            snapOffset={10}
          >
            <Device />
            <DeviceControlPanel />
          </Split>
          <DeviceAccessScreen onTakeAgain={onTakeAgain} />
        </div>
      )}
      <ConditionalRender conditions={[deviceErrorModalStore.isModalOpen]}>
        <ErrorModal
          description={deviceErrorModalStore.fatalMessage}
          isOpen={deviceErrorModalStore.isModalOpen}
          title={t('Device was disconnected')}
          onClose={() => deviceErrorModalStore.closeModal()}
        />
      </ConditionalRender>
    </>
  )
})

export const ControlPage = observer(() => {
  const { serial = '', provider } = useParams()
  // NOTE: A new generation re-creates the device services, which takes the device again
  const [generation, setGeneration] = useState(0)

  useEffect(() => () => deviceAccessStore.clear(), [serial, provider])

  const onTakeAgain = () => {
    deviceAccessStore.clear()
    deviceErrorModalStore.clearError()
    setGeneration((value) => value + 1)
  }

  return (
    <DIContainerProvider
      key={JSON.stringify([provider, serial, generation])}
      container={() => createDeviceContainer(serial, provider)}
    >
      <ControlPageLayout onTakeAgain={onTakeAgain} />
    </DIContainerProvider>
  )
})
