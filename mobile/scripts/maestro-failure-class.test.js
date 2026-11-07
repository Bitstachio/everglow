const { classifyMaestroFailure, shouldRetryMaestroFailure } = require("./maestro-failure-class");

test("retries an unreachable XCTest driver", () => {
  const failureClass = classifyMaestroFailure(
    "xcuitest.XCTestDriverClient$XCTestDriverUnreachable: Failed to reach XCUITest Server in restart",
  );
  expect(failureClass).toBe("flake");
  expect(shouldRetryMaestroFailure(failureClass, 1)).toBe(true);
});

test("retries a dead local driver port", () => {
  const failureClass = classifyMaestroFailure(
    "java.net.ConnectException: Failed to connect to /127.0.0.1:49889\nCaused by: java.net.ConnectException: Connection refused",
  );
  expect(failureClass).toBe("flake");
});

test("retries a hierarchy update the XCTest server rejected", () => {
  expect(classifyMaestroFailure("XCUITestServerError 500 kAXErrorInvalidUIElement")).toBe("flake");
});

test("retries a missing element as ambiguous", () => {
  const log = [
    "Waiting for XCTest driver to start...",
    "XCTest driver started",
    "Assertion is false: id: events-profile-button is visible",
  ].join("\n");
  const failureClass = classifyMaestroFailure(log);
  expect(failureClass).toBe("ambiguous");
  expect(shouldRetryMaestroFailure(failureClass, 1)).toBe(true);
});

test("retries an Auth0 web view that never showed the email field", () => {
  expect(classifyMaestroFailure("Element not found: Text matching regex: Email address")).toBe("ambiguous");
});

test("retries when the failed attempt produced no output", () => {
  expect(classifyMaestroFailure("")).toBe("ambiguous");
});

test("does not retry wrong Auth0 credentials", () => {
  const failureClass = classifyMaestroFailure("Wrong email or password");
  expect(failureClass).toBe("clear");
  expect(shouldRetryMaestroFailure(failureClass, 1)).toBe(false);
});

test("does not retry a required-field validation on the Auth0 form", () => {
  expect(classifyMaestroFailure("Password is required")).toBe("clear");
  expect(classifyMaestroFailure("Email is required")).toBe("clear");
});

test("does not retry configuration and account states that a second login will not fix", () => {
  expect(classifyMaestroFailure("Auth0 is not configured. Set EXPO_PUBLIC_AUTH0_DOMAIN")).toBe("clear");
  expect(classifyMaestroFailure("Everglow is finishing it. You can't sign in to this account in the meantime.")).toBe(
    "clear",
  );
  expect(classifyMaestroFailure("Could not complete onboarding.")).toBe("clear");
});

test("does not retry a broken invocation", () => {
  expect(classifyMaestroFailure("pnpm: command not found")).toBe("clear");
  expect(classifyMaestroFailure("No flows found in .maestro")).toBe("clear");
  expect(classifyMaestroFailure("Unknown option: '--nope'")).toBe("clear");
  expect(classifyMaestroFailure("Failed to parse flow login-smoke.yaml")).toBe("clear");
});

test("prefers a clear credential failure over a driver error in the same log", () => {
  const log = "Wrong email or password\njava.net.ConnectException: Connection refused";
  expect(classifyMaestroFailure(log)).toBe("clear");
});

test("does not retry a second time", () => {
  expect(shouldRetryMaestroFailure("flake", 2)).toBe(false);
  expect(shouldRetryMaestroFailure("ambiguous", 2)).toBe(false);
});
