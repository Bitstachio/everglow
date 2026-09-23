import { render, screen } from "@testing-library/react-native";
import { LEGAL_LAST_UPDATED, TERMS_OF_USE_INTRO, TERMS_OF_USE_SECTIONS } from "../legal-content";
import TermsOfUseScreen from "./terms-of-use-screen";

test("renders the terms intro, revision date, and every section", async () => {
  await render(<TermsOfUseScreen />);
  expect(screen.getByText(TERMS_OF_USE_INTRO)).toBeOnTheScreen();
  expect(screen.getByText(`Last updated ${LEGAL_LAST_UPDATED}`)).toBeOnTheScreen();
  expect(screen.getAllByRole("header")).toHaveLength(TERMS_OF_USE_SECTIONS.length);
  for (const section of TERMS_OF_USE_SECTIONS) {
    expect(screen.getByRole("header", { name: section.heading })).toBeOnTheScreen();
    expect(screen.getByText(section.body)).toBeOnTheScreen();
  }
});

test("shows terms content rather than the privacy policy", async () => {
  await render(<TermsOfUseScreen />);
  expect(screen.getByRole("header", { name: "Acceptable use" })).toBeOnTheScreen();
  expect(screen.queryByRole("header", { name: "Information we collect" })).not.toBeOnTheScreen();
  expect(screen.queryByRole("button")).not.toBeOnTheScreen();
});
