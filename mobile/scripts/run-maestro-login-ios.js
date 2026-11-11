#!/usr/bin/env node

/**
 * Runs the iOS login smoke once, then retries once when the failure is a flake
 * or ambiguous. Clear failures stop immediately. Does not rebuild the app.
 *
 * Maestro replaces `.maestro/results/report.xml` on every run, and may replace
 * the debug output next to it. Attempt logs and the first attempt's results
 * are staged outside that directory and copied back after the last run so the
 * CI artifact still contains both.
 *
 * Each attempt's result, failure class and duration go to `attempts.json` in
 * the results, to the GitHub job summary, and, when a retry rescued the run,
 * to a `::warning::` annotation (see `maestro-attempt-summary.ts`). The device
 * and artifact name come from `SIM_NAME`, `SIM_RUNTIME_USED` and
 * `MAESTRO_ARTIFACT_NAME`, which the workflow sets.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const { attemptsRecord, rescueWarning, summaryMarkdown } = require("./maestro-attempt-summary.ts");
const {
  classifyMaestroFailure,
  failedHierarchyPaths,
  hierarchyText,
  shouldRetryMaestroFailure,
} = require("./maestro-failure-class.ts");

const mobileRoot = path.resolve(__dirname, "..");
const resultsDir = path.join(mobileRoot, ".maestro", "results");
const stagingDir = path.join(mobileRoot, ".maestro", "attempt-staging");
const MAX_ATTEMPTS = 2;

/**
 * @param {string} logPath
 * @returns {Promise<{ code: number, text: string }>}
 */
const runLoginSmoke = (logPath) =>
  new Promise((resolve) => {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    const log = fs.createWriteStream(logPath);
    let text = "";
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      log.end(() => resolve({ code, text }));
    };
    const child = spawn("pnpm", ["run", "test:e2e:login:ios"], {
      cwd: mobileRoot,
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
    });
    const capture = (stream) => (chunk) => {
      text += chunk.toString();
      stream.write(chunk);
      log.write(chunk);
    };
    child.stdout.on("data", capture(process.stdout));
    child.stderr.on("data", capture(process.stderr));
    child.on("error", (error) => {
      const message = error.code === "ENOENT" ? "pnpm: command not found" : String(error);
      text += `\n${message}\n`;
      log.write(`\n${message}\n`);
      finish(127);
    });
    child.on("close", (code) => finish(code ?? 1));
  });

/**
 * Maestro debug files (`commands.json`, one per flow) written by this attempt.
 * Earlier attempts' files are older than `sinceMs`, and staged copies are skipped.
 * @param {string} dir
 * @param {number} sinceMs
 * @param {number} [depth]
 * @returns {string[]}
 */
const debugCommandFiles = (dir, sinceMs, depth = 3) => {
  if (depth < 0 || !fs.existsSync(dir)) return [];
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("attempt-")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...debugCommandFiles(full, sinceMs, depth - 1));
    } else if (entry.name === "commands.json" && fs.statSync(full).mtimeMs >= sinceMs) {
      found.push(full);
    }
  }
  return found;
};

/**
 * Text on screen when this attempt's failing command ran, from the screen
 * hierarchy Maestro saved for it. Secret values (the E2E email typed into the
 * Auth0 form) are left out so they never reach the log.
 */
const screenTextAtFailure = (sinceMs) => {
  const secrets = new Set([process.env.E2E_EMAIL, process.env.E2E_PASSWORD].filter(Boolean));
  const text = new Set();
  for (const file of debugCommandFiles(resultsDir, sinceMs)) {
    try {
      for (const relative of failedHierarchyPaths(JSON.parse(fs.readFileSync(file, "utf8")))) {
        const root = JSON.parse(fs.readFileSync(path.join(path.dirname(file), relative), "utf8"));
        for (const line of hierarchyText(root)) {
          if (![...secrets].some((secret) => line.includes(secret))) text.add(line);
        }
      }
    } catch {
      // A missing or truncated debug file only costs the screen text, not the classification.
    }
  }
  return [...text];
};

const failureText = (stdio, screenText) => {
  const reportPath = path.join(resultsDir, "report.xml");
  const report = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, "utf8") : "";
  return `${stdio}\n${report}\n${screenText.join("\n")}`;
};

