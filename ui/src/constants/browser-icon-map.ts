import softbankParentalControlsImage from '@/assets/browser-icons/softbank-parentalcontrols.png'
import googleAndroidBrowserImage from '@/assets/browser-icons/google-android-browser.png'
import oppoBaiduSearchboxImage from '@/assets/browser-icons/oppo-baidu-searchbox.png'
import netstarFamilysmileImage from '@/assets/browser-icons/netstar-familysmile.png'
import htcSenseBrowserImage from '@/assets/browser-icons/htc-sense-browser.png'
import fujitsuFbrowserImage from '@/assets/browser-icons/fujitsu-fbrowser.png'
import androidBrowserImage from '@/assets/browser-icons/android-browser.png'
import yahooYbrowserImage from '@/assets/browser-icons/yahoo-ybrowser.png'
import lenovoBrowserImage from '@/assets/browser-icons/lenovo-browser.png'
import firefoxBetaImage from '@/assets/browser-icons/firefox-beta.png'
import asusBrowserImage from '@/assets/browser-icons/asus-browser.png'
import amazonSilkImage from '@/assets/browser-icons/amazon-silk.png'
import yahooYjtopImage from '@/assets/browser-icons/yahoo-yjtop.png'
import maxthonImage from '@/assets/browser-icons/maxthon.png'
import firefoxImage from '@/assets/browser-icons/firefox.png'
import exploreImage from '@/assets/browser-icons/explore.png'
import baiduImage from '@/assets/browser-icons/baidu.png'
import oneImage from '@/assets/browser-icons/one.png'

export enum BrowserIcon {
  AMAZON_SILK = 'amazon-silk',
  ANDROID_BROWSER = 'android-browser',
  ASUS_BROWSER = 'asus-browser',
  BAIDU = 'baidu',
  CHROME_BETA = 'chrome-beta',
  CHROME_CANARY = 'chrome-canary',
  CHROME_DEV = 'chrome-dev',
  CHROME = 'chrome',
  EXPLORE = 'explore',
  FIREFOX_BETA = 'firefox-beta',
  FIREFOX = 'firefox',
  FUJITSU_FBROWSER = 'fujitsu-fbrowser',
  GOOGLE_ANDROID_BROWSER = 'google-android-browser',
  HTC_SENSE_BROWSER = 'htc-sense-browser',
  LENOVO_BROWSER = 'lenovo-browser',
  MAXTHON = 'maxthon',
  NETSTAR_FAMILYSMILE = 'netstar-familysmile',
  ONE = 'one',
  OPERA_BETA = 'opera-beta',
  OPERA_MINI_NATIVE = 'opera-mini-native',
  OPERA_MINI = 'opera-mini',
  OPERA = 'opera',
  OPPO_BAIDU_SEARCHBOX = 'oppo-baidu-searchbox',
  PUFFIN_FREE = 'puffin-free',
  SAMSUNG_POPUPBROWSER = 'samsung-popupbrowser',
  SAMSUNG_SBROWSER = 'samsung-sbrowser',
  SOFTBANK_PARENTALCONTROLS = 'softbank-parentalcontrols',
  UC_MINI = 'uc-mini',
  UC = 'uc',
  YAHOO_YBROWSER = 'yahoo-ybrowser',
  YAHOO_YJTOP = 'yahoo-yjtop',
}

export const BROWSER_ICON_MAP: Record<string, string> = {
  [BrowserIcon.AMAZON_SILK]: amazonSilkImage,
  [BrowserIcon.ANDROID_BROWSER]: androidBrowserImage,
  [BrowserIcon.ASUS_BROWSER]: asusBrowserImage,
  [BrowserIcon.BAIDU]: baiduImage,
  [BrowserIcon.CHROME_BETA]: 'https://cdnjs.cloudflare.com/ajax/libs/browser-logos/75.0.1/chrome-beta/chrome-beta.svg',
  [BrowserIcon.CHROME_CANARY]:
    'https://cdnjs.cloudflare.com/ajax/libs/browser-logos/75.0.1/chrome-canary/chrome-canary.svg',
  [BrowserIcon.CHROME_DEV]: 'https://cdnjs.cloudflare.com/ajax/libs/browser-logos/75.0.1/chrome-dev/chrome-dev.svg',
  [BrowserIcon.CHROME]: 'https://cdnjs.cloudflare.com/ajax/libs/browser-logos/75.0.1/chrome/chrome.svg',
  [BrowserIcon.EXPLORE]: exploreImage,
  [BrowserIcon.FIREFOX_BETA]: firefoxBetaImage,
  [BrowserIcon.FIREFOX]: firefoxImage,
  [BrowserIcon.FUJITSU_FBROWSER]: fujitsuFbrowserImage,
  [BrowserIcon.GOOGLE_ANDROID_BROWSER]: googleAndroidBrowserImage,
  [BrowserIcon.HTC_SENSE_BROWSER]: htcSenseBrowserImage,
  [BrowserIcon.LENOVO_BROWSER]: lenovoBrowserImage,
  [BrowserIcon.MAXTHON]: maxthonImage,
  [BrowserIcon.NETSTAR_FAMILYSMILE]: netstarFamilysmileImage,
  [BrowserIcon.ONE]: oneImage,
  [BrowserIcon.OPERA_BETA]: 'https://cdnjs.cloudflare.com/ajax/libs/browser-logos/75.0.1/opera-beta/opera-beta.svg',
  [BrowserIcon.OPERA_MINI_NATIVE]:
    'https://cdnjs.cloudflare.com/ajax/libs/browser-logos/75.0.1/opera-mini/opera-mini_32x32',
  [BrowserIcon.OPERA_MINI]: 'https://cdnjs.cloudflare.com/ajax/libs/browser-logos/75.0.1/opera-mini/opera-mini_32x32',
  [BrowserIcon.OPERA]: 'https://cdnjs.cloudflare.com/ajax/libs/browser-logos/75.0.1/opera/opera.svg',
  [BrowserIcon.OPPO_BAIDU_SEARCHBOX]: oppoBaiduSearchboxImage,
  [BrowserIcon.PUFFIN_FREE]: 'https://cdnjs.cloudflare.com/ajax/libs/browser-logos/75.0.1/puffin/puffin_32x32.png',
  [BrowserIcon.SAMSUNG_POPUPBROWSER]:
    'https://cdnjs.cloudflare.com/ajax/libs/browser-logos/75.0.1/samsung-internet/samsung-internet.svg',
  [BrowserIcon.SAMSUNG_SBROWSER]:
    'https://cdnjs.cloudflare.com/ajax/libs/browser-logos/75.0.1/samsung-internet/samsung-internet.svg',
  [BrowserIcon.SOFTBANK_PARENTALCONTROLS]: softbankParentalControlsImage,
  [BrowserIcon.UC_MINI]: 'https://cdnjs.cloudflare.com/ajax/libs/browser-logos/75.0.1/uc-mini/uc-mini_32x32.png',
  [BrowserIcon.UC]: 'https://cdnjs.cloudflare.com/ajax/libs/browser-logos/75.0.1/uc/uc.svg',
  [BrowserIcon.YAHOO_YBROWSER]: yahooYbrowserImage,
  [BrowserIcon.YAHOO_YJTOP]: yahooYjtopImage,
}
