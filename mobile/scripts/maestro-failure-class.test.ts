import {
  classifyMaestroFailure,
  failedHierarchyPaths,
  hierarchyText,
  shouldRetryMaestroFailure,
} from "./maestro-failure-class";

test("retries an unreachable XCTest driver", () => {
  const failureClass = classifyMaestroFailure(
    "xcuitest.XCTestDriverClient$XCTestDriverUnreachable: Failed to reach XCUITest Server in restart",
  );
  expect(failureClass).toBe("flake");
  expect(shouldRetryMaestroFailure(failureClass, 1)).toBe(true);
});

test("retries a simulator that became unreachable", () => {
  expect(
    classifyMaestroFailure("maestro.DeviceUnreachableException: Device became unreachable during deviceInfo"),
  ).toBe("flake");
  expect(classifyMaestroFailure("Device became unreachable during deviceInfo")).toBe("flake");
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

test("does not retry the app's sign-in error alert", () => {
  expect(classifyMaestroFailure("Couldn’t sign in")).toBe("clear");
  expect(classifyMaestroFailure("Couldn't sign in")).toBe("clear");
  expect(classifyMaestroFailure('Assertion is false: "Couldn.t sign in" is not visible')).toBe("clear");
});

test("does not retry a Keychain error from an unsigned or misconfigured build", () => {
  const alert = "Unable to retrieve the private key representation from the Keychain. OSStatus: -34018";
  expect(classifyMaestroFailure(alert)).toBe("clear");
  expect(classifyMaestroFailure("OSStatus error -25300")).toBe("clear");
  expect(classifyMaestroFailure("errSecMissingEntitlement")).toBe("clear");
});

test("does not treat Maestro's clear-keychain launch option as a Keychain error", () => {
  expect(classifyMaestroFailure("Launch app with clear state and clear keychain\nAssertion is false")).toBe(
    "ambiguous",
  );
});

// Shapes below match Maestro 2.10 debug output (`commands.json` plus
// `screen-hierarchy/step-NNN-*.json`), with made-up values.
test("finds the screen hierarchy saved for a failed command", () => {
  const commands = [
    { command: { tapOnElement: {} }, metadata: { status: "COMPLETED" } },
    {
      command: { assertConditionCommand: {} },
      metadata: {
        status: "FAILED",
        error: { message: "Assertion is false: id: events-profile-button is visible" },
        artifacts: [
          { type: "SCREEN_HIERARCHY", path: "screen-hierarchy/step-016-assertCondition-events-profile-button.json" },
          { type: "SCREENSHOT", path: "screenshots/step-016-assertCondition-events-profile-button.png" },
        ],
      },
    },
  ];
  expect(failedHierarchyPaths(commands)).toEqual([
    "screen-hierarchy/step-016-assertCondition-events-profile-button.json",
  ]);
});

test("ignores debug files without a failed command", () => {
  expect(failedHierarchyPaths([{ metadata: { status: "COMPLETED", artifacts: [] } }])).toEqual([]);
  expect(failedHierarchyPaths({ not: "an array" })).toEqual([]);
  expect(failedHierarchyPaths(null)).toEqual([]);
});

test("reads the visible text from a screen hierarchy", () => {
  const root = {
    attributes: { bounds: "[0,0][390,844]" },
    children: [
      { attributes: { accessibilityText: "Welcome", text: "Welcome" } },
      { attributes: { text: "Couldn’t sign in" }, children: [] },
      {
        attributes: {
          accessibilityText: "Unable to retrieve the private key representation from the Keychain. OSStatus: -34018",
        },
      },
      { attributes: { text: "OK" } },
      { attributes: { text: " " } },
    ],
  };
  const text = hierarchyText(root);
  expect(text).toEqual([
    "Welcome",
    "Couldn’t sign in",
    "Unable to retrieve the private key representation from the Keychain. OSStatus: -34018",
    "OK",
  ]);
  expect(classifyMaestroFailure(text.join("\n"))).toBe("clear");
});

test("classifies an Auth0 wrong-password page from the hierarchy, which stdout never shows", () => {
  const root = {
    attributes: {},
    children: [
      { attributes: { accessibilityText: "Email address" } },
      { attributes: { text: "Wrong email or password", accessibilityText: "Wrong email or password" } },
    ],
  };
  expect(classifyMaestroFailure("Assertion is false: id: events-profile-button is visible")).toBe("ambiguous");
  expect(classifyMaestroFailure(hierarchyText(root).join("\n"))).toBe("clear");
});

test("returns no text for an empty hierarchy", () => {
  expect(hierarchyText(null)).toEqual([]);
  expect(hierarchyText({ attributes: {} })).toEqual([]);
});

test("retries a run stuck on Auth0's consent page, which the login helper accepts on the next attempt", () => {
  const root = {
    attributes: {},
    children: [
      { attributes: { accessibilityText: "Authorize Everglow Mobile" } },
      { attributes: { text: "Everglow Mobile is requesting access to your dev-tenant account." } },
      { attributes: { text: "Decline" } },
      { attributes: { text: "Accept" } },
    ],
  };
  expect(classifyMaestroFailure(hierarchyText(root).join("\n"))).toBe("ambiguous");
});
