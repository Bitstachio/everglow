import api from "@/lib/api";
import type { AvatarUploadPayload, ProfileUser, UpdateProfilePayload } from "../types/profile";

const extractErrorMessage = (error: unknown): string => {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { message?: string | string[]; error?: string } } }).response;
    const message = response?.data?.message || response?.data?.error || "An error occurred";
    return Array.isArray(message) ? message.join(", ") : message;
  }

  if (typeof error === "object" && error !== null && "request" in error) {
    return "Network error. Please check your connection.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred";
};

export class ProfileApiError extends Error {
  readonly name = "ProfileApiError";

  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const wrapRequest = async <T>(request: () => Promise<T>): Promise<T> => {
  try {
    return await request();
  } catch (error) {
    throw new ProfileApiError(extractErrorMessage(error));
  }
};

export const getProfile = async (): Promise<ProfileUser> =>
  wrapRequest(async () => {
    const response = await api.get("/users/me");
    return response.data.data;
  });

export const updateProfile = async (payload: UpdateProfilePayload): Promise<ProfileUser> =>
  wrapRequest(async () => {
    const response = await api.patch("/users/me", payload);
    return response.data.data;
  });

export const deleteAccount = async (): Promise<void> =>
  wrapRequest(async () => {
    await api.delete("/users/me");
  });

export const uploadAvatar = async ({ uri, fileName, mimeType }: AvatarUploadPayload): Promise<ProfileUser> =>
  wrapRequest(async () => {
    const formData = new FormData();
    formData.append("avatar", {
      uri,
      type: mimeType,
      name: fileName,
    } as unknown as Blob);

    const response = await api.post("/users/me/avatar", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data.data;
  });

export const deleteAvatar = async (): Promise<ProfileUser> =>
  wrapRequest(async () => {
    const response = await api.delete("/users/me/avatar");
    return response.data.data;
  });
