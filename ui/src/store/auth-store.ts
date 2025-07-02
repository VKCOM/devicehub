import { makeAutoObservable } from 'mobx'
import { isHydrated, makePersistable } from 'mobx-persist-store'

class AuthStore {
  jwt: string | null = null

  constructor() {
    makeAutoObservable(this)
    makePersistable(this, { name: 'jwt', properties: ['jwt'], storage: window.localStorage })
  }

  get isHydrated(): boolean {
    return isHydrated(this)
  }

  login(jwt: string): void {
    this.jwt = jwt
  }

  logout(): void {
    this.jwt = null
  }

  get isAuthed(): boolean {
    return this.jwt !== null
  }
}

export const authStore = new AuthStore()
