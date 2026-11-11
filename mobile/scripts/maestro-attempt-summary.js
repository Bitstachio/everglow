/**
 * Records what each Mac smoke Maestro attempt did, so a run that passed only
 * on its retry stays visible after the log scrolls away.
 *
 * `scripts/run-maestro-login-ios.js` uses these to write the GitHub job summary,
 * `attempts.json` in the results artifact, and a `::warning::` annotation when
 * a retry rescued the run. Annotations stay on the run and can be queried with
 * the checks API (see `mobile/docs/mac-smoke.md`).
 */

/** @typedef {import("./maestro-failure-class").MaestroFailureClass} MaestroFailureClass */

/**
 * @typedef {object} MaestroAttempt
 * @property {number} attempt 1-based
 * @property {boolean} passed
 * @property {MaestroFailureClass | null} failureClass null when the attempt passed
 * @property {number} durationMs
 * @property {boolean} retried whether another attempt followed this one
 */

/** @param {number} ms */
const formatDuration = (ms) => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
};

/**
 * The failure class of the attempt a later pass recovered from, or null when
 * the first attempt passed, the run failed, or it never retried. A clear
 * failure is never retried, so it can never be a rescued flake.
 * @param {MaestroAttempt[]} attempts
 * @returns {MaestroFailureClass | null}
 */
const rescuedFrom = (attempts) => {
  const last = attempts[attempts.length - 1];
  if (!last?.passed || attempts.length < 2) return null;
  return attempts[0].failureClass;
};

/**
 * @param {MaestroAttempt[]} attempts
 * @returns {"passed" | "passed after retry" | "failed"}
 */
const outcome = (attempts) => {
  const last = attempts[attempts.length - 1];
  if (!last?.passed) return "failed";
  return attempts.length > 1 ? "passed after retry" : "passed";
};

/**
 * @param {MaestroAttempt} attempt
 */
const attemptResult = (attempt) => {
  if (attempt.passed) return "passed";
  const next = attempt.retried ? "retried" : attempt.failureClass === "clear" ? "not retried" : "no retries left";
  return `failed (${attempt.failureClass}), ${next}`;
};

/**
 * One line for a `::warning::` annotation when a retry rescued the run.
 * @param {MaestroAttempt[]} attempts
 * @param {string | undefined} artifact
 * @returns {string | null}
 */
const rescueWarning = (attempts, artifact) => {
  const from = rescuedFrom(attempts);
  if (from === null) return null;
  const where = artifact ? ` Attempt 1 is in attempt-1/ of the ${artifact} artifact.` : "";
  return `::warning title=Mac smoke retry::Login smoke passed on attempt ${attempts.length} after a ${from} failure.${where}`;
};

/**
 * @param {{ device?: string, runtime?: string, artifact?: string, attempts: MaestroAttempt[] }} run
 * @returns {string} GitHub-flavoured Markdown for `$GITHUB_STEP_SUMMARY`
 */
const summaryMarkdown = ({ device, runtime, artifact, attempts }) => {
  const lines = [
    "## Mac smoke: Maestro login",
    "",
    `**Result:** ${outcome(attempts)}`,
    "",
    `- Simulator: ${device ?? "unknown"} on ${runtime ?? "unknown runtime"}`,
  ];
  if (artifact) lines.push(`- Results artifact: \`${artifact}\``);
  const from = rescuedFrom(attempts);
  if (from !== null) lines.push(`- Rescued by a retry after a \`${from}\` failure. Investigate it as a flake.`);
  lines.push("", "| Attempt | Result | Duration |", "| ------- | ------ | -------- |");
  for (const attempt of attempts) {
    lines.push(`| ${attempt.attempt} | ${attemptResult(attempt)} | ${formatDuration(attempt.durationMs)} |`);
  }
  return `${lines.join("\n")}\n`;
};

/**
 * The machine-readable record kept as `attempts.json` in the results artifact.
 * @param {{ device?: string, runtime?: string, artifact?: string, attempts: MaestroAttempt[] }} run
 */
const attemptsRecord = ({ device, runtime, artifact, attempts }) => ({
  outcome: outcome(attempts),
  rescuedFrom: rescuedFrom(attempts),
  device: device ?? null,
  runtime: runtime ?? null,
  artifact: artifact ?? null,
  attempts,
});

module.exports = { attemptsRecord, formatDuration, rescueWarning, rescuedFrom, summaryMarkdown };
