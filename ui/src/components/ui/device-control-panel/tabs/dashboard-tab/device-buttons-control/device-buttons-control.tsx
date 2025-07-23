import { FormItem, FormLayoutGroup, SelectionControl, Switch } from '@vkontakte/vkui'
import { useTranslation } from 'react-i18next'
import {
  Icon24Play,
  Icon24Stop,
  Icon24Search,
  Icon24SkipBack,
  Icon24SkipNext,
  Icon28VolumeAlt,
  Icon24LogoGoogle,
  Icon24SunOutline,
  Icon24SkipForward,
  Icon20MoonOutline,
  Icon24TextOutline,
  Icon28MuteOutline,
  Icon28TextOutline,
  Icon24OnOffOutline,
  Icon24SkipPrevious,
  Icon24CameraOutline,
  Icon20TextTtOutline,
  Icon16UnlockOutline,
  Icon28VolumeOutline,
  Icon28SettingsOutline,
} from '@vkontakte/icons'
import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'
import { useMutation } from '@tanstack/react-query'

import { ContentCard } from '@/components/lib/content-card'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import { ButtonControl } from './button-control'

import styles from './device-buttons-control.module.css'

export const DeviceButtonsControl = observer(({ className }: { className?: string }) => {
  const { t } = useTranslation()

  const deviceControlStore = useInjection(CONTAINER_IDS.deviceControlStore)
  const deviceBySerialStore = useInjection(CONTAINER_IDS.deviceBySerialStore)
  const { data: device } = deviceBySerialStore.deviceQueryResult()
  const airplaneMutation = useMutation({
    mutationFn: async ({ enabled }: { enabled: boolean }) => {
      const tr = await deviceControlStore.setAirplaneMode(enabled)
      await tr.donePromise
    },
  })

  return (
    <ContentCard
      before={<Icon28SettingsOutline height={20} width={20} />}
      className={className}
      title={t('Device Buttons')}
    >
      <FormLayoutGroup>
        <FormItem top={t('Special Keys')}>
          <div className={styles.buttonsContainer}>
            <ButtonControl
              appearance='negative'
              icon={<Icon24OnOffOutline />}
              tooltipText={t('Power')}
              onClick={() => {
                deviceControlStore.power()
              }}
            />
            <ButtonControl
              icon={<Icon16UnlockOutline />}
              tooltipText={t('Unlock device')}
              onClick={() => {
                deviceControlStore.unlockDevice()
              }}
            />
            <ButtonControl
              icon={<Icon24CameraOutline />}
              tooltipText={t('Camera')}
              onClick={() => deviceControlStore.camera()}
            />
            {device?.platform === 'Android' && (
              <ButtonControl
                icon={<Icon28TextOutline />}
                tooltipText={t('Switch Charset')}
                onClick={() => deviceControlStore.switchCharset()}
              />
            )}
            <ButtonControl
              icon={<Icon24Search />}
              tooltipText={t('Search')}
              onClick={() => deviceControlStore.search()}
            />
          </div>
        </FormItem>
        <FormItem top={t('Volume')}>
          <div className={styles.buttonsContainer}>
            <ButtonControl
              icon={<Icon28MuteOutline />}
              tooltipText={t('Mute')}
              onClick={() => deviceControlStore.mute()}
            />
            <ButtonControl
              icon={<Icon28VolumeOutline />}
              tooltipText={t('Volume Down')}
              onClick={() => deviceControlStore.volumeDown()}
            />
            <ButtonControl
              icon={<Icon28VolumeAlt />}
              tooltipText={t('Volume Up')}
              onClick={() => deviceControlStore.volumeUp()}
            />
          </div>
        </FormItem>
        {device?.platform === 'Android' && (
          <>
            <FormItem top={t('Special actions')}>
              <div className={styles.buttonsContainer}>
                <ButtonControl
                  icon={<Icon24SunOutline color='#fac60a' />}
                  tooltipText={t('Set Light Theme')}
                  onClick={() => deviceControlStore.setLightTheme()}
                />
                <ButtonControl
                  icon={<Icon20MoonOutline color='#6bcded' />}
                  tooltipText={t('Set Dark Theme')}
                  onClick={() => deviceControlStore.setDarkTheme()}
                />
                <ButtonControl tooltipText={`${t('Enable')} DKA`} onClick={() => deviceControlStore.enableDKA()}>
                  DKA
                </ButtonControl>
                <ButtonControl
                  appearance='negative'
                  className={styles.lineThrough}
                  tooltipText={`${t('Disable')} DKA`}
                  onClick={() => deviceControlStore.disableDKA()}
                >
                  DKA
                </ButtonControl>
                <ButtonControl
                  icon={<Icon24LogoGoogle />}
                  tooltipText={`${t('Enable')} Google Services`}
                  onClick={() => deviceControlStore.enableGoogleServices()}
                />
                <ButtonControl
                  appearance='negative'
                  icon={<Icon24LogoGoogle />}
                  tooltipText={`${t('Disable')} Google Services`}
                  onClick={() => deviceControlStore.disableGoogleServices()}
                />
                <ButtonControl
                  icon={<Icon20TextTtOutline />}
                  tooltipText={t('Change language')}
                  onClick={() => deviceControlStore.openLanguageChange()}
                />
              </div>
              <div className={styles.buttonsContainer}>
                <SelectionControl>
                  <Switch
                    checked={device?.airplaneMode}
                    disabled={airplaneMutation.isPending}
                    onChange={(event) => {
                      airplaneMutation.mutate({ enabled: event.target.checked })
                    }}
                  />
                  <SelectionControl.Label>{t('Airplane Mode')}</SelectionControl.Label>
                </SelectionControl>
              </div>
            </FormItem>
            <FormItem top={t('Font size')}>
              <div className={styles.buttonsContainer}>
                <ButtonControl
                  icon={<Icon24TextOutline />}
                  iconHeight={14}
                  iconWidth={14}
                  tooltipText={t('Small')}
                  onClick={() => deviceControlStore.changeToSmallFont()}
                />
                <ButtonControl
                  icon={<Icon24TextOutline />}
                  iconHeight={17}
                  iconWidth={17}
                  tooltipText={t('Normal')}
                  onClick={() => deviceControlStore.changeToNormalFont()}
                />
                <ButtonControl
                  icon={<Icon24TextOutline />}
                  iconHeight={20}
                  iconWidth={20}
                  tooltipText={t('Big')}
                  onClick={() => deviceControlStore.changeToBigFont()}
                />
              </div>
            </FormItem>
            <FormItem top={t('Media')}>
              <div className={styles.buttonsContainer}>
                <ButtonControl
                  icon={<Icon24SkipPrevious />}
                  tooltipText={t('Rewind')}
                  onClick={() => deviceControlStore.mediaRewind()}
                />
                <ButtonControl
                  icon={<Icon24SkipBack />}
                  tooltipText={t('Previous')}
                  onClick={() => deviceControlStore.mediaPrevious()}
                />
                <ButtonControl
                  icon={<Icon24Play />}
                  tooltipText={t('Play/Pause')}
                  onClick={() => deviceControlStore.mediaPlayPause()}
                />
                <ButtonControl
                  icon={<Icon24Stop />}
                  tooltipText={t('Stop')}
                  onClick={() => deviceControlStore.mediaStop()}
                />
                <ButtonControl
                  icon={<Icon24SkipForward />}
                  tooltipText={t('Next')}
                  onClick={() => deviceControlStore.mediaNext()}
                />
                <ButtonControl
                  icon={<Icon24SkipNext />}
                  tooltipText={t('Fast Forward')}
                  onClick={() => deviceControlStore.mediaFastForward()}
                />
              </div>
            </FormItem>
          </>
        )}
      </FormLayoutGroup>
    </ContentCard>
  )
})
