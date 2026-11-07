/**
 * Classifies a failed Maestro login smoke so CI can retry once or fail immediately.
 *
 * Clear patterns are checked first. A wrong-password page that also mentions a
 * driver error should not be retried. Flake patterns are specific exception
 * text. Routine lines such as "XCTest driver started" must not count, or every
 * iOS failure would look like a flake.
 */

/** @typedef {"flake" | "ambiguous" | "clear"} MaestroFailureClass */

const CLEAR_PATTERNS = [
  /wrong email or password/i,
  /wrong password/i,
  /invalid (login )?credentials/i,
  /password is required/i,
  /email is required/i,
  /too many (unsuccessful )?(login )?attempts/i,
  /account has been blocked/i,
  /auth0 is not configured/i,
  /you can't sign in to this account/i,
  /could not complete onboarding/i,
  /command not found/i,
  /no flows? found/i,
  /no flows to run/i,
  /unable to parse/i,
  /failed to parse flow/i,
  /flow is invalid/i,
  /unknown option/i,
];

const FLAKE_PATTERNS = [
  /XCTestDriverUnreachable/,
  /Failed to reach XCUITest Server/i,
  /kAXErrorInvalidUIElement/,
  /Failed to connect to \/127\.0\.0\.1/,
  /Failed to connect to localhost/i,
  /Connection refused/i,
  /ConnectException/,
  /SocketTimeoutException/,
  /SocketException/,
  /Connection reset/i,
  /Broken pipe/i,
  /StatusRuntimeException/,
  /UNAVAILABLE: io exception/i,
  /driver unreachable/i,
  /unable to connect to .{0,80}driver/i,
  /failed to (get|obtain|fetch) (the )?(view )?hierarchy/i,
  /error getting hierarchy/i,
];

/**
 * @param {string} log Maestro stdout/stderr plus report.xml from the failed attempt.
 * @returns {MaestroFailureClass}
 */
const classifyMaestroFailure = (log) => {
  const text = log ?? "";
  if (CLEAR_PATTERNS.some((pattern) => pattern.test(text))) return "clear";
  if (FLAKE_PATTERNS.some((pattern) => pattern.test(text))) return "flake";
  return "ambiguous";
};

/**
 * One retry, and only when the failure is not clearly deterministic.
 * @param {MaestroFailureClass} failureClass
 * @param {number} attempt 1-based attempt that just failed
 * @param {number} [maxAttempts]
 */
const shouldRetryMaestroFailure = (failureClass, attempt, maxAttempts = 2) =>
  failureClass !== "clear" && attempt < maxAttempts;

module.exports = { classifyMaestroFailure, shouldRetryMaestroFailure };
