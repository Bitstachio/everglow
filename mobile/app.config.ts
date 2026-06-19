import { ConfigContext, ExpoConfig } from "expo/config";

// The Auth0 domain is injected into the react-native-auth0 config plugin at
// prebuild time so the native callback URLs are registered correctly. It is
// read from the environment to keep tenant configuration out of source control.
const AUTH0_DOMAIN = process.env.EXPO_PUBLIC_AUTH0_DOMAIN ?? "";
const AUTH0_CUSTOM_SCHEME = "everglowmobile";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? "everglow-mobile",
  slug: config.slug ?? "everglow-mobile",
  plugins: [
    ...(config.plugins ?? []),
    [
      "react-native-auth0",
      {
        domain: AUTH0_DOMAIN,
        customScheme: AUTH0_CUSTOM_SCHEME,
      },
    ],
  ],
});
