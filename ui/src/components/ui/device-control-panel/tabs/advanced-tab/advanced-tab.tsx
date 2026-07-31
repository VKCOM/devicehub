import { Flex } from '@vkontakte/vkui'

import { MaintenanceControl } from './maintenance-control'

import styles from './advanced-tab.module.css'

export const AdvancedTab = () => (
  <Flex align='start' className={styles.advancedTab} gap='l' justify='space-between'>
    <MaintenanceControl className={styles.controlCard} />
  </Flex>
)
