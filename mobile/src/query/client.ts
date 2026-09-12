import { keepPreviousData, QueryClient } from "@tanstack/react-query";

/**
 * Global QueryClient configured for instant UI responsiveness.
 * Previous results stay on screen while filters/months change.
 * Re-focus refetching disabled to avoid layout shifts on mobile.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      gcTime: 1000 * 60 * 10,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      placeholderData: keepPreviousData,
    },
    mutations: {
      retry: 0,
    },
  },
});
