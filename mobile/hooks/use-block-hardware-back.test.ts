import { blockHardwareBack, useBlockHardwareBack } from "./use-block-hardware-back";

const mockUseFocusEffect = jest.fn();
jest.mock("expo-router", () => ({ useFocusEffect: (effect: unknown) => mockUseFocusEffect(effect) }));

const mockRemove = jest.fn();
const mockAddEventListener = jest.fn();
// Everything else stays the real module (the jest-expo setup reads Platform from it).
jest.mock("react-native", () =>
  Object.create(jest.requireActual("react-native"), {
    BackHandler: {
      value: {
        addEventListener: (...args: unknown[]) => {
          mockAddEventListener(...args);
          return { remove: mockRemove };
        },
      },
    },
  }),
);

beforeEach(() => jest.clearAllMocks());

test("swallows the system back while it is on", () => {
  blockHardwareBack();

  expect(mockAddEventListener).toHaveBeenCalledWith("hardwareBackPress", expect.any(Function));
  const onBack = mockAddEventListener.mock.calls[0][1] as () => boolean;
  expect(onBack()).toBe(true);
});

test("lets back through again once cleaned up", () => {
  const cleanup = blockHardwareBack();

  expect(mockRemove).not.toHaveBeenCalled();
  cleanup();
  expect(mockRemove).toHaveBeenCalled();
});

test("the hook turns it on only while the screen is focused", () => {
  useBlockHardwareBack();
  expect(mockUseFocusEffect).toHaveBeenCalledWith(blockHardwareBack);
});
