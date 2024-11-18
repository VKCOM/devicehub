import { Text } from '@vkontakte/vkui'
import { useTranslation } from 'react-i18next'

export const HeaderWithTranslation = ({ name }: { name: string }) => {
  const { t } = useTranslation()

  return <Text>{t(name)}</Text>
}
