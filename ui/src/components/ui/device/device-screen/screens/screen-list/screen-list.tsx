import { observer } from 'mobx-react-lite'
import { useMemo, type ReactNode, type ChangeEvent } from 'react'
import { Input, Spinner, CustomScrollView } from '@vkontakte/vkui'
import { Icon16Clear, Icon56DevicesOutline } from '@vkontakte/icons'

import { useDebounce } from '@/lib/hooks/use-debounce.hook'

import styles from './screen-list.module.css'

/**
 * Universal item interface for ScreenList component
 */
export interface ScreenListItem {
  /** Unique identifier for the item */
  id: string
  /** Primary display name */
  name: string
  /** Optional secondary text (e.g., package name for apps, URL for assets) */
  subtitle?: string
  /** Additional data to be passed through to event handlers */
  data?: unknown
}

/**
 * Props for the ScreenList component
 *
 * @example
 * // For applications:
 * const appItems = Object.entries(apps).map(([name, pkg]) => ({
 *   id: pkg,
 *   name,
 *   subtitle: pkg,
 *   data: { packageName: pkg }
 * }))
 *
 * @example
 * // For assets:
 * const assetItems = assetsList.map(asset => ({
 *   id: asset.url,
 *   name: extractFilename(asset.url),
 *   subtitle: asset.mimeType,
 *   data: { url: asset.url, type: asset.type }
 * }))
 */
export interface ScreenListProps {
  /** Array of items to display */
  items: ScreenListItem[]
  /** Callback when an item is clicked */
  onItemClick?: (item: ScreenListItem) => void
  /** Whether the list is in loading state */
  isLoading?: boolean
  /** Current search query value */
  searchQuery?: string
  /** Callback when search query changes */
  onSearchChange?: (query: string) => void
  /** Custom render function for items (overrides default rendering) */
  renderItem?: (item: ScreenListItem, index: number) => ReactNode
  /** Placeholder text for search input */
  placeholder?: string
  /** Title for empty state */
  emptyStateTitle?: string
  /** Subtitle for empty state */
  emptyStateSubtitle?: string
  /** Whether to show search input */
  showSearch?: boolean
  hidden?: boolean
}

export const ScreenList = observer<ScreenListProps>(
  ({
    items,
    onItemClick,
    isLoading = false,
    searchQuery = '',
    onSearchChange,
    renderItem,
    placeholder = 'Search...',
    emptyStateTitle = 'No items found',
    emptyStateSubtitle = 'Items will appear here when available',
    showSearch = true,
    hidden,
  }) => {
    const debouncedSearchQuery = useDebounce(searchQuery, 300)

    const filteredItems = useMemo(() => {
      if (!debouncedSearchQuery.trim()) {
        return items
      }

      const query = debouncedSearchQuery.toLowerCase()

      return items.filter(
        (item) => item.name.toLowerCase().includes(query) || item.subtitle?.toLowerCase().includes(query)
      )
    }, [items, debouncedSearchQuery])

    const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
      onSearchChange?.(event.target.value)
    }

    const clearSearch = () => {
      onSearchChange?.('')
    }

    const handleItemClick = (item: ScreenListItem) => {
      onItemClick?.(item)
    }

    const defaultRenderItem = (item: ScreenListItem) => (
      <div
        key={item.id}
        className={styles.listItem}
        role='button'
        tabIndex={0}
        onClick={() => handleItemClick(item)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleItemClick(item)
          }
        }}
      >
        <div className={styles.itemInfo}>
          <div className={styles.itemName}>{item.name}</div>
          {item.subtitle && <div className={styles.itemSubtitle}>{item.subtitle}</div>}
        </div>
      </div>
    )

    if (hidden) return null

    return (
      <div className={styles.container}>
        {showSearch && (
          <div className={styles.searchContainer}>
            <Input
              placeholder={placeholder}
              value={searchQuery}
              after={
                searchQuery && (
                  <button
                    type='button'
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                    }}
                    onClick={clearSearch}
                  >
                    <Icon16Clear />
                  </button>
                )
              }
              onChange={handleSearchChange}
            />
          </div>
        )}

        <CustomScrollView className={styles.scrollContainer}>
          {isLoading ? (
            <div className={styles.loadingState}>
              <Spinner size='l' />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon}>
                <Icon56DevicesOutline />
              </div>
              <div className={styles.emptyStateText}>{searchQuery ? 'No items found' : emptyStateTitle}</div>
              <div className={styles.emptyStateSubtext}>
                {searchQuery ? `Try adjusting your search for "${searchQuery}"` : emptyStateSubtitle}
              </div>
            </div>
          ) : (
            <div className={styles.itemList}>
              {filteredItems.map((item, index) => (renderItem ? renderItem(item, index) : defaultRenderItem(item)))}
            </div>
          )}
        </CustomScrollView>
      </div>
    )
  }
)
