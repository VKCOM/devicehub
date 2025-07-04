import Split from 'react-split'
import { useParams } from 'react-router'
import { Provider as DIContainerProvider } from 'inversify-react'
import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'

import { Device } from '@/components/ui/device'
import { DeviceControlPanel } from '@/components/ui/device-control-panel'
import { ErrorModal } from '@/components/ui/modals'
import { ConditionalRender } from '@/components/lib/conditional-render'

import { deviceErrorModalStore } from '@/store/device-error-modal-store'
import { createDeviceContainer } from '@/config/inversify/create-device-container'

import styles from './control-page.module.css'

export const ControlPage = observer(() => {
  const { t } = useTranslation()
  const { serial = '' } = useParams()

  return (
    <DIContainerProvider container={() => createDeviceContainer(serial)}>
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
      <ConditionalRender conditions={[deviceErrorModalStore.isModalOpen]}>
        <ErrorModal
          description={deviceErrorModalStore.fatalMessage}
          isOpen={deviceErrorModalStore.isModalOpen}
          title={t('Device was disconnected')}
          onClose={() => deviceErrorModalStore.closeModal()}
        />
      </ConditionalRender>
    </DIContainerProvider>
  )
})
