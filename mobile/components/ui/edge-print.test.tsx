import { render, screen } from "@testing-library/react-native";
import { EdgePrint, EdgeValue } from "./edge-print";

test("prints metadata in uppercase mono, with the value brighter", async () => {
  await render(
    <EdgePrint>
      <EdgeValue>1.2</EdgeValue> / 3 GB
    </EdgePrint>,
  );
  const line = screen.getByText(/3 GB/);
  expect(line).toHaveProp("className", expect.stringContaining("font-mono uppercase text-edge"));
  expect(screen.getByText("1.2")).toHaveProp("className", expect.stringContaining("text-text"));
});

test("frame labels use the smaller size", async () => {
  await render(<EdgePrint size="frame-label">144 · Leila</EdgePrint>);
  expect(screen.getByText("144 · Leila")).toHaveProp("className", expect.stringContaining("text-frame-label"));
});
