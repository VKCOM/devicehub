import { RouterProvider } from 'react-router/dom'
import { AdaptivityProvider, AppRoot, ConfigProvider } from '@vkontakte/vkui'

import { useTheme } from '@/lib/hooks/use-theme.hook'

import { appRouter } from './app-router'

export const App = () => {
  const { theme } = useTheme()

  return (
    <ConfigProvider appearance={theme === 'system' ? undefined : theme} platform='vkcom'>
      <AdaptivityProvider>
        <AppRoot>
          <RouterProvider router={appRouter} />
        </AppRoot>
      </AdaptivityProvider>
    </ConfigProvider>
  )
}
