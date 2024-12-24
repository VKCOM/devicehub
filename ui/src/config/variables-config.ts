export const variablesConfig: Record<string, { openStfApiHostUrl: string; websocketUrl: string }> = {
  development: {
    openStfApiHostUrl: 'http://localhost:7100',
    websocketUrl: 'http://localhost:7110',
  },
  staging: {
    openStfApiHostUrl: window.location.origin,
    websocketUrl: window.location.origin,
  },
  production: {
    openStfApiHostUrl: window.location.origin,
    websocketUrl: window.location.origin,
  },
}
