import { Prisma } from "generated/prisma/client";
import { isSerializationFailure } from "./prisma.errors";

describe("isSerializationFailure", () => {
  const knownRequestError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError("Transaction failed", { code, clientVersion: "7.8.0" });

  // Wraps `leaf` in `depth` layers of cause, so the marker sits `depth` links down.
  const nest = (depth: number, leaf: unknown): unknown => {
    let current = leaf;
    for (let i = 0; i < depth; i++) current = new Error(`wrapper ${i}`, { cause: current });
    return current;
  };

  describe("recognises every shape the same failure arrives in", () => {
    it("matches the code Prisma maps a failed statement to", () => {
      expect(isSerializationFailure(knownRequestError("P2034"))).toBe(true);
    });

    it("matches a raw Postgres SQLSTATE on the error itself", () => {
      expect(isSerializationFailure(Object.assign(new Error("could not serialize access"), { code: "40001" }))).toBe(
        true,
      );
    });

    it("matches the driver adapter error rethrown unmapped when COMMIT fails", () => {
      const failure = Object.assign(new Error("TransactionWriteConflict"), {
        name: "DriverAdapterError",
        cause: {
          kind: "TransactionWriteConflict",
          originalCode: "40001",
          originalMessage: "could not serialize access due to read/write dependencies among transactions",
        },
      });

      expect(isSerializationFailure(failure)).toBe(true);
    });

    it("matches a SQLSTATE carried as originalCode without the adapter's kind", () => {
      expect(isSerializationFailure({ cause: { originalCode: "40001" } })).toBe(true);
    });
  });

  describe("leaves unrelated failures alone", () => {
    it.each([
      ["a unique constraint violation", knownRequestError("P2002")],
      ["a missing record", knownRequestError("P2025")],
      ["a plain error", new Error("connection reset")],
    ])("returns false for %s", (_label, error) => {
      expect(isSerializationFailure(error)).toBe(false);
    });

    it.each([
      ["null", null],
      ["undefined", undefined],
      ["a string", "40001"],
      ["a number", 40001],
    ])("returns false for %s rather than throwing", (_label, value) => {
      expect(isSerializationFailure(value)).toBe(false);
    });
  });

  describe("bounds how far it walks", () => {
    it("finds a failure at the deepest link it inspects", () => {
      expect(isSerializationFailure(nest(4, knownRequestError("P2034")))).toBe(true);
    });

    it("gives up on a failure buried past that depth", () => {
      expect(isSerializationFailure(nest(5, knownRequestError("P2034")))).toBe(false);
    });

    it("terminates on a cause chain that loops back on itself", () => {
      const outer: { cause?: unknown } = {};
      const inner = { cause: outer };
      outer.cause = inner;

      expect(isSerializationFailure(outer)).toBe(false);
    });
  });
});
