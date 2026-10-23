import { useEffect, useState } from 'react'
import cn from 'classnames'
import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { useInjection } from 'inversify-react'
import { Button, Footnote, FormItem, FormLayoutGroup, Input, List, Placeholder, Spacing } from '@vkontakte/vkui'
import { Icon20AddSquareOutline, Icon20TagOutline, Icon28InboxOutline, Icon28KeySquareOutline } from '@vkontakte/icons'

import { WarningModal } from '@/components/ui/modals'
import { CopyableBlock } from '@/components/lib/copyable-block'
import { ConditionalRender } from '@/components/lib/conditional-render'
import { ContentCard } from '@/components/lib/content-card'
import { BaseSelect } from '@/components/lib/base-select'

import { useMediaQuery } from '@/lib/hooks/use-media-query.hook'
import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { formatDateWithLocale } from '@/lib/utils/format-date-with-locale.util'

import { KeyListItem } from '../key-list-item'

import styles from './access-tokens-control.module.css'

import type { CreateAccessTokenLifetime, Token } from '@/generated/types'
import type { SelectOption } from '@/components/lib/base-select'
import type { FormEvent } from 'react'

const LIFETIME_OPTIONS: SelectOption<CreateAccessTokenLifetime>[] = [
  { name: 'No expiration', value: 0 },
  { name: '1 month', value: 1 },
  { name: '2 months', value: 2 },
  { name: '3 months', value: 3 },
]

export const AccessTokensControl = observer(({ className }: { className?: string }) => {
  const { t } = useTranslation()
  const [accessTokenLabel, setAccessTokenLabel] = useState('')
  const [lifetime, setLifetime] = useState<CreateAccessTokenLifetime>(0)
  // The fields do not fit in one row on a narrow screen
  const isDesktop = !useMediaQuery('(max-width: 768px)')
  const [tokenDetail, setTokenDetail] = useState<Token | null>(null)
  const [isAddNewTokenOpen, setIsAddNewTokenOpen] = useState(false)
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false)
  const [isTokenDetailOpen, setIsTokenDetailOpen] = useState(false)

  const accessTokenService = useInjection(CONTAINER_IDS.accessTokenService)
  const { data = [] } = accessTokenService.accessTokensQueryResult

  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    accessTokenService.generateAccessToken(accessTokenLabel, lifetime)
  }

  const handleViewToken = (title: string) => {
    accessTokenService.getAccessTokenByTitle(title).then((token) => {
      setTokenDetail(token)
      setIsTokenDetailOpen(true)
    })
  }

  const handleCloseTokenDetail = () => {
    setIsTokenDetailOpen(false)
    setTokenDetail(null)
  }

  useEffect(() => {
    accessTokenService.addAccessTokenGeneratedListener()

    return () => {
      accessTokenService.removeAccessTokenGeneratedListener()
    }
  }, [])

  return (
    <ContentCard
      afterButtonIcon={<Icon20AddSquareOutline />}
      afterTooltipText={t('Generate Access Token')}
      before={<Icon28KeySquareOutline height={20} width={20} />}
      className={cn(className, styles.accessTokensControl)}
      isAfterButtonDisabled={!!accessTokenService.generatedToken}
      title={t('Access Tokens')}
      separator
      onAfterButtonClick={() => setIsAddNewTokenOpen((prev) => !prev)}
    >
      <ConditionalRender conditions={[!!accessTokenService.generatedToken]}>
        <CopyableBlock
          copyableText={accessTokenService.generatedToken}
          title={t('This is sensitive information. Do not share this token.')}
          onOkClick={() => {
            accessTokenService.resetGeneratedTokenId(accessTokenLabel)

            setIsAddNewTokenOpen(false)
            setAccessTokenLabel('')
            setLifetime(0)
          }}
        />
        <Spacing />
      </ConditionalRender>
      <ConditionalRender conditions={[isAddNewTokenOpen]}>
        <form onSubmit={onFormSubmit}>
          <FormLayoutGroup mode={isDesktop ? 'horizontal' : 'vertical'}>
            <FormItem htmlFor='tokenTitle' top={t('Title')}>
              <Input
                before={<Icon20TagOutline />}
                className={styles.addNewTokenInput}
                disabled={!!accessTokenService.generatedToken}
                id='tokenTitle'
                spellCheck={false}
                value={accessTokenLabel}
                autoFocus
                onChange={(event) => setAccessTokenLabel(event.target.value)}
              />
            </FormItem>
            <FormItem htmlFor='tokenLifetime' top={t('Lifetime')}>
              <BaseSelect
                id='tokenLifetime'
                isDisabled={!!accessTokenService.generatedToken}
                options={LIFETIME_OPTIONS.map((option) => ({ ...option, name: t(option.name) }))}
                value={lifetime}
                onChange={(value) => setLifetime(Number(value) as CreateAccessTokenLifetime)}
              />
            </FormItem>
            <ConditionalRender conditions={[isDesktop]}>
              <Button
                appearance='accent'
                className={styles.generateTokenButton}
                disabled={!accessTokenLabel || !!accessTokenService.generatedToken}
                mode='secondary'
                size='m'
                type='submit'
              >
                {t('Generate')}
              </Button>
            </ConditionalRender>
            <ConditionalRender conditions={[!isDesktop]}>
              <FormItem>
                <Button
                  appearance='accent'
                  disabled={!accessTokenLabel || !!accessTokenService.generatedToken}
                  mode='secondary'
                  size='m'
                  type='submit'
                  stretched
                >
                  {t('Generate')}
                </Button>
              </FormItem>
            </ConditionalRender>
          </FormLayoutGroup>
        </form>
        <Spacing />
      </ConditionalRender>
      <List>
        {data.map((item, index) => (
          <KeyListItem
            key={index}
            title={item}
            onClick={() => handleViewToken(item)}
            onRemove={() => {
              accessTokenService.setTokenToRemove(item)
              setIsConfirmationOpen(true)
            }}
          />
        ))}
      </List>
      <ConditionalRender conditions={[!data.length]}>
        <Placeholder icon={<Icon28InboxOutline />}>{t('No access tokens')}</Placeholder>
      </ConditionalRender>
      <WarningModal
        description={t('Are you sure you want to delete the access token')}
        isOpen={isConfirmationOpen}
        title={t('Warning')}
        onClose={() => setIsConfirmationOpen(false)}
        onOk={async () => accessTokenService.removeAccessToken()}
      />
      <WarningModal
        actions={<div />}
        description={t('This is sensitive information. Do not share this token.')}
        isOpen={isTokenDetailOpen && !!tokenDetail}
        title={t('Access Token')}
        onClose={handleCloseTokenDetail}
      >
        <div className={styles.tokenWrapper}>
          <Footnote className={styles.expiration}>
            {tokenDetail?.expiresAt
              ? t('Expires on {{date}}', { date: formatDateWithLocale(new Date(tokenDetail.expiresAt)) })
              : t('Never expires')}
          </Footnote>
          <CopyableBlock
            className={styles.copyBlock}
            copyableText={tokenDetail?.id || ''}
            onOkClick={() => handleCloseTokenDetail()}
          />
        </div>
      </WarningModal>
    </ContentCard>
  )
})
