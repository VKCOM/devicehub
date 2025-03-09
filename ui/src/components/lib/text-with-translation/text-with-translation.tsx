import { useTranslation } from 'react-i18next'
import { EllipsisText, Text } from '@vkontakte/vkui'

export const TextWithTranslation = ({ name }: { name: string }) => {
  const { t } = useTranslation()

  return (
    <Text>
      <EllipsisText>{t(name)}</EllipsisText>
    </Text>
  )
}
