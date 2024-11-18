export const enableMocking = async (): Promise<ServiceWorkerRegistration | undefined> => {
  if (process.env.NODE_ENV !== 'development' || import.meta.env.MODE !== 'mock') return

  const { worker } = await import('./browser')

  return worker.start()
}
