import { memo } from 'react'
import { Flex, Image } from '@vkontakte/vkui'

import softbankParentalControlsImage from './assets/softbank-parentalcontrols.png'
import googleAndroidBrowserImage from './assets/google-android-browser.png'
import samsungPopupbrowserImage from './assets/samsung-popupbrowser.png'
import oppoBaiduSearchboxImage from './assets/oppo-baidu-searchbox.png'
import netstarFamilysmileImage from './assets/netstar-familysmile.png'
import htcSenseBrowserImage from './assets/htc-sense-browser.png'
import operaMiniNativeImage from './assets/opera-mini-native.png'
import samsungSbrowserImage from './assets/samsung-sbrowser.png'
import fujitsuFbrowserImage from './assets/fujitsu-fbrowser.png'
import androidBrowserImage from './assets/android-browser.png'
import yahooYbrowserImage from './assets/yahoo-ybrowser.png'
import lenovoBrowserImage from './assets/lenovo-browser.png'
import chromeCanaryImage from './assets/chrome-canary.png'
import firefoxBetaImage from './assets/firefox-beta.png'
import asusBrowserImage from './assets/asus-browser.png'
import chromeBetaImage from './assets/chrome-beta.png'
import amazonSilkImage from './assets/amazon-silk.png'
import yahooYjtopImage from './assets/yahoo-yjtop.png'
import puffinFreeImage from './assets/puffin-free.png'
import chromeDevImage from './assets/chrome-dev.png'
import operaMiniImage from './assets/opera-mini.png'
import operaBetaImage from './assets/opera-beta.png'
import maxthonImage from './assets/maxthon.png'
import firefoxImage from './assets/firefox.png'
import exploreImage from './assets/explore.png'
import chromeImage from './assets/chrome.png'
import operaImage from './assets/opera.png'
import baiduImage from './assets/baidu.png'
import oneImage from './assets/one.png'
import ucMiniImage from './assets/uc-mini.png'
import ucImage from './assets/uc.png'

import type { DeviceBrowserAppsItem } from '@/generated/types'

enum BrowserIcon {
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

const BROWSER_ICON_MAP: Record<string, string> = {
  [BrowserIcon.AMAZON_SILK]: amazonSilkImage,
  [BrowserIcon.ANDROID_BROWSER]: androidBrowserImage,
  [BrowserIcon.ASUS_BROWSER]: asusBrowserImage,
  [BrowserIcon.BAIDU]: baiduImage,
  [BrowserIcon.CHROME_BETA]: chromeBetaImage,
  [BrowserIcon.CHROME_CANARY]: chromeCanaryImage,
  [BrowserIcon.CHROME_DEV]: chromeDevImage,
  [BrowserIcon.CHROME]: chromeImage,
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
  [BrowserIcon.OPERA_BETA]: operaBetaImage,
  [BrowserIcon.OPERA_MINI_NATIVE]: operaMiniNativeImage,
  [BrowserIcon.OPERA_MINI]: operaMiniImage,
  [BrowserIcon.OPERA]: operaImage,
  [BrowserIcon.OPPO_BAIDU_SEARCHBOX]: oppoBaiduSearchboxImage,
  [BrowserIcon.PUFFIN_FREE]: puffinFreeImage,
  [BrowserIcon.SAMSUNG_POPUPBROWSER]: samsungPopupbrowserImage,
  [BrowserIcon.SAMSUNG_SBROWSER]: samsungSbrowserImage,
  [BrowserIcon.SOFTBANK_PARENTALCONTROLS]: softbankParentalControlsImage,
  [BrowserIcon.UC_MINI]: ucMiniImage,
  [BrowserIcon.UC]: ucImage,
  [BrowserIcon.YAHOO_YBROWSER]: yahooYbrowserImage,
  [BrowserIcon.YAHOO_YJTOP]: yahooYjtopImage,
}

type BrowserCellProps = {
  apps?: DeviceBrowserAppsItem[]
}

export const BrowserCell = memo(({ apps }: BrowserCellProps) => (
  <Flex>
    {apps?.map(({ id, type }) => (
      <Image key={id} alt={type} size={24} src={type && BROWSER_ICON_MAP[type]} title={type} />
    ))}
  </Flex>
))
