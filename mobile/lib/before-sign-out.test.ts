import { BEFORE_SIGN_OUT_TIMEOUT_MS, onBeforeSignOut, runBeforeSignOut } from "./before-sign-out";

describe("runBeforeSignOut", () => {
  const cleanups: (() => void)[] = [];
  afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    jest.useRealTimers();
  });

  it("runs every handler with the context and waits for them", async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    cleanups.push(onBeforeSignOut(handler));

    await runBeforeSignOut({ accountDeleted: false });

    expect(handler).toHaveBeenCalledWith({ accountDeleted: false });
  });

  it("is not stopped by a handler that fails", async () => {
    const after = jest.fn().mockResolvedValue(undefined);
    cleanups.push(onBeforeSignOut(() => Promise.reject(new Error("offline"))));
    cleanups.push(onBeforeSignOut(after));

    await expect(runBeforeSignOut({ accountDeleted: false })).resolves.toBeUndefined();
    expect(after).toHaveBeenCalled();
  });

  it("stops waiting for a handler that hangs", async () => {
    jest.useFakeTimers();
    cleanups.push(onBeforeSignOut(() => new Promise<void>(() => undefined)));

    const done = jest.fn();
    void runBeforeSignOut({ accountDeleted: false }).then(done);
    await jest.advanceTimersByTimeAsync(BEFORE_SIGN_OUT_TIMEOUT_MS);

    expect(done).toHaveBeenCalled();
  });

  it("no longer runs a handler once it unsubscribes", async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    onBeforeSignOut(handler)();

    await runBeforeSignOut({ accountDeleted: false });

    expect(handler).not.toHaveBeenCalled();
  });
});
