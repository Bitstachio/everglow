import { parseEnv, validateEnv } from "./env";

const valid = {
  DATABASE_URL: "postgresql://everglow:everglow@localhost:5433/everglow",
  AUTH0_DOMAIN: "tenant.us.auth0.com",
  AUTH0_AUDIENCE: "https://api.example.com",
  AUTH0_NATIVE_CLIENT_ID: "native-client-id",
  AWS_S3_BUCKET: "everglow-photos-dev",
} as const;

describe("parseEnv", () => {
  it("defaults AWS_REGION when unset", () => {
    expect(parseEnv({ ...valid }).AWS_REGION).toBe("us-east-1");
  });

  it("allows missing AWS access keys", () => {
    expect(parseEnv({ ...valid }).AWS_ACCESS_KEY_ID).toBeUndefined();
    expect(parseEnv({ ...valid }).AWS_SECRET_ACCESS_KEY).toBeUndefined();
  });

  it("keeps provided values", () => {
    expect(
      parseEnv({
        ...valid,
        AWS_REGION: "eu-west-1",
        AWS_ACCESS_KEY_ID: "AKIAtest",
        AWS_SECRET_ACCESS_KEY: "secret",
      }),
    ).toEqual({
      ...valid,
      AWS_REGION: "eu-west-1",
      AWS_ACCESS_KEY_ID: "AKIAtest",
      AWS_SECRET_ACCESS_KEY: "secret",
    });
  });

  it("rejects missing required values", () => {
    expect(() => parseEnv({})).toThrow(/Invalid API env:.*DATABASE_URL/s);
    expect(() => parseEnv({ ...valid, AUTH0_DOMAIN: "" })).toThrow(/Invalid API env:.*AUTH0_DOMAIN/s);
    expect(() => parseEnv({ ...valid, AWS_S3_BUCKET: "" })).toThrow(/Invalid API env:.*AWS_S3_BUCKET/s);
  });
});

describe("validateEnv", () => {
  it("merges parsed boot env onto the full config object", () => {
    const result = validateEnv({
      ...valid,
      LOG_LEVEL: "debug",
      PHOTO_ORPHAN_RECONCILER_ENABLED: "false",
    });

    expect(result.DATABASE_URL).toBe(valid.DATABASE_URL);
    expect(result.AWS_REGION).toBe("us-east-1");
    expect(result.LOG_LEVEL).toBe("debug");
    expect(result.PHOTO_ORPHAN_RECONCILER_ENABLED).toBe("false");
  });
});
