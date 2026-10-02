import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { createApiError } from "@/lib/api/errors";
import { buildEvent } from "../testing/fixtures";
import { eventsKeys } from "./keys";
import { useRemoveEventCoverMutation, useSetEventCoverMutation } from "./mutations";

const mockCreateUploadUrl = jest.fn();
const mockConfirm = jest.fn();
const mockRemove = jest.fn();
let mockFileSize = 2048;

jest.mock("@/lib/api/generated/client.gen", () => ({ client: { getConfig: () => ({}) } }));
jest.mock("@/lib/api/generated", () => ({
  eventsControllerCreateCoverUploadUrl: (...args: unknown[]) => mockCreateUploadUrl(...args),
  eventsControllerConfirmCoverUpload: (...args: unknown[]) => mockConfirm(...args),
  eventsControllerRemoveCover: (...args: unknown[]) => mockRemove(...args),
}));
// The byte handling is covered by upload-file's own tests; here only the mint matters.
jest.mock("@/lib/api/upload-file", () => ({
  uploadFile: async ({ contentType, mint }: { contentType: string; mint: (file: unknown) => Promise<unknown> }) =>
    mint({ contentType, sizeBytes: mockFileSize }),
}));

const image = { uri: "file://cover.jpg", contentType: "image/jpeg" as const };
const event = buildEvent({ coverUrl: "https://bucket.example.com/event-covers/event-1/old?sig=a" });
const updatedEvent = { ...event, coverUrl: "https://bucket.example.com/event-covers/event-1/new?sig=b" };
const mintResponse = (uploadId: string) => ({
  data: { data: { uploadId, uploadUrl: `https://upload.example.com/${uploadId}`, expiresAt: "2030-01-01T00:00:00Z" } },
});

const setup = () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
  client.setQueryData(eventsKeys.detail("event-1"), event);
  client.setQueryData(eventsKeys.list("user-1"), [event]);
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
};

/** Runs the mutation inside act, including React Query's observer notify, which lands on the next tick. */
const settle = (work: () => Promise<unknown>) =>
  act(async () => {
    await work();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockFileSize = 2048;
  mockCreateUploadUrl.mockImplementation(async () => mintResponse(`upload-${mockCreateUploadUrl.mock.calls.length}`));
  mockConfirm.mockResolvedValue({ data: { data: updatedEvent } });
  mockRemove.mockResolvedValue({});
});

test("mints for the event, confirms, stores the returned event and refreshes the list", async () => {
  const { client, wrapper } = setup();
  const { result } = await renderHook(() => useSetEventCoverMutation("event-1"), { wrapper });

  await settle(() => expect(result.current.mutateAsync(image)).resolves.toEqual(updatedEvent));

  expect(mockCreateUploadUrl).toHaveBeenCalledWith({
    path: { eventId: "event-1" },
    body: { contentType: "image/jpeg", sizeBytes: 2048 },
    throwOnError: true,
  });
  expect(mockConfirm).toHaveBeenCalledWith({
    path: { eventId: "event-1" },
    body: { uploadId: "upload-1" },
    throwOnError: true,
  });
  expect(client.getQueryData(eventsKeys.detail("event-1"))).toEqual(updatedEvent);
  expect(client.getQueryState(eventsKeys.list("user-1"))?.isInvalidated).toBe(true);
});

test.each(["IMAGE_UPLOAD_EXPIRED", "IMAGE_UPLOAD_REJECTED"])(
  "starts over with a new upload URL after %s",
  async (code) => {
    mockConfirm.mockRejectedValueOnce(createApiError("gone", { status: 422, code }));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useSetEventCoverMutation("event-1"), { wrapper });

    await settle(() => result.current.mutateAsync(image));

    expect(mockCreateUploadUrl).toHaveBeenCalledTimes(2);
    expect(mockConfirm).toHaveBeenLastCalledWith(expect.objectContaining({ body: { uploadId: "upload-2" } }));
  },
);

test("retries a confirm that lost a race with another organizer once", async () => {
  mockConfirm.mockRejectedValueOnce(createApiError("conflict", { status: 409 }));
  const { wrapper } = setup();
  const { result } = await renderHook(() => useSetEventCoverMutation("event-1"), { wrapper });

  await settle(() => result.current.mutateAsync(image));

  expect(mockCreateUploadUrl).toHaveBeenCalledTimes(1);
  expect(mockConfirm).toHaveBeenCalledTimes(2);
});

test.each([
  ["a persistent conflict", 409],
  ["a lost organizer role", 403],
])("refetches the event after %s", async (_name, status) => {
  mockConfirm.mockRejectedValue(createApiError("no", { status }));
  const { client, wrapper } = setup();
  const { result } = await renderHook(() => useSetEventCoverMutation("event-1"), { wrapper });

  await settle(() => expect(result.current.mutateAsync(image)).rejects.toThrow("no"));

  expect(client.getQueryState(eventsKeys.detail("event-1"))?.isInvalidated).toBe(true);
});

test("rejects a file over 5 MB without asking for an upload URL", async () => {
  mockFileSize = 5 * 1024 * 1024 + 1;
  const { wrapper } = setup();
  const { result } = await renderHook(() => useSetEventCoverMutation("event-1"), { wrapper });

  await settle(() => expect(result.current.mutateAsync(image)).rejects.toMatchObject({ code: "IMAGE_INVALID_SIZE" }));
  expect(mockCreateUploadUrl).not.toHaveBeenCalled();
});

test("removing clears the cover on the cached event", async () => {
  const { client, wrapper } = setup();
  const { result } = await renderHook(() => useRemoveEventCoverMutation("event-1"), { wrapper });

  await settle(() => result.current.mutateAsync());

  expect(mockRemove).toHaveBeenCalledWith({ path: { eventId: "event-1" }, throwOnError: true });
  expect(client.getQueryData(eventsKeys.detail("event-1"))).toEqual({ ...event, coverUrl: null });
});
