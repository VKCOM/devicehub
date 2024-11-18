import { RouterProvider } from 'react-router-dom'
import { AppRoot } from '@vkontakte/vkui'

import { appRouter } from './app-router'

export const App = () => (
  <AppRoot>
    <RouterProvider router={appRouter} />
  </AppRoot>
)
