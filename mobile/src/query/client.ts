import { QueryClient } from "@tanstack/react-query";

/**
 * Global QueryClient configured for instant UI responsiveness.
 * Data remains fresh for 30s; inactive cache retained for 10m.
 * Re-focus refetching disabled to avoid unexpected layout shifts on mobile.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30, // 30 seconds
      gcTime: 1000 * 60 * 10, // 10 minutes
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});
