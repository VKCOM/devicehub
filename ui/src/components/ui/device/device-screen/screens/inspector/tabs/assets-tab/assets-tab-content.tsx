import { observer } from 'mobx-react-lite'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@vkontakte/vkui'
import { Icon24DownloadOutline } from '@vkontakte/icons'

import { ScreenList } from '../../../screen-list'

import styles from './assets-tab-content.module.css'

import type { ApplicationAssetsListItem } from '@/types/application.type'
import type { ScreenListItem } from '../../../screen-list'

export interface AssetsTabContentProps {
  assetsList: ApplicationAssetsListItem[]
  onAssetDownload: (url: string) => void
  isLoading?: boolean
}

export const AssetsTabContent = observer<AssetsTabContentProps>(
  ({ assetsList, onAssetDownload, isLoading = false }) => {
    const { t } = useTranslation()
    const [searchQuery, setSearchQuery] = useState('')
    const [downloadingAsset, setDownloadingAsset] = useState<string | null>(null)

    const extractFilename = (url: string): string => url.split('/').pop() || url

    const assetItems: ScreenListItem[] = useMemo(
      () =>
        assetsList.map((asset) => ({
          id: asset.url,
          name: extractFilename(asset.url),
          subtitle: asset.mimeType,
          data: { url: asset.url, mimeType: asset.mimeType } as { url: string; mimeType: string },
        })),
      [assetsList]
    )

    const handleDownload = async (url: string) => {
      if (downloadingAsset) return

      setDownloadingAsset(url)

      try {
        await onAssetDownload(url)
      } finally {
        setDownloadingAsset(null)
      }
    }

    const renderAssetItem = (item: ScreenListItem) => {
      const url = (item.data as { url: string }).url
      const isDownloading = downloadingAsset === url
      const isDisabled = downloadingAsset !== null

      return (
        <div key={item.id} className={styles.assetItem}>
          <div className={styles.assetInfo}>
            <div className={styles.assetName}>{item.name}</div>
            <div className={styles.assetSubtitle}>{item.subtitle}</div>
          </div>

          <div className={styles.buttonContainer}>
            <Button
              before={<Icon24DownloadOutline />}
              className={styles.downloadButton}
              disabled={isDisabled}
              mode='secondary'
              size='s'
              onClick={() => handleDownload(url)}
            >
              {isDownloading ? t('Downloading...') : t('Download')}
            </Button>
          </div>
        </div>
      )
    }

    return (
      <div className={styles.container}>
        <ScreenList
          emptyStateSubtitle={t('Assets will appear here after launching an application')}
          emptyStateTitle={t('No assets found')}
          isLoading={isLoading}
          items={assetItems}
          placeholder={t('Search assets...')}
          renderItem={renderAssetItem}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />
      </div>
    )
  }
)
