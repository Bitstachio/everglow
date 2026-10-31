import { handwrittenRing, pencilArrow, pencilStrokes } from "./grease-pencil-paths";

test("10,000 handwritten rings stay unique, round, continuous and inside the stroke bounds", () => {
  const sizes = [
    [100, 100, 3],
    [132, 132, 3],
    [280, 280, 6],
    [196, 30, 2.5],
    [44, 160, 3],
    [80, 50, 3],
    [24, 24, 2],
    [390, 60, 2.5],
  ];
  const shapes = new Set<string>();
  for (let seed = 0; seed < 10_000; seed++) {
    const [width, height, thickness] = sizes[seed % sizes.length];
    const points = handwrittenRing(width, height, thickness, seed);
    // Normalize the drawn ellipse, not the SVG box: stroke margins occupy a
    // much greater share of a short text ring's height than its width.
    const radiusX = (Math.max(...points.map(([x]) => x)) - Math.min(...points.map(([x]) => x))) / 2;
    const radiusY = (Math.max(...points.map(([, y]) => y)) - Math.min(...points.map(([, y]) => y))) / 2;
    let sweep = 0;
    let previousAngle = 0;
    const radii: number[] = [];
    for (const [i, [x, y]] of points.entries()) {
      if (
        !Number.isFinite(x + y) ||
        x < thickness / 2 ||
        y < thickness / 2 ||
        x > width - thickness / 2 ||
        y > height - thickness / 2
      ) {
        throw new Error(`Ring ${seed} clips its stroke or has invalid coordinates`);
      }
      const nx = (x - width / 2) / radiusX;
      const ny = (y - height / 2) / radiusY;
      const angle = Math.atan2(ny, nx);
      radii.push(Math.hypot(nx, ny));
      if (i > 0) {
        const delta = Math.atan2(Math.sin(angle - previousAngle), Math.cos(angle - previousAngle));
        // Never reverse direction or suddenly jump across the circle.
        if (Math.abs(delta) > 0.15 || (sweep !== 0 && delta * sweep <= 0)) {
          throw new Error(`Ring ${seed} has a kink or reverses direction`);
        }
        sweep += delta;
      }
      previousAngle = angle;
    }
    if (Math.abs(sweep) <= Math.PI * 2 || Math.abs(sweep) > 7) {
      throw new Error(`Ring ${seed} is incomplete or loops too far`);
    }
    if (Math.max(...radii) / Math.min(...radii) > 1.4) {
      throw new Error(`Ring ${seed} is too distorted to read as a circle`);
    }
    shapes.add(points.map(([x, y]) => `${(x / width).toFixed(3)},${(y / height).toFixed(3)}`).join(" "));
  }
  expect(shapes.size).toBe(10_000);
});

test("a handwritten ring is reproducible and different seeds vary its gesture", () => {
  const ring = handwrittenRing(132, 132, 3, 123);
  expect(handwrittenRing(132, 132, 3, 123)).toEqual(ring);
  expect(handwrittenRing(132, 132, 3, 124)).not.toEqual(ring);
  expect(handwrittenRing(132, 132, 3, -123)).not.toEqual(ring);
});

test.each([
  [0, 100, 3],
  [100, 0, 3],
  [Number.NaN, 100, 3],
  [100, Number.POSITIVE_INFINITY, 3],
  [100, 100, 0],
  [100, 100, -3],
  [4, 4, 3],
])("invalid or too-small ring bounds %p × %p with stroke %p produce no path", (width, height, stroke) => {
  expect(handwrittenRing(width, height, stroke, 1)).toEqual([]);
});

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

test("an arrow is a curved shaft ending at its point, then a head there", () => {
  const [shaft, head] = pencilArrow([0, 100], [40, 0]);
  expect(shaft.d.endsWith("L40.0 0.0")).toBe(true);
  expect(head.d).toContain("L40.0 0.0");
  // It bows: the shaft is longer than the straight line.
  expect(shaft.length).toBeGreaterThan(Math.hypot(40, 100));
});
