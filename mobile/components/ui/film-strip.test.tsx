import { fireEvent, render, screen } from "@testing-library/react-native";
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
  expect(screen.queryByText("4")).not.toBeOnTheScreen();
  expect(screen.getByText("4", { includeHiddenElements: true })).toBeTruthy();
});

test("caches a photo by its key, since a presigned URL changes on every fetch", async () => {
  const uri = "https://bucket.example.com/photos/a.jpg?X-Amz-Signature=abc";
  await render(<FilmStrip frames={[{ key: "a", uri, cacheKey: "photo:a" }]} />);
  const photo = screen.getByTestId("film-strip-photo", { includeHiddenElements: true });
  expect(JSON.stringify(photo.props.source)).toContain('"cacheKey":"photo:a"');
});

test("shows the photo in a frame whose thumbnail is missing", async () => {
  const fallback = { uri: "https://bucket.example.com/photos/a.jpg", cacheKey: "photo:a:original" };
  await render(
    <FilmStrip
      frames={[
        { key: "a", uri: "https://bucket.example.com/a.webp", cacheKey: "photo:a:strip", fallback, mayBeLate: false },
      ]}
    />,
  );
  const photo = () => screen.getByTestId("film-strip-photo", { includeHiddenElements: true });
  await fireEvent(photo(), "error", { nativeEvent: { error: "404" } });
  expect(photo().props.source).toEqual([fallback]);
});

test("shows the photo in a frame with no thumbnail link", async () => {
  const fallback = { uri: "https://bucket.example.com/photos/b.jpg", cacheKey: "photo:b:original" };
  await render(<FilmStrip frames={[{ key: "b", fallback }]} />);
  expect(screen.getByTestId("film-strip-photo", { includeHiddenElements: true }).props.source).toEqual([fallback]);
});

test("shows a bundled photo as it is", async () => {
  await render(<FilmStrip frames={[{ key: "a", image: 7 }]} />);
  const photo = screen.getByTestId("film-strip-photo", { includeHiddenElements: true });
  expect(photo.props.source).toEqual([expect.objectContaining({ __packager_asset: true })]);
});
