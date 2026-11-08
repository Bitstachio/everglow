import { PrismaClient } from "generated/prisma/client";
import { DeepMockProxy, mockDeep } from "jest-mock-extended";
import { runExclusively } from "./advisory-lock";

describe("runExclusively", () => {
  let prisma: DeepMockProxy<PrismaClient>;

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>();
    prisma.$transaction.mockImplementation(((fn: (tx: unknown) => Promise<unknown>) => fn(prisma)) as never);
  });

  it("runs the work under a transaction-scoped try-lock on the key, with the timeout given", async () => {
    prisma.$queryRaw.mockResolvedValue([{ locked: true }] as never);
    const work = jest.fn().mockResolvedValue("done");

    await expect(runExclusively(prisma, "job:key", 60_000, work)).resolves.toEqual({ ran: true, result: "done" });

    const [strings, key] = prisma.$queryRaw.mock.calls[0] as unknown as [TemplateStringsArray, string];
    expect(strings.join("?")).toContain("pg_try_advisory_xact_lock(hashtextextended(?, 0))");
    expect(key).toBe("job:key");
    expect(prisma.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ timeout: 60_000 }),
    );
  });

  it("skips the work when another instance holds the lock", async () => {
    prisma.$queryRaw.mockResolvedValue([{ locked: false }] as never);
    const work = jest.fn();

    await expect(runExclusively(prisma, "job:key", 60_000, work)).resolves.toEqual({ ran: false });
    expect(work).not.toHaveBeenCalled();
  });

  it("lets the work's error through, which releases the lock with the transaction", async () => {
    prisma.$queryRaw.mockResolvedValue([{ locked: true }] as never);

    await expect(runExclusively(prisma, "job:key", 60_000, () => Promise.reject(new Error("boom")))).rejects.toThrow(
      "boom",
    );
  });
});
