import { fireEvent, render, screen } from "@testing-library/react-native";
import { WhenSlip, type WhenSlipDay, type WhenSlipMonth } from "./when-slip";

jest.mock("@/hooks/use-reduce-motion", () => ({ useReduceMotion: () => true }));

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const PAGE = 350;

/** A month whose 1st falls `blanks` days into the week. */
const month = (title: string, length: number, blanks: number): WhenSlipMonth => ({
  key: title,
  title,
  days: [
    ...Array.from({ length: blanks }, (_, i): WhenSlipDay => ({ key: `blank-${i}`, label: null, state: "open" })),
    ...Array.from(
      { length },
      (_, i): WhenSlipDay => ({
        key: `day-${i + 1}`,
        label: String(i + 1),
        state: "open",
        accessibilityLabel: `${i + 1} ${title}`,
        onPress: jest.fn(),
      }),
    ),
  ],
});

// November 2026 fills five weeks; January 2027 starts on a Friday and needs six.
const months = [month("November 2026", 30, 0), month("December 2026", 31, 2), month("January 2027", 31, 5)];

const renderSlip = async ({ monthIndex = 0 } = {}) => {
  const onMonthChange = jest.fn();
  await render(
    <WhenSlip
      edge="When it happens"
      months={months}
      monthIndex={monthIndex}
      onMonthChange={onMonthChange}
      previous={{ accessibilityLabel: "Previous month", disabled: monthIndex === 0 }}
      next={{ accessibilityLabel: "Next month", disabled: monthIndex === months.length - 1 }}
      weekdays={WEEKDAYS}
      times={[]}
      setLabel="Set Sat 7 Nov, 19:00"
      onSet={jest.fn()}
    />,
  );
  const strip = screen.getByTestId("when-slip-months");
  await fireEvent(strip, "layout", { nativeEvent: { layout: { width: PAGE, height: 300 } } });
  return { strip, onMonthChange };
};

const scrollTo = (strip: ReturnType<typeof screen.getByTestId>, x: number) =>
  fireEvent.scroll(strip, { nativeEvent: { contentOffset: { x, y: 0 } } });

/** A finger drags the strip to `x`. */
const dragTo = async (strip: ReturnType<typeof screen.getByTestId>, x: number) => {
  await fireEvent(strip, "scrollBeginDrag");
  await scrollTo(strip, x);
};

test("shows the chosen month's name over its days", async () => {
  await renderSlip({ monthIndex: 1 });

  expect(screen.getByText("December 2026")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Previous month" })).toBeEnabled();
});

test("turns to the next month once a swipe is past halfway, and not before", async () => {
  const { strip, onMonthChange } = await renderSlip();

  // A third of the way, the next month shows at the edge but the slip stays on this one.
  await dragTo(strip, PAGE / 3);
  expect(onMonthChange).not.toHaveBeenCalled();

  await dragTo(strip, PAGE * 0.6);
  expect(onMonthChange).toHaveBeenLastCalledWith(1);

  await dragTo(strip, 0);
  expect(onMonthChange).toHaveBeenLastCalledWith(0);
});

test("opens on the chosen month without passing through the first", async () => {
  const { strip, onMonthChange } = await renderSlip({ monthIndex: 1 });

  // The strip being put in place reports where it is on the way; that isn't a turn.
  await scrollTo(strip, 0);
  await scrollTo(strip, PAGE);

  expect(onMonthChange).not.toHaveBeenCalled();
  expect(screen.getByText("December 2026")).toBeOnTheScreen();
});

test("can't step before the first month or past the last", async () => {
  await renderSlip();

  expect(screen.getByRole("button", { name: "Previous month" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Next month" })).toBeEnabled();
});

test("gives every month six weeks, so the slip keeps its height", async () => {
  await renderSlip();

  // 42 cells a month: of the 126, 92 are days and the rest blank, before the 1st or after the last.
  expect(screen.getAllByTestId("when-slip-blank", { includeHiddenElements: true })).toHaveLength(126 - 92);
});
