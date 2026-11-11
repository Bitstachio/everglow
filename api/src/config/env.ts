import { z } from "zod";

const emptyToUndefined = (value: unknown): unknown => {
  if (value === undefined || value === null || value === "") return undefined;
  return value;
};

const nonEmptyString = z.string().min(1);

/**
 * Process env the API needs to boot. Matches the Required section of
 * .env.example. Optional feature flags and credentials stay outside this
 * schema and keep being read by the per-domain config factories.
 *
 * AWS access keys are optional so a task role / default credential chain can
 * run without static keys (see staging Copilot). The bucket and region are not.
 */
const envSchema = z.object({
  DATABASE_URL: nonEmptyString,
  AUTH0_DOMAIN: nonEmptyString,
  AUTH0_AUDIENCE: nonEmptyString,
  AUTH0_NATIVE_CLIENT_ID: nonEmptyString,
  AWS_REGION: z.preprocess(emptyToUndefined, nonEmptyString.default("us-east-1")),
  AWS_S3_BUCKET: nonEmptyString,
  AWS_ACCESS_KEY_ID: z.preprocess(emptyToUndefined, nonEmptyString.optional()),
  AWS_SECRET_ACCESS_KEY: z.preprocess(emptyToUndefined, nonEmptyString.optional()),
});

type Env = z.infer<typeof envSchema>;

export const parseEnv = (raw: Record<string, unknown>): Env => {
  const result = envSchema.safeParse({
    DATABASE_URL: raw.DATABASE_URL,
    AUTH0_DOMAIN: raw.AUTH0_DOMAIN,
    AUTH0_AUDIENCE: raw.AUTH0_AUDIENCE,
    AUTH0_NATIVE_CLIENT_ID: raw.AUTH0_NATIVE_CLIENT_ID,
    AWS_REGION: raw.AWS_REGION,
    AWS_S3_BUCKET: raw.AWS_S3_BUCKET,
    AWS_ACCESS_KEY_ID: raw.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: raw.AWS_SECRET_ACCESS_KEY,
  });

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid API env: ${details}`);
  }

  return result.data;
};

/**
 * Nest ConfigModule `validate` hook. Parses the required boot env, then merges
 * it back so optional keys ConfigService / dotenv already loaded are kept.
 */
export const validateEnv = (config: Record<string, unknown>): Record<string, unknown> => {
  const env = parseEnv(config);
  return { ...config, ...env };
};
