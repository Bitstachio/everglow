import axios from "axios";
import { getAccessToken } from "./auth0";

const RAW_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000";

// The NestJS API is served under a global prefix (see swagger.config.ts:
// API_GLOBAL_PREFIX = "api/v2"). All service calls use paths relative to this.
const API_BASE_URL = `${RAW_BASE_URL.replace(/\/+$/, "")}/api/v2`;

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000,
});

// Attach the Auth0 access token. The credentials manager renews it from the
// stored refresh token when it has expired, so no manual refresh flow is needed.
api.interceptors.request.use(
  async (config) => {
    const accessToken = await getAccessToken();
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Allows the auth layer to react to an unrecoverable 401 (e.g. revoked session)
// by clearing local state and sending the user back to login, without coupling
// this module to the navigation/router.
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      onUnauthorized?.();
    }
    return Promise.reject(error);
  },
);

export default api;
