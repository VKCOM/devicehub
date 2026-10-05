export const getMainRoute = () => '/' as const
export const getDevicesRoute = () => '/devices' as const
export const getControlRoute = (serial: string, provider?: string) =>
  provider === undefined
    ? `/control/${serial}`
    : `/silent-control/${encodeURIComponent(provider)}/${encodeURIComponent(serial)}`
export const getControlLogsRoute = (serial: string, provider?: string) => `${getControlRoute(serial, provider)}/logs`
export const getControlAdvancedRoute = (serial: string, provider?: string) =>
  `${getControlRoute(serial, provider)}/advanced`
export const getControlFileExplorerRoute = (serial: string, provider?: string) =>
  `${getControlRoute(serial, provider)}/file-explorer`
export const getControlInfoRoute = (serial: string, provider?: string) => `${getControlRoute(serial, provider)}/info`

export const getSettingsRoute = () => '/settings' as const
export const getSettingsKeysRoute = () => '/settings/keys' as const
export const getSettingsGroupsRoute = () => '/settings/groups' as const
export const getSettingsTeamsRoute = () => '/settings/teams' as const
export const getSettingsDevicesRoute = () => '/settings/devices' as const
export const getSettingsUsersRoute = () => '/settings/users' as const
export const getSettingsShellRoute = () => '/settings/shell' as const

export const getGroupsRoute = () => '/groups' as const

export const getAuthRoute = () => '/auth' as const
export const getMockAuthRoute = () => '/auth/mock' as const
export const getLdapAuthRoute = () => '/auth/ldap' as const
