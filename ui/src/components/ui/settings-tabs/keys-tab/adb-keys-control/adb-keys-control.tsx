import { useEffect, useState } from 'react'
import cn from 'classnames'
import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'
import { useTranslation } from 'react-i18next'
import {
  Icon20KeyOutline,
  Icon16LogoAndroid,
  Icon28InboxOutline,
  Icon20AddSquareOutline,
  Icon20ComputerSmartphoneOutline,
} from '@vkontakte/icons'
import { Button, Div, Footnote, FormItem, FormStatus, Input, List, Placeholder, Textarea } from '@vkontakte/vkui'

import { WarningModal } from '@/components/ui/modals'
import { CopyableBlock } from '@/components/lib/copyable-block'
import { ConditionalRender } from '@/components/lib/conditional-render'
import { ContentCard } from '@/components/lib/content-card'

import { useMediaQuery } from '@/lib/hooks/use-media-query.hook'
import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import { KeyListItem } from '../key-list-item'

import styles from './adb-keys-control.module.css'

import type { FormEvent } from 'react'

export const AdbKeysControl = observer(({ className }: { className?: string }) => {
  const { t } = useTranslation()
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false)
  // Side by side with the form only on a wide screen
  const isWide = !useMediaQuery('(max-width: 768px)')

  const adbKeyService = useInjection(CONTAINER_IDS.adbKeyService)
  const currentUserProfileStore = useInjection(CONTAINER_IDS.currentUserProfileStore)
  const { data } = currentUserProfileStore.profileQueryResult

  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    adbKeyService.addAdbKey()
  }

  useEffect(() => {
    adbKeyService.addAdbKeysListeners()

    return () => {
      adbKeyService.removeAdbKeysListeners()
    }
  })

  return (
    <ContentCard
      afterButtonIcon={<Icon20AddSquareOutline />}
      afterTooltipText={t('Add ADB Key')}
      before={<Icon16LogoAndroid height={20} width={20} />}
      className={cn(className, styles.adbKeysControl)}
      title={t('ADB Keys')}
      separator
      onAfterButtonClick={() => adbKeyService.setIsAddAdbKeyOpen((prev) => !prev)}
    >
      <Footnote className={styles.hint}>
        {t(
          'Optional. If you add keys, only their owners can connect via adb connect. Without keys, anyone with the command can connect.'
        )}
      </Footnote>
      <ConditionalRender conditions={[adbKeyService.isAddAdbKeyOpen]}>
        <div className={styles.addKey}>
          <form onSubmit={onFormSubmit}>
            <FormItem htmlFor='adbKey' top={t('Key')}>
              <Textarea
                before={<Icon20KeyOutline />}
                id='adbKey'
                spellCheck={false}
                value={adbKeyService.deviceKey}
                onChange={(event) => adbKeyService.setDeviceKey(event.target.value)}
              />
            </FormItem>
            <FormItem htmlFor='tokenTitle' top={t('Device')}>
              <Input
                before={<Icon20ComputerSmartphoneOutline />}
                id='tokenTitle'
                spellCheck={false}
                value={adbKeyService.deviceTitle}
                onChange={(event) => adbKeyService.setDeviceTitle(event.target.value)}
              />
            </FormItem>
            <ConditionalRender conditions={[!!adbKeyService.errorMessage]}>
              <Div>
                <FormStatus mode='error' title={t('Oops!')}>
                  {adbKeyService.errorMessage}
                </FormStatus>
              </Div>
            </ConditionalRender>
            <FormItem className={styles.submit}>
              <Button
                appearance='accent'
                disabled={!adbKeyService.deviceKey || !adbKeyService.deviceTitle}
                mode='secondary'
                size='m'
                type='submit'
                stretched
              >
                {t('Add ADB Key')}
              </Button>
            </FormItem>
          </form>
          {/* An empty label as tall as the key one puts the block level with the key field */}
          <FormItem className={styles.instruction} top={isWide ? '\u00a0' : undefined}>
            <CopyableBlock
              className={styles.instructionBlock}
              contentClassName={styles.instructionContent}
              copyableText='pbcopy < ~/.android/adbkey.pub'
              isClosable={false}
              title={t('Run this command to copy the key to your clipboard')}
            />
          </FormItem>
        </div>
      </ConditionalRender>
      <List>
        {data?.adbKeys?.map((item, index) => (
          <KeyListItem
            key={index}
            subtitle={item.fingerprint}
            title={item.title || t('Unknown')}
            onRemove={() => {
              adbKeyService.setAdbKeyToDelete(item)

              setIsConfirmationOpen(true)
            }}
          />
        ))}
      </List>
      <ConditionalRender conditions={[!data?.adbKeys?.length]}>
        <Placeholder icon={<Icon28InboxOutline />}>{t('No ADB keys')}</Placeholder>
      </ConditionalRender>
      <WarningModal
        description={t('Are you sure you want to delete the ADB key')}
        isOpen={isConfirmationOpen}
        title={t('Warning')}
        onClose={() => setIsConfirmationOpen(false)}
        onOk={async () => adbKeyService.removeAdbKey()}
      />
    </ContentCard>
  )
})
