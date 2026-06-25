process.env.AUTH0_DOMAIN ??= "e2e.auth0.com";
process.env.AUTH0_AUDIENCE ??= "https://e2e-api";
process.env.DATABASE_URL ??= "postgresql://e2e:e2e@localhost:5432/e2e";
process.env.AWS_REGION ??= "us-east-1";
process.env.AWS_S3_BUCKET ??= "e2e-bucket";
process.env.AWS_ACCESS_KEY_ID ??= "e2e-access-key";
process.env.AWS_SECRET_ACCESS_KEY ??= "e2e-secret-key";

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
