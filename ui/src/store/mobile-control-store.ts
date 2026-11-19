import { makeAutoObservable } from 'mobx'
import { inject, injectable } from 'inversify'

import { CONTAINER_IDS } from '@/config/inversify/container-ids'
import { readStoredValue, writeStoredValue } from '@/lib/utils/local-storage.util'

import type { SheetState } from '@/components/ui/mobile-control/mobile-layout'

export type SheetPage = 'tabs' | 'settings'
export type FabPosition = { side: 'left' | 'right'; y: number }

const STORAGE_PREFIX = 'devicehub.mobileControl'

/* NOTE: Keys of the row above the phone keyboard; Hide and the row settings are always there */
export const ACCESSORY_KEY_IDS = ['tab', 'left', 'right', 'up', 'down', 'home', 'end', 'esc', 'enter', 'paste'] as const
export type AccessoryKeyId = (typeof ACCESSORY_KEY_IDS)[number]

const DEFAULT_ACCESSORY_KEYS: AccessoryKeyId[] = ['tab', 'left', 'right', 'esc', 'paste']
const MAGNIFIER_ZOOM = 2

/* State of the phone layout of the control page; the desktop layout does not use it */
@injectable()
export class MobileControlStore {
  sheet: SheetState = 'closed'
  sheetPage: SheetPage = 'tabs'
  isKeyboardOpen = false
  isStripEnabled: boolean
  keepScreenOn: boolean
  fabPosition: FabPosition
  isMagnifierOn = false
  /* NOTE: A small ring under each finger and a short fading line of its path, both sent to the device */
  isTouchIndicatorShown: boolean
  isTouchTrailShown: boolean
  magnifierOffset = { x: 0, y: 0 }
  isAddToHomeScreenHintShown = false
  isAlertDismissed = false
  /* NOTE: A global alert marks the tools button until the sheet is opened */
  isAlertSeen = false
  isStopConfirmationOpen = false
  isPasteDialogOpen = false
  isAccessorySettingsOpen = false
  accessoryKeys: AccessoryKeyId[]
  snackbarText: string | null = null

  private keyboardInput: HTMLTextAreaElement | null = null

  constructor(@inject(CONTAINER_IDS.deviceSerial) private serial: string) {
    this.isStripEnabled = readStoredValue(this.stripStorageKey, true)
    this.keepScreenOn = readStoredValue(`${STORAGE_PREFIX}.keepScreenOn`, true)
    this.accessoryKeys = readStoredValue<AccessoryKeyId[]>(`${STORAGE_PREFIX}.accessoryKeys`, DEFAULT_ACCESSORY_KEYS).filter(
      (id) => ACCESSORY_KEY_IDS.includes(id)
    )
    this.isTouchIndicatorShown = readStoredValue(`${STORAGE_PREFIX}.touchIndicator`, true)
    this.isTouchTrailShown = readStoredValue(`${STORAGE_PREFIX}.touchTrail`, true)
    this.fabPosition = readStoredValue<FabPosition>(`${STORAGE_PREFIX}.fab`, { side: 'right', y: 0.62 })

    makeAutoObservable<this, 'keyboardInput'>(this, { keyboardInput: false })
  }

  get magnifierZoom(): number {
    return MAGNIFIER_ZOOM
  }

  get isSheetOpen(): boolean {
    return this.sheet !== 'closed'
  }

  private get stripStorageKey(): string {
    return `${STORAGE_PREFIX}.strip.${this.serial}`
  }

  setKeyboardInput(input: HTMLTextAreaElement | null): void {
    this.keyboardInput = input
  }

  /* NOTE: Must run inside the tap handler: iOS shows the keyboard only for a focus in a user gesture */
  openKeyboard(): void {
    this.keyboardInput?.focus({ preventScroll: true })
    this.sheet = 'closed'
    this.sheetPage = 'tabs'
    this.isKeyboardOpen = true
  }

  closeKeyboard(): void {
    this.isKeyboardOpen = false
    this.keyboardInput?.blur()
  }

  toggleKeyboard(): void {
    if (this.isKeyboardOpen) {
      this.closeKeyboard()

      return
    }

    this.openKeyboard()
  }

