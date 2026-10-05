import { Outlet } from 'react-router'
import { observer } from 'mobx-react-lite'
import { useEffect, useState } from 'react'

import { ConditionalRender } from '@/components/lib/conditional-render'

import { connectWithBackoff } from '@/api/socket'

import { authStore } from '@/store/auth-store'

import { getAuthRoute } from '@/constants/route-paths'

export const RequireAuth = observer(() => {
  // A token in the URL wins over a stored one: a page embedding DeviceHub in an iframe passes its user's token
  const [urlJwt, setUrlJwt] = useState(() => new URLSearchParams(location.search).get('jwt'))

  useEffect(() => {
    if (!authStore.isHydrated) return

    if (urlJwt) {
      authStore.login(urlJwt)
      window.history.replaceState({}, '', location.pathname + location.hash)
      setUrlJwt(null)

      return
    }

    if (!authStore.isAuthed) window.location.assign(`${getAuthRoute()}`)
  }, [authStore.isHydrated, authStore.isAuthed, urlJwt])

  useEffect(() => {
    if (authStore.isHydrated && authStore.isAuthed && !urlJwt) {
      connectWithBackoff()
    }
  }, [authStore.isHydrated, authStore.isAuthed, urlJwt])

  return (
    <ConditionalRender conditions={[authStore.isAuthed, !urlJwt]}>
      <Outlet />
    </ConditionalRender>
  )
})
