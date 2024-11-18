import { Navigate, Route, createHashRouter, createRoutesFromElements } from 'react-router-dom'

import { GroupsPage } from '@/components/views/groups-page'
import { DevicesPage } from '@/components/views/devices-page'
import { ControlPage } from '@/components/views/control-page'
import { MainLayout } from '@/components/layouts/main-layout'
import { SettingsPage } from '@/components/views/settings-page'

import {
  getControlRoute,
  getDevicesRoute,
  getGroupsRoute,
  getMainRoute,
  getSettingsRoute,
} from '@/constants/route-paths'

export const appRouter = createHashRouter(
  createRoutesFromElements(
    <Route element={<MainLayout />}>
      <Route element={<DevicesPage />} path={getMainRoute()} />
      <Route element={<DevicesPage />} path={getDevicesRoute()} />
      <Route element={<ControlPage />} path={getControlRoute(':deviceSerial')} />
      <Route element={<SettingsPage />} path={getSettingsRoute()}>
        <Route element={<SettingsPage />} path='keys' />
        <Route element={<SettingsPage />} path='groups' />
        <Route element={<SettingsPage />} path='devices' />
        <Route element={<SettingsPage />} path='users' />
        <Route element={<SettingsPage />} path='shell' />
      </Route>
      <Route element={<GroupsPage />} path={getGroupsRoute()} />
      <Route element={<Navigate to={getDevicesRoute()} replace />} path='*' />
    </Route>
  )
)
