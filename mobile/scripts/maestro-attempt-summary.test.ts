import {
  attemptsRecord,
  formatDuration,
  rescueWarning,
  rescuedFrom,
  summaryMarkdown,
  type MaestroAttempt,
} from "./maestro-attempt-summary";

const pass = (attempt: number, durationMs = 90_000) => ({
  attempt,
  passed: true,
  failureClass: null,
  durationMs,
  retried: false,
});
const fail = (
  attempt: number,
  failureClass: "flake" | "ambiguous" | "clear",
  retried: boolean,
  durationMs = 75_000,
) => ({
  attempt,
  passed: false,
  failureClass,
  durationMs,
  retried,
});

const run = (attempts: MaestroAttempt[]) => ({
  device: "iPhone 17",
  runtime: "iOS 26.5",
  artifact: "maestro-login-ios-42",
  attempts,
});

test("formats durations in minutes and seconds", () => {
  expect(formatDuration(0)).toBe("0s");
  expect(formatDuration(42_400)).toBe("42s");
  expect(formatDuration(125_000)).toBe("2m 5s");
});

test("records nothing as a flake when the first attempt passes", () => {
  const attempts = [pass(1)];
  expect(rescuedFrom(attempts)).toBeNull();
  expect(rescueWarning(attempts, "maestro-login-ios-42")).toBeNull();
  expect(attemptsRecord(run(attempts))).toMatchObject({ outcome: "passed", rescuedFrom: null });
  expect(summaryMarkdown(run(attempts))).not.toContain("Rescued");
});

test("warns when a retry rescued the run, naming the first failure class", () => {
  const attempts = [fail(1, "flake", true), pass(2)];
  expect(rescuedFrom(attempts)).toBe("flake");
  expect(rescueWarning(attempts, "maestro-login-ios-42")).toBe(
    "::warning title=Mac smoke retry::Login smoke passed on attempt 2 after a flake failure. Attempt 1 is in attempt-1/ of the maestro-login-ios-42 artifact.",
  );
  expect(attemptsRecord(run(attempts))).toMatchObject({ outcome: "passed after retry", rescuedFrom: "flake" });
});

test("counts an ambiguous first failure that a retry fixed", () => {
  expect(rescuedFrom([fail(1, "ambiguous", true), pass(2)])).toBe("ambiguous");
});

test("does not count a clear failure as a flake", () => {
  const attempts = [fail(1, "clear", false)];
  expect(rescuedFrom(attempts)).toBeNull();
  expect(rescueWarning(attempts)).toBeNull();
  expect(summaryMarkdown(run(attempts))).toContain("| 1 | failed (clear), not retried | 1m 15s |");
  expect(attemptsRecord(run(attempts)).outcome).toBe("failed");
});

test("does not warn when both attempts failed", () => {
  const attempts = [fail(1, "flake", true), fail(2, "ambiguous", false)];
  expect(rescueWarning(attempts)).toBeNull();
  expect(summaryMarkdown(run(attempts))).toContain("| 2 | failed (ambiguous), no retries left |");
});

test("writes the device, artifact and one row per attempt to the job summary", () => {
  expect(summaryMarkdown(run([fail(1, "flake", true, 61_000), pass(2, 95_000)]))).toBe(
    [
      "## Mac smoke: Maestro login",
      "",
      "**Result:** passed after retry",
      "",
      "- Simulator: iPhone 17 on iOS 26.5",
      "- Results artifact: `maestro-login-ios-42`",
      "- Rescued by a retry after a `flake` failure. Investigate it as a flake.",
      "",
      "| Attempt | Result | Duration |",
      "| ------- | ------ | -------- |",
      "| 1 | failed (flake), retried | 1m 1s |",
      "| 2 | passed | 1m 35s |",
      "",
    ].join("\n"),
  );
});

test("still summarizes when the workflow did not say which device ran", () => {
  const markdown = summaryMarkdown({ attempts: [pass(1)] });
  expect(markdown).toContain("- Simulator: unknown on unknown runtime");
  expect(markdown).not.toContain("Results artifact");
});
