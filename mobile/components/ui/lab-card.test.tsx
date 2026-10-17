import { render, screen } from "@testing-library/react-native";
import { LabCard } from "./lab-card";

test("reads as one summary of the account", async () => {
  await render(
    <LabCard
      title="Lab card"
      fields={[{ label: "Name", value: "Maya Chen" }]}
      accessibilityLabel="Maya Chen, @maya.chen"
    />,
  );
  expect(screen.getByLabelText("Maya Chen, @maya.chen")).toBeOnTheScreen();
});

test("marks the empty photo spot when there is no photo yet", async () => {
  await render(
    <LabCard title="Lab card" fields={[{ label: "Name", value: "Maya" }]} accessibilityLabel="Maya, @maya" />,
  );
  expect(screen.getByText("Maya", { includeHiddenElements: true })).toBeOnTheScreen();
});

test("caches the photo by its key, since the presigned URL changes on every fetch", async () => {
  const uri = "https://bucket.example.com/avatars/u1/a.jpg?X-Amz-Signature=abc";
  await render(
    <LabCard
      title="Lab card"
      photoUri={uri}
      photoCacheKey="avatar:u1:a"
      fields={[{ label: "Name", value: "Maya" }]}
      accessibilityLabel="Maya, @maya"
    />,
  );
  const photo = screen.getByTestId("lab-card-photo", { includeHiddenElements: true });
  expect(JSON.stringify(photo.props.source)).toContain('"cacheKey":"avatar:u1:a"');
});
