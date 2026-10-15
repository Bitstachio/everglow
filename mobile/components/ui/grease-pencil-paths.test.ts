import { pencilStrokes } from "./grease-pencil-paths";

test("a ring is one stroke that runs past where it started", () => {
  const [stroke, ...rest] = pencilStrokes("ring", 100, 60, 3);
  expect(rest).toHaveLength(0);
  const points = stroke.d
    .slice(1)
    .split(" L")
    .map((pair) => pair.split(" ").map(Number));
  const [first, last] = [points[0], points[points.length - 1]];
  expect(Math.hypot(last[0] - first[0], last[1] - first[1])).toBeGreaterThan(1);
  expect(stroke.length).toBeGreaterThan(200);
});

test("a cross is two strokes; the other marks are one", () => {
  expect(pencilStrokes("cross", 40, 40, 3)).toHaveLength(2);
  for (const mark of ["tick", "underline", "strike"] as const) {
    expect(pencilStrokes(mark, 40, 20, 3)).toHaveLength(1);
  }
});

test("the same seed draws the same mark", () => {
  expect(pencilStrokes("ring", 80, 50, 3, 4)).toEqual(pencilStrokes("ring", 80, 50, 3, 4));
  expect(pencilStrokes("ring", 80, 50, 3, 4)).not.toEqual(pencilStrokes("ring", 80, 50, 3, 5));
});
