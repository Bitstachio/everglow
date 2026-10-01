import { ACCOUNT_PLAN_LIMITS, galleryClosesAt, galleryStateOf } from "./plans.constants";

describe("plans", () => {
  describe("ACCOUNT_PLAN_LIMITS", () => {
    it("lets a free account run 2 active events (docs/event-quotas.md)", () => {
      expect(ACCOUNT_PLAN_LIMITS.FREE).toEqual({ maxActiveEvents: 2 });
    });
  });

  describe("galleryClosesAt", () => {
    it("closes a gallery its plan's window after the event's date", () => {
      expect(galleryClosesAt(new Date("2026-10-01T18:00:00.000Z"), 30)).toEqual(new Date("2026-10-31T18:00:00.000Z"));
    });

    it("never closes a gallery on a plan without a window", () => {
      expect(galleryClosesAt(new Date("2026-10-01T18:00:00.000Z"), null)).toBeNull();
    });
  });

  describe("galleryStateOf", () => {
    const now = new Date("2026-10-31T18:00:00.000Z");

    it("is OPEN before the close time", () => {
      expect(galleryStateOf({ galleryClosesAt: new Date(now.getTime() + 1), galleryClosedAt: null }, now)).toBe("OPEN");
    });

    it("is CLOSED from the close time on, before the close job has run", () => {
      expect(galleryStateOf({ galleryClosesAt: now, galleryClosedAt: null }, now)).toBe("CLOSED");
    });

    it("is CLOSED once the close job has run", () => {
      expect(galleryStateOf({ galleryClosesAt: null, galleryClosedAt: now }, now)).toBe("CLOSED");
    });

    it("stays OPEN on a plan that never closes", () => {
      expect(galleryStateOf({ galleryClosesAt: null, galleryClosedAt: null }, now)).toBe("OPEN");
    });
  });
});
