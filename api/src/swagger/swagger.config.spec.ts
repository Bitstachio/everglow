import { servesSwagger } from "./swagger.config";

describe("servesSwagger", () => {
  it("is off in production, which staging runs as too", () => {
    expect(servesSwagger("production")).toBe(false);
  });

  it.each([undefined, "development", "test"])("is on with NODE_ENV=%s", (nodeEnv) => {
    expect(servesSwagger(nodeEnv)).toBe(true);
  });
});
