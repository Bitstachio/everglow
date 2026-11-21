import { QueryClient } from "@tanstack/react-query";

declare module "@tanstack/react-query" {
  interface Register {
    queryMeta: {
      /**
       * Keep this query's last answer on the phone for an offline launch
       * (`lib/query/session-persister.ts`). Only for what Home needs to open;
       * never for anything with long-lived links or another account's data.
       */
      persist?: boolean;
    };
  }
}

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
