const coverage = require("./jest.coverage");

/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  ...coverage("unit"),
  testMatch: ["**/*.(test|spec).(ts|tsx|js|jsx)"],
  testPathIgnorePatterns: ["\\.integration\\.(test|spec)\\.(ts|tsx|js|jsx)$"],
  moduleNameMapper: {
    "\\.svg": "<rootDir>/__mocks__/svgMock.js",
    "^lucide-react-native$": "<rootDir>/__mocks__/lucide-react-native.js",
  },
};
