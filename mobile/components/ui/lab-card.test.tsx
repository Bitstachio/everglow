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
