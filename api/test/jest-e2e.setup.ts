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
