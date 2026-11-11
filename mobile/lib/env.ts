import { z } from "zod";

/** Must match the scheme in app.json / the Auth0 Expo plugin. Not an env var. */
export const AUTH0_CUSTOM_SCHEME = "everglowmobile";

const DEFAULT_API_URL = "http://localhost:3000";
const DEFAULT_PASSWORD_CHANGE_RESULT_URL = `${AUTH0_CUSTOM_SCHEME}://password-change/result`;

const emptyToUndefined = (value: unknown): unknown => {
  if (value === undefined || value === null || value === "") return undefined;
  return value;
};

const envSchema = z.object({
  EXPO_PUBLIC_API_URL: z.preprocess(emptyToUndefined, z.url().default(DEFAULT_API_URL)),
  EXPO_PUBLIC_AUTH0_DOMAIN: z.string().default(""),
  EXPO_PUBLIC_AUTH0_CLIENT_ID: z.string().default(""),
  EXPO_PUBLIC_AUTH0_AUDIENCE: z.string().default(""),
  EXPO_PUBLIC_AUTH0_PASSWORD_CHANGE_RESULT_URL: z.preprocess(
    emptyToUndefined,
    z.url().default(DEFAULT_PASSWORD_CHANGE_RESULT_URL),
  ),
});

type Env = z.infer<typeof envSchema>;

export const parseEnv = (raw: Record<string, string | undefined>): Env => {
  const result = envSchema.safeParse({
    EXPO_PUBLIC_API_URL: raw.EXPO_PUBLIC_API_URL,
    EXPO_PUBLIC_AUTH0_DOMAIN: raw.EXPO_PUBLIC_AUTH0_DOMAIN,
    EXPO_PUBLIC_AUTH0_CLIENT_ID: raw.EXPO_PUBLIC_AUTH0_CLIENT_ID,
    EXPO_PUBLIC_AUTH0_AUDIENCE: raw.EXPO_PUBLIC_AUTH0_AUDIENCE,
    EXPO_PUBLIC_AUTH0_PASSWORD_CHANGE_RESULT_URL: raw.EXPO_PUBLIC_AUTH0_PASSWORD_CHANGE_RESULT_URL,
  });

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid mobile public env: ${details}`);
  }

  return result.data;
};

export const env = parseEnv(process.env);
