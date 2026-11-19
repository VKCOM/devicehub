import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'
import { useTranslation } from 'react-i18next'
import { Button, Div, Footnote, Group, Header, SimpleCell, Slider, Switch } from '@vkontakte/vkui'
import { Icon24AddSquareOutline, Icon24ChevronLeft } from '@vkontakte/icons'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { isFullscreenAvailable } from '@/lib/utils/mobile-platform.util'

import styles from './tools-sheet.module.css'

const QUALITY_MIN = 10
const QUALITY_MAX = 80

type ViewSettingsProps = {
  deviceName: string
}

/* View settings of this phone: they change only how the device is shown here */
export const ViewSettings = observer(({ deviceName }: ViewSettingsProps) => {
  const { t } = useTranslation()

  const deviceControlStore = useInjection(CONTAINER_IDS.deviceControlStore)
  const mobileControlStore = useInjection(CONTAINER_IDS.mobileControlStore)
  const deviceBySerialStore = useInjection(CONTAINER_IDS.deviceBySerialStore)

  const { data: device } = deviceBySerialStore.deviceQueryResult()

  return (
    <>
      <div className={styles.pageHeader}>
        <button
          aria-label={t('Back to tools')}
          className={styles.iconButton}
          type='button'
          onClick={() => mobileControlStore.setSheetPage('tabs')}
        >
          <Icon24ChevronLeft />
        </button>
        <b>{t('View settings')}</b>
      </div>
      <Group header={<Header size='s'>{t('On this phone')}</Header>} mode='card'>
        <SimpleCell
          Component='label'
          after={
            <Switch
              checked={mobileControlStore.isStripEnabled}
              onChange={(event) => {
                mobileControlStore.setStripEnabled(event.target.checked)
                mobileControlStore.showSnackbar(
                  event.target.checked
                    ? t('Navigation buttons are on')
                    : t('Navigation buttons are off. Tools open from the floating button.')
                )
              }}
            />
          }
          subtitle={t(
            'Keyboard, Back, Home and Recents under the screen. Saved for {{name}}. Turn off if the device has its own on-screen buttons.',
            { name: deviceName }
          )}
          multiline
        >
          {t('Navigation buttons')}
        </SimpleCell>
        <SimpleCell
          Component='label'
          subtitle={t('Your phone won’t sleep while this page is open.')}
          after={
            <Switch
              checked={mobileControlStore.keepScreenOn}
              onChange={(event) => mobileControlStore.setKeepScreenOn(event.target.checked)}
            />
          }
          multiline
        >
          {t('Keep screen on')}
        </SimpleCell>
        <SimpleCell
          Component='label'
          subtitle={t('Zooms the picture 2×; drag to look around. Touches stay on your phone while it is on.')}
          after={
            <Switch
              checked={mobileControlStore.isMagnifierOn}
              onChange={(event) => mobileControlStore.setMagnifierOn(event.target.checked)}
            />
          }
          multiline
        >
          {t('Magnifier')}
        </SimpleCell>
        <SimpleCell
          Component='label'
          subtitle={t('A small ring under each finger touching the device.')}
          after={
            <Switch
              checked={mobileControlStore.isTouchIndicatorShown}
              onChange={(event) => mobileControlStore.setTouchIndicatorShown(event.target.checked)}
            />
          }
          multiline
        >
          {t('Show touches')}
        </SimpleCell>
        <SimpleCell
          Component='label'
          subtitle={t('A short fading line of the exact path sent to the device.')}
          after={
            <Switch
              checked={mobileControlStore.isTouchTrailShown}
              onChange={(event) => mobileControlStore.setTouchTrailShown(event.target.checked)}
            />
          }
          multiline
        >
          {t('Touch trail')}
        </SimpleCell>
        {/* NOTE: Full screen itself is a button in the sheet header, iPhone Safari has no full screen API */}
        {!isFullscreenAvailable() && (
          <Div>
            <Button
              before={<Icon24AddSquareOutline />}
              mode='secondary'
              size='l'
              stretched
              onClick={() => mobileControlStore.showAddToHomeScreenHint()}
            >
              {t('Full screen: add to Home Screen')}
            </Button>
          </Div>
        )}
      </Group>
      {device?.platform === 'Android' && (
        <Group header={<Header size='s'>{t('Screen quality')}</Header>} mode='card'>
          <Div>
            <div className={styles.qualityRow}>
              <Slider
                aria-label={t('Screen quality')}
                max={QUALITY_MAX}
                min={QUALITY_MIN}
                step={10}
                value={deviceControlStore.currentQuality || QUALITY_MIN}
                onChange={(value) => deviceControlStore.changeDeviceQuality(value)}
              />
              <b className={styles.qualityValue}>{deviceControlStore.currentQuality}</b>
            </div>
            <Footnote className={styles.hint}>
              {t('Lower quality uses less mobile data. It follows your connection until you move the slider.')}
            </Footnote>
          </Div>
        </Group>
      )}
    </>
  )
})
