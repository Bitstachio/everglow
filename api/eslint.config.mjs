// @ts-check
import eslint from "@eslint/js";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";
import tseslint from "typescript-eslint";

// Nest class/object methods are FunctionExpression in the AST; allow those.
const arrowFunctionsOnly = {
  selector: ":not(MethodDefinition, Property[method=true]) > FunctionExpression",
  message: "Use an arrow function instead of the function keyword.",
};

const nestExceptionTemplateRules = [
  {
    selector:
      "NewExpression[callee.name='NotFoundException'][arguments.length>0]:not([arguments.0.type='CallExpression'][arguments.0.callee.object.object.name='RESPONSE_TEMPLATES'][arguments.0.callee.object.property.name='RESOURCE'][arguments.0.callee.property.name='NOT_FOUND'])",
    message: "NotFoundException may only take RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND(...) or no argument.",
  },
  {
    selector:
      "NewExpression[callee.name='ConflictException'][arguments.length>0]:not([arguments.0.type='CallExpression'][arguments.0.callee.object.object.name='RESPONSE_TEMPLATES'][arguments.0.callee.object.property.name='RESOURCE'][arguments.0.callee.property.name='ALREADY_EXISTS'])",
    message: "ConflictException may only take RESPONSE_TEMPLATES.RESOURCE.ALREADY_EXISTS(...) or no argument.",
  },
  {
    selector:
      "NewExpression[callee.name='BadRequestException'][arguments.length>0]:not([arguments.0.type='CallExpression'][arguments.0.callee.object.name='RESPONSE_TEMPLATES'][arguments.0.callee.property.name=/^(INVALID_FORMAT|INVALID_VALUE)$/])",
    message:
      "BadRequestException may only take RESPONSE_TEMPLATES.INVALID_FORMAT(...), RESPONSE_TEMPLATES.INVALID_VALUE(...) or no argument.",
  },
  {
    selector:
      "NewExpression[callee.name=/^(Forbidden|Unauthorized|UnprocessableEntity)Exception$/][arguments.length>0]",
    message:
      "ForbiddenException, UnauthorizedException, and UnprocessableEntityException must take no argument (status alone). Use ApiException for product codes.",
  },
];

export default tseslint.config(
  {
    ignores: ["eslint.config.mjs"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: "commonjs",
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "prettier/prettier": ["error", { endOfLine: "auto" }],
      // Match mobile codebaseConventionRules that apply to Nest/TypeScript.
      "func-style": ["error", "expression"],
      "prefer-arrow-callback": "error",
      "no-var": "error",
      "prefer-const": "error",
      "no-restricted-syntax": ["error", arrowFunctionsOnly, ...nestExceptionTemplateRules],
    },
  },
  {
    files: ["**/*.spec.ts"],
    rules: {
      "@typescript-eslint/unbound-method": "off",
      // Filter specs pass raw Nest messages on purpose. Keep the arrow-function ban.
      "no-restricted-syntax": ["error", arrowFunctionsOnly],
    },
  },
);
