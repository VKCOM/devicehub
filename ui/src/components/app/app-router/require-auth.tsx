import { Outlet } from 'react-router'
import { observer } from 'mobx-react-lite'
import { useEffect } from 'react'

import { ConditionalRender } from '@/components/lib/conditional-render'

import { connectWithBackoff } from '@/api/socket'

import { authStore } from '@/store/auth-store'

import { getAuthRoute } from '@/constants/route-paths'

export const RequireAuth = observer(() => {
  useEffect(() => {
    if (!authStore.isAuthed) {
      const params = new URLSearchParams(location.search)
      const jwt = params.get('jwt')

      if (!jwt) {
        window.location.assign(`${getAuthRoute()}`)

        return
      }

      authStore.login(jwt)
      window.history.replaceState({}, '', location.pathname + location.hash)
    }
  }, [authStore.isAuthed])

  useEffect(() => {
    if (authStore.isHydrated && authStore.isAuthed) {
      connectWithBackoff()
    }
  }, [authStore.isHydrated, authStore.isAuthed])

  return (
    <ConditionalRender conditions={[authStore.isAuthed]}>
      <Outlet />
    </ConditionalRender>
  )
})
