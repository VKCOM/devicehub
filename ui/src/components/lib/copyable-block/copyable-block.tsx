import { Button, Flex, FormStatus } from '@vkontakte/vkui'

import { OutputField } from '@/components/lib/output-field'
import { ConditionalRender } from '@/components/lib/conditional-render'

import styles from './copyable-block.module.css'

type CopyableBlockProps = {
  title?: string
  copyableText: string
  onOkClick?: () => void
  isClosable?: boolean
}

export const CopyableBlock = ({ title, copyableText, onOkClick, isClosable = true }: CopyableBlockProps) => (
  <FormStatus className={styles.copyableBlock} mode='default' title={title}>
    <Flex className={styles.outputContainer} justify='space-between'>
      <OutputField className={styles.outputField} text={copyableText} />
      <ConditionalRender conditions={[isClosable]}>
        <Button appearance='overlay' className={styles.outputButton} mode='primary' size='m' onClick={onOkClick}>
          OK
        </Button>
      </ConditionalRender>
    </Flex>
  </FormStatus>
)
