export const getMainRoute = () => '/' as const
export const getDevicesRoute = () => '/devices' as const
export const getControlRoute = (deviceSerial: string) => `/control/${deviceSerial}` as const
export const getSettingsRoute = () => '/settings' as const
export const getSettingsKeysRoute = () => '/settings/keys' as const
export const getSettingsGroupsRoute = () => '/settings/groups' as const
export const getSettingsDevicesRoute = () => '/settings/devices' as const
export const getSettingsUsersRoute = () => '/settings/users' as const
export const getSettingsShellRoute = () => '/settings/shell' as const
export const getGroupsRoute = () => '/groups' as const
