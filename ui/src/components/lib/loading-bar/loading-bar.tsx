import { Headline, Progress } from '@vkontakte/vkui'
import cn from 'classnames'

import styles from './loading-bar.module.css'

type LoadingBarProps = {
  value: number
  status: string
  isLoading?: boolean
}

export const LoadingBar = ({ value, status, isLoading = true }: LoadingBarProps) => (
  <>
    <Progress height={10} value={value} />
    <Headline className={styles.status} level='1'>
      <span>
        {status} ({value}%)
      </span>
      <span
        className={cn({
          [styles.loader]: isLoading,
        })}
      >
        ...
      </span>
    </Headline>
  </>
)
