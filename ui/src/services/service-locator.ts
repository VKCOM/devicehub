import { makeAutoObservable } from 'mobx'

class ServiceLocator {
  private map = new Map<PropertyKey, unknown>()

  constructor() {
    makeAutoObservable(this)
  }

  get<T>(key: PropertyKey): T {
    if (!this.map.has(key)) {
      throw new Error('Unable to locate service.')
    }

    return this.map.get(key) as T
  }

  safeGet<T>(key: PropertyKey): T | undefined {
    return this.map.get(key) as T | undefined
  }

  has(key: PropertyKey): boolean {
    return this.map.has(key)
  }

  register(key: PropertyKey, instance: unknown): void {
    if (this.map.has(key)) throw new Error(`Service already registered for that symbol: ${key.toString()}`)

    this.map.set(key, instance)
  }

  unregister(key: PropertyKey): void {
    this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
  }
}

export const serviceLocator = new ServiceLocator()
