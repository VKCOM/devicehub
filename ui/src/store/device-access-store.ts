import { makeAutoObservable } from 'mobx'

export type DeviceAccessState =
  /* NOTE: Another user owns the device, so it was not taken over */
  | { kind: 'busy'; ownerName?: string }

/* Why the control page cannot control its device, shown instead of the stream */
class DeviceAccessStore {
  state: DeviceAccessState | null = null

  constructor() {
    makeAutoObservable(this)
  }

  setBusy(ownerName?: string): void {
    this.state = { kind: 'busy', ownerName }
  }

  clear(): void {
    this.state = null
  }
}

export const deviceAccessStore = new DeviceAccessStore()
