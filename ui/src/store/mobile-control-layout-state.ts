import { makeAutoObservable } from 'mobx'

/* Whether the control page shows its phone layout, which replaces the site header and page paddings */
class MobileControlLayoutState {
  isActive = false

  constructor() {
    makeAutoObservable(this)
  }

  setActive(value: boolean): void {
    this.isActive = value
  }
}

export const mobileControlLayoutState = new MobileControlLayoutState()
