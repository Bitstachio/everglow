import { render, screen } from "@testing-library/react-native";
import { FilmStrip } from "./film-strip";

test("prints a blank frame's number and hides the preview strip from assistive tech", async () => {
  await render(
    <FilmStrip
      frames={[
        { key: "a", uri: "https://example.com/a.jpg" },
        { key: "b", number: 4 },
      ]}
    />,
  );
  expect(screen.queryByText("04")).not.toBeOnTheScreen();
  expect(screen.getByText("04", { includeHiddenElements: true })).toBeTruthy();
});
