import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { buildEvent } from "../testing/fixtures";
import { eventsKeys } from "./keys";
import { useRegenerateInviteMutation } from "./mutations";

const mockRegenerate = jest.fn();
jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerRegenerateInvite: (...args: unknown[]) => mockRegenerate(...args),
}));

const setup = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
};

test("rotates one invite and puts the new links on the cached roll", async () => {
  const { client, wrapper } = setup();
  client.setQueryData(eventsKeys.detail("event-1"), buildEvent());
  const rotated = buildEvent({
    invites: [
      { accessLevel: "PARTICIPANT", invitationUrl: "https://events.everglow.app/invite/weekend" },
      { accessLevel: "VIEWER", invitationUrl: "https://events.everglow.app/invite/fresh" },
    ],
  });
  mockRegenerate.mockResolvedValue({ data: { data: rotated } });
  const invalidate = jest.spyOn(client, "invalidateQueries");

  const { result } = await renderHook(() => useRegenerateInviteMutation("event-1"), { wrapper });
  await act(() => result.current.mutateAsync("VIEWER"));
  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  expect(mockRegenerate).toHaveBeenCalledWith({
    path: { eventId: "event-1", accessLevel: "VIEWER" },
    throwOnError: true,
  });
  expect(client.getQueryData(eventsKeys.detail("event-1"))).toEqual(rotated);
  expect(invalidate).toHaveBeenCalledWith({ queryKey: eventsKeys.all });
});

test("leaves the cached roll alone when the reset fails", async () => {
  const { client, wrapper } = setup();
  const event = buildEvent();
  client.setQueryData(eventsKeys.detail("event-1"), event);
  mockRegenerate.mockRejectedValue(new Error("Too many requests"));

  const { result } = await renderHook(() => useRegenerateInviteMutation("event-1"), { wrapper });
  let failure: unknown;
  await act(async () => {
    failure = await result.current.mutateAsync("PARTICIPANT").catch((error: unknown) => error);
  });
  await waitFor(() => expect(result.current.isError).toBe(true));

  expect(failure).toEqual(new Error("Too many requests"));

  expect(client.getQueryData(eventsKeys.detail("event-1"))).toBe(event);
});
