/**
 * Geometry for grease-pencil marks. Each mark is one or more strokes, each a
 * polyline sampled densely enough to read as a curve. A seeded wobble keeps
 * marks hand-drawn but stable between renders.
 */

export type PencilMark = "ring" | "tick" | "cross" | "underline" | "strike";

type Point = [number, number];

export type PencilStroke = {
  /** SVG path data. */
  d: string;
  /** Polyline length, for the draw-on dash animation. */
  length: number;
};

const wobble = (i: number, seed: number) => 0.5 * Math.sin(i * 1.7 + seed * 3.1) + 0.5 * Math.sin(i * 0.37 + seed);

const toStroke = (points: Point[]): PencilStroke => {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  const d = `M${points.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L")}`;
  return { d, length };
};

const sampleQuad = (from: Point, control: Point, to: Point, steps = 24): Point[] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    return [a * from[0] + b * control[0] + c * to[0], a * from[1] + b * control[1] + c * to[1]];
  });

/**
 * A circle drawn the way a hand does it: one stroke that starts at the upper
 * left, runs past where it began and spirals out a little.
 */
const ring = (width: number, height: number, inset: number, seed: number): Point[] => {
  const cx = width / 2;
  const cy = height / 2;
  const rx = width / 2 - inset * 2;
  const ry = height / 2 - inset * 2;
  const tilt = (-4 * Math.PI) / 180;
  const steps = 72;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const f = i / steps;
    const angle = ((205 + 385 * f) * Math.PI) / 180;
    const k = 1 - 0.06 + 0.1 * f + 0.015 * wobble(i, seed);
    const x = rx * k * Math.cos(angle);
    const y = ry * k * Math.sin(angle);
    return [cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)];
  });
};

const line = (from: Point, to: Point, bow: number, seed: number): Point[] => {
  const mid: Point = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + bow];
  return sampleQuad(from, mid, to).map(([x, y], i) => [x, y + 0.6 * wobble(i, seed)]);
};

export const pencilStrokes = (
  mark: PencilMark,
  width: number,
  height: number,
  strokeWidth: number,
  seed = 1,
): PencilStroke[] => {
  const inset = strokeWidth;
  switch (mark) {
    case "ring":
      return [toStroke(ring(width, height, inset, seed))];
    case "tick":
      return [
        toStroke([
          ...sampleQuad([inset, height * 0.55], [width * 0.22, height * 0.7], [width * 0.36, height - inset], 10),
          ...sampleQuad(
            [width * 0.36, height - inset],
            [width * 0.55, height * 0.35],
            [width - inset, inset],
            16,
          ).slice(1),
        ]),
      ];
    case "cross":
      return [
        toStroke(line([inset, inset], [width - inset, height - inset], height * 0.04, seed)),
        toStroke(line([width - inset, inset * 1.5], [inset * 1.5, height - inset], -height * 0.04, seed + 1)),
      ];
    case "underline":
      return [toStroke(line([0, height * 0.5], [width, height * 0.42], height * 0.25, seed))];
    case "strike":
      return [toStroke(line([0, height * 0.55], [width, height * 0.45], 0, seed))];
  }
};
