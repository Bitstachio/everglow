import { FormField } from "@/components/ui/form-field";
import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { Alert, Button, View } from "react-native";
import { useJoinEventForm } from "./use-join-event-form";

const mockMutateAsync = jest.fn();
const mockSuccess = jest.fn();
jest.mock("../api/mutations", () => ({
  useJoinEventMutation: () => ({ mutateAsync: mockMutateAsync }),
}));

const JoinFormProbe = ({ visible = true }: { visible?: boolean }) => {
  const { form, onSubmit, onScan } = useJoinEventForm({ visible, onSuccess: mockSuccess });
  return (
    <View>
      <FormField control={form.control} name="invitationUrl" placeholder="Invitation" />
      <Button title="Join" onPress={onSubmit} disabled={form.formState.isSubmitting} />
      <Button title="Scan" onPress={() => void onScan("  scanned-token  ")} />
    </View>
  );
};

beforeEach(() => {
  mockMutateAsync.mockReset().mockResolvedValue({ id: "event-1" });
  mockSuccess.mockReset();
  jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

test.each(["https://events.everglow.app/invite/token", "invite-token"])(
  "submits trimmed invitation %s",
  async (invitation) => {
    await render(<JoinFormProbe />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("Invitation"), `  ${invitation}  `);
    await user.press(screen.getByRole("button", { name: "Join" }));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledWith({ invitationUrl: invitation }));
    expect(mockSuccess).toHaveBeenCalledWith({ id: "event-1" });
  },
);

test("rejects blank input without calling the API", async () => {
  await render(<JoinFormProbe />);
  await userEvent.setup().press(screen.getByRole("button", { name: "Join" }));
  expect(await screen.findByText("Please paste the invitation URL or invite token.")).toBeOnTheScreen();
  expect(mockMutateAsync).not.toHaveBeenCalled();
});

test("retains the invitation and displays API errors for retry", async () => {
  mockMutateAsync.mockRejectedValue(new Error("Invitation expired"));
  await render(<JoinFormProbe />);
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("Invitation"), "invite-token");
  await user.press(screen.getByRole("button", { name: "Join" }));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Error", "Invitation expired"));
  expect(screen.getByPlaceholderText("Invitation")).toHaveDisplayValue("invite-token");
  expect(mockSuccess).not.toHaveBeenCalled();
});

test("clears validation when closed and reopened", async () => {
  const { rerender } = await render(<JoinFormProbe />);
  await userEvent.setup().press(screen.getByRole("button", { name: "Join" }));
  await screen.findByText("Please paste the invitation URL or invite token.");
  await rerender(<JoinFormProbe visible={false} />);
  await rerender(<JoinFormProbe />);
  expect(screen.queryByText("Please paste the invitation URL or invite token.")).not.toBeOnTheScreen();
  expect(screen.getByPlaceholderText("Invitation")).toHaveDisplayValue("");
});

test("QR submission stays pending and blocks duplicate requests", async () => {
  mockMutateAsync.mockReturnValue(new Promise(() => {}));
  await render(<JoinFormProbe />);
  const user = userEvent.setup();
  await user.press(screen.getByRole("button", { name: "Scan" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Join" })).toBeDisabled());
  await user.press(screen.getByRole("button", { name: "Scan" }));
  expect(mockMutateAsync).toHaveBeenCalledTimes(1);
  expect(mockMutateAsync).toHaveBeenCalledWith({ invitationUrl: "scanned-token" });
});
