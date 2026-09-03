import type { CreateClientConfig } from "@/lib/api/generated/client.gen";
import { API_HOST_URL, createAxiosInstance } from "./axios-instance";

export const createClientConfig: CreateClientConfig = (config) => ({
  ...config,
  axios: createAxiosInstance(),
  baseURL: API_HOST_URL,
});
