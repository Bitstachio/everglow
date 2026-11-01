import { noteLeftRoll, takeLeftRoll } from "./left-roll-note";

test("Home reads the roll you left once", () => {
  expect(takeLeftRoll()).toBeNull();
  noteLeftRoll("Sam & Jo’s wedding");
  expect(takeLeftRoll()).toBe("Sam & Jo’s wedding");
  expect(takeLeftRoll()).toBeNull();
});
