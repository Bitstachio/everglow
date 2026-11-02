import assert from "node:assert/strict";
import { test } from "node:test";
import { derivedKeysForOriginal } from "./keys.js";

void test("renders an original of the current layout, which names no uploader", () => {
  assert.deepEqual(derivedKeysForOriginal("photos/event/photo"), {
    thumb: "derived/photos/event/photo/thumb.webp",
    large: "derived/photos/event/photo/large.jpg",
  });
});

void test("still renders an original of the uploader layout rows minted before EV-205 use", () => {
  assert.deepEqual(derivedKeysForOriginal("photos/user/event/photo"), {
    thumb: "derived/photos/user/event/photo/thumb.webp",
    large: "derived/photos/user/event/photo/large.jpg",
  });
});

void test("refuses anything outside photos/", () => {
  assert.throws(() => derivedKeysForOriginal("event-covers/event/cover"));
});
