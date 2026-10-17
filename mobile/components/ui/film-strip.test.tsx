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

test("caches a photo by its key, since a presigned URL changes on every fetch", async () => {
  const uri = "https://bucket.example.com/photos/a.jpg?X-Amz-Signature=abc";
  await render(<FilmStrip frames={[{ key: "a", uri, cacheKey: "photo:a" }]} />);
  const photo = screen.getByTestId("film-strip-photo", { includeHiddenElements: true });
  expect(JSON.stringify(photo.props.source)).toContain('"cacheKey":"photo:a"');
});
