import { render, screen, userEvent } from "@testing-library/react-native";
import { BlockedPersonRow, initials } from "./blocked-person-row";

test.each([
  ["Leila Haddad", "LH"],
  ["Tom", "T"],
  ["@tom.ortiz", "TO"],
  ["Ana María López", "AM"],
])("initials of %p are %p", (name, expected) => {
  expect(initials(name)).toBe(expected);
});

test("shows the person and unblocks from the row", async () => {
  const onUnblock = jest.fn();
  await render(
    <BlockedPersonRow
      number={1}
      name="Leila Haddad"
      handle="@leila.h"
      unblockLabel="Unblock"
      unblockA11y="Unblock Leila Haddad"
      onUnblock={onUnblock}
    />,
  );
  expect(screen.getByText("01")).toBeOnTheScreen();
  expect(screen.getByText("@leila.h")).toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Unblock Leila Haddad" }));
  expect(onUnblock).toHaveBeenCalledTimes(1);
});
