import { fireEvent, render, screen } from "@testing-library/react-native";
import { Avatar, getAvatarCacheKey, getInitial } from "./avatar";

// The avatar is decorative, so it is hidden from accessibility queries by default.
const hidden = { includeHiddenElements: true };

const signedUrl = (signature: string) =>
  `https://bucket.example.com/avatars/user-1/upload-1?X-Amz-Signature=${signature}&X-Amz-Expires=900`;

test("shows the image when the user has an avatar", async () => {
  await render(<Avatar userId="user-1" name="Ada" uri={signedUrl("a")} />);
  expect(screen.getByTestId("avatar-image", hidden)).toBeOnTheScreen();
  expect(screen.queryByText("A", hidden)).toBeNull();
});

test("falls back to the initial when there is no avatar", async () => {
  await render(<Avatar userId="user-1" name=" ada" uri={null} />);
  expect(screen.queryByTestId("avatar-image", hidden)).toBeNull();
  expect(screen.getByText("A", hidden)).toBeOnTheScreen();
});

test("falls back to the initial when the image fails to load", async () => {
  await render(<Avatar userId="user-1" name="Ada" uri={signedUrl("a")} />);
  await fireEvent(screen.getByTestId("avatar-image", hidden), "error", { nativeEvent: { error: "expired" } });
  expect(screen.getByText("A", hidden)).toBeOnTheScreen();
});

test("uses a placeholder initial when the name is empty", () => {
  expect(getInitial("  ")).toBe("E");
  expect(getInitial(undefined)).toBe("E");
});

test("caches by user and object, not by the signed URL", () => {
  expect(getAvatarCacheKey("user-1", signedUrl("a"))).toBe(getAvatarCacheKey("user-1", signedUrl("b")));
  expect(getAvatarCacheKey("user-1", signedUrl("a"))).not.toBe(
    getAvatarCacheKey("user-1", "https://bucket.example.com/avatars/user-1/upload-2?X-Amz-Signature=a"),
  );
});
