import { goesOnlyToEverglow, lastHostReason, REPORT_REASONS } from "./reasons";

test("the two serious reasons go only to Everglow", () => {
  expect(goesOnlyToEverglow("CHILD_SAFETY")).toBe(true);
  expect(goesOnlyToEverglow("NON_CONSENSUAL_INTIMATE_IMAGE")).toBe(true);
  expect(goesOnlyToEverglow("NUDITY_OR_SEXUAL")).toBe(false);
});

test("every ticket lists the hosts' reasons before Everglow's", () => {
  for (const reasons of Object.values(REPORT_REASONS)) {
    const firstSerious = reasons.findIndex(goesOnlyToEverglow);
    expect(reasons.slice(firstSerious).every(goesOnlyToEverglow)).toBe(true);
  }
});

test("a person can't be reported for an intimate image, since there is none", () => {
  expect(REPORT_REASONS.person).not.toContain("NON_CONSENSUAL_INTIMATE_IMAGE");
  expect(REPORT_REASONS.person).toContain("CHILD_SAFETY");
});

test("the Everglow rule sits under Something else", () => {
  expect(lastHostReason("frame")).toBe("OTHER");
  expect(lastHostReason("person")).toBe("OTHER");
  expect(lastHostReason("roll")).toBe("OTHER");
});
