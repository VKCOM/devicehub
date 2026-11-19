export type SheetState = 'closed' | 'half' | 'full'

export type Insets = {
  top: number
  right: number
  bottom: number
  left: number
}

export type Box = {
  top: number
  right: number
  bottom: number
  left: number
}

/* NOTE: Height of the navigation strip (its width in landscape), without the safe area */
export const STRIP_SIZE = 44
export const ACCESSORY_HEIGHT = 44
/* NOTE: The keyboard counts as open above this height, smaller differences are browser chrome */
export const KEYBOARD_MIN_HEIGHT = 80

const HALF_SHEET_RATIO = 0.4
const SIDE_PANEL_RATIO = 0.5
const SHEET_TOP_GAP = 8

export type MobileLayoutInput = {
  width: number
  height: number
  insets: Insets
  isStripEnabled: boolean
  sheet: SheetState
  isKeyboardOpen: boolean
  /* NOTE: Height of the on-screen keyboard over the layout viewport */
  keyboardHeight: number
  /* NOTE: How far the visual viewport is scrolled down inside the layout viewport (iOS with the keyboard) */
  visualViewportTop: number
  /* NOTE: Visible height of the sheet while its handle is dragged */
  dragVisible: number | null
}

export type MobileLayout = {
  isLandscape: boolean
  stage: Box
  isStripVisible: boolean
  isScrimVisible: boolean
  sheet: {
    /* NOTE: Portrait: offset from the bottom, the strip stays below the sheet */
    bottom: number
    right: number
    width: number | null
    height: number | null
    transform: string
    paddingBottom: number
  }
  sheetHalf: number
  sheetMax: number
  /* NOTE: Top of the keyboard accessory row in the layout viewport, pinned to the visual viewport */
  accessoryTop: number
}

export const getSheetVisible = (sheet: SheetState, half: number, max: number): number => {
  if (sheet === 'half') return half

  if (sheet === 'full') return max

  return 0
}

export const computeMobileLayout = ({
  width,
  height,
  insets,
  isStripEnabled,
  sheet,
  isKeyboardOpen,
  keyboardHeight,
  visualViewportTop,
  dragVisible,
}: MobileLayoutInput): MobileLayout => {
  const isLandscape = width > height
  const isSheetOpen = sheet !== 'closed' || dragVisible !== null
  const isStripVisible = isStripEnabled && !isKeyboardOpen
  const keyboardBottom = isKeyboardOpen ? keyboardHeight + ACCESSORY_HEIGHT : 0
  const accessoryTop = height - keyboardHeight - ACCESSORY_HEIGHT
  const top = isKeyboardOpen ? Math.max(insets.top, visualViewportTop) : insets.top

  if (isLandscape) {
    const stripWidth = isStripVisible ? STRIP_SIZE + insets.right : insets.right
    const panelWidth = Math.round((width - stripWidth - insets.left) * SIDE_PANEL_RATIO)
    const isPanelShown = isSheetOpen && !isKeyboardOpen

    return {
      isLandscape,
      isStripVisible,
      isScrimVisible: false,
      stage: {
        top,
        left: insets.left,
        right: stripWidth + (isPanelShown ? panelWidth : 0),
        bottom: isKeyboardOpen ? keyboardBottom : insets.bottom,
      },
      sheet: {
        bottom: 0,
        right: stripWidth,
        width: panelWidth,
        height: null,
        transform: isPanelShown ? 'none' : `translateX(calc(100% + ${stripWidth + 30}px))`,
        paddingBottom: insets.bottom,
      },
      sheetHalf: 0,
      sheetMax: 0,
      accessoryTop,
    }
  }

  const base = isStripEnabled ? STRIP_SIZE + insets.bottom : 0
  const sheetHalf = Math.round(height * HALF_SHEET_RATIO)
  const sheetMax = height - insets.top - SHEET_TOP_GAP - base
  const visible = dragVisible ?? getSheetVisible(sheet, sheetHalf, sheetMax)

  let stageBottom = isStripVisible ? STRIP_SIZE + insets.bottom : insets.bottom

  if (isSheetOpen) stageBottom = base + Math.min(visible, sheetHalf)

  if (isKeyboardOpen) stageBottom = keyboardBottom

  return {
    isLandscape,
    isStripVisible,
    isScrimVisible: sheet === 'full' && dragVisible === null,
    stage: { top, left: insets.left, right: insets.right, bottom: stageBottom },
    sheet: {
      bottom: base,
      right: 0,
      width: null,
      height: sheetMax,
      transform: isSheetOpen ? `translateY(${sheetMax - visible}px)` : `translateY(calc(100% + ${base + 30}px))`,
      paddingBottom: isStripEnabled ? 0 : insets.bottom,
    },
    sheetHalf,
    sheetMax,
    accessoryTop,
  }
}

/* NOTE: Velocity in px/ms, positive downwards. A fling wins over the position */
export const FLING_VELOCITY = 0.5

/* Where the sheet settles after its handle is released */
export const resolveSheetSnap = ({
  visible,
  velocity,
  half,
  max,
}: {
  visible: number
  velocity: number
  half: number
  max: number
}): SheetState => {
  if (velocity > FLING_VELOCITY) return visible > half + 24 ? 'half' : 'closed'

  if (velocity < -FLING_VELOCITY) return 'full'

  if (visible < half * 0.55) return 'closed'

  return visible - half < (max - half) / 2 ? 'half' : 'full'
}
