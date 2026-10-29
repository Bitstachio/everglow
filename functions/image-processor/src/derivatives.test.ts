import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { createDerivatives } from "./derivatives.js";

test("rotates portrait EXIF, bounds dimensions and strips metadata from both outputs", async () => {
  const input = await sharp({
    create: { width: 2400, height: 1200, channels: 3, background: "blue" },
  })
    .withMetadata({ orientation: 6 })
    .withExifMerge({ IFD0: { Artist: "private metadata" } })
    .jpeg()
    .toBuffer();
  const output = await createDerivatives(input);
  for (const [bytes, edge, format] of [
    [output.thumbWebp, 512, "webp"],
    [output.largeJpeg, 2048, "jpeg"],
  ] as const) {
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.height, edge);
    assert.equal(metadata.width, edge / 2);
    assert.equal(metadata.format, format);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.orientation, undefined);
  }
});

test("does not enlarge a small photo", async () => {
  const input = await sharp({
    create: { width: 20, height: 10, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const output = await createDerivatives(input);
  for (const bytes of [output.thumbWebp, output.largeJpeg]) {
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.width, 20);
    assert.equal(metadata.height, 10);
  }
});
