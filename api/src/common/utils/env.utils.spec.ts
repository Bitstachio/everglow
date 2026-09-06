import { parseIntegerEnv } from "./env.utils";

describe("parseIntegerEnv", () => {
  const FALLBACK = 42;

  it("returns an integer at or above the floor", () => {
    expect(parseIntegerEnv("1", FALLBACK, 1)).toBe(1);
    expect(parseIntegerEnv("500", FALLBACK, 1)).toBe(500);
    expect(parseIntegerEnv(" 7 ", FALLBACK, 1)).toBe(7);
  });

  it("falls back below the floor", () => {
    expect(parseIntegerEnv("0", FALLBACK, 1)).toBe(FALLBACK);
    expect(parseIntegerEnv("-1", FALLBACK, 0)).toBe(FALLBACK);
  });

  it("honours a zero floor, so a key can switch itself off deliberately", () => {
    expect(parseIntegerEnv("0", FALLBACK, 0)).toBe(0);
  });

  it.each([undefined, ""])("falls back when the variable is %p", (value) => {
    expect(parseIntegerEnv(value, FALLBACK, 1)).toBe(FALLBACK);
  });

  // Number(" ") is 0, so without the pattern a stray space would read as a real
  // zero and switch off the bound it was meant to set.
  it.each([" ", "\t", "\n"])("falls back for the whitespace-only %p", (value) => {
    expect(parseIntegerEnv(value, FALLBACK, 0)).toBe(FALLBACK);
  });

  // A fractional batch size or page count is nonsense downstream, and rounding
  // one would hide the typo rather than surface it.
  it.each(["1.5", "0.5", ".5", "1."])("rejects the fractional %p", (value) => {
    expect(parseIntegerEnv(value, FALLBACK, 0)).toBe(FALLBACK);
  });

  it.each(["abc", "12abc", "NaN", "Infinity", "-Infinity"])("rejects the non-numeric %p", (value) => {
    expect(parseIntegerEnv(value, FALLBACK, 0)).toBe(FALLBACK);
  });

  // Number() reads all three; a .env file does not mean them.
  it.each(["0x10", "1e3", "1_000"])("does not reinterpret the non-decimal %p", (value) => {
    expect(parseIntegerEnv(value, FALLBACK, 0)).toBe(FALLBACK);
  });

  it("accepts an explicit sign", () => {
    expect(parseIntegerEnv("+7", FALLBACK, 1)).toBe(7);
    expect(parseIntegerEnv("-7", FALLBACK, -10)).toBe(-7);
  });
});
