import type { ComponentProps } from "react";
import type DateTimePicker from "@react-native-community/datetimepicker";

// Exercise native change/dismiss events without requiring a device picker.
jest.mock("@react-native-community/datetimepicker", () => {
  const { View } = jest.requireActual("react-native");
  return {
    __esModule: true,
    default: (props: ComponentProps<typeof DateTimePicker>) => (
      <View {...props} testID={`${"mode" in props ? props.mode : "date"}-picker`} />
    ),
  };
});
