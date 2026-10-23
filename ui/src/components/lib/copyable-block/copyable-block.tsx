import { Button, Flex, FormStatus } from '@vkontakte/vkui'
import classNames from 'classnames'

import { OutputField } from '@/components/lib/output-field'
import { ConditionalRender } from '@/components/lib/conditional-render'

import styles from './copyable-block.module.css'

type CopyableBlockProps = {
  copyableText: string
  className?: string
  contentClassName?: string
  title?: string
  onOkClick?: () => void
  isClosable?: boolean
}

export const CopyableBlock = ({
  title,
  copyableText,
  onOkClick,
  isClosable = true,
  className,
  contentClassName,
}: CopyableBlockProps) => (
  <FormStatus className={classNames(styles.copyableBlock, className)} mode='default' title={title}>
    <Flex className={classNames(styles.outputContainer, contentClassName)} justify='space-between'>
      <OutputField className={styles.outputField} text={copyableText} />
      <ConditionalRender conditions={[!!isClosable]}>
        <Button appearance='overlay' className={styles.outputButton} mode='primary' size='m' onClick={onOkClick}>
          OK
        </Button>
      </ConditionalRender>
    </Flex>
  </FormStatus>
)
