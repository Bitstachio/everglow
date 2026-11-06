import { buildEvent } from "../testing/fixtures";
import { handOverLeftRoll, takeLeftRoll } from "./left-roll";

test("Home reads the roll you left once", () => {
  const left = { event: buildEvent({ title: "Sam & Jo’s wedding" }), photos: [] };
  expect(takeLeftRoll()).toBeNull();
  handOverLeftRoll(left);
  expect(takeLeftRoll()).toBe(left);
  expect(takeLeftRoll()).toBeNull();
});
