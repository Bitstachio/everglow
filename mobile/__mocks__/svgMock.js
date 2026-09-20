const React = require("react");
const { View } = require("react-native");

function SvgMock(props) {
  return React.createElement(View, { testID: "svg-mock", ...props });
}

module.exports = SvgMock;
module.exports.default = SvgMock;
