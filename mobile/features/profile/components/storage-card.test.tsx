import { render, screen, userEvent } from "@testing-library/react-native";
import { StorageCard } from "./storage-card";

test("displays the actual storage quota including an empty account", async () => {
  await render(
    <StorageCard
      storage={{ usedBytes: "0", limitBytes: "1073741824", remainingBytes: "1073741824" }}
      isLoading={false}
      isError={false}
      isFetching={false}
      onRetry={jest.fn()}
    />,
  );
  expect(screen.getByText("0 B of 1 GB used")).toBeOnTheScreen();
  expect(screen.getByText("Photos stored")).toBeOnTheScreen();
  expect(screen.getByText("Unavailable")).toBeOnTheScreen();
  expect(screen.getByRole("progressbar")).toHaveAccessibilityValue({ now: 0, min: 0, max: 100 });
});

test("shows retry on failure without inventing quota values", async () => {
  const retry = jest.fn();
  await render(<StorageCard isLoading={false} isError isFetching={false} onRetry={retry} />);
  expect(screen.getByRole("alert")).toHaveTextContent("Could not refresh your storage usage.");
  expect(screen.queryByText("0 B of 1 GB used")).not.toBeOnTheScreen();
  await userEvent.setup().press(screen.getByRole("button", { name: "Retry" }));
  expect(retry).toHaveBeenCalledTimes(1);
});

test.each([
  ["3650722202", "5368709120", 68],
  ["10737418240", "5368709120", 100],
  ["0", "0", 0],
])("bounds the progress bar for %s bytes used out of %s", async (usedBytes, limitBytes, progress) => {
  await render(
    <StorageCard
      storage={{ usedBytes, limitBytes, remainingBytes: "0" }}
      isLoading={false}
      isError={false}
      isFetching={false}
      onRetry={jest.fn()}
    />,
  );
  expect(screen.getByRole("progressbar")).toHaveAccessibilityValue({ now: progress });
  expect(screen.getByText("Unavailable")).toBeOnTheScreen();
});
