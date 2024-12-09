import { useTranslation } from 'react-i18next'
import { Icon20SquareStackUpOutline, Icon24ErrorCircleFillRed } from '@vkontakte/icons'
import { Accordion, Button, Div, Gradient, Paragraph, Placeholder, Spacing } from '@vkontakte/vkui'

import { ConditionalRender } from '@/components/lib/conditional-render'

import styles from './error-fallback.module.css'

import type { FallbackProps } from 'react-error-boundary'

export const ErrorFallback = ({ error, resetErrorBoundary }: FallbackProps) => {
  const { t } = useTranslation()

  return (
    <Gradient className={styles.gradient} mode='tint'>
      <Placeholder
        header={t('Something went wrong')}
        icon={<Icon24ErrorCircleFillRed height={56} width={56} />}
        action={
          <Button appearance='accent-invariable' mode='outline' size='m' onClick={resetErrorBoundary}>
            {t('Reset')}
          </Button>
        }
        stretched
      >
        <Paragraph>{error?.message}</Paragraph>
        <Spacing size='xl' />
        <ConditionalRender conditions={[!!error?.stack]}>
          <Accordion defaultExpanded={false}>
            <Accordion.Summary before={<Icon20SquareStackUpOutline height={24} width={24} />}>
              {t('Stack trace')}
            </Accordion.Summary>
            <Accordion.Content className={styles.accordionContent}>
              <Div>{error?.stack}</Div>
            </Accordion.Content>
          </Accordion>
        </ConditionalRender>
      </Placeholder>
    </Gradient>
  )
}
