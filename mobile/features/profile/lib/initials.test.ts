import { initials } from "./initials";

test.each([
  ["Leila Haddad", "LH"],
  ["Tom", "T"],
  ["@tom.ortiz", "TO"],
  ["Ana María López", "AM"],
  ["Élodie", "É"],
  ["😀 Sam", "😀S"],
  ["", ""],
])("initials of %p are %p", (name, expected) => {
  expect(initials(name)).toBe(expected);
});