  setSheet(sheet: SheetState): void {
    if (sheet !== 'closed' && this.isKeyboardOpen) this.closeKeyboard()

    if (sheet === 'closed') this.sheetPage = 'tabs'

    if (sheet !== 'closed') this.isAlertSeen = true

    this.sheet = sheet
  }

  toggleSheet(): void {
    this.setSheet(this.isSheetOpen ? 'closed' : 'half')
  }

  toggleSettings(): void {
    this.sheetPage = this.sheetPage === 'settings' ? 'tabs' : 'settings'

    if (!this.isSheetOpen) this.setSheet('half')
  }

  setSheetPage(page: SheetPage): void {
    this.sheetPage = page
  }

  /* Android system back and browser back: keyboard, then the sheet. False when there is nothing to close */
  handleBack(): boolean {
    if (this.isKeyboardOpen) {
      this.closeKeyboard()

      return true
    }

    if (this.isSheetOpen) {
      this.setSheet('closed')

      return true
    }

    return false
  }

  setStripEnabled(value: boolean): void {
    this.isStripEnabled = value
    writeStoredValue(this.stripStorageKey, value)
  }

  setKeepScreenOn(value: boolean): void {
    this.keepScreenOn = value
    writeStoredValue(`${STORAGE_PREFIX}.keepScreenOn`, value)
  }

  setAccessorySettingsOpen(value: boolean): void {
    this.isAccessorySettingsOpen = value
  }

  /* NOTE: The row keeps the order of ACCESSORY_KEY_IDS whatever order the keys were turned on in */
  setAccessoryKeyShown(id: AccessoryKeyId, isShown: boolean): void {
    this.accessoryKeys = ACCESSORY_KEY_IDS.filter((key) => (key === id ? isShown : this.accessoryKeys.includes(key)))
    writeStoredValue(`${STORAGE_PREFIX}.accessoryKeys`, this.accessoryKeys)
  }

  setTouchIndicatorShown(value: boolean): void {
    this.isTouchIndicatorShown = value
    writeStoredValue(`${STORAGE_PREFIX}.touchIndicator`, value)
  }

  setTouchTrailShown(value: boolean): void {
    this.isTouchTrailShown = value
    writeStoredValue(`${STORAGE_PREFIX}.touchTrail`, value)
  }

  setFabPosition(position: FabPosition): void {
    this.fabPosition = position
    writeStoredValue(`${STORAGE_PREFIX}.fab`, position)
  }

  setMagnifierOn(value: boolean): void {
    this.isMagnifierOn = value
    this.magnifierOffset = { x: 0, y: 0 }
  }

  setMagnifierOffset(offset: { x: number; y: number }): void {
    this.magnifierOffset = offset
  }

  /* NOTE: Shown once by itself in iOS Safari outside a Home Screen app, then only from the settings */
  showAddToHomeScreenHint(): void {
    this.isAddToHomeScreenHintShown = true
    this.setSheet('closed')
  }

  maybeShowAddToHomeScreenHintOnce(): void {
    const key = `${STORAGE_PREFIX}.addToHomeScreenHintSeen`

    if (readStoredValue(key, false)) return

    writeStoredValue(key, true)
    this.isAddToHomeScreenHintShown = true
  }

  hideAddToHomeScreenHint(): void {
    this.isAddToHomeScreenHintShown = false
  }

  dismissAlert(): void {
    this.isAlertDismissed = true
  }

  setStopConfirmationOpen(value: boolean): void {
    this.isStopConfirmationOpen = value
  }

  setPasteDialogOpen(value: boolean): void {
    if (value && this.isKeyboardOpen) this.closeKeyboard()

    this.isPasteDialogOpen = value
  }

  showSnackbar(text: string): void {
    this.snackbarText = text
  }

  hideSnackbar(): void {
    this.snackbarText = null
  }

  /* NOTE: The OS hid the keyboard by itself (e.g. iOS Done or Android back), leave keyboard mode */
  onKeyboardHiddenByOs(): void {
    if (this.isKeyboardOpen) this.closeKeyboard()
  }
}
