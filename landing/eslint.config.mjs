import { createRequire } from "node:module";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";
import { defineConfig, globalIgnores } from "eslint/config";

const require = createRequire(import.meta.url);
const localPlugin = require("./eslint-local");

const lintedSourceGlobs = ["src/**/*.{ts,tsx}", "middleware.ts"];

// Same TypeScript/React conventions as mobile (arrow functions, kebab-case files).
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
  "local/kebab-case-filename": "error",
  "local/no-component-folder": "error",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "node_modules/**"]),
  {
    files: lintedSourceGlobs,
    plugins: {
      local: localPlugin,
    },
    rules: codebaseConventionRules,
  },
  {
    files: ["src/components/**/*.{ts,tsx}", "src/hooks/**/*.{ts,tsx}", "src/lib/**/*.{ts,tsx}"],
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
]);

export default eslintConfig;
