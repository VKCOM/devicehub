import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'
import { Button, Card, Div, Flex, IconButton, Input } from '@vkontakte/vkui'
import { Icon20HomeOutline, Icon20FolderSimpleArrowUpOutline, Icon24ChevronCompactRight } from '@vkontakte/icons'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { useIsMobileControl } from '@/lib/hooks/use-is-mobile-control.hook'

import { FileExplorerTable } from './file-explorer-table'
import { MobileFileList } from './mobile-file-list'

import styles from './file-explorer-tab.module.css'

import type { FormEvent } from 'react'

export const FileExplorerTab = observer(() => {
  const fileExplorerService = useInjection(CONTAINER_IDS.fileExplorerService)
  const isMobileControl = useIsMobileControl()

  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    fileExplorerService.enterDirectoryLocation()
  }

  if (isMobileControl) return <MobileFileList />

  return (
    <Card className={styles.fileExplorerTab} mode='tint'>
      <Div>
        <Flex align='center' gap='m' justify='space-between' noWrap>
          <Flex noWrap>
            <Button
              appearance='neutral'
              before={<Icon20HomeOutline />}
              mode='tertiary'
              onClick={() => fileExplorerService.goHome()}
            />
            <Button
              appearance='neutral'
              before={<Icon20FolderSimpleArrowUpOutline />}
              mode='tertiary'
              onClick={() => fileExplorerService.upDirectory()}
            />
          </Flex>
          <form className={styles.form} onSubmit={onFormSubmit}>
            <Input
              value={fileExplorerService.currentPath}
              after={
                <IconButton hoverMode='opacity' label='list directory' type='submit'>
                  <Icon24ChevronCompactRight />
                </IconButton>
              }
              onChange={(event) => fileExplorerService.setCurrentPath(event.target.value)}
            />
          </form>
        </Flex>
        <FileExplorerTable />
      </Div>
    </Card>
  )
})
