import type { User } from "@/lib/auth";
import { saveSessionSnapshot, removeSessionSnapshot } from "@/lib/session-cache";
import { QueryClient } from "@tanstack/react-query";
import { createSessionPersister, SESSION_WRITE_DELAY_MS } from "./session-persister";

jest.mock("@/lib/session-cache", () => ({ saveSessionSnapshot: jest.fn(), removeSessionSnapshot: jest.fn() }));

const save = saveSessionSnapshot as jest.Mock;
const remove = removeSessionSnapshot as jest.Mock;
const session = {
  userId: "user-1",
  identity: { sub: "auth0|1" },
  profile: { id: "user-1" } as unknown as User,
};

let queryClient: QueryClient;

const fetchInto = (key: string, persist: boolean, data: unknown) =>
  queryClient.fetchQuery({ queryKey: [key], queryFn: async () => data, meta: persist ? { persist } : undefined });

const savedKeys = () =>
  (save.mock.calls.at(-1)?.[0].queries.queries as { queryKey: unknown[] }[]).map((query) => query.queryKey[0]);

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  queryClient = new QueryClient();
});

afterEach(() => {
  queryClient.clear();
  jest.useRealTimers();
});

test("only queries that opted in are saved, with the account they belong to", async () => {
  const persister = createSessionPersister(queryClient);
  persister.setSession(session);
  await fetchInto("rolls", true, [{ id: "event-1" }]);
  await fetchInto("participants", false, [{ id: "person-1" }]);

  jest.advanceTimersByTime(SESSION_WRITE_DELAY_MS);

  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][0]).toMatchObject({ userId: "user-1", identity: { sub: "auth0|1" } });
  expect(savedKeys()).toEqual(["rolls"]);
  persister.stop();
});

const failRolls = () =>
  queryClient
    .fetchQuery({
      queryKey: ["rolls"],
      queryFn: async () => Promise.reject(new Error("offline")),
      meta: { persist: true },
    })
    .catch(() => undefined);

test("nothing is written until an opted-in query has an answer, so what was saved last time stands", async () => {
  const persister = createSessionPersister(queryClient);
  // The profile answers first; a write then would replace last time's rolls with none.
  persister.setSession(session);
  jest.advanceTimersByTime(SESSION_WRITE_DELAY_MS);
  // And a query that failed without ever answering has nothing to save either.
  await failRolls();
  jest.advanceTimersByTime(SESSION_WRITE_DELAY_MS);

  expect(save).not.toHaveBeenCalled();
  persister.stop();
});

test("a query whose refetch failed is still saved with its last answer, as an answer", async () => {
  const persister = createSessionPersister(queryClient);
  persister.setSession(session);
  await fetchInto("rolls", true, [{ id: "event-1" }]);
  await failRolls();
  expect(queryClient.getQueryState(["rolls"])?.status).toBe("error");
  // Another opted-in answer schedules the write.
  await fetchInto("strip-1", true, []);
  jest.advanceTimersByTime(SESSION_WRITE_DELAY_MS);

  expect(savedKeys().sort()).toEqual(["rolls", "strip-1"]);
  const rolls = (save.mock.calls.at(-1)?.[0].queries.queries as { queryKey: unknown[]; state: object }[]).find(
    (query) => query.queryKey[0] === "rolls",
  );
  // Read back offline, it must not look like a failure.
  expect(rolls?.state).toMatchObject({ data: [{ id: "event-1" }], status: "success", error: null });
  persister.stop();
});

test("a burst of answers is one write", async () => {
  const persister = createSessionPersister(queryClient);
  persister.setSession(session);
  jest.advanceTimersByTime(SESSION_WRITE_DELAY_MS);
  save.mockClear();

  await fetchInto("rolls", true, []);
  await fetchInto("strip-1", true, []);
  await fetchInto("strip-2", true, []);
  jest.advanceTimersByTime(SESSION_WRITE_DELAY_MS);

  expect(save).toHaveBeenCalledTimes(1);
  persister.stop();
});

test("without a signed-in account nothing is written, and nothing on disk is deleted", async () => {
  const persister = createSessionPersister(queryClient);
  persister.setSession(null);
  await fetchInto("rolls", true, []);
  jest.advanceTimersByTime(SESSION_WRITE_DELAY_MS);

  expect(save).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  persister.stop();
});

test("clearing the account deletes the snapshot and drops a write still waiting", async () => {
  const persister = createSessionPersister(queryClient);
  persister.setSession(session);
  await fetchInto("rolls", true, []);

  persister.clear();
  jest.advanceTimersByTime(SESSION_WRITE_DELAY_MS);
  await fetchInto("strip-1", true, []);
  jest.advanceTimersByTime(SESSION_WRITE_DELAY_MS);

  expect(remove).toHaveBeenCalledTimes(1);
  expect(save).not.toHaveBeenCalled();
  persister.stop();
});

test("a full disk doesn't break the app; the next change tries again", async () => {
  save.mockImplementationOnce(() => {
    throw new Error("No space left");
  });
  const persister = createSessionPersister(queryClient);
  persister.setSession(session);
  await fetchInto("rolls", true, []);
  jest.advanceTimersByTime(SESSION_WRITE_DELAY_MS);

  await fetchInto("strip-1", true, []);
  jest.advanceTimersByTime(SESSION_WRITE_DELAY_MS);

  expect(save).toHaveBeenCalledTimes(2);
  persister.stop();
});
