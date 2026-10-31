import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { crc32 } from "node:zlib";
import sharp from "sharp";
import { createDerivatives, MAX_INPUT_PIXELS } from "./derivatives.js";
import { UndecodablePhotoError, type UndecodableReason } from "./errors.js";

/** A 16×16 HEVC HEIC made with `sips -s format heic`; Sharp's prebuilt libvips cannot decode HEVC. */
const hevcHeic = readFileSync(path.join(__dirname, "fixtures", "hevc-16x16.heic"));

/** A valid PNG whose header claims width × height, so the pixel limit trips before any decode. */
const pngClaiming = async (width: number, height: number): Promise<Buffer> => {
  const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  // Signature (8) + IHDR length (4) + "IHDR" (4), then width and height; CRC covers type + data.
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  png.writeUInt32BE(crc32(png.subarray(12, 29)), 29);
  return png;
};

const assertUndecodable = async (input: Buffer, reason: UndecodableReason) => {
  await assert.rejects(createDerivatives(input), (error: unknown) => {
    assert.ok(error instanceof UndecodablePhotoError, `expected UndecodablePhotoError, got ${String(error)}`);
    assert.equal(error.reason, reason);
    assert.ok(error.message.length > 0 && error.message.length <= 300);
    assert.doesNotMatch(error.message, /\n/);
    return true;
  });
};

void test("rotates portrait EXIF, bounds dimensions and strips metadata from both outputs", async () => {
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
  // Reported dimensions are the rotated large rendition's, not the stored 2400×1200.
  assert.deepEqual({ width: output.width, height: output.height }, { width: 1024, height: 2048 });
});

void test("does not enlarge a small photo", async () => {
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
  assert.deepEqual({ width: output.width, height: output.height }, { width: 20, height: 10 });
});

void test("keeps transparency in the thumb and flattens it in the JPEG", async () => {
  const input = await sharp({
    create: { width: 40, height: 30, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 0.5 } },
  })
    .png()
    .toBuffer();
  const output = await createDerivatives(input);
  assert.equal((await sharp(output.thumbWebp).metadata()).hasAlpha, true);
  assert.equal((await sharp(output.largeJpeg).metadata()).hasAlpha, false);
});

void test("HEVC HEIC is a permanent unsupported format", async () => {
  await assertUndecodable(hevcHeic, "unsupported_format");
});

void test("bytes that are not an image are a permanent unsupported format", async () => {
  await assertUndecodable(Buffer.from("not an image"), "unsupported_format");
});

void test("decodable types the upload API does not accept are refused", async () => {
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
  const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: "red" } })
    .gif()
    .toBuffer();
  for (const input of [svg, gif]) await assertUndecodable(input, "unsupported_format");
});

void test("a truncated JPEG is permanently corrupt", async () => {
  const jpeg = await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: "black",
      noise: { type: "gaussian", mean: 128, sigma: 40 },
    },
  })
    .jpeg()
    .toBuffer();
  await assertUndecodable(jpeg.subarray(0, jpeg.length / 2), "corrupt");
  await assertUndecodable(jpeg.subarray(0, 100), "corrupt");
});

void test(`refuses originals above ${MAX_INPUT_PIXELS} pixels before decoding`, async () => {
  await assertUndecodable(await pngClaiming(16_000, 8_001), "pixel_limit");
  // At the limit the header passes; this 1-pixel body then fails as corrupt, not as too large.
  await assertUndecodable(await pngClaiming(16_000, 8_000), "corrupt");
});
