import { render, screen } from "@testing-library/react-native";
import { LegalDocument } from "./legal-document";

const sections = [
  { heading: "Information we collect", body: "Your display name and email." },
  { heading: "Your choices", body: "Delete your account at any time." },
];

test("renders the intro, revision date, and every section", async () => {
  await render(<LegalDocument intro="What we collect and why." lastUpdated="September 22, 2026" sections={sections} />);
  expect(screen.getByText("What we collect and why.")).toBeOnTheScreen();
  expect(screen.getByText("Last updated September 22, 2026")).toBeOnTheScreen();
  expect(screen.getAllByRole("header")).toHaveLength(sections.length);
  for (const section of sections) {
    expect(screen.getByRole("header", { name: section.heading })).toBeOnTheScreen();
    expect(screen.getByText(section.body)).toBeOnTheScreen();
  }
});

test("renders without sections", async () => {
  await render(<LegalDocument intro="Short notice." lastUpdated="September 22, 2026" sections={[]} />);
  expect(screen.getByText("Short notice.")).toBeOnTheScreen();
  expect(screen.queryByRole("header")).not.toBeOnTheScreen();
});
