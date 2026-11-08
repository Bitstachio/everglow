process.env.AUTH0_DOMAIN ??= "integration.auth0.com";
process.env.AUTH0_AUDIENCE ??= "https://integration-api";
process.env.AUTH0_MANAGEMENT_CLIENT_ID ??= "integration-mgmt-client-id";
process.env.AUTH0_MANAGEMENT_CLIENT_SECRET ??= "integration-mgmt-client-secret";
process.env.AUTH0_NATIVE_CLIENT_ID ??= "integration-native-client-id";
process.env.DATABASE_URL ??= "postgresql://integration:integration@localhost:5432/integration";
process.env.AWS_REGION ??= "us-east-1";
process.env.AWS_S3_BUCKET ??= "integration-bucket";
process.env.AWS_ACCESS_KEY_ID ??= "integration-access-key";
process.env.AWS_SECRET_ACCESS_KEY ??= "integration-secret-key";
// The one switch that keeps rate limiting out of every other suite. Assigned
// rather than defaulted so a developer's shell or .env cannot turn it back on.
// rate-limit.integration.spec.ts opts back in by overriding the config provider.
process.env.RATE_LIMIT_ENABLED = "false";
// Same for the notification sender, which is on by default: no suite sends
// pushes, and ExpoPushService refuses to under NODE_ENV=test anyway.
process.env.NOTIFICATIONS_SENDER_ENABLED = "false";

// The suites authenticate through a stubbed guard; the key set's boot warm-up
// must not reach a real tenant, so it gets an empty set.
jest.mock("jwks-rsa", () => ({
  JwksClient: jest.fn().mockImplementation(() => ({ getSigningKeys: jest.fn().mockResolvedValue([]) })),
  SigningKeyNotFoundError: class SigningKeyNotFoundError extends Error {},
}));

jest.mock("passport-jwt", () => {
  class MockJwtStrategy {
    name = "jwt";
  }

  return {
    ExtractJwt: {
      fromAuthHeaderAsBearerToken: jest.fn(),
    },
    Strategy: MockJwtStrategy,
  };
});
