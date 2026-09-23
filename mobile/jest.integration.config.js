/** @type {import('jest').Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["**/*.integration.(test|spec).(ts|tsx|js|jsx)"],
  // Screen-integration suites are CPU-heavy under RNTL userEvent.
  testTimeout: 15000,
  maxWorkers: 2,
  moduleNameMapper: {
    "\\.svg": "<rootDir>/__mocks__/svgMock.js",
    "^lucide-react-native$": "<rootDir>/__mocks__/lucide-react-native.js",
  },
};
