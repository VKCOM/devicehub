/**
 * Generated by orval v7.1.1 🍺
 * Do not edit manually.
 * Smartphone Test Farm
 * Control and manages real Smartphone devices from browser and restful apis
 * OpenAPI spec version: 2.4.3
 */

export type CreateServiceUserParams = {
  /**
   * User name
   */
  name: string
  /**
   * Give user admin privilege
   */
  admin?: boolean
  /**
   * Secret for jwt
   */
  secret: string
}
