import { EVENT_PLAN_LIMITS, galleryClosesAt, galleryStateOf } from "./plans.constants";

describe("plans", () => {
  describe("EVENT_PLAN_LIMITS", () => {
    it("holds the free plan from docs/event-quotas.md", () => {
      expect(EVENT_PLAN_LIMITS.FREE).toEqual({
        maxMembers: 30,
        maxGalleryBytes: 3n * 1024n ** 3n,
        galleryWindowDays: 30,
      });
    });
  });

  describe("galleryClosesAt", () => {
    it("closes a free gallery 30 days after the event's date", () => {
      expect(galleryClosesAt(new Date("2026-10-01T18:00:00.000Z"), "FREE")).toEqual(
        new Date("2026-10-31T18:00:00.000Z"),
      );
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
