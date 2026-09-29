const coverage = require("./jest.coverage");

/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  ...coverage("unit"),
  testMatch: ["**/*.(test|spec).(ts|tsx|js|jsx)"],
  testPathIgnorePatterns: ["\\.integration\\.(test|spec)\\.(ts|tsx|js|jsx)$"],
  // Same budget as the integration config. Rendering tests take several
  // seconds on the 2-CPU runners private repositories get, past Jest's 5 s default.
  testTimeout: 15000,
  moduleNameMapper: {
    "\\.svg": "<rootDir>/__mocks__/svgMock.js",
    "^lucide-react-native$": "<rootDir>/__mocks__/lucide-react-native.js",
  },
};
