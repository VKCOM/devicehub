import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Card, Checkbox, Flex, FormItem, FormLayoutGroup } from '@vkontakte/vkui'
import { Icon24Filter } from '@vkontakte/icons'
import { observer } from 'mobx-react-lite'

import { ConditionalRender } from '@/components/lib/conditional-render'
import { COLUMN_VISIBILITY_DEFAULT } from '@/components/ui/device-table/constants'
import { DEVICE_COLUMNS } from '@/components/ui/device-table/columns'

import { useClickOutside } from '@/lib/hooks/use-click-outside.hook'
import { deviceTableState } from '@/store/device-table-state'

import styles from './table-column-visibility.module.css'

import type { MouseEvent } from 'react'
import type { ArrayType } from '@/types/array-type.type'

const COLUMNS_BY_GROUP = Object.groupBy(DEVICE_COLUMNS, (column) => column.meta?.columnGroup || 'Other')
const FIRST_THREE_COLUMN_GROUPS = Object.entries(COLUMNS_BY_GROUP).slice(0, 3)
const OTHER_COLUMN_GROUPS = Object.entries(COLUMNS_BY_GROUP).slice(3)

type RowsGroupProps = {
  columns: ArrayType<typeof DEVICE_COLUMNS>[]
  groupName: string
}

const RowsGroup = observer(({ columns, groupName }: RowsGroupProps) => {
  const onCheckboxChange = (id: string) => {
    deviceTableState.setColumnVisibility((prevVisibility) => ({ ...prevVisibility, [id]: !prevVisibility[id] }))
  }

  return (
    <FormLayoutGroup>
      <FormItem className={styles.group} top={groupName}>
        {columns?.map(({ id, meta }) =>
          id ? (
            <Checkbox
              key={id}
              checked={deviceTableState.columnVisibility[id]}
              value={id}
              onChange={() => onCheckboxChange(id)}
            >
              {meta?.columnName}
            </Checkbox>
          ) : null
        )}
      </FormItem>
    </FormLayoutGroup>
  )
})

export const TableColumnVisibility = observer(() => {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()

  useClickOutside(cardRef, () => setIsMenuOpen(false))

  const onMenuOpen = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()

    setIsMenuOpen((isOpen) => !isOpen)
  }

  const onResetClick = () => {
    deviceTableState.setColumnVisibility(COLUMN_VISIBILITY_DEFAULT)

    setIsMenuOpen(false)
  }

  return (
    <div className={styles.tableColumnVisibility}>
      <ConditionalRender conditions={[isMenuOpen]}>
        <Card className={styles.menu} getRootRef={cardRef} mode='shadow'>
          <Flex>
            <div>
              {FIRST_THREE_COLUMN_GROUPS.map(([group, columns]) => (
                <RowsGroup key={group} columns={columns} groupName={group} />
              ))}
            </div>
            <div>
              {OTHER_COLUMN_GROUPS.map(([group, columns]) => (
                <RowsGroup key={group} columns={columns} groupName={group} />
              ))}
            </div>
          </Flex>
          <Button className={styles.resetButton} size='s' onClick={onResetClick}>
            {t('Reset')}
          </Button>
        </Card>
      </ConditionalRender>
      <Button before={<Icon24Filter />} mode='tertiary' size='m' onClick={onMenuOpen}>
        {t('Customize')}
      </Button>
    </div>
  )
})
