/**
 * Generated by orval v7.1.1 🍺
 * Do not edit manually.
 * Smartphone Test Farm
 * Control and manages real Smartphone devices from browser and restful apis
 * OpenAPI spec version: 2.4.3
 */

export type AddAdbPublicKeyBody = {
  /** adb public key (~/.android/id_rsa.pub) */
  publickey: string
  /** By default will be extracted from public key */
  title?: string
}
