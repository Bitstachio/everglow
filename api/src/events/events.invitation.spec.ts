import { buildInvitationUrl, extractInvitationToken } from "./events.invitation";

describe("events.invitation", () => {
  describe("buildInvitationUrl", () => {
    it("composes a shareable URL from the stored invite token", () => {
      expect(buildInvitationUrl("token-123")).toBe("https://events.everglow.app/invite/token-123");
    });
  });

  describe("extractInvitationToken", () => {
    it("returns a bare token unchanged", () => {
      expect(extractInvitationToken("token-123")).toBe("token-123");
    });

    it("extracts the token from a full invitation URL", () => {
      expect(extractInvitationToken("https://events.everglow.app/invite/token-123")).toBe("token-123");
    });

    it("trims whitespace from pasted input", () => {
      expect(extractInvitationToken("  token-123  ")).toBe("token-123");
    });
  });
});
