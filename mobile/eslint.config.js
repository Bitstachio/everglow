// https://docs.expo.dev/guides/using-eslint/
const fs = require("fs");
const path = require("path");
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

const featuresDir = path.join(__dirname, "features");
const featureNames = fs.existsSync(featuresDir)
  ? fs
      .readdirSync(featuresDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  : [];

// Profile (features/profile/) is the reference structure. Legacy feature folders listed here
// are exempt from layer rules until refactored to match profile. Do not copy their patterns.
const legacyFeatureNames = ["events"];

// App routes exempt from thin-route rules while legacy event screens live outside features/.
const legacyAppRoutePaths = ["app/events/**"];

const lintedSourceGlobs = [
  "app/**/*.{ts,tsx}",
  "components/**/*.{ts,tsx}",
  "constants/**/*.{ts,tsx}",
  "context/**/*.{ts,tsx}",
  "features/**/*.{ts,tsx}",
  "hooks/**/*.{ts,tsx}",
  "lib/**/*.{ts,tsx}",
  "providers/**/*.{ts,tsx}",
];

const generatedApiPatterns = ["@/lib/api/generated", "@/lib/api/generated/**"];
const featureApiPatterns = ["../api/*", "../api/**", "../../api/*", "../../api/**"];
const featureHookPatterns = ["../hooks/*", "../hooks/**", "../../hooks/*", "../../hooks/**"];

const generatedApiMessage =
  "Import API types from the feature types.ts file and call the API through feature api/ hooks.";

// Level 1 — codebase conventions (all linted app source).
const codebaseConventionRules = {
  "func-style": ["error", "expression"],
  "prefer-arrow-callback": "error",
  "no-var": "error",
  "prefer-const": "error",
  "no-restricted-syntax": [
    "error",
    {
      selector: "FunctionExpression",
      message: "Use an arrow function instead of the function keyword.",
    },
  ],
};

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
    ignores: ["dist/*", "lib/api/generated/**", "scripts/**"],
  },
  {
    files: lintedSourceGlobs,
    rules: codebaseConventionRules,
  },
  ...featureSelfImportConfigs,
  {
    files: ["features/**/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@tanstack/react-query",
              message: "React Query belongs in the feature api/ layer, not presentational components.",
            },
          ],
          patterns: [
            {
              group: generatedApiPatterns,
              message: generatedApiMessage,
            },
            {
              group: featureApiPatterns,
              message: "Presentational components must not import the feature api/ layer.",
            },
            {
              group: featureHookPatterns,
              message: "Presentational components must not import screen hooks.",
            },
          ],
        },
      ],
      "no-restricted-exports": [
        "error",
        {
          restrictDefaultExports: {
            direct: true,
          },
        },
      ],
    },
  },
  {
    files: ["features/**/screens/**/*.{ts,tsx}"],
    ignores: legacyFeatureNames.map((feature) => `features/${feature}/**`),
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@tanstack/react-query",
              message: "Screens delegate data access to screen hooks and feature api/ hooks.",
            },
            {
              name: "react-native",
              importNames: ["Alert"],
              message: "Move Alert dialogs into the screen hook.",
            },
          ],
          patterns: [
            {
              group: generatedApiPatterns,
              message: "Screens must not call the generated SDK directly. Use a screen hook and api/ hooks.",
            },
            {
              group: featureApiPatterns,
              message: "Screens must not import the feature api/ layer. Use a screen hook instead.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["features/**/hooks/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: generatedApiPatterns,
              message: "Screen hooks call feature api/ hooks instead of the generated SDK.",
            },
            {
              group: ["../screens/*", "../screens/**", "../components/*", "../components/**"],
              message: "Screen hooks must not import screens or components.",
            },
          ],
        },
      ],
      "no-restricted-exports": [
        "error",
        {
          restrictDefaultExports: {
            direct: true,
          },
        },
      ],
    },
  },
  {
    files: ["features/**/api/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-exports": [
        "error",
        {
          restrictDefaultExports: {
            direct: true,
          },
        },
      ],
    },
  },
  {
    files: ["context/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/features/*", "@/features/**"],
              message: "App-wide context must not depend on feature modules.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["app/**/*.{ts,tsx}"],
    ignores: legacyAppRoutePaths,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/features/*/hooks/*",
                "@/features/*/hooks/**",
                "@/features/*/components/*",
                "@/features/*/components/**",
                "@/features/*/api/*",
                "@/features/*/api/**",
              ],
              message:
                "App routes should stay thin. Re-export a feature screen from @/features/<name>/screens/.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["eslint.config.js", "babel.config.js"],
    languageOptions: {
      globals: {
        __dirname: "readonly",
        module: "readonly",
        require: "readonly",
        exports: "readonly",
      },
    },
  },
]);
