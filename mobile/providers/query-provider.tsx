import { makeQueryClient } from "@/lib/query/client";
import { setupReactNativeQueryManagers } from "@/lib/query/setup-react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useEffect, useState } from "react";

type QueryProviderProps = {
  children: ReactNode;
};

export const QueryProvider = ({ children }: QueryProviderProps) => {
  const [queryClient] = useState(() => makeQueryClient());

  useEffect(() => {
    return setupReactNativeQueryManagers();
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
};
