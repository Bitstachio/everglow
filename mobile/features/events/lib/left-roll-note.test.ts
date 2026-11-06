import { buildEvent } from "../testing/fixtures";
import { noteLeftRoll, takeLeftRoll } from "./left-roll-note";

test("Home reads the roll you left once", () => {
  const left = { event: buildEvent({ title: "Sam & Jo’s wedding" }), photos: [] };
  expect(takeLeftRoll()).toBeNull();
  noteLeftRoll(left);
  expect(takeLeftRoll()).toBe(left);
  expect(takeLeftRoll()).toBeNull();
});