/** Drop attempt artifacts from a previous local run so this run's copies are the only ones. */
const clearPreviousAttemptArtifacts = () => {
  if (!fs.existsSync(resultsDir)) return;
  for (const name of fs.readdirSync(resultsDir)) {
    if (!name.startsWith("attempt-")) continue;
    fs.rmSync(path.join(resultsDir, name), { recursive: true, force: true });
  }
};

const snapshotResults = (dest) => {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  if (!fs.existsSync(resultsDir)) return;
  for (const entry of fs.readdirSync(resultsDir, { withFileTypes: true })) {
    if (entry.name.startsWith("attempt-")) continue;
    fs.cpSync(path.join(resultsDir, entry.name), path.join(dest, entry.name), { recursive: true });
  }
};

const publishStaging = () => {
  if (!fs.existsSync(stagingDir)) return;
  fs.mkdirSync(resultsDir, { recursive: true });
  for (const entry of fs.readdirSync(stagingDir, { withFileTypes: true })) {
    const target = path.join(resultsDir, entry.name);
    fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(path.join(stagingDir, entry.name), target, { recursive: true });
  }
};

/**
 * Writes `attempts.json`, the job summary and the rescue warning. Failures here
 * are logged but never change the smoke's result.
 * @param {import("./maestro-attempt-summary.ts").MaestroAttempt[]} attempts
 */
const recordAttempts = (attempts) => {
  if (attempts.length === 0) return;
  const run = {
    device: process.env.SIM_NAME || undefined,
    runtime: process.env.SIM_RUNTIME_USED || undefined,
    artifact: process.env.MAESTRO_ARTIFACT_NAME || undefined,
    attempts,
  };
  try {
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(path.join(resultsDir, "attempts.json"), `${JSON.stringify(attemptsRecord(run), null, 2)}\n`);
    const warning = rescueWarning(attempts, run.artifact);
    if (warning) console.log(warning);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown(run));
  } catch (error) {
    console.error("Failed to record Maestro attempts:", error);
  }
};

const main = async () => {
  let exitCode = 1;
  /** @type {import("./maestro-attempt-summary.ts").MaestroAttempt[]} */
  const attempts = [];
  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });
  clearPreviousAttemptArtifacts();
  let firstFailureClass = null;
  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      console.log(`Maestro login smoke attempt ${attempt}`);
      // Whole seconds: some file systems store coarse mtimes.
      const startedMs = Math.floor(Date.now() / 1000) * 1000;
      const result = await runLoginSmoke(path.join(stagingDir, `attempt-${attempt}.log`));
      const durationMs = Date.now() - startedMs;
      exitCode = result.code;
      if (exitCode === 0) {
        attempts.push({ attempt, passed: true, failureClass: null, durationMs, retried: false });
        if (attempt > 1) {
          console.log(`Maestro login smoke passed on attempt ${attempt} after a ${firstFailureClass} failure.`);
        }
        return;
      }
      const screenText = screenTextAtFailure(startedMs);
      if (screenText.length > 0) {
        console.error(`Screen at failure (attempt ${attempt}): ${screenText.join(" | ").slice(0, 600)}`);
      }
      const failureClass = classifyMaestroFailure(failureText(result.text, screenText));
      if (firstFailureClass === null) firstFailureClass = failureClass;
      const retry = shouldRetryMaestroFailure(failureClass, attempt, MAX_ATTEMPTS);
      attempts.push({ attempt, passed: false, failureClass, durationMs, retried: retry });
      if (retry) {
        console.error(
          `Maestro login smoke attempt ${attempt} failed (${failureClass}). Retrying once without rebuilding.`,
        );
        snapshotResults(path.join(stagingDir, `attempt-${attempt}`));
        continue;
      }
      const why = failureClass === "clear" ? " Not retrying." : "";
      console.error(`Maestro login smoke attempt ${attempt} failed (${failureClass}).${why}`);
      return;
    }
  } finally {
    try {
      publishStaging();
    } catch (error) {
      console.error("Failed to keep Maestro attempt logs:", error);
      exitCode = 1;
    }
    fs.rmSync(stagingDir, { recursive: true, force: true });
    recordAttempts(attempts);
    process.exitCode = exitCode;
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
