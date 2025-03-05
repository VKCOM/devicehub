import { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { useInjection } from 'inversify-react'
import { Button, Card, Div, Flex, Input } from '@vkontakte/vkui'

import { SaveLogsModal } from '@/components/ui/modals'
import { ConditionalRender } from '@/components/lib/conditional-render'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { logsTableState } from '@/store/logs-table-state'

import { LogsTable } from './logs-table'

import styles from './logs-tab.module.css'

export const LogsTab = observer(() => {
  const { t } = useTranslation()
  const [isModalOpen, setIsModalOpen] = useState(false)

  const logcatService = useInjection(CONTAINER_IDS.logcatService)

  return (
    <Card className={styles.logsTab} mode='tint'>
      <Div>
        <Flex align='center' justify='space-between' noWrap>
          <Input
            className={styles.search}
            placeholder={t('Search')}
            value={logsTableState.globalFilter}
            onChange={(event) => logsTableState.setGlobalFilter(event.target.value)}
          />
          <Flex gap='m' noWrap>
            <ConditionalRender conditions={[!logcatService.isLogcatStarted]}>
              <Button
                appearance='accent-invariable'
                mode='primary'
                size='m'
                stretched
                onClick={() => logcatService.startLogcat()}
              >
                {t('Start')}
              </Button>
            </ConditionalRender>
            <ConditionalRender conditions={[logcatService.isLogcatStarted]}>
              <Button
                appearance='negative'
                mode='primary'
                size='m'
                stretched
                onClick={() => logcatService.stopLogcat()}
              >
                {t('Stop')}
              </Button>
            </ConditionalRender>
            <Button disabled={logcatService.isLogsEmpty} mode='secondary' size='m' onClick={() => setIsModalOpen(true)}>
              {t('Export')}
            </Button>
            <Button
              disabled={logcatService.isLogsEmpty}
              mode='secondary'
              size='m'
              onClick={() => logcatService.clearLogs()}
            >
              {t('Clear')}
            </Button>
          </Flex>
        </Flex>
      </Div>
      <LogsTable />
      <SaveLogsModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </Card>
  )
})
