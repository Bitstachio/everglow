import { NotificationType } from "generated/prisma/client";
import { NOTIFICATION_CATALOGUE } from "./notification-catalogue";

/** One sample per type, so every entry is rendered here. Add one with each new type. */
const SAMPLES: { [T in NotificationType]: Parameters<(typeof NOTIFICATION_CATALOGUE)[T]["render"]>[0] } = {
  TEST: { nonce: "n1" },
};

describe("NOTIFICATION_CATALOGUE", () => {
  it.each(Object.values(NotificationType))("%s renders short copy and an in-app link", (type) => {
    const rendered = NOTIFICATION_CATALOGUE[type].render(SAMPLES[type] as never);

    expect(rendered.title.length).toBeGreaterThan(0);
    expect(rendered.body.length).toBeLessThanOrEqual(178);
    expect(rendered.url).toMatch(/^\//);
    // docs/voice.md: no exclamation marks.
    expect(`${rendered.title} ${rendered.body}`).not.toContain("!");
  });

  it.each(Object.values(NotificationType))("%s keys each recipient apart and fits the column", (type) => {
    const definition = NOTIFICATION_CATALOGUE[type];
    const a = definition.dedupeKey("11111111-1111-1111-1111-111111111111", SAMPLES[type] as never);
    const b = definition.dedupeKey("22222222-2222-2222-2222-222222222222", SAMPLES[type] as never);

    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(255);
  });
});
