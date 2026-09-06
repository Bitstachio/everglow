import { planMultipartParts } from "./photos.multipart";

describe("planMultipartParts", () => {
  const MIB = 1024 * 1024;

  it("splits a file into full parts plus a smaller last part", () => {
    expect(planMultipartParts(12 * MIB, 5 * MIB)).toEqual([
      { partNumber: 1, sizeBytes: 5 * MIB },
      { partNumber: 2, sizeBytes: 5 * MIB },
      { partNumber: 3, sizeBytes: 2 * MIB },
    ]);
  });

  it("uses exactly full parts when the size is a multiple of the part size", () => {
    expect(planMultipartParts(10 * MIB, 5 * MIB)).toEqual([
      { partNumber: 1, sizeBytes: 5 * MIB },
      { partNumber: 2, sizeBytes: 5 * MIB },
    ]);
  });

  it("plans a single part for a file no larger than one part", () => {
    expect(planMultipartParts(5 * MIB, 5 * MIB)).toEqual([{ partNumber: 1, sizeBytes: 5 * MIB }]);
    expect(planMultipartParts(1, 5 * MIB)).toEqual([{ partNumber: 1, sizeBytes: 1 }]);
  });

  it("sums back to the file size", () => {
    const parts = planMultipartParts(25_000_000, 5 * MIB);

    expect(parts).toHaveLength(5);
    expect(parts.reduce((sum, part) => sum + part.sizeBytes, 0)).toBe(25_000_000);
    expect(parts.map((part) => part.partNumber)).toEqual([1, 2, 3, 4, 5]);
  });

  it.each([0, -1, 1.5, Number.NaN])("rejects a file size of %p", (sizeBytes) => {
    expect(() => planMultipartParts(sizeBytes, 5 * MIB)).toThrow("Invalid multipart upload size");
  });

  it.each([0, -5, 2.5])("rejects a part size of %p", (partSizeBytes) => {
    expect(() => planMultipartParts(10 * MIB, partSizeBytes)).toThrow("Invalid multipart part size");
  });
});
