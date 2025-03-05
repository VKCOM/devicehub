export const getMainRoute = () => '/' as const
export const getDevicesRoute = () => '/devices' as const

export const getControlRoute = (serial: string) => `/control/${serial}` as const
export const getControlLogsRoute = (serial: string) => `/control/${serial}/logs` as const
export const getControlAdvancedRoute = (serial: string) => `/control/${serial}/advanced` as const
export const getControlFileExplorerRoute = (serial: string) => `/control/${serial}/file-explorer` as const
export const getControlInfoRoute = (serial: string) => `/control/${serial}/info` as const

export const getSettingsRoute = () => '/settings' as const
export const getSettingsKeysRoute = () => '/settings/keys' as const
export const getSettingsGroupsRoute = () => '/settings/groups' as const
export const getSettingsDevicesRoute = () => '/settings/devices' as const
export const getSettingsUsersRoute = () => '/settings/users' as const
export const getSettingsShellRoute = () => '/settings/shell' as const

export const getGroupsRoute = () => '/groups' as const

export const getAuthRoute = () => '/auth' as const
export const getMockAuthRoute = () => '/auth/mock' as const
export const getLdapAuthRoute = () => '/auth/ldap' as const
