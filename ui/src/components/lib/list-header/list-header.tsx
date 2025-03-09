import { useEffect, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { useInjection } from 'inversify-react'
import { useTranslation } from 'react-i18next'
import {
  Button,
  ButtonGroup,
  Checkbox,
  Flex,
  Pagination,
  Placeholder,
  Search,
  Skeleton,
  Tooltip,
} from '@vkontakte/vkui'
import {
  Icon16DeleteOutline,
  Icon16Lock,
  Icon16UnlockOutline,
  Icon20AddSquareOutline,
  Icon28InboxOutline,
} from '@vkontakte/icons'

import { WarningModal } from '@/components/ui/modals'
import { BaseSelect } from '@/components/lib/base-select'
import { TitledValue } from '@/components/lib/titled-value'
import { ContentCard } from '@/components/lib/content-card'
import { ConditionalRender } from '@/components/lib/conditional-render'

import { PAGE_SIZE_OPTIONS } from '@/constants/page-size-options'

import styles from './list-header.module.css'

import type { ReactNode } from 'react'
import type { interfaces } from 'inversify'
import type { ListManagementService } from '@/services/list-management-service'

type ListHeaderProps<T> = {
  title: string
  actions?: ReactNode
  beforeIcon?: ReactNode
  beforeAddButton?: ReactNode
  isAddButtonDisabled?: boolean
  isAddButtonLoading?: boolean
  isRemoveButtonDisabled?: boolean
  isItemsLoading?: boolean
  containerId: interfaces.ServiceIdentifier<T>
  beforePagination?: ReactNode
  skeletonHeight?: number
  onRemove?: () => void
  onAddItem?: () => void
  children: ReactNode
}

export const ListHeader = observer(
  <T extends ListManagementService>({
    title,
    actions,
    beforeIcon,
    containerId,
    beforeAddButton,
    isItemsLoading,
    isAddButtonLoading,
    isAddButtonDisabled,
    isRemoveButtonDisabled,
    beforePagination,
    skeletonHeight,
    onAddItem,
    onRemove,
    children,
  }: ListHeaderProps<T>) => {
    const { t } = useTranslation()
    const [isConfirmationOpen, setIsConfirmationOpen] = useState(false)

    const listService = useInjection<T>(containerId)

    const onRemoveClick = () => {
      if (listService.needConfirm) {
        setIsConfirmationOpen(true)

        return
      }

      onRemove?.()
    }

    useEffect(() => {
      listService.setCurrentPage(1)
    }, [listService.isPaginatedItemsEmpty])

    return (
      <ContentCard
        afterButtonIcon={<Icon20AddSquareOutline />}
        afterTooltipText={t('Add')}
        before={beforeIcon}
        className={styles.listHeader}
        extraAfter={beforeAddButton}
        isAfterButtonDisabled={isAddButtonDisabled}
        isAfterButtonLoading={isAddButtonLoading}
        title={title}
        onAfterButtonClick={onAddItem}
      >
        <Flex align='center' justify='space-between' noWrap>
          <Search
            className={styles.search}
            placeholder={t('Search')}
            value={listService.globalFilter}
            onChange={(event) => listService.setGlobalFilter(event.target.value)}
          />
          <ButtonGroup align='center' gap='s'>
            {actions}
            <Tooltip appearance='accent' description={t('Enable Disable confirmation for items removing')}>
              <Button
                activated={listService.needConfirm}
                before={listService.needConfirm ? <Icon16Lock /> : <Icon16UnlockOutline />}
                mode='tertiary'
                size='s'
                onClick={() => listService.toggleNeedConfirm()}
              >
                {t('Need Confirm')}
              </Button>
            </Tooltip>
            <div>
              <Tooltip appearance='accent' description={t('Remove selected items')}>
                <Button
                  before={<Icon16DeleteOutline />}
                  disabled={isRemoveButtonDisabled}
                  mode='tertiary'
                  size='s'
                  onClick={onRemoveClick}
                >
                  {t('Remove')}
                </Button>
              </Tooltip>
            </div>
          </ButtonGroup>
        </Flex>
        {beforePagination}
        <Flex align='center' justify='space-between'>
          <Checkbox
            checked={listService.isAllItemsOnPageSelected}
            className={styles.selectAllCheckbox}
            onChange={(event) => listService.selectItemsOnPage(event.target.checked)}
          >
            {t('Select all')}
          </Checkbox>
          <Flex align='center' className={styles.pagination}>
            <Pagination
              boundaryCount={1}
              currentPage={listService.currentPage}
              navigationButtonsStyle='both'
              siblingCount={2}
              totalPages={listService.totalPages}
              onChange={(page) => listService.setCurrentPage(page)}
            />
            <BaseSelect
              options={PAGE_SIZE_OPTIONS}
              selectType='plain'
              stretched={false}
              value={listService.pageSize}
              onChange={(value) => listService.setPageSize(Number(value))}
            />
          </Flex>
          <Flex align='center' className={styles.afterPagination}>
            <TitledValue
              className={styles.titledValue}
              isValueLoading={isItemsLoading}
              title={t('Displayed')}
              value={listService.paginatedItems.length}
            />
            <TitledValue
              className={styles.titledValue}
              isValueLoading={isItemsLoading}
              title={t('Selected')}
              value={listService.selectedItems.length}
            />
          </Flex>
        </Flex>
        {children}
        <ConditionalRender conditions={[listService.isPaginatedItemsEmpty && !isItemsLoading]}>
          <Placeholder icon={<Icon28InboxOutline />}>{t('Empty')}</Placeholder>
        </ConditionalRender>
        <ConditionalRender conditions={[!!isItemsLoading]}>
          <Flex direction='column' gap={5}>
            {Array(5)
              .fill({})
              .map((_, index) => (
                <Skeleton
                  key={index}
                  colorFrom='var(--vkui--color_background_tertiary_alpha)'
                  colorTo='var(--vkui--color_skeleton_to)'
                  height={skeletonHeight}
                  width='100%'
                />
              ))}
          </Flex>
        </ConditionalRender>
        <WarningModal
          description={t('Really delete selected items')}
          isOpen={isConfirmationOpen}
          title={t('Warning')}
          onClose={() => setIsConfirmationOpen(false)}
          onOk={async () => onRemove?.()}
        />
      </ContentCard>
    )
  }
)
