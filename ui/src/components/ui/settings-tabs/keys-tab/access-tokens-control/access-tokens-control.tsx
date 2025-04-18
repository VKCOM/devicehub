import { useEffect, useState } from 'react'
import cn from 'classnames'
import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { useInjection } from 'inversify-react'
import { Button, FormItem, FormLayoutGroup, Input, List, Placeholder, Spacing } from '@vkontakte/vkui'
import { Icon20AddSquareOutline, Icon20TagOutline, Icon28InboxOutline, Icon28KeySquareOutline } from '@vkontakte/icons'

import { WarningModal } from '@/components/ui/modals'
import { CopyableBlock } from '@/components/lib/copyable-block'
import { ConditionalRender } from '@/components/lib/conditional-render'
import { ContentCard } from '@/components/lib/content-card'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'

import { KeyListItem } from '../key-list-item'

import styles from './access-tokens-control.module.css'

import type { Token } from '@/generated/types'
import type { FormEvent } from 'react'

export const AccessTokensControl = observer(({ className }: { className?: string }) => {
  const { t } = useTranslation()
  const [accessTokenLabel, setAccessTokenLabel] = useState('')
  const [tokenDetail, setTokenDetail] = useState<Token | null>(null)
  const [isAddNewTokenOpen, setIsAddNewTokenOpen] = useState(false)
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false)
  const [isTokenDetailOpen, setIsTokenDetailOpen] = useState(false)

  const accessTokenService = useInjection(CONTAINER_IDS.accessTokenService)
  const { data = [] } = accessTokenService.accessTokensQueryResult

  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    accessTokenService.generateAccessToken(accessTokenLabel)
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
      isAfterButtonDisabled={!!accessTokenService.generatedTokenId}
      title={t('Access Tokens')}
      separator
      onAfterButtonClick={() => setIsAddNewTokenOpen((prev) => !prev)}
    >
      <ConditionalRender conditions={[!!accessTokenService.generatedTokenId]}>
        <CopyableBlock
          copyableText={accessTokenService.generatedTokenId}
          title={t('Make sure to copy your access token now. You wont be able to see it again')}
          onOkClick={() => {
            accessTokenService.resetGeneratedTokenId(accessTokenLabel)

            setIsAddNewTokenOpen(false)
            setAccessTokenLabel('')
          }}
        />
        <Spacing />
      </ConditionalRender>
      <ConditionalRender conditions={[isAddNewTokenOpen]}>
        <form onSubmit={onFormSubmit}>
          <FormLayoutGroup className={className} mode='horizontal'>
            <FormItem htmlFor='tokenTitle' top={t('Title')}>
              <Input
                before={<Icon20TagOutline />}
                className={styles.addNewTokenInput}
                disabled={!!accessTokenService.generatedTokenId}
                id='tokenTitle'
                spellCheck={false}
                value={accessTokenLabel}
                autoFocus
                onChange={(event) => setAccessTokenLabel(event.target.value)}
              />
            </FormItem>
            <Button
              appearance='accent'
              className={styles.generateTokenButton}
              disabled={!accessTokenLabel || !!accessTokenService.generatedTokenId}
              mode='secondary'
              size='m'
              type='submit'
            >
              {t('Generate')}
            </Button>
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
          <CopyableBlock copyableText={tokenDetail?.id || ''} onOkClick={() => handleCloseTokenDetail()} />
        </div>
      </WarningModal>
    </ContentCard>
  )
})
