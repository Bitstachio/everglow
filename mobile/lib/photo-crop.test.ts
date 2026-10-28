import { clampCropOffset, clampCropScale, coverScale, cropRect } from "./photo-crop";

const area = { width: 400, height: 800 };
const photo = { width: 3000, height: 4000 };
// The avatar's 300pt circle, by its square.
const circle = { width: 300, height: 300 };

test("covers the area on the tighter side", () => {
  // 800 / 4000 = 0.2 beats 400 / 3000.
  expect(coverScale(photo, area)).toBeCloseTo(0.2);
});

test("keeps the scale between the cover fit and the maximum", () => {
  expect(clampCropScale(0.5)).toBe(1);
  expect(clampCropScale(2)).toBe(2);
  expect(clampCropScale(9)).toBe(5);
});

test("never moves the photo far enough to uncover the window", () => {
  // Shown 600pt wide around a 300pt window: 150pt of slack each way.
  expect(clampCropOffset(400, 600, 300)).toBe(150);
  expect(clampCropOffset(-400, 600, 300)).toBe(-150);
  expect(clampCropOffset(40, 600, 300)).toBe(40);
  expect(clampCropOffset(10, 200, 300)).toBe(0);
});

test("crops the centre square when the photo is not moved", () => {
  // 0.2 points per pixel: the 300pt circle is 1500px of photo.
  expect(cropRect(photo, area, circle, { scale: 1, x: 0, y: 0 })).toEqual({
    originX: 750,
    originY: 1250,
    width: 1500,
    height: 1500,
  });
});

test("zooming in crops less, and moving the photo right crops further left", () => {
  expect(cropRect(photo, area, circle, { scale: 2, x: 100, y: 0 })).toEqual({
    // 0.4 points per pixel: 750px square, centred 250px left of the middle.
    originX: 1500 - 250 - 375,
    originY: 2000 - 375,
    width: 750,
    height: 750,
  });
});

test("crops a wide window at its own shape", () => {
  // A 352 × 198pt frame (16:9) at 0.2 points per pixel is 1760 × 990px.
  expect(cropRect(photo, area, { width: 352, height: 198 }, { scale: 1, x: 0, y: 0 })).toEqual({
    originX: 620,
    originY: 1505,
    width: 1760,
    height: 990,
  });
});

test("stays inside the photo however far it is asked to go", () => {
  const rect = cropRect(photo, area, circle, { scale: 1, x: 10_000, y: -10_000 });
  expect(rect.originX).toBe(0);
  expect(rect.originY).toBe(photo.height - rect.height);
});
