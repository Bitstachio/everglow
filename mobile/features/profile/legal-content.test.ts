import {
  LEGAL_LAST_UPDATED,
  PRIVACY_POLICY_INTRO,
  PRIVACY_POLICY_SECTIONS,
  TERMS_OF_USE_INTRO,
  TERMS_OF_USE_SECTIONS,
} from "./legal-content";

test.each([
  ["privacy policy", PRIVACY_POLICY_SECTIONS, PRIVACY_POLICY_INTRO],
  ["terms of use", TERMS_OF_USE_SECTIONS, TERMS_OF_USE_INTRO],
])("%s has non-empty copy in every section", (_name, sections, intro) => {
  expect(intro.trim()).not.toBe("");
  expect(sections.length).toBeGreaterThan(0);
  for (const section of sections) {
    expect(section.heading.trim()).not.toBe("");
    expect(section.body.trim()).not.toBe("");
  }
});

test.each([
  ["privacy policy", PRIVACY_POLICY_SECTIONS],
  ["terms of use", TERMS_OF_USE_SECTIONS],
])("%s headings are unique so they are stable render keys", (_name, sections) => {
  const headings = sections.map((section) => section.heading);
  expect(new Set(headings).size).toBe(headings.length);
});

test("the revision date is a parseable date", () => {
  expect(Number.isNaN(Date.parse(LEGAL_LAST_UPDATED))).toBe(false);
});

const privacySection = (heading: string) =>
  PRIVACY_POLICY_SECTIONS.find((section) => section.heading === heading)?.body ?? "";

test("the privacy policy says reports are kept for up to a year, longer under a legal hold", () => {
  const retention = privacySection("Data retention");
  expect(retention).toMatch(/up to a year after the report is closed/);
  expect(retention).toMatch(/until that hold ends/);
});

test("the privacy policy's contact is on the website's domain", () => {
  expect(privacySection("Contact us")).toContain("hello@everglow.social");
});
