export type ApplicationsList = Record<string, string>

export interface ApplicationLaunchResult {
  pkg: string
  pid: number
  port: number
  error?: string
}

export interface ApplicationKillResult {
  result: boolean
  error?: string
}

export type ResourceType =
  | 'Document'
  | 'Stylesheet'
  | 'Image'
  | 'Media'
  | 'Font'
  | 'Script'
  | 'TextTrack'
  | 'XHR'
  | 'Fetch'
  | 'EventSource'
  | 'WebSocket'
  | 'Manifest'
  | 'SignedExchange'
  | 'Ping'
  | 'CSPViolationReport'
  | 'Preflight'
  | 'Other'

export interface ApplicationAssetsListItem {
  url: string
  type: ResourceType
  mimeType: string
}

export interface ApplicationAssetsList {
  frameId: string
  assets: ApplicationAssetsListItem[]
}

export interface ApplicationAsset<T extends boolean = boolean> {
  content: string
  base64Encoded: T
}
