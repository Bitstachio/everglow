import { validateForgotPasswordEmail } from "./forgot-password";

describe("validateForgotPasswordEmail", () => {
  it("accepts and trims a valid address", () => {
    expect(validateForgotPasswordEmail("  ada@example.com ")).toEqual({
      ok: true,
      email: "ada@example.com",
    });
  });

  it("rejects an invalid address without calling Auth0", () => {
    expect(validateForgotPasswordEmail("not-an-email")).toEqual({
      ok: false,
      error: expect.stringMatching(/valid email/i),
    });
  });
});
