import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AdaptivityProvider, ConfigProvider } from '@vkontakte/vkui'
import { QueryClientProvider } from '@tanstack/react-query'

import { App } from '@/components/app/app'

import { queryClient } from '@/config/queries/query-client'

import { enableMocking } from './__mocks__/enable-mocking'

import '@/styles/index.css'
import '@vkontakte/vkui/dist/cssm/styles/themes.css'

import '@/config/i18n/i18n'

enableMocking().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ConfigProvider platform='vkcom'>
        <AdaptivityProvider>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </AdaptivityProvider>
      </ConfigProvider>
    </StrictMode>
  )
})
