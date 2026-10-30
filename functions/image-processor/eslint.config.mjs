// @ts-check
import eslint from "@eslint/js";
import prettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import tseslint from "typescript-eslint";

// The API's TypeScript rules apply; Nest HTTP exception rules belong to api/.
export default tseslint.config(
  { ignores: ["dist/**", "tmp/**", "scripts/**", "eslint.config.mjs"] },
  { files: ["src/**/*.ts"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  prettier,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "func-style": ["error", "expression"],
      "prefer-arrow-callback": "error",
      "no-var": "error",
      "prefer-const": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: ":not(MethodDefinition, Property[method=true]) > FunctionExpression",
          message: "Use an arrow function instead of the function keyword.",
        },
      ],
    },
  },
  {
    files: ["**/*.spec.ts"],
    rules: {
      "@typescript-eslint/unbound-method": "off",
      // Async SDK test doubles intentionally resolve/reject without real I/O.
      "@typescript-eslint/require-await": "off",
    },
  },
);
