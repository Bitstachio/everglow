// Public env is required at module load (mobile/lib/env.ts). Give every Jest
// worker the same stand-in values so suites that import Auth0 or the API
// client can load without a real .env.
process.env.EXPO_PUBLIC_API_URL ??= "http://localhost:3000";
process.env.EXPO_PUBLIC_AUTH0_DOMAIN ??= "test.auth0.com";
process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID ??= "test-client-id";
process.env.EXPO_PUBLIC_AUTH0_AUDIENCE ??= "https://test-api";
process.env.EXPO_PUBLIC_AUTH0_PASSWORD_CHANGE_RESULT_URL ??= "everglowmobile://password-change/result";
