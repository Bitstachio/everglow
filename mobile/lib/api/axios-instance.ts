import axios, { type AxiosInstance } from "axios";
import { getAccessToken } from "@/lib/auth0";
import { toApiError } from "@/lib/api/errors";

const RAW_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

export const API_BASE_URL = `${RAW_BASE_URL.replace(/\/+$/, "")}/api/v2`;

let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

export function createAxiosInstance(): AxiosInstance {
  const instance = axios.create({
    headers: {
      "Content-Type": "application/json",
    },
    timeout: 10000,
  });

  instance.interceptors.request.use(
    async (config) => {
      const accessToken = await getAccessToken();
      if (accessToken) {
        config.headers.Authorization = `Bearer ${accessToken}`;
      }
      return config;
    },
    (error) => Promise.reject(error),
  );

  instance.interceptors.response.use(
    (response) => response,
    async (error) => {
      if (error.response?.status === 401) {
        onUnauthorized?.();
      }
      return Promise.reject(toApiError(error));
    },
  );

  return instance;
}

/** Host-only base URL; Hey API SDK paths already include `/api/v2`. */
export const API_HOST_URL = RAW_BASE_URL.replace(/\/+$/, "");
