// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
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
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
      // Match mobile codebaseConventionRules that apply to Nest/TypeScript.
      'func-style': ['error', 'expression'],
      'prefer-arrow-callback': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-restricted-syntax': [
        'error',
        {
          // Nest class/object methods are FunctionExpression in the AST; allow those.
          selector:
            ':not(MethodDefinition, Property[method=true]) > FunctionExpression',
          message: 'Use an arrow function instead of the function keyword.',
        },
        {
          selector:
            'NewExpression[callee.name=/^(BadRequest|Conflict|Forbidden|NotFound|Unauthorized|UnprocessableEntity)Exception$/][arguments.0.type=/^(Literal|TemplateLiteral)$/]',
          message:
            'Pass RESPONSE_TEMPLATES (or no message) to uncoded Nest HTTP exceptions. Do not inline a string.',
        },
      ],
    },
  },
  {
    files: ['**/*.spec.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      // Filter specs pass raw Nest messages on purpose. Keep the arrow-function ban.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            ':not(MethodDefinition, Property[method=true]) > FunctionExpression',
          message: 'Use an arrow function instead of the function keyword.',
        },
      ],
    },
  },
);
