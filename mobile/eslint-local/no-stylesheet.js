"use strict";

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow React Native StyleSheet — use NativeWind className instead",
    },
    schema: [],
    messages: {
      noStyleSheetImport: "Do not import StyleSheet. Use NativeWind className. See docs/theme.md.",
      noStyleSheetUse: "Do not use StyleSheet. Use NativeWind className. See docs/theme.md.",
    },
  },
  create(context) {
    return {
      ImportSpecifier(node) {
        if (node.imported.type === "Identifier" && node.imported.name === "StyleSheet") {
          context.report({ node, messageId: "noStyleSheetImport" });
        }
      },
      MemberExpression(node) {
        if (node.object.type === "Identifier" && node.object.name === "StyleSheet") {
          context.report({ node, messageId: "noStyleSheetUse" });
        }
      },
    };
  },
};
