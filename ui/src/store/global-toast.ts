import { makeAutoObservable } from 'mobx'

class GlobalToast {
  message: string = ''

  constructor() {
    makeAutoObservable(this)
  }

  setMessage(message: string): void {
    this.message = message
  }
}

export const globalToast = new GlobalToast()
