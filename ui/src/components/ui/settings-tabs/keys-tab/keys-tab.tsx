import { Flex } from '@vkontakte/vkui'

import { AdbKeysControl } from './adb-keys-control'
import { AccessTokensControl } from './access-tokens-control'

import styles from './keys-tab.module.css'

export const KeysTab = () => (
  <Flex align='stretch' className={styles.keysTab} direction='column' gap='l'>
    <AccessTokensControl className={styles.controlCard} />
    <AdbKeysControl className={styles.controlCard} />
  </Flex>
)
