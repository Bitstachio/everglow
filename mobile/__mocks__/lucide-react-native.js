const React = require("react");
const { View } = require("react-native");

const createIcon = (name) => {
  const Icon = (props) => React.createElement(View, { testID: `lucide-${name}`, accessibilityRole: "image", ...props });
  Icon.displayName = name;
  return Icon;
};

module.exports = new Proxy(
  {},
  {
    get: (_target, prop) => {
      if (prop === "__esModule") return true;
      if (typeof prop === "string") return createIcon(prop);
      return undefined;
    },
  },
);
