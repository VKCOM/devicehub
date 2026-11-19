import { Flex } from '@vkontakte/vkui'

import { useIsMobileControl } from '@/lib/hooks/use-is-mobile-control.hook'

import { MaintenanceControl } from './maintenance-control'

import styles from './advanced-tab.module.css'

export const AdvancedTab = () => {
  const isMobileControl = useIsMobileControl()

  if (isMobileControl) return <MaintenanceControl isCompact />

  return (
    <Flex align='start' className={styles.advancedTab} gap='l' justify='space-between'>
      <MaintenanceControl className={styles.controlCard} />
    </Flex>
  )
}
