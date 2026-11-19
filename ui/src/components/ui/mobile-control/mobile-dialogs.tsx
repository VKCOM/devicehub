import { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { useNavigate } from 'react-router'
import { useInjection } from 'inversify-react'
import { useTranslation } from 'react-i18next'
import { Button, ButtonGroup, FormItem, SimpleCell, Switch, Textarea } from '@vkontakte/vkui'

import { BaseModal } from '@/components/lib/base-modal'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { ACCESSORY_KEY_IDS } from '@/store/mobile-control-store'

import { getMainRoute } from '@/constants/route-paths'

import { useAccessoryKeys } from './accessory-keys'

import styles from './tools-sheet.module.css'

type MobileDialogsProps = {
  deviceName: string
}

/* Stop Using confirmation, the dialog that types a whole text on the device and the keyboard row settings */
export const MobileDialogs = observer(({ deviceName }: MobileDialogsProps) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [text, setText] = useState('')

  const deviceControlStore = useInjection(CONTAINER_IDS.deviceControlStore)
  const mobileControlStore = useInjection(CONTAINER_IDS.mobileControlStore)
  const deviceBySerialStore = useInjection(CONTAINER_IDS.deviceBySerialStore)
  const deviceDisconnection = useInjection(CONTAINER_IDS.deviceDisconnection)
  const accessoryKeys = useAccessoryKeys()

  const closePaste = () => {
    setText('')
    mobileControlStore.setPasteDialogOpen(false)
  }

  return (
    <>
      <BaseModal
        description={t('The device goes back to the pool. Apps and data you added may be cleaned.')}
        isOpen={mobileControlStore.isStopConfirmationOpen}
        title={t('Stop using {{name}}?', { name: deviceName })}
        actions={
          <ButtonGroup gap='s' mode='horizontal' stretched>
            <Button
              appearance='negative'
              size='l'
              stretched
              onClick={async () => {
                mobileControlStore.setStopConfirmationOpen(false)

                const { data: device } = deviceBySerialStore.deviceQueryResult()

                if (!device?.serial) return

                await deviceDisconnection.stopUsingDevice(device.serial)

                navigate(getMainRoute(), { replace: true })
              }}
            >
              {t('Stop using')}
            </Button>
            <Button
              mode='secondary'
              size='l'
              stretched
              onClick={() => mobileControlStore.setStopConfirmationOpen(false)}
            >
              {t('Cancel')}
            </Button>
          </ButtonGroup>
        }
        onClose={() => mobileControlStore.setStopConfirmationOpen(false)}
      />
      <BaseModal
        description={t('Typed into the focused field on the device, character by character.')}
        isOpen={mobileControlStore.isPasteDialogOpen}
        title={t('Paste text')}
        actions={
          <ButtonGroup gap='s' mode='horizontal' stretched>
            <Button
              disabled={!text}
              size='l'
              stretched
              onClick={() => {
                deviceControlStore.type(text)
                mobileControlStore.showSnackbar(t('Characters sent: {{length}}', { length: text.length }))
                closePaste()
              }}
            >
              {t('Send to device')}
            </Button>
            <Button mode='secondary' size='l' stretched onClick={closePaste}>
              {t('Cancel')}
            </Button>
          </ButtonGroup>
        }
        onClose={closePaste}
      >
        <FormItem className={styles.pasteField} htmlFor='mobile-paste-text'>
          <Textarea
            aria-label={t('Text to send')}
            id='mobile-paste-text'
            placeholder={t('Paste a token, URL or test data')}
            rows={4}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </FormItem>
      </BaseModal>
      <BaseModal
        description={t('Pick the keys shown above the keyboard. Hide and these settings are always there.')}
        isOpen={mobileControlStore.isAccessorySettingsOpen}
        title={t('Keyboard row')}
        onClose={() => mobileControlStore.setAccessorySettingsOpen(false)}
      >
        <div className={styles.accessorySettingsList}>
          {ACCESSORY_KEY_IDS.map((id) => (
            <SimpleCell
              key={id}
              before={<span className={styles.accessorySettingsKey}>{accessoryKeys[id].content}</span>}
              Component='label'
              after={
                <Switch
                  checked={mobileControlStore.accessoryKeys.includes(id)}
                  onChange={(event) => mobileControlStore.setAccessoryKeyShown(id, event.target.checked)}
                />
              }
            >
              {accessoryKeys[id].label}
            </SimpleCell>
          ))}
        </div>
      </BaseModal>
    </>
  )
})
