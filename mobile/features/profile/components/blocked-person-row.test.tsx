import { render, screen, userEvent } from "@testing-library/react-native";
import { BlockedPersonRow } from "./blocked-person-row";

test("shows the person and unblocks from the row", async () => {
  const onUnblock = jest.fn();
  await render(
    <BlockedPersonRow
      number={1}
      name="Leila Haddad"
      handle="@leila.h"
      initials="LH"
      unblockLabel="Unblock"
      unblockA11y="Unblock Leila Haddad"
      onUnblock={onUnblock}
    />,
  );
  expect(screen.getByText("01")).toBeOnTheScreen();
  expect(screen.getByText("LH", { includeHiddenElements: true })).toBeOnTheScreen();
  expect(screen.getByText("@leila.h")).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Unblock Leila Haddad" }));
  expect(onUnblock).toHaveBeenCalledTimes(1);
});
