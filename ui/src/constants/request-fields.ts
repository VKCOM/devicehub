export const DEVICE_LIST_FIELDS =
  'abi,battery.health,battery.level,battery.scale,battery.source,battery.status,battery.temp,bookedBefore,browser.apps,channel,cpuPlatform,createdAt,display.width,display.height,display.rotation,display.url,group,ios,macAddress,manufacturer,marketName,model,name,network.type,network.subtype,notes,openGLESVersion,operator,owner.email,owner.name,phone.iccid,phone.imei,phone.imsi,phone.phoneNumber,place,platform,present,product,provider.name,ready,releaseAt,sdk,serial,service,status,statusChangedAt,storageId,usage,using,version'

export const DEVICE_GROUPS_FIELDS =
  'serial,model,version,operator,network.type,network.subtype,display.height,display.width,manufacturer,sdk,abi,cpuPlatform,openGLESVersion,marketName,phone.imei,provider.name,group.originName,group.class,group.lifeTime'

export const DEVICE_SETTINGS_FIELDS =
  'serial,model,version,manufacturer,sdk,marketName,provider.name,group.originName,storageId,place,adbPort'

export const DEVICE_SHELL_FIELDS =
  'model,serial,version,display.height,display.width,manufacturer,sdk,abi,cpuPlatform,openGLESVersion,marketName,phone.imei,provider.name,group.originName,storageId,place,channel'

export const USERS_GROUPS_FIELDS =
  'email,name,privilege,groups.subscribed,groups.quotas.allocated,groups.quotas.consumed'

export const USERS_SETTINGS_FIELDS = 'email,name,privilege,groups.quotas'

export const USERS_TEAMS_FIELDS = 'email,name,privilege'

export const GROUPS_TEAMS_FIELDS = 'name,id,class,owner,privilege'
