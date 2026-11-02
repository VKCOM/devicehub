// The screen quality clients pick (the minicap JPEG quality, 10-80 in the UI)
// as a scrcpy bit rate: --scrcpy-bit-rate is the rate at the top of the slider.
export const SCRCPY_REFERENCE_QUALITY = 80

// Below this, H.264 turns into blocks without saving much
const MIN_BIT_RATE = 200_000

export const scrcpyBitRate = (base: number, quality: number): number => {
    const clamped = Math.min(Math.max(quality, 1), 100)
    return Math.max(MIN_BIT_RATE, Math.round(base * clamped / SCRCPY_REFERENCE_QUALITY))
}
