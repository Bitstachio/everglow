/**
 * Geometry for grease-pencil marks. Each mark is one or more strokes, each a
 * polyline sampled densely enough to read as a curve. A seeded wobble keeps
 * marks hand-drawn but stable between renders.
 */

export type PencilMark = "ring" | "tick" | "cross" | "underline" | "strike";

export type Point = [number, number];

export type PencilStroke = {
  /** SVG path data. */
  d: string;
  /** Polyline length, for the draw-on dash animation. */
  length: number;
};

const wobble = (i: number, seed: number) => 0.5 * Math.sin(i * 1.7 + seed * 3.1) + 0.5 * Math.sin(i * 0.37 + seed);

/** A local PRNG: a seed describes one hand gesture, without randomizing every point or render. */
const randomFrom = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * One slightly uneven loop with a short overshoot, as if drawn without lifting
 * the pencil. Slow, smooth variations model the hand's motion; independent
 * point jitter would make a jagged or furry outline. Fit the completed stroke
 * into its box, including round caps, so even a wide text ring cannot clip.
 */
export const handwrittenRing = (width: number, height: number, strokeWidth: number, seed: number): Point[] => {
  if (
    ![width, height, strokeWidth].every(Number.isFinite) ||
    strokeWidth <= 0 ||
    Math.min(width, height) <= strokeWidth + 2
  ) {
    return [];
  }
  const random = randomFrom(seed);
  const between = (low: number, high: number) => low + random() * (high - low);
  const turn = Math.PI * 2;
  const start = between(0, turn);
  const direction = random() < 0.2 ? -1 : 1;
  const sweep = turn + between(0.15, 0.55);
  const lean = between(-0.09, 0.09);
  const drift = between(0.015, 0.035);
  const phase = [between(0, turn), between(0, turn), between(0, turn)];
  const wave = [between(0.02, 0.05), between(0.01, 0.03), between(0.003, 0.009)];
  const points: Point[] = Array.from({ length: 97 }, (_, i) => {
    const t = i / 96;
    const angle = start + direction * sweep * t;
    const radius =
      1 +
      wave[0] * Math.sin(2 * angle + phase[0]) +
      wave[1] * Math.sin(3 * angle + phase[1]) +
      wave[2] * Math.sin(5 * angle + phase[2]) +
      drift * (2 * t - 1);
    return [radius * (Math.cos(angle) + lean * Math.sin(angle)), radius * Math.sin(angle)];
  });

  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const diameter = Math.max(maxX - minX, maxY - minY);
  const margin = strokeWidth / 2 + Math.min(width, height) * 0.025 + 0.5;
  const scaleX = (width - 2 * margin) / diameter;
  const scaleY = (height - 2 * margin) / diameter;
  return points.map(([x, y]) => [
    width / 2 + (x - (minX + maxX) / 2) * scaleX,
    height / 2 + (y - (minY + maxY) / 2) * scaleY,
  ]);
};

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

const line = (from: Point, to: Point, bow: number, seed: number): Point[] => {
  const mid: Point = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + bow];
  return sampleQuad(from, mid, to).map(([x, y], i) => [x, y + 0.6 * wobble(i, seed)]);
};

/**
 * A hand-drawn arrow from `from` to `to`: one curved stroke that bows to the
 * left of its direction by `bend` (a fraction of its length), then a two-stroke
 * head at `to`. Points are in the drawing's own coordinates.
 */
export const pencilArrow = (from: Point, to: Point, bend = 0.25, seed = 1): PencilStroke[] => {
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  const length = Math.hypot(dx, dy) || 1;
  const control: Point = [
    (from[0] + to[0]) / 2 + (dy / length) * length * bend,
    (from[1] + to[1]) / 2 - (dx / length) * length * bend,
  ];
  const shaft = sampleQuad(from, control, to, 32).map(
    // Wobble along the shaft, none at the ends so it starts and lands exactly.
    ([x, y], i): Point => [x + 0.6 * Math.sin((Math.PI * i) / 32) * wobble(i, seed), y],
  );
  const angle = Math.atan2(to[1] - control[1], to[0] - control[0]);
  const head = 12;
  const barb = (side: number): Point => [
    to[0] - head * Math.cos(angle + side * 0.5),
    to[1] - head * Math.sin(angle + side * 0.5),
  ];
  return [toStroke(shaft), toStroke([barb(-1), to, barb(1)])];
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
    case "ring": {
      const points = handwrittenRing(width, height, strokeWidth, seed);
      return points.length > 0 ? [toStroke(points)] : [];
    }
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
