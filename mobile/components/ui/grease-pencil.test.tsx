import { render, screen } from "@testing-library/react-native";
import { GreasePencil } from "./grease-pencil";

test("draws a cross in two strokes, hidden from assistive tech", async () => {
  const { toJSON } = await render(<GreasePencil mark="cross" width={40} height={40} drawOn />);
  const tree = JSON.stringify(toJSON());
  expect(tree).toContain('"importantForAccessibility":"no-hide-descendants"');
  expect(tree.match(/"type":"RNSVGPath"/g)).toHaveLength(2);
});

test("a new ring varies its gesture, but re-rendering an existing ring does not redraw it", async () => {
  const random = jest.spyOn(Math, "random").mockReturnValue(0.1);
  try {
    await render(<GreasePencil mark="ring" width={132} height={132} />);
    const first = JSON.stringify(screen.toJSON());
    random.mockReturnValue(0.8);
    await screen.rerender(<GreasePencil mark="ring" width={132} height={132} />);
    expect(JSON.stringify(screen.toJSON())).toBe(first);
    await screen.unmount();
    await render(<GreasePencil mark="ring" width={132} height={132} />);
    expect(JSON.stringify(screen.toJSON())).not.toBe(first);
  } finally {
    random.mockRestore();
  }
});

test("an explicit seed repeats a ring even on a fresh mount", async () => {
  await render(<GreasePencil mark="ring" width={132} height={132} seed={42} />);
  const first = JSON.stringify(screen.toJSON());
  await screen.unmount();
  await render(<GreasePencil mark="ring" width={132} height={132} seed={42} />);
  expect(JSON.stringify(screen.toJSON())).toBe(first);
});
