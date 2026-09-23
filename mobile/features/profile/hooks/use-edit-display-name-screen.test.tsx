import { render, screen, userEvent, act } from "@testing-library/react-native";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { View } from "react-native";
import { useEditDisplayNameScreen } from "./use-edit-display-name-screen";

const mockSave = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn();
jest.mock("@/context/auth-context", () => ({ useAuth: () => ({ user: { details: { name: "Ada" } } }) }));
jest.mock("../api/mutations", () => ({ useUpdateProfileMutation: () => ({ mutateAsync: mockSave }) }));
jest.mock("expo-router", () => ({
  router: {
    canGoBack: () => mockCanGoBack(),
    back: () => mockBack(),
    replace: (path: string) => mockReplace(path),
  },
}));

const Probe = () => {
  const { form, onSubmit } = useEditDisplayNameScreen();
  return (
    <View>
      <FormField control={form.control} name="name" accessibilityLabel="Display Name" />
      <Button title="Save" onPress={onSubmit} disabled={!form.formState.isDirty || form.formState.isSubmitting} />
    </View>
  );
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSave.mockReset();
  mockSave.mockResolvedValue({});
  mockCanGoBack.mockReturnValue(true);
});

const editAndSave = async () => {
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText("Display Name"));
  await user.paste(screen.getByLabelText("Display Name"), "Grace");
  await user.press(screen.getByRole("button", { name: "Save" }));
};

test("returns to the previous page only after saving succeeds", async () => {
  let finish!: () => void;
  mockSave.mockReturnValue(
    new Promise<void>((resolve) => {
      finish = resolve;
    }),
  );
  await render(<Probe />);
  expect(screen.getByLabelText("Display Name")).toHaveDisplayValue("Ada");
  await editAndSave();
  expect(mockSave).toHaveBeenCalledWith({ name: "Grace" });
  expect(mockBack).not.toHaveBeenCalled();
  await act(async () => finish());
  expect(mockBack).toHaveBeenCalledTimes(1);
  expect(mockReplace).not.toHaveBeenCalled();
});

test("returns to Account Settings when opened without navigation history", async () => {
  mockCanGoBack.mockReturnValue(false);
  await render(<Probe />);
  await editAndSave();
  expect(mockReplace).toHaveBeenCalledWith("/account-settings");
  expect(mockBack).not.toHaveBeenCalled();
});

test("stays on the page after a failed save", async () => {
  mockSave.mockRejectedValue(new Error("Offline"));
  await render(<Probe />);
  await editAndSave();
  expect(mockBack).not.toHaveBeenCalled();
  expect(mockReplace).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Display Name")).toHaveDisplayValue("Grace");
  expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
});
