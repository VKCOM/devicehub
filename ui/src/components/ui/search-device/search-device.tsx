import { useRef } from 'react'
import { Div, IconButton, Input } from '@vkontakte/vkui'
import { Icon16Clear } from '@vkontakte/icons'
import { useTranslation } from 'react-i18next'
import { observer } from 'mobx-react-lite'

import { DEVICE_COLUMNS } from '@/components/ui/device-table/columns'

import { deviceTableState } from '@/store/device-table-state'

import styles from './search-device.module.css'

import type { ChangeEvent } from 'react'

export const SearchDevice = observer(() => {
  const textInput = useRef<HTMLInputElement>(null)
  const { t } = useTranslation()

  const onClear = () => {
    if (textInput.current) {
      deviceTableState.setGlobalFilter('')
      textInput.current.focus()
    }
  }

  const onSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    deviceTableState.setGlobalFilter(event.target.value)
  }

  return (
    <Div className={styles.searchDevice}>
      <Input
        className={styles.search}
        getRef={textInput}
        list='columns-list'
        placeholder={t('Device search')}
        type='text'
        value={deviceTableState.globalFilter}
        after={
          deviceTableState.globalFilter ? (
            <IconButton hoverMode='opacity' label='Очистить поле' onClick={onClear}>
              <Icon16Clear />
            </IconButton>
          ) : undefined
        }
        onChange={onSearchChange}
      />
      <datalist id='columns-list'>
        {DEVICE_COLUMNS.map((item) => (
          <option key={item.id} value={`${item.id}:`}>
            {item.meta?.columnName}
          </option>
        ))}
      </datalist>
    </Div>
  )
})
