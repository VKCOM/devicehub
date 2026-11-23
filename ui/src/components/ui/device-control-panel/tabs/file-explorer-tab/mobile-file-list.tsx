import { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { useInjection } from 'inversify-react'
import { Button, Input, Placeholder, Skeleton } from '@vkontakte/vkui'
import {
  Icon20DocumentOutline,
  Icon20FolderFill,
  Icon20PictureOutline,
  Icon24ChevronDown,
  Icon24ChevronRight,
  Icon24ChevronUp,
  Icon24DownloadOutline,
  Icon24HomeOutline,
  Icon24FolderSimpleArrowUpOutline,
} from '@vkontakte/icons'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { formatFileSize } from '@/lib/utils/format-file-size.util'
import { formatPermissionMode } from '@/lib/utils/format-permission-mode.util'
import { dateToFormattedString } from '@/lib/utils/date-to-formatted-string.util'

import styles from './mobile-file-list.module.css'

import type { FormEvent } from 'react'

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|heic|bmp)$/i

/* File explorer for a phone: cell rows; a file expands to its details and a download */
export const MobileFileList = observer(() => {
  const { t } = useTranslation()
  const [openedFile, setOpenedFile] = useState<string | null>(null)

  const fileExplorerService = useInjection(CONTAINER_IDS.fileExplorerService)

  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setOpenedFile(null)
    fileExplorerService.enterDirectoryLocation()
  }

  const pathOf = (name: string) =>
    fileExplorerService.currentPath === '/' ? `/${name}` : `${fileExplorerService.currentPath}/${name}`

  return (
    <div className={styles.mobileFileList}>
      <form className={styles.pathBar} onSubmit={onFormSubmit}>
        <button
          aria-label={t('Home folder')}
          className={styles.iconButton}
          type='button'
          onClick={() => {
            setOpenedFile(null)
            fileExplorerService.goHome()
          }}
        >
          <Icon24HomeOutline />
        </button>
        <button
          aria-label={t('Up one folder')}
          className={styles.iconButton}
          type='button'
          onClick={() => {
            setOpenedFile(null)
            fileExplorerService.upDirectory()
          }}
        >
          <Icon24FolderSimpleArrowUpOutline />
        </button>
        <Input
          aria-label={t('Path')}
          className={styles.path}
          enterKeyHint='go'
          value={fileExplorerService.currentPath}
          onChange={(event) => fileExplorerService.setCurrentPath(event.target.value)}
        />
      </form>
      <section className={styles.list}>
        {fileExplorerService.isDirectoryLoading &&
          Array.from({ length: 6 }, (_, index) => (
            <div key={index} className={styles.row}>
              <Skeleton height={36} width={36} />
              <Skeleton height={16} width='60%' />
            </div>
          ))}
        {!fileExplorerService.isDirectoryLoading &&
          fileExplorerService.sortedFsList.map((file) => {
            const isDirectory = fileExplorerService.isDirectory(file.mode)
            const isOpened = openedFile === file.name
            const date = dateToFormattedString({ value: file.mtime, needTime: true })
            let icon = <Icon20DocumentOutline />

            if (isDirectory) icon = <Icon20FolderFill />

            if (!isDirectory && IMAGE_EXTENSIONS.test(file.name)) icon = <Icon20PictureOutline />

            let chevron = isOpened ? <Icon24ChevronUp /> : <Icon24ChevronDown />

            if (isDirectory) chevron = <Icon24ChevronRight />

            return (
              <div key={file.name} className={styles.item}>
                <button
                  aria-expanded={isDirectory ? undefined : isOpened}
                  className={styles.row}
                  type='button'
                  onClick={() => {
                    if (isDirectory) {
                      setOpenedFile(null)
                      fileExplorerService.addSegment(file.name)

                      return
                    }

                    setOpenedFile(isOpened ? null : file.name)
                  }}
                >
                  <span className={isDirectory ? styles.folderIcon : styles.fileIcon}>{icon}</span>
                  <span className={styles.name}>
                    <b>{file.name}</b>
                    <small>{isDirectory ? date : `${formatFileSize(file.size)} · ${date}`}</small>
                  </span>
                  <span className={styles.chevron}>{chevron}</span>
                </button>
                {isOpened && (
                  <div className={styles.details}>
                    <div className={styles.detail}>
                      <span>{t('Permissions')}</span>
                      <span className={styles.mono}>{formatPermissionMode(file.mode)}</span>
                    </div>
                    <div className={styles.detail}>
                      <span>{t('Path')}</span>
                      <span className={styles.mono}>{pathOf(file.name)}</span>
                    </div>
                    <Button
                      before={<Icon24DownloadOutline height={18} width={18} />}
                      mode='secondary'
                      size='l'
                      onClick={() => fileExplorerService.getFile(file.name)}
                    >
                      {t('Download to phone')}
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        {!fileExplorerService.isDirectoryLoading && fileExplorerService.isFsListEmpty && (
          <Placeholder>
            {fileExplorerService.isDirectoryError
              ? t('This folder can’t be opened. It may need permissions the device shell doesn’t have.')
              : t('This folder is empty')}
          </Placeholder>
        )}
      </section>
    </div>
  )
})
