import { Snackbar } from '@vkontakte/vkui'
import { Icon28ErrorCircleOutline } from '@vkontakte/icons'

type ErrorToastProps = {
  title: string
  text: string
  onClose: () => void
}

export const ErrorToast = ({ title, text, onClose }: ErrorToastProps) => (
  <Snackbar
    before={<Icon28ErrorCircleOutline fill='var(--vkui--color_accent_orange_fire)' />}
    placement='bottom-end'
    subtitle={text}
    onClose={onClose}
  >
    {title}
  </Snackbar>
)
