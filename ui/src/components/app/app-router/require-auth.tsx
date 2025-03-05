import { Navigate, useLocation, Outlet } from 'react-router'
import { observer } from 'mobx-react-lite'

import { ConditionalRender } from '@/components/lib/conditional-render'

import { authStore } from '@/store/auth-store'

import { getAuthRoute } from '@/constants/route-paths'

export const RequireAuth = observer(() => {
  const location = useLocation()

  return (
    <>
      <ConditionalRender conditions={[!authStore.isAuthed]}>
        <Navigate state={{ from: location }} to={getAuthRoute()} replace />
      </ConditionalRender>
      <ConditionalRender conditions={[authStore.isAuthed]}>
        <Outlet />
      </ConditionalRender>
    </>
  )
})
