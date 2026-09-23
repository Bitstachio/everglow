import { render, screen } from "@testing-library/react-native";
import { LEGAL_LAST_UPDATED, PRIVACY_POLICY_INTRO, PRIVACY_POLICY_SECTIONS } from "../legal-content";
import PrivacyPolicyScreen from "./privacy-policy-screen";

test("renders the privacy policy intro, revision date, and every section", async () => {
  await render(<PrivacyPolicyScreen />);
  expect(screen.getByText(PRIVACY_POLICY_INTRO)).toBeOnTheScreen();
  expect(screen.getByText(`Last updated ${LEGAL_LAST_UPDATED}`)).toBeOnTheScreen();
  expect(screen.getAllByRole("header")).toHaveLength(PRIVACY_POLICY_SECTIONS.length);
  for (const section of PRIVACY_POLICY_SECTIONS) {
    expect(screen.getByRole("header", { name: section.heading })).toBeOnTheScreen();
    expect(screen.getByText(section.body)).toBeOnTheScreen();
  }
});

test("is read-only", async () => {
  await render(<PrivacyPolicyScreen />);
  expect(screen.queryByRole("button")).not.toBeOnTheScreen();
  expect(screen.queryByLabelText("Display Name")).not.toBeOnTheScreen();
});
