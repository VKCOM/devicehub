/* NOTE: iPadOS reports itself as a Mac, but a Mac has no touch screen */
export const isIosClient = (): boolean =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

/* Opened from the Home Screen (iOS) or as an installed web app */
export const isStandaloneClient = (): boolean =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

/* Safari itself, not another iOS browser, offers Add to Home Screen in its share sheet */
export const isIosSafariClient = (): boolean =>
  isIosClient() && !/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser/.test(navigator.userAgent)

/* NOTE: iOS has no Fullscreen API for pages, a Home Screen app is its full screen */
export const isFullscreenAvailable = (): boolean => !isIosClient() && !!document.fullscreenEnabled

export const getMobileVkuiPlatform = (): 'ios' | 'android' => (isIosClient() ? 'ios' : 'android')
