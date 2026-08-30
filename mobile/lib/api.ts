export { setUnauthorizedHandler, API_BASE_URL, API_HOST_URL } from "@/lib/api/axios-instance";

// Initialize the generated Hey API client (auth interceptors via hey-api.config.ts).
import "@/lib/api/generated/client.gen";

export * from "@/lib/api/generated";
export * from "@/lib/api/generated/@tanstack/react-query.gen";
