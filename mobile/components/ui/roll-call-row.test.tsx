import { render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { RollCallRow } from "./roll-call-row";

test("reads the name with the role and numbers the row", async () => {
  await render(<RollCallRow number={2} name="Leila Haddad" roleLabel="Participant" avatar={<Text>L</Text>} />);
  expect(screen.getByRole("button", { name: "Leila Haddad, Participant" })).toBeOnTheScreen();
  expect(screen.getByText("02")).toBeOnTheScreen();
});
