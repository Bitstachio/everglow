// https://docs.expo.dev/guides/using-eslint/
const fs = require("fs");
const path = require("path");
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

const featureNames = fs
  .readdirSync(path.join(__dirname, "features"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

// A feature references its own files relatively, so renaming or extracting the folder never
// rewrites internal paths, and `@/features/*` is left to mean "coupling to another feature".
const featureSelfImportConfigs = featureNames.map((feature) => ({
  files: [`features/${feature}/**/*.{ts,tsx}`],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: [`@/features/${feature}`, `@/features/${feature}/*`, `@/features/${feature}/**`],
            message: `Use a relative import (e.g. "../types") for files inside features/${feature}.`,
          },
        ],
      },
    ],
  },
}));

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
  },
  ...featureSelfImportConfigs,
]);
