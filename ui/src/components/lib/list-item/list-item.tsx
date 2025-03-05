import { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { useTranslation } from 'react-i18next'
import { Button, Cell, Checkbox } from '@vkontakte/vkui'

import { WarningModal } from '@/components/ui/modals'
import { ConditionalRender } from '@/components/lib/conditional-render'

import styles from './list-item.module.css'

import type { ChangeEvent, ReactNode } from 'react'

type ListItemProps = {
  title: ReactNode
  subtitle?: ReactNode
  extraSubtitle?: ReactNode
  indicator?: ReactNode
  after?: ReactNode
  defaultOpened?: boolean
  href?: string
  modalDescription?: string
  isRemoveDisabled?: boolean
  isNeedConfirmRemove?: boolean
  isOpenable?: boolean
  isSelected?: boolean
  onIsSelectedChange?: (event: ChangeEvent<HTMLInputElement>) => void
  onRemove?: () => void
  children?: ReactNode
}

export const ListItem = observer(
  ({
    title,
    subtitle,
    extraSubtitle,
    indicator,
    href,
    after,
    isSelected,
    isNeedConfirmRemove,
    isRemoveDisabled,
    modalDescription,
    onIsSelectedChange,
    onRemove,
    children,
    isOpenable = true,
    defaultOpened = false,
  }: ListItemProps) => {
    const { t } = useTranslation()
    const [isOpen, setIsOpen] = useState(defaultOpened)
    const [isConfirmationOpen, setIsConfirmationOpen] = useState(false)

    const onRemoveClick = () => {
      if (isRemoveDisabled) return

      if (isNeedConfirmRemove) {
        setIsConfirmationOpen(true)

        return
      }

      onRemove?.()
    }

    return (
      <div className={styles.listItem}>
        <Cell
          after={after}
          before={onIsSelectedChange && <Checkbox checked={isSelected} onChange={onIsSelectedChange} />}
          extraSubtitle={extraSubtitle}
          indicator={indicator}
          mode='removable'
          subtitle={subtitle}
          hasActive
          hasHover
          multiline
          onClick={isOpenable ? () => setIsOpen((prev) => !prev) : undefined}
          onRemove={onRemoveClick}
        >
          <ConditionalRender conditions={[!href]}>{title}</ConditionalRender>
          <ConditionalRender conditions={[!!href]}>
            <Button appearance='accent-invariable' href={href} mode='link' size='s'>
              {title}
            </Button>
          </ConditionalRender>
        </Cell>
        <ConditionalRender conditions={[isOpen]}>{children}</ConditionalRender>
        <WarningModal
          description={modalDescription}
          isOpen={isConfirmationOpen}
          title={t('Warning')}
          onClose={() => setIsConfirmationOpen(false)}
          onOk={async () => onRemove?.()}
        />
      </div>
    )
  }
)
