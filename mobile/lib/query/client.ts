import { QueryClient } from "@tanstack/react-query";

export const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        retry: 2,
        refetchOnWindowFocus: true,
      },
      mutations: {
        retry: false,
      },
    },
  });
