import { create, type AxiosInstance } from "axios";
import { getAccessToken } from "@/lib/auth0";
import { toApiError } from "@/lib/api/errors";

const RAW_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

export const API_BASE_URL = `${RAW_BASE_URL.replace(/\/+$/, "")}/api/v2`;

let onUnauthorized: (() => void) | null = null;
let onSuspended: (() => void) | null = null;

export const setUnauthorizedHandler = (handler: (() => void) | null): void => {
  onUnauthorized = handler;
};

/** Called when a request answers 403 ACCOUNT_SUSPENDED (wired from auth context). */
export const setSuspendedHandler = (handler: (() => void) | null): void => {
  onSuspended = handler;
};

export const createAxiosInstance = (): AxiosInstance => {
  const instance = create({
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
      const apiError = toApiError(error);
      if (error.response?.status === 401) {
        onUnauthorized?.();
      } else if (apiError.code === "ACCOUNT_SUSPENDED") {
        onSuspended?.();
      }
      return Promise.reject(apiError);
    },
  );

  return instance;
};

/** Host-only base URL; Hey API SDK paths already include `/api/v2`. */
export const API_HOST_URL = RAW_BASE_URL.replace(/\/+$/, "");
