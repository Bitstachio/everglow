import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeDecoderMessage, toUndecodable, UndecodablePhotoError } from "./errors.js";

// Messages as Sharp 0.35.5 reports them (see derivatives.spec.ts for the real inputs).
const HEIC =
  "source: bad seek to 2789\nsource: bad seek to 2763\nheif: Error while loading plugin: Support for this compression format has not been built in: HEVC (a suitable decoder plugin is libde265) (11.6003)";

void test("classifies Sharp's decode failures by reason", () => {
  for (const [message, reason] of [
    ["Input image exceeds pixel limit", "pixel_limit"],
    ["Input buffer contains unsupported image format", "unsupported_format"],
    [HEIC, "unsupported_format"],
    ["Input Buffer is empty", "empty"],
    ["Input buffer has corrupt header: webp: unable to parse image", "corrupt"],
    ["VipsJpeg: premature end of JPEG image", "corrupt"],
    ["vipspng: libpng read error", "corrupt"],
  ] as const) {
    const error = toUndecodable(new Error(message));
    assert.ok(error instanceof UndecodablePhotoError, message);
    assert.equal(error.reason, reason, message);
  }
});

void test("leaves anything else retryable", () => {
  for (const error of [
    new Error("vips_malloc: out of memory"),
    Object.assign(new Error("Service Unavailable"), { name: "ServiceUnavailable" }),
    new TypeError("Cannot read properties of undefined"),
    "a string",
    undefined,
  ]) {
    assert.equal(toUndecodable(error), undefined);
  }
});

void test("keeps one copy of each useful decoder line, printable and bounded", () => {
  assert.equal(
    sanitizeDecoderMessage(HEIC),
    "heif: Error while loading plugin: Support for this compression format has not been built in: HEVC (a suitable decoder plugin is libde265) (11.6003)",
  );
  assert.equal(
    sanitizeDecoderMessage("VipsJpeg: bad\nVipsJpeg: worse\nVipsJpeg: bad\n"),
    "VipsJpeg: bad | VipsJpeg: worse",
  );
  assert.equal(sanitizeDecoderMessage("bad\u0000byteé"), "bad?byte?");
  assert.equal(sanitizeDecoderMessage("x".repeat(1000)).length, 300);
});
