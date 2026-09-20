import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { useEventsQuery } from "./queries";
import { useJoinEventMutation } from "./mutations";
import { eventsKeys } from "./keys";
import { buildEvent, deferred } from "../testing/fixtures";

const mockFindAll = jest.fn();
const mockJoin = jest.fn();
jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerFindAll: (...args: unknown[]) => mockFindAll(...args),
  eventsControllerJoin: (...args: unknown[]) => mockJoin(...args),
}));

const clients: QueryClient[] = [];

const setupClient = () => {
  const client = new QueryClient({
    defaultOptions: {
      // Keep inactive seeded caches until assertions finish; cleanup runs after unmount.
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  clients.push(client);
  const QueryProvider = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper: QueryProvider };
};
beforeEach(() => {
  mockFindAll.mockReset();
  mockJoin.mockReset();
});

afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
});

test("unwraps the events envelope and passes a cancellation signal to the SDK", async () => {
  const events = [buildEvent()];
  mockFindAll.mockResolvedValue({ data: { data: events } });
  const { result } = await renderHook(() => useEventsQuery("user-1"), { wrapper: setupClient().wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual(events);
  expect(mockFindAll).toHaveBeenCalledWith({ signal: expect.any(AbortSignal), throwOnError: true });
});

test("does not fetch until a user is available", async () => {
  mockFindAll.mockResolvedValue({ data: { data: [] } });
  const { result, rerender } = await renderHook((userId: string | undefined) => useEventsQuery(userId), {
    wrapper: setupClient().wrapper,
    initialProps: undefined as string | undefined,
  });
  expect(mockFindAll).not.toHaveBeenCalled();
  await rerender("user-1");
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toEqual([]);
});

test("exposes SDK failures to the screen", async () => {
  const error = new Error("Offline");
  mockFindAll.mockRejectedValue(error);
  const { result } = await renderHook(() => useEventsQuery("user-1"), { wrapper: setupClient().wrapper });
  await waitFor(() => expect(result.current.error).toBe(error));
});

test("aborts an in-flight request on unmount", async () => {
  mockFindAll.mockReturnValue(new Promise(() => {}));
  const { unmount } = await renderHook(() => useEventsQuery("user-1"), { wrapper: setupClient().wrapper });
  const signal = mockFindAll.mock.calls[0][0].signal as AbortSignal;
  expect(signal.aborted).toBe(false);
  await unmount();
  expect(signal.aborted).toBe(true);
});

test("joining unwraps the result and invalidates all event lists, leaving unrelated data fresh", async () => {
  const { client, wrapper } = setupClient();
  const event = buildEvent();
  client.setQueryData(eventsKeys.list("user-1"), []);
  client.setQueryData(eventsKeys.list("user-2"), []);
  client.setQueryData(["profile"], { name: "Ada" });
  mockJoin.mockResolvedValue({ data: { data: event } });
  const { result } = await renderHook(() => useJoinEventMutation(), { wrapper });
  await expect(result.current.mutateAsync({ invitationUrl: "token" })).resolves.toEqual(event);
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(mockJoin).toHaveBeenCalledWith({ body: { invitationUrl: "token" }, throwOnError: true });
  expect(client.getQueryState(eventsKeys.list("user-1"))?.isInvalidated).toBe(true);
  expect(client.getQueryState(eventsKeys.list("user-2"))?.isInvalidated).toBe(true);
  expect(client.getQueryState(["profile"])?.isInvalidated).toBe(false);
});

test("a failed join preserves existing event caches", async () => {
  const { client, wrapper } = setupClient();
  const events = [buildEvent()];
  client.setQueryData(eventsKeys.list("user-1"), events);
  const error = new Error("Invalid invitation");
  mockJoin.mockRejectedValue(error);
  const { result } = await renderHook(() => useJoinEventMutation(), { wrapper });
  await expect(result.current.mutateAsync({ invitationUrl: "bad-token" })).rejects.toBe(error);
  await waitFor(() => expect(result.current.isError).toBe(true));
  expect(client.getQueryData(eventsKeys.list("user-1"))).toEqual(events);
  expect(client.getQueryState(eventsKeys.list("user-1"))?.isInvalidated).toBe(false);
});

test("joining remains pending until active lists finish refreshing", async () => {
  const { wrapper } = setupClient();
  mockFindAll.mockResolvedValue({ data: { data: [] } });
  mockJoin.mockResolvedValue({ data: { data: buildEvent() } });
  const { result } = await renderHook(() => ({ query: useEventsQuery("user-1"), mutation: useJoinEventMutation() }), {
    wrapper,
  });
  await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
  const pending = deferred<unknown>();
  mockFindAll.mockReturnValue(pending.promise);
  const mutation = result.current.mutation.mutateAsync({ invitationUrl: "token" });
  await waitFor(() => expect(result.current.query.isRefetching).toBe(true));
  expect(result.current.mutation.isPending).toBe(true);
  pending.resolve({ data: { data: [buildEvent()] } });
  await mutation;
  await waitFor(() => expect(result.current.mutation.isSuccess).toBe(true));
  expect(result.current.query.data).toEqual([buildEvent()]);
});
