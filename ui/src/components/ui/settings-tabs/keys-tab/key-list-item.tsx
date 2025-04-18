import { Cell } from '@vkontakte/vkui'
import { observer } from 'mobx-react-lite'
import { Icon20KeyOutline } from '@vkontakte/icons'

import styles from './keys-tab.module.css'

type KeyListItemProps = {
  title: string
  subtitle?: string
  onRemove: () => void
  onClick?: () => void
}

export const KeyListItem = observer(({ title, subtitle, onRemove, onClick }: KeyListItemProps) => (
  <Cell
    before={<Icon20KeyOutline />}
    className={styles.listItem}
    mode='removable'
    subtitle={subtitle}
    onClick={onClick}
    onRemove={onRemove}
  >
    {title}
  </Cell>
))
