import { ACCOUNT_PLAN_LIMITS, gallerySchedule, galleryStateOf } from "./plans.constants";

describe("plans", () => {
  describe("ACCOUNT_PLAN_LIMITS", () => {
    it("lets a free account run 2 active events (docs/event-quotas.md)", () => {
      expect(ACCOUNT_PLAN_LIMITS.FREE).toEqual({ maxActiveEvents: 2 });
    });
  });

  describe("gallerySchedule", () => {
    const now = new Date("2026-10-01T12:00:00.000Z");

    it("opens a gallery on a future date and closes it the chosen length after", () => {
      expect(gallerySchedule(new Date("2026-11-14T18:00:00.000Z"), 7, now)).toEqual({
        galleryOpensAt: new Date("2026-11-14T18:00:00.000Z"),
        galleryClosesAt: new Date("2026-11-21T18:00:00.000Z"),
      });
    });

    it("opens a gallery for a past date now, so the date never shortens it", () => {
      expect(gallerySchedule(new Date("2026-08-15T18:00:00.000Z"), 30, now)).toEqual({
        galleryOpensAt: now,
        galleryClosesAt: new Date("2026-10-31T12:00:00.000Z"),
      });
    });

    it("never closes a gallery on a plan without a length", () => {
      expect(gallerySchedule(new Date("2026-11-14T18:00:00.000Z"), null, now)).toEqual({
        galleryOpensAt: new Date("2026-11-14T18:00:00.000Z"),
        galleryClosesAt: null,
      });
    });
  });

  describe("galleryStateOf", () => {
    const now = new Date("2026-10-31T18:00:00.000Z");
    const opened = new Date("2026-10-01T18:00:00.000Z");

    it("is UPCOMING before the gallery opens", () => {
      const event = { galleryOpensAt: new Date(now.getTime() + 1), galleryClosesAt: null, galleryClosedAt: null };

      expect(galleryStateOf(event, now)).toBe("UPCOMING");
    });

    it("is OPEN from the open time until the close time", () => {
      expect(galleryStateOf({ galleryOpensAt: now, galleryClosesAt: null, galleryClosedAt: null }, now)).toBe("OPEN");
      expect(
        galleryStateOf(
          { galleryOpensAt: opened, galleryClosesAt: new Date(now.getTime() + 1), galleryClosedAt: null },
          now,
        ),
      ).toBe("OPEN");
    });

    it("is CLOSED from the close time on, before the close job has run", () => {
      expect(galleryStateOf({ galleryOpensAt: opened, galleryClosesAt: now, galleryClosedAt: null }, now)).toBe(
        "CLOSED",
      );
    });

    it("is CLOSED once the close job has run, even before the close time", () => {
      const event = { galleryOpensAt: opened, galleryClosesAt: new Date(now.getTime() + 1), galleryClosedAt: now };

      expect(galleryStateOf(event, now)).toBe("CLOSED");
    });

    it("stays OPEN on a plan that never closes", () => {
      expect(galleryStateOf({ galleryOpensAt: opened, galleryClosesAt: null, galleryClosedAt: null }, now)).toBe(
        "OPEN",
      );
    });
  });
});
