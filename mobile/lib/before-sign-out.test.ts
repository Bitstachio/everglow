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

    await runBeforeSignOut({ reason: "signedOut" });

    expect(handler).toHaveBeenCalledWith({ reason: "signedOut" });
  });

  it("is not stopped by a handler that fails", async () => {
    const after = jest.fn().mockResolvedValue(undefined);
    cleanups.push(onBeforeSignOut(() => Promise.reject(new Error("offline"))));
    cleanups.push(onBeforeSignOut(after));

    await expect(runBeforeSignOut({ reason: "signedOut" })).resolves.toBeUndefined();
    expect(after).toHaveBeenCalled();
  });

  it("is not stopped by a handler that throws before it returns a promise", async () => {
    const after = jest.fn().mockResolvedValue(undefined);
    cleanups.push(
      onBeforeSignOut(() => {
        throw new Error("not async");
      }),
    );
    cleanups.push(onBeforeSignOut(after));

    await expect(runBeforeSignOut({ reason: "signedOut" })).resolves.toBeUndefined();
    expect(after).toHaveBeenCalledWith({ reason: "signedOut" });
  });

  it("stops waiting for a handler that hangs", async () => {
    jest.useFakeTimers();
    cleanups.push(onBeforeSignOut(() => new Promise<void>(() => undefined)));

    const done = jest.fn();
    void runBeforeSignOut({ reason: "signedOut" }).then(done);
    await jest.advanceTimersByTimeAsync(BEFORE_SIGN_OUT_TIMEOUT_MS);

    expect(done).toHaveBeenCalled();
  });

  it("no longer runs a handler once it unsubscribes", async () => {
    const handler = jest.fn().mockResolvedValue(undefined);
    onBeforeSignOut(handler)();

    await runBeforeSignOut({ reason: "signedOut" });

    expect(handler).not.toHaveBeenCalled();
  });
});
