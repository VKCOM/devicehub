import { makeAutoObservable } from 'mobx'

class AuthStore {
  isAuthed = false

  constructor() {
    makeAutoObservable(this)
  }

  setIsAuthed(isAuthed: boolean): void {
    this.isAuthed = isAuthed
  }
}

export const authStore = new AuthStore()
