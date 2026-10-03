import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react-native";
import type { PropsWithChildren } from "react";
import { createApiError } from "@/lib/api/errors";
import { profileKeys } from "./keys";
import { useRemoveAvatarMutation, useSetAvatarMutation } from "./mutations";

const mockCreateUploadUrl = jest.fn();
const mockConfirm = jest.fn();
const mockRemove = jest.fn();
const mockFindMe = jest.fn();
const mockUpdateUser = jest.fn();
let mockFileSize = 2048;

const user = {
  id: "user-1",
  isOnboarded: true,
  details: { name: "Ada", username: "ada", avatarUrl: "https://bucket.example.com/avatars/user-1/old?sig=a" },
};

jest.mock("@/context/auth-context", () => ({
  useAuth: () => ({ user, updateUser: mockUpdateUser }),
}));
jest.mock("@/lib/api/generated", () => ({
  usersControllerCreateAvatarUploadUrl: (...args: unknown[]) => mockCreateUploadUrl(...args),
  usersControllerConfirmAvatarUpload: (...args: unknown[]) => mockConfirm(...args),
  usersControllerRemoveAvatar: (...args: unknown[]) => mockRemove(...args),
  usersControllerFindMe: (...args: unknown[]) => mockFindMe(...args),
}));
jest.mock("@/lib/api/generated/@tanstack/react-query.gen", () => ({
  usersControllerFindMeQueryKey: () => [{ _id: "usersControllerFindMe" }],
}));
// The byte handling is covered by upload-file's own tests; here only the mint matters.
jest.mock("@/lib/api/upload-file", () => ({
  uploadFile: async ({ contentType, mint }: { contentType: string; mint: (file: unknown) => Promise<unknown> }) =>
    mint({ contentType, sizeBytes: mockFileSize }),
}));

const image = { uri: "file://avatar.jpg", contentType: "image/jpeg" as const };
const updatedUser = { ...user, details: { ...user.details, avatarUrl: "https://bucket.example.com/new?sig=b" } };
const mintResponse = (uploadId: string) => ({
  data: { data: { uploadId, uploadUrl: `https://upload.example.com/${uploadId}`, expiresAt: "2030-01-01T00:00:00Z" } },
});

const setup = () => {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFileSize = 2048;
  mockCreateUploadUrl.mockImplementation(async () => mintResponse(`upload-${mockCreateUploadUrl.mock.calls.length}`));
  mockConfirm.mockResolvedValue({ data: { data: updatedUser } });
});

test("mints for the prepared file, confirms, and stores the returned user", async () => {
  const { client, wrapper } = setup();
  const { result } = await renderHook(() => useSetAvatarMutation(), { wrapper });

  await act(async () => {
    await expect(result.current.mutateAsync(image)).resolves.toEqual(updatedUser);
  });

  expect(mockCreateUploadUrl).toHaveBeenCalledWith({
    body: { contentType: "image/jpeg", sizeBytes: 2048 },
    throwOnError: true,
  });
  expect(mockConfirm).toHaveBeenCalledWith({ body: { uploadId: "upload-1" }, throwOnError: true });
  expect(mockUpdateUser).toHaveBeenCalledWith(updatedUser);
  expect(client.getQueryData(profileKeys.me())).toEqual(updatedUser);
});

test.each(["IMAGE_UPLOAD_EXPIRED", "IMAGE_UPLOAD_REJECTED"])(
  "starts over with a new upload URL after %s",
  async (code) => {
    mockConfirm.mockRejectedValueOnce(createApiError("gone", { status: 422, code }));
    const { wrapper } = setup();
    const { result } = await renderHook(() => useSetAvatarMutation(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync(image)).resolves.toEqual(updatedUser);
    });

    expect(mockCreateUploadUrl).toHaveBeenCalledTimes(2);
    expect(mockConfirm).toHaveBeenLastCalledWith({ body: { uploadId: "upload-2" }, throwOnError: true });
  },
);

test("gives up after starting over once", async () => {
  mockConfirm.mockRejectedValue(createApiError("gone", { status: 422, code: "IMAGE_UPLOAD_EXPIRED" }));
  const { wrapper } = setup();
  const { result } = await renderHook(() => useSetAvatarMutation(), { wrapper });

  await act(async () => {
    await expect(result.current.mutateAsync(image)).rejects.toMatchObject({ code: "IMAGE_UPLOAD_EXPIRED" });
  });
  expect(mockCreateUploadUrl).toHaveBeenCalledTimes(2);
});

test("does not ask for an upload URL for a file over the size limit", async () => {
  mockFileSize = 5 * 1024 * 1024 + 1;
  const { wrapper } = setup();
  const { result } = await renderHook(() => useSetAvatarMutation(), { wrapper });

  await act(async () => {
    await expect(result.current.mutateAsync(image)).rejects.toMatchObject({ code: "IMAGE_INVALID_SIZE" });
  });
  expect(mockCreateUploadUrl).not.toHaveBeenCalled();
});

test("retries the confirm once when another device changed the avatar at the same time", async () => {
  mockConfirm.mockRejectedValueOnce(
    createApiError("changed", { status: 409, code: "AVATAR_CHANGED_CONCURRENTLY" }),
  );
  const { wrapper } = setup();
  const { result } = await renderHook(() => useSetAvatarMutation(), { wrapper });

  await act(async () => {
    await expect(result.current.mutateAsync(image)).resolves.toEqual(updatedUser);
  });
  expect(mockCreateUploadUrl).toHaveBeenCalledTimes(1);
  expect(mockConfirm).toHaveBeenCalledTimes(2);
});

test("refetches the user when the conflict survives the retry", async () => {
  mockConfirm.mockRejectedValue(
    createApiError("changed", { status: 409, code: "AVATAR_CHANGED_CONCURRENTLY" }),
  );
  mockFindMe.mockResolvedValue({ data: { data: updatedUser } });
  const { wrapper } = setup();
  const { result } = await renderHook(() => useSetAvatarMutation(), { wrapper });

  await act(async () => {
    await expect(result.current.mutateAsync(image)).rejects.toMatchObject({
      status: 409,
      code: "AVATAR_CHANGED_CONCURRENTLY",
    });
  });
  expect(mockFindMe).toHaveBeenCalledWith({ throwOnError: true });
  expect(mockUpdateUser).toHaveBeenCalledWith(updatedUser);
});

test("removing the avatar clears it on the stored user", async () => {
  mockRemove.mockResolvedValue({ data: undefined });
  const { client, wrapper } = setup();
  const { result } = await renderHook(() => useRemoveAvatarMutation(), { wrapper });

  await act(async () => {
    await result.current.mutateAsync();
  });

  const cleared = { ...user, details: { ...user.details, avatarUrl: null } };
  expect(mockRemove).toHaveBeenCalledWith({ throwOnError: true });
  expect(mockUpdateUser).toHaveBeenCalledWith(cleared);
  expect(client.getQueryData(profileKeys.me())).toEqual(cleared);
});
