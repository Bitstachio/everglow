process.env.AUTH0_DOMAIN ??= "integration.auth0.com";
process.env.AUTH0_AUDIENCE ??= "https://integration-api";
process.env.DATABASE_URL ??= "postgresql://integration:integration@localhost:5432/integration";
process.env.AWS_REGION ??= "us-east-1";
process.env.AWS_S3_BUCKET ??= "integration-bucket";
process.env.AWS_ACCESS_KEY_ID ??= "integration-access-key";
process.env.AWS_SECRET_ACCESS_KEY ??= "integration-secret-key";

jest.mock("jwks-rsa", () => ({
  passportJwtSecret: jest.fn().mockReturnValue(jest.fn()),
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
