"use strict";

const path = require("path");

const PLATFORM_OR_TEST_SUFFIX = /(?:\.(?:ios|android|web|native|test|spec|config))+$/;

/** Strip .ts/.tsx (and platform/test/config suffixes) so only the file stem is checked. */
const getFileStem = (basename) => {
  const withoutJsTs = basename.replace(/\.(?:tsx|ts|jsx|js)$/u, "");
  return withoutJsTs.replace(PLATFORM_OR_TEST_SUFFIX, "");
};

/** Folders where files should stay flat (no per-component wrappers). */
const isInFlatFileScope = (filename) =>
  /(^|[/\\])(components|features|hooks|context|constants|providers)([/\\]|$)/u.test(filename);

/** Expo Router owns its own nesting under `app/`. */
const isUnderApp = (filename) => /(^|[/\\])app([/\\]|$)/u.test(filename);

const normalizeName = (name) => name.replace(/_/gu, "-").toLowerCase();

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid wrapping a source file in a same-named folder (or an index.tsx component folder)",
    },
    schema: [],
    messages: {
      sameNamedFolder:
        "Do not wrap a file in a same-named folder. Move this file up and keep it flat (e.g. `{{suggestion}}`).",
      indexInComponentFolder:
        "Do not use `index` as a component entry. Prefer a kebab-case file next to its siblings (e.g. `button.tsx`).",
    },
  },
  create(context) {
    return {
      Program(node) {
        const filename = context.filename;
        if (!filename || filename === "<input>" || filename.includes(`${path.sep}node_modules${path.sep}`)) {
          return;
        }
        if (isUnderApp(filename) || !isInFlatFileScope(filename)) {
          return;
        }

        const basename = path.basename(filename);
        const stem = getFileStem(basename);
        if (!stem) {
          return;
        }

        if (stem === "index") {
          context.report({ node, messageId: "indexInComponentFolder" });
          return;
        }

        const parentName = path.basename(path.dirname(filename));
        if (!parentName || parentName === "." || parentName === path.sep) {
          return;
        }
        // Expo-style segments are irrelevant outside app/, but skip anyway.
        if (parentName.startsWith("(") || parentName.startsWith("[")) {
          return;
        }

        if (normalizeName(parentName) !== normalizeName(stem)) {
          return;
        }

        context.report({
          node,
          messageId: "sameNamedFolder",
          data: { suggestion: basename },
        });
      },
    };
  },
};
