import { createHash } from "crypto";
import { inviteTokenHash, redactUrl } from "./redact-url";

describe("redactUrl", () => {
  const token = "0f8c2f4e-5b1a-4c3d-9e7f-123456789abc";
  const hash = createHash("sha256").update(token).digest("hex");

  it("replaces an invite preview's token with its SHA-256", () => {
    expect(inviteTokenHash(token)).toBe(hash);
    expect(redactUrl(`/api/v2/events/invites/${token}/preview`)).toBe(`/api/v2/events/invites/sha256:${hash}/preview`);
  });

  it("keeps the query string", () => {
    expect(redactUrl(`/api/v2/events/invites/${token}/preview?x=1`)).toBe(
      `/api/v2/events/invites/sha256:${hash}/preview?x=1`,
    );
  });

  it("hashes the token as the route receives it, decoded", () => {
    expect(redactUrl("/api/v2/events/invites/a%20b/preview")).toBe(
      `/api/v2/events/invites/sha256:${inviteTokenHash("a b")}/preview`,
    );
  });

  it.each([
    "/api/v2/events/66666666-6666-6666-6666-666666666666",
    "/api/v2/events/66666666-6666-6666-6666-666666666666/invites/VIEWER/regenerate",
    "/api/v2/events/join",
    "/api/v2/events/invites/abc",
  ])("leaves %s as it is", (url) => {
    expect(redactUrl(url)).toBe(url);
  });
});
