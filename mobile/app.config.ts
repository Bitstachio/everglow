import { ConfigContext, ExpoConfig } from "expo/config";
import { AUTH0_CUSTOM_SCHEME, env } from "./lib/env";

// The Auth0 domain is injected into the react-native-auth0 config plugin at
// prebuild time so the native callback URLs are registered correctly. It comes
// from the shared Zod env schema so prebuild and the app agree.

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? "everglow-mobile",
  slug: config.slug ?? "everglow-mobile",
  plugins: [
    ...(config.plugins ?? []),
    [
      "react-native-auth0",
      {
        domain: env.EXPO_PUBLIC_AUTH0_DOMAIN,
        customScheme: AUTH0_CUSTOM_SCHEME,
      },
    ],
  ],
});
