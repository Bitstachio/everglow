"use strict";

const fs = require("fs");
const path = require("path");

const PLATFORM_OR_TEST_SUFFIX = /(?:\.(?:ios|android|web|native|integration|test|spec|config))+$/;
const SOURCE_EXT = /\.(?:tsx|ts|jsx|js)$/u;

/** Strip .ts/.tsx (and platform/test/integration/config suffixes) so only the file stem is checked. */
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

/** True when the file is the folder's main module or a test/platform variant of it. */
const isFolderCompanion = (basename, folderName) => normalizeName(getFileStem(basename)) === normalizeName(folderName);

/**
 * Same-named folders are allowed when they hold related modules (hook, util, subcomponent).
 * A folder that only contains the component and its tests must stay flat.
 */
const folderHasJustifyingSibling = (dir, folderName) => {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return false;
  }

  return entries.some((entry) => {
    if (!entry.isFile() || !SOURCE_EXT.test(entry.name)) return false;
    return !isFolderCompanion(entry.name, folderName);
  });
};

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid same-named component folders that only wrap a component (+ tests); allow folders that also colocate hooks/utils. Forbid index component entries.",
    },
    schema: [],
    messages: {
      sameNamedFolder:
        "Do not wrap a component in a same-named folder unless it also contains related non-test modules (hook, util, subcomponent). Keep it flat (e.g. `{{suggestion}}`).",
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

        const dir = path.dirname(filename);
        if (folderHasJustifyingSibling(dir, parentName)) {
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
