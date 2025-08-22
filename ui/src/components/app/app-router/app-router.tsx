import { Navigate, Route, createHashRouter, createRoutesFromElements } from 'react-router'

import { GroupsPage } from '@/components/views/groups-page'
import { DevicesPage } from '@/components/views/devices-page'
import { ControlPage } from '@/components/views/control-page'
import { MainLayout } from '@/components/layouts/main-layout'
import { SettingsPage } from '@/components/views/settings-page'

import {
  getMainRoute,
  getGroupsRoute,
  getControlRoute,
  getDevicesRoute,
  getSettingsRoute,
} from '@/constants/route-paths'

import { ErrorBoundaryElement } from './error-boundary-element'
import { RequireAuth } from './require-auth'

export const appRouter = createHashRouter(
  createRoutesFromElements(
    <Route element={<ErrorBoundaryElement />}>
      <Route element={<RequireAuth />}>
        <Route element={<MainLayout />}>
          <Route element={<ErrorBoundaryElement />}>
            <Route element={<DevicesPage />} path={getMainRoute()} />
            <Route element={<DevicesPage />} path={getDevicesRoute()} />
            <Route element={<ControlPage />} path={getControlRoute(':serial')}>
              <Route element={<ControlPage />} path='logs' />
              <Route element={<ControlPage />} path='advanced' />
              <Route element={<ControlPage />} path='file-explorer' />
              <Route element={<ControlPage />} path='info' />
            </Route>
            <Route element={<SettingsPage />} path={getSettingsRoute()}>
              <Route element={<SettingsPage />} path='keys' />
              <Route element={<SettingsPage />} path='groups' />
              <Route element={<SettingsPage />} path='teams' />
              <Route element={<SettingsPage />} path='devices' />
              <Route element={<SettingsPage />} path='users' />
              <Route element={<SettingsPage />} path='shell' />
            </Route>
            <Route element={<GroupsPage />} path={getGroupsRoute()} />
            <Route element={<Navigate to={getDevicesRoute()} replace />} path='*' />
          </Route>
        </Route>
      </Route>
    </Route>
  )
)
