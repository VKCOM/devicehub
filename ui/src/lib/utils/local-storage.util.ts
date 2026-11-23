/* NOTE: Storage may be unavailable (private mode, blocked site data), so a stored value is only a preference */
export const readStoredValue = <T>(key: string, fallback: T): T => {
  try {
    const value = localStorage.getItem(key)

    return value === null ? fallback : (JSON.parse(value) as T)
  } catch {
    return fallback
  }
}

export const writeStoredValue = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* empty */
  }
}
