/**
 * Coverage settings shared by the unit and integration Jest configs, so both
 * suites measure the same files. `collectCoverageFrom` lists the app's own
 * source; without it Jest only counts files a test happens to import, which
 * hides untested code. The generated API client and test scaffolding are not
 * ours to cover.
 */
const SOURCE_DIRS = ["app", "components", "constants", "context", "features", "hooks", "lib", "providers", "theme"];

/** @param {string} suite subdirectory under coverage/, one per suite */
module.exports = (suite) => ({
  collectCoverageFrom: [
    ...SOURCE_DIRS.map((dir) => `${dir}/**/*.{ts,tsx}`),
    "!**/*.d.ts",
    "!**/*.{test,spec}.{ts,tsx}",
    "!lib/api/generated/**",
    "!**/testing/**",
  ],
  coverageDirectory: `coverage/${suite}`,
  coverageReporters: ["text-summary", "json-summary"],
});
