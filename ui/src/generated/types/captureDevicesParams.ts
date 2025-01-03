/**
 * Generated by orval v7.1.1 🍺
 * Do not edit manually.
 * Smartphone Test Farm
 * Control and manages real Smartphone devices from browser and restful apis
 * OpenAPI spec version: 2.4.3
 */

export type CaptureDevicesParams = {
  /**
   * timeout for group in seconds
   */
  timeout?: number
  /**
   * Device amount needed for autotests run
   */
  amount: number
  /**
   * need only specified amount, not less
   */
  need_amount?: boolean
  /**
   * device abi
   */
  abi?: string
  /**
   * device sdk
   */
  sdk?: string
  /**
   * device model
   */
  model?: string
  /**
   * device type
   */
  type?: string
  /**
   * device os version
   */
  version?: string
  /**
   * run identificator
   */
  run: string
}
