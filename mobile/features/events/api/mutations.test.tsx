import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen, userEvent, waitFor } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { Button, Text, View } from "react-native";
import { eventsKeys } from "./keys";
import { useEventsQuery } from "./queries";
import { buildEvent, deferred } from "../testing/fixtures";
import { useCreateEventMutation, useUploadEventPhotosMutation } from "./mutations";

const mockCreate = jest.fn();
const mockFindAll = jest.fn();
const mockCreateUploadUrls = jest.fn();
const mockConfirmUploads = jest.fn();

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerFindAll: (...args: unknown[]) => mockFindAll(...args),
  eventsControllerCreate: (...args: unknown[]) => mockCreate(...args),
  photosControllerCreateUploadUrls: (...args: unknown[]) => mockCreateUploadUrls(...args),
  photosControllerConfirmUploads: (...args: unknown[]) => mockConfirmUploads(...args),
}));
jest.mock("expo-file-system", () => ({
  File: jest.fn().mockImplementation((uri: string) => ({ uri, size: 1 })),
}));
jest.mock("expo-file-system/legacy", () => ({
  FileSystemSessionType: { BACKGROUND: 0, FOREGROUND: 1 },
  FileSystemUploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
  uploadAsync: jest.fn().mockResolvedValue({ status: 200, headers: {} }),
}));

const body = { title: "Meetup", date: "2030-06-15T18:30:00.000Z" };
const MutationProbe = () => {
  const mutation = useCreateEventMutation();
  return (
    <View>
      <Button title="Create" onPress={() => mutation.mutate(body)} />
      {mutation.data && <Text>{mutation.data.title}</Text>}
      {mutation.isError && <Text>Creation failed</Text>}
    </View>
  );
};

test.each([true, false])(
  "creation success=%s unwraps the response and invalidates only on success",
  async (success) => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
    const key = eventsKeys.list("user-1");
    client.setQueryData(key, []);
    mockCreate.mockReset();
    if (success) mockCreate.mockResolvedValue({ data: { data: { id: "event-1", ...body } } });
    else mockCreate.mockRejectedValue(new Error("Network unavailable"));
    const view = await render(
      <QueryClientProvider client={client}>
        <MutationProbe />
      </QueryClientProvider>,
    );
    await userEvent.setup().press(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText(success ? "Meetup" : "Creation failed")).toBeOnTheScreen();
    expect(mockCreate).toHaveBeenCalledWith({ body, throwOnError: true });
    await waitFor(() => expect(client.getQueryState(key)?.isInvalidated).toBe(success));
    await view.unmount();
    client.clear();
  },
);

const ActiveEventsProbe = () => {
  const query = useEventsQuery("user-1");
  const mutation = useCreateEventMutation();
  return (
    <View>
      <Button title="Create" onPress={() => mutation.mutate(body)} disabled={mutation.isPending} />
      {query.isSuccess && <Text>Events loaded</Text>}
      {mutation.isPending && <Text>Creating</Text>}
      {mutation.isSuccess && <Text>Created</Text>}
      {query.data?.map((event) => (
        <Text key={event.id}>{event.title}</Text>
      ))}
    </View>
  );
};

test("creation stays pending until the active event list has refreshed", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false, gcTime: 0 } },
  });
  mockFindAll.mockReset().mockResolvedValue({ data: { data: [] } });
  mockCreate.mockReset().mockResolvedValue({ data: { data: buildEvent() } });
  const view = await render(
    <QueryClientProvider client={client}>
      <ActiveEventsProbe />
    </QueryClientProvider>,
  );
  await screen.findByText("Events loaded");
  const pending = deferred<unknown>();
  mockFindAll.mockReturnValue(pending.promise);
  await userEvent.setup().press(screen.getByRole("button", { name: "Create" }));
  expect(await screen.findByText("Creating")).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
  expect(mockFindAll).toHaveBeenCalledTimes(2);
  expect(screen.queryByText("Created")).not.toBeOnTheScreen();
  pending.resolve({ data: { data: [buildEvent()] } });
  expect(await screen.findByText("Created")).toBeOnTheScreen();
  expect(screen.getByText(buildEvent().title)).toBeOnTheScreen();
  expect(screen.getByRole("button", { name: "Create" })).toBeEnabled();
  await view.unmount();
  client.clear();
});

test.each([
  ["succeeds", { data: { data: [{ photoId: "photo-new", uploadUrl: "https://upload.example.com/slot" }] } }],
  ["stops", undefined],
])("photo upload refreshes the photos and the event's storage when it %s", async (_outcome, slots) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: 0 } },
  });
  client.setQueryData(eventsKeys.photos("event-1"), []);
  client.setQueryData(eventsKeys.detail("event-1"), buildEvent());
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  mockCreateUploadUrls.mockReset();
  if (slots) mockCreateUploadUrls.mockResolvedValue(slots);
  else mockCreateUploadUrls.mockRejectedValue(new Error("Network unavailable"));
  mockConfirmUploads.mockReset().mockResolvedValue({ data: { data: [{ photoId: "photo-new", status: "READY" }] } });

  const { result } = await renderHook(() => useUploadEventPhotosMutation(), { wrapper });
  const outcome = await result.current.mutateAsync({
    eventId: "event-1",
    files: [{ uri: "file://photo.jpg", contentType: "image/jpeg", sizeBytes: 1 }],
  });

  expect(outcome.uploaded).toBe(slots ? 1 : 0);
  expect(client.getQueryState(eventsKeys.photos("event-1"))?.isInvalidated).toBe(true);
  expect(client.getQueryState(eventsKeys.detail("event-1"))?.isInvalidated).toBe(true);
  client.clear();
});
