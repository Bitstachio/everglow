"use strict";

const path = require("path");

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLATFORM_OR_TEST_SUFFIX = /(?:\.(?:ios|android|web|native|test|spec|config))+$/;

/** Strip .ts/.tsx (and platform/test/config suffixes) so only the file stem is checked. */
const getFileStem = (basename) => {
  const withoutJsTs = basename.replace(/\.(?:tsx|ts|jsx|js)$/u, "");
  return withoutJsTs.replace(PLATFORM_OR_TEST_SUFFIX, "");
};

/** Expo Router private files (`_layout`) and dynamic segments (`[id]`). */
const isExpoRouterFilename = (stem) => stem.startsWith("_") || /^\[[^\]]+\]$/u.test(stem);

const toKebabSuggestion = (stem) =>
  stem
    .replace(/([a-z0-9])([A-Z])/gu, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/gu, "$1-$2")
    .replace(/_/gu, "-")
    .toLowerCase();

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce kebab-case source filenames",
    },
    schema: [],
    messages: {
      notKebabCase: "Filename must be kebab-case. Rename it to `{{suggestion}}`.",
    },
  },
  create(context) {
    return {
      Program(node) {
        const filename = context.filename;
        if (!filename || filename === "<input>" || filename.includes(`${path.sep}node_modules${path.sep}`)) {
          return;
        }

        const basename = path.basename(filename);
        const stem = getFileStem(basename);
        if (!stem || isExpoRouterFilename(stem) || KEBAB_CASE.test(stem)) {
          return;
        }

        const extension = basename.slice(stem.length);
        context.report({
          node,
          messageId: "notKebabCase",
          data: { suggestion: `${toKebabSuggestion(stem)}${extension}` },
        });
      },
    };
  },
};
