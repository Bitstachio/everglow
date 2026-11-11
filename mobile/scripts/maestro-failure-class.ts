/**
 * Classifies a failed Maestro login smoke so CI can retry once or fail immediately.
 *
 * Clear patterns are checked first. A wrong-password page that also mentions a
 * driver error should not be retried. Flake patterns are specific exception
 * text. Routine lines such as "XCTest driver started" must not count, or every
 * iOS failure would look like a flake.
 *
 * Maestro's stdout does not show what was on screen. `failedHierarchyPaths`
 * and `hierarchyText` read the visible text from the screen hierarchy Maestro
 * saves for a failed command in its debug output, so an in-app error alert or
 * an Auth0 form error can be classified too.
 */

export type MaestroFailureClass = "flake" | "ambiguous" | "clear";

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
  // The app's sign-in error alert, with either apostrophe, and the Keychain
  // errors behind it (for example OSStatus -34018 from an unsigned build).
  /couldn.t sign in/i,
  /\bOSStatus\b/i,
  /\berrSec[A-Z]\w*/,
  /(from|in|to) the keychain/i,
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
  /DeviceUnreachableException/,
  /device became unreachable/i,
  /unable to connect to .{0,80}driver/i,
  /failed to (get|obtain|fetch) (the )?(view )?hierarchy/i,
  /error getting hierarchy/i,
];

/**
 * @param log Maestro stdout/stderr plus report.xml from the failed attempt.
 */
export const classifyMaestroFailure = (log: string): MaestroFailureClass => {
  const text = log ?? "";
  if (CLEAR_PATTERNS.some((pattern) => pattern.test(text))) return "clear";
  if (FLAKE_PATTERNS.some((pattern) => pattern.test(text))) return "flake";
  return "ambiguous";
};

const HIERARCHY_TEXT_KEYS = ["text", "accessibilityText", "hintText"] as const;

type ScreenHierarchyArtifact = { type?: unknown; path?: unknown };
type CommandMetadata = { status?: unknown; artifacts?: unknown };
type CommandEntry = { metadata?: CommandMetadata };

/**
 * Paths of the screen hierarchies Maestro saved for failed commands, from one
 * parsed `commands.json` (an array of `{ command, metadata }`). Paths are
 * relative to the folder that holds `commands.json`.
 */
export const failedHierarchyPaths = (commands: unknown): string[] => {
  if (!Array.isArray(commands)) return [];
  const paths: string[] = [];
  for (const entry of commands) {
    const metadata = (entry as CommandEntry | null)?.metadata;
    if (metadata?.status !== "FAILED" || !Array.isArray(metadata.artifacts)) continue;
    for (const artifact of metadata.artifacts as ScreenHierarchyArtifact[]) {
      if (artifact?.type === "SCREEN_HIERARCHY" && typeof artifact.path === "string") paths.push(artifact.path);
    }
  }
  return paths;
};

type HierarchyNode = {
  attributes?: Record<string, unknown>;
  children?: unknown[];
};

/**
 * Visible text in a Maestro screen hierarchy (`screen-hierarchy/*.json`), in
 * order and without repeats.
 */
export const hierarchyText = (root: unknown, out: Set<string> = new Set()): string[] => {
  if (root && typeof root === "object") {
    const node = root as HierarchyNode;
    const attributes = node.attributes ?? {};
    for (const key of HIERARCHY_TEXT_KEYS) {
      const value = attributes[key];
      if (typeof value === "string" && value.trim() !== "") out.add(value.trim());
    }
    if (Array.isArray(node.children)) for (const child of node.children) hierarchyText(child, out);
  }
  return [...out];
};

/**
 * One retry, and only when the failure is not clearly deterministic.
 * @param attempt 1-based attempt that just failed
 */
export const shouldRetryMaestroFailure = (
  failureClass: MaestroFailureClass,
  attempt: number,
  maxAttempts = 2,
): boolean => failureClass !== "clear" && attempt < maxAttempts;
