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

// How each failure is thrown (docs/api-exceptions.md). A product rule the app
// explains is an ApiException with a catalogue code; a generic failure is a
// Nest exception whose only argument is a RESPONSE_TEMPLATES reason for the logs.
const notFoundTakesItsTemplate = {
  selector:
    "NewExpression[callee.name='NotFoundException'][arguments.length>0]:not([arguments.0.type='CallExpression'][arguments.0.callee.object.object.name='RESPONSE_TEMPLATES'][arguments.0.callee.object.property.name='RESOURCE'][arguments.0.callee.property.name='NOT_FOUND'])",
  message: "NotFoundException may only take RESPONSE_TEMPLATES.RESOURCE.NOT_FOUND(...) or no argument.",
};

const badRequestTakesItsTemplate = {
  selector:
    "NewExpression[callee.name='BadRequestException'][arguments.length>0]:not([arguments.0.type='CallExpression'][arguments.0.callee.object.name='RESPONSE_TEMPLATES'][arguments.0.callee.property.name=/^(INVALID_FORMAT|INVALID_VALUE)$/])",
  message:
    "BadRequestException may only take RESPONSE_TEMPLATES.INVALID_FORMAT(...), RESPONSE_TEMPLATES.INVALID_VALUE(...) or no argument.",
};

const unauthorizedTakesNothing = {
  selector: "NewExpression[callee.name='UnauthorizedException'][arguments.length>0]",
  message: "UnauthorizedException must take no argument: the client is only told to sign in again. Log why first.",
};

const conflictsAndRuleBreaksAreCoded = {
  selector: "NewExpression[callee.name=/^(Conflict|UnprocessableEntity)Exception$/]",
  message: "A 409 or 422 is always a product rule the app explains: throw an ApiException with a catalogue code.",
};

const noRawHttpException = {
  selector: "NewExpression[callee.name='HttpException']",
  message: "Throw an ApiException with a catalogue code, or a Nest subclass for a generic failure.",
};

// The only bare 403 is authorize()'s failed CASL check, so a product rule can't
// be thrown as one and leave the app with generic copy.
const forbiddenOnlyInAuthorize = {
  selector: "NewExpression[callee.name='ForbiddenException']",
  message:
    "Refuse a caller without access with authorize() from src/casl/authorize.ts, and a product rule with an ApiException with a catalogue code.",
};

const nestExceptionRules = [
  notFoundTakesItsTemplate,
  badRequestTakesItsTemplate,
  unauthorizedTakesNothing,
  conflictsAndRuleBreaksAreCoded,
  noRawHttpException,
  forbiddenOnlyInAuthorize,
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
      "no-restricted-syntax": ["error", arrowFunctionsOnly, ...nestExceptionRules],
    },
  },
  {
    files: ["src/casl/authorize.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        arrowFunctionsOnly,
        ...nestExceptionRules.filter((rule) => rule !== forbiddenOnlyInAuthorize),
      ],
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
