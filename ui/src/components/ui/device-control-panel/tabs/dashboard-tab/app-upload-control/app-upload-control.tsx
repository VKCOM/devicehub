import { useMemo, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { useInjection } from 'inversify-react'
import { FormStatus, Input, Spacing } from '@vkontakte/vkui'
import { Icon20DeleteOutline, Icon24Upload } from '@vkontakte/icons'

import { FileInput } from '@/components/lib/file-input'
import { LoadingBar } from '@/components/lib/loading-bar'
import { ConditionalRender } from '@/components/lib/conditional-render'
import { ContentCard } from '@/components/lib/content-card'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import { ActivityLauncher } from './activity-launcher'

export const AppUploadControl = observer(({ className }: { className?: string }) => {
  const { t } = useTranslation()
  const [fileInputError, setFileInputError] = useState('')
  const [pkg, setPkg] = useState('')

  const applicationInstallationService = useInjection(CONTAINER_IDS.applicationInstallationService)

  const pkgInput = useMemo(() => {
    if (applicationInstallationService.device?.platform === 'Tizen') {
      return true
    }

    return false
  }, [applicationInstallationService.device])

  return (
    <ContentCard
      afterButtonIcon={<Icon20DeleteOutline />}
      afterTooltipText={t('Clear')}
      before={<Icon24Upload height={20} width={20} />}
      className={className}
      title={t('App Upload')}
      onAfterButtonClick={() => applicationInstallationService.clear()}
    >
      {pkgInput && (
        <Input
          placeholder={'pkg'}
          style={{ marginBottom: '24px' }}
          value={pkg}
          onChange={(event) => setPkg(event.target.value)}
        />
      )}
      <FileInput
        accept={applicationInstallationService.allowedFileExtensions()}
        onError={(message) => setFileInputError(message)}
        onChange={(file) => {
          if (file) {
            applicationInstallationService.installFile(file, pkg)
          }
        }}
      />
      <Spacing size='3xl' />
      <ConditionalRender conditions={[!!fileInputError]}>
        <FormStatus mode='error' title={t('Error')}>
          {fileInputError}
        </FormStatus>
      </ConditionalRender>
      <ConditionalRender
        conditions={[applicationInstallationService.isInstalling || applicationInstallationService.isError]}
      >
        <LoadingBar
          isLoading={applicationInstallationService.isInstalling}
          status={applicationInstallationService.status}
          value={applicationInstallationService.progress}
        />
      </ConditionalRender>
      <ConditionalRender conditions={[applicationInstallationService.isInstalled]}>
        <ActivityLauncher />
      </ConditionalRender>
    </ContentCard>
  )
})
