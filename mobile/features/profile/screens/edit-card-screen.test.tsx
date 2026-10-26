import { renderWithI18n } from "@/testing/render";
import { screen, userEvent } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import EditCardScreen from "./edit-card-screen";

const mockSave = jest.fn();
const mockCancel = jest.fn();
const mockChangePhoto = jest.fn();
let mockUpdatingPhoto = false;

jest.mock("../hooks/use-edit-card-screen", () => ({
  useEditCardScreen: () => {
    // A real form, so the field and Save react to typing.
    const { useForm } = jest.requireActual<typeof import("react-hook-form")>("react-hook-form");
    const form = useForm<{ name: string }>({ defaultValues: { name: "Ada" } });
    return {
      title: "Lab card · since Oct 2026",
      photoUri: undefined,
      username: "@ada",
      form,
      hasAvatar: false,
      isUpdatingAvatar: mockUpdatingPhoto,
      onChangePhoto: mockChangePhoto,
      onSave: mockSave,
      onCancel: mockCancel,
    };
  },
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderScreen = () =>
  renderWithI18n(<EditCardScreen />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <SafeAreaProvider initialMetrics={initialMetrics}>{children}</SafeAreaProvider>
    ),
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdatingPhoto = false;
});

test("the name is edited on the card and saved from the top bar", async () => {
  const user = userEvent.setup();
  await renderScreen();

  expect(screen.getByRole("header", { name: "Edit card" })).toBeOnTheScreen();
  expect(screen.getByText("@ada")).toBeOnTheScreen();
  const save = screen.getByRole("button", { name: "Save" });
  expect(save).toBeDisabled();

  await user.type(screen.getByLabelText("Name"), " L");
  expect(save).toBeEnabled();
  await user.press(save);
  expect(mockSave).toHaveBeenCalledTimes(1);
});

test("Cancel leaves without saving", async () => {
  await renderScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Cancel" }));
  expect(mockCancel).toHaveBeenCalledTimes(1);
  expect(mockSave).not.toHaveBeenCalled();
});

test("Add a photo opens the picker", async () => {
  await renderScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Add a photo" }));
  expect(mockChangePhoto).toHaveBeenCalledTimes(1);
});

test("photo and Save wait while a new photo uploads", async () => {
  mockUpdatingPhoto = true;
  await renderScreen();
  expect(screen.getByRole("button", { name: "Add a photo" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
});
