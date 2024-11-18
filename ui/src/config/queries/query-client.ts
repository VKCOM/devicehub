import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: import.meta.env.PROD,
      retry: import.meta.env.PROD ? 6 : false,
      retryDelay: (attemptIndex): number => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
})
