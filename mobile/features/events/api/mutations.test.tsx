import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook, screen, userEvent, waitFor } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { Button, Text, View } from "react-native";
import { eventsKeys } from "./keys";
import { useEventsQuery } from "./queries";
import { buildEvent, buildPhoto, deferred } from "../testing/fixtures";
import { useCreateEventMutation, useUploadEventPhotoMutation } from "./mutations";

const mockCreate = jest.fn();
const mockFindAll = jest.fn();
const mockCreateUploadUrls = jest.fn();
const mockConfirmUploads = jest.fn();
const mockFindOnePhoto = jest.fn();

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerFindAll: (...args: unknown[]) => mockFindAll(...args),
  eventsControllerCreate: (...args: unknown[]) => mockCreate(...args),
  photosControllerCreateUploadUrls: (...args: unknown[]) => mockCreateUploadUrls(...args),
  photosControllerConfirmUploads: (...args: unknown[]) => mockConfirmUploads(...args),
  photosControllerFindOne: (...args: unknown[]) => mockFindOnePhoto(...args),
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

const uploadClients: QueryClient[] = [];
const originalFetch = globalThis.fetch;

const setupUploadClient = () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  uploadClients.push(client);
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
};

beforeEach(() => {
  mockCreateUploadUrls.mockReset();
  mockConfirmUploads.mockReset();
  mockFindOnePhoto.mockReset();
  globalThis.fetch = jest.fn() as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  uploadClients.splice(0).forEach((client) => client.clear());
});

test("photo upload mints a slot, uploads the blob, confirms, and invalidates photos", async () => {
  const photo = buildPhoto({ id: "photo-new" });
  const { client, wrapper } = setupUploadClient();
  client.setQueryData(eventsKeys.photos("event-1"), []);
  mockCreateUploadUrls.mockResolvedValue({
    data: { data: [{ photoId: "photo-new", uploadUrl: "https://upload.example.com/slot" }] },
  });
  mockConfirmUploads.mockResolvedValue({ data: { data: null } });
  mockFindOnePhoto.mockResolvedValue({ data: { data: photo } });
  const blob = new Blob(["image-bytes"], { type: "image/jpeg" });
  (globalThis.fetch as jest.Mock).mockResolvedValueOnce({ blob: async () => blob }).mockResolvedValueOnce({ ok: true });

  const { result } = await renderHook(() => useUploadEventPhotoMutation(), { wrapper });
  await expect(
    result.current.mutateAsync({
      eventId: "event-1",
      uri: "file://photo.jpg",
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
    }),
  ).resolves.toEqual(photo);

  expect(mockCreateUploadUrls).toHaveBeenCalledWith({
    path: { eventId: "event-1" },
    body: { files: [{ contentType: "image/jpeg", sizeBytes: blob.size }] },
    throwOnError: true,
  });
  expect(globalThis.fetch).toHaveBeenNthCalledWith(1, "file://photo.jpg");
  expect(globalThis.fetch).toHaveBeenNthCalledWith(2, "https://upload.example.com/slot", {
    body: expect.any(Blob),
    headers: { "Content-Type": "image/jpeg" },
    method: "PUT",
  });
  expect(mockConfirmUploads).toHaveBeenCalledWith({
    path: { eventId: "event-1" },
    body: { photoIds: ["photo-new"] },
    throwOnError: true,
  });
  expect(mockFindOnePhoto).toHaveBeenCalledWith({ path: { photoId: "photo-new" }, throwOnError: true });
  await waitFor(() => expect(client.getQueryState(eventsKeys.photos("event-1"))?.isInvalidated).toBe(true));
});

test("photo upload normalizes unknown image types to image/jpeg", async () => {
  const { wrapper } = setupUploadClient();
  mockCreateUploadUrls.mockResolvedValue({
    data: { data: [{ photoId: "photo-new", uploadUrl: "https://upload.example.com/slot" }] },
  });
  mockConfirmUploads.mockResolvedValue({ data: { data: null } });
  mockFindOnePhoto.mockResolvedValue({ data: { data: buildPhoto() } });
  (globalThis.fetch as jest.Mock)
    .mockResolvedValueOnce({ blob: async () => new Blob(["x"]) })
    .mockResolvedValueOnce({ ok: true });

  const { result } = await renderHook(() => useUploadEventPhotoMutation(), { wrapper });
  await result.current.mutateAsync({
    eventId: "event-1",
    uri: "file://photo.jpg",
    fileName: "photo.jpg",
    mimeType: "image/jpg",
  });

  expect(mockCreateUploadUrls).toHaveBeenCalledWith(
    expect.objectContaining({
      body: { files: [{ contentType: "image/jpeg", sizeBytes: 1 }] },
    }),
  );
});

test("photo upload sends a body typed with the signed content type", async () => {
  const { wrapper } = setupUploadClient();
  mockCreateUploadUrls.mockResolvedValue({
    data: { data: [{ photoId: "photo-new", uploadUrl: "https://upload.example.com/slot" }] },
  });
  mockConfirmUploads.mockResolvedValue({ data: { data: null } });
  mockFindOnePhoto.mockResolvedValue({ data: { data: buildPhoto() } });
  // A blob read from a file:// URI has no type, and Expo's fetch sends the
  // body's type as Content-Type in place of the header.
  const fileBlob = new Blob(["image-bytes"]);
  (globalThis.fetch as jest.Mock)
    .mockResolvedValueOnce({ blob: async () => fileBlob })
    .mockResolvedValueOnce({ ok: true });

  const { result } = await renderHook(() => useUploadEventPhotoMutation(), { wrapper });
  await result.current.mutateAsync({
    eventId: "event-1",
    uri: "file://photo.png",
    fileName: "photo.png",
    mimeType: "image/png",
  });

  const [, init] = (globalThis.fetch as jest.Mock).mock.calls[1];
  expect(init.headers).toEqual({ "Content-Type": "image/png" });
  expect(init.body.type).toBe("image/png");
  expect(init.body.size).toBe(fileBlob.size);
});

test("photo upload does not ask for an upload URL when the file is empty", async () => {
  const { wrapper } = setupUploadClient();
  (globalThis.fetch as jest.Mock).mockResolvedValueOnce({ blob: async () => new Blob([]) });

  const { result } = await renderHook(() => useUploadEventPhotoMutation(), { wrapper });
  await expect(
    result.current.mutateAsync({
      eventId: "event-1",
      uri: "file://photo.jpg",
      fileName: "photo.jpg",
      mimeType: "image/jpeg",
    }),
  ).rejects.toThrow("Could not determine file size for upload");
  expect(mockCreateUploadUrls).not.toHaveBeenCalled();
});

test("photo upload fails when storage rejects the PUT", async () => {
  const { wrapper } = setupUploadClient();
  mockCreateUploadUrls.mockResolvedValue({
    data: { data: [{ photoId: "photo-new", uploadUrl: "https://upload.example.com/slot" }] },
  });
  (globalThis.fetch as jest.Mock)
    .mockResolvedValueOnce({ blob: async () => new Blob(["x"]) })
    .mockResolvedValueOnce({ ok: false, status: 403 });

  const { result } = await renderHook(() => useUploadEventPhotoMutation(), { wrapper });
  await expect(
    result.current.mutateAsync({
      eventId: "event-1",
      uri: "file://photo.jpg",
      fileName: "photo.jpg",
      mimeType: "image/png",
    }),
  ).rejects.toThrow("Upload to storage failed (403)");
  expect(mockConfirmUploads).not.toHaveBeenCalled();
});
