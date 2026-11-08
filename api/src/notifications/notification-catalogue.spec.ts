import { NotificationType } from "generated/prisma/client";
import {
  NOTIFICATION_CATALOGUE,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_LOCALES,
  NotificationDataByType,
  notificationDefinitionOf,
  resolveNotificationLocale,
} from "./notification-catalogue";

/** One sample per type, so every entry is rendered here. Add one with each new type. */
const SAMPLES: { [T in NotificationType]: NotificationDataByType[T] } = {
  TEST: { nonce: "n1" },
};

const cases = Object.values(NotificationType).flatMap((type) => NOTIFICATION_LOCALES.map((locale) => [type, locale]));

describe("NOTIFICATION_CATALOGUE", () => {
  it.each(cases)("%s renders short copy and an in-app link in %s", (type, locale) => {
    const rendered = notificationDefinitionOf(type as NotificationType).render(
      SAMPLES[type as NotificationType],
      locale as "en",
    );

    expect(rendered.title.length).toBeGreaterThan(0);
    expect(rendered.body.length).toBeLessThanOrEqual(178);
    expect(rendered.url).toMatch(/^\//);
    // docs/voice.md: no exclamation marks.
    expect(`${rendered.title} ${rendered.body}`).not.toContain("!");
  });

  it.each(Object.values(NotificationType))("%s keys each recipient apart and fits the column", (type) => {
    const definition = notificationDefinitionOf(type);
    const a = definition.dedupeKey("11111111-1111-1111-1111-111111111111", SAMPLES[type]);
    const b = definition.dedupeKey("22222222-2222-2222-2222-222222222222", SAMPLES[type]);

    expect(a).not.toBe(b);
    expect(a.length).toBeLessThanOrEqual(255);
  });

  it.each(Object.values(NotificationType))("%s accepts its sample and refuses data of another shape", (type) => {
    const definition = notificationDefinitionOf(type);

    expect(definition.isData(SAMPLES[type])).toBe(true);
    for (const wrong of [null, "text", 42, [], {}, { nonce: 1 }]) expect(definition.isData(wrong)).toBe(false);
  });

  it.each(Object.values(NotificationType))(
    "%s goes to a channel the app creates, with a positive ttl if any",
    (type) => {
      const definition = notificationDefinitionOf(type);

      expect(NOTIFICATION_CHANNELS).toContain(definition.channel);
      if (definition.ttlSeconds !== undefined) expect(definition.ttlSeconds).toBeGreaterThan(0);
    },
  );

  it("keeps TEST on the account channel with no ttl, so a test reaches a phone that was off", () => {
    expect(NOTIFICATION_CATALOGUE.TEST.channel).toBe("account");
    expect(NOTIFICATION_CATALOGUE.TEST.ttlSeconds).toBeUndefined();
  });
});

describe("resolveNotificationLocale", () => {
  it.each([
    ["en-CA", "en"],
    ["EN_us", "en"],
    ["en", "en"],
    ["fr-CA", "en"],
    ["", "en"],
    [null, "en"],
    [undefined, "en"],
  ])("picks copy for %p: %p", (tag, locale) => {
    expect(resolveNotificationLocale(tag)).toBe(locale);
  });
});
