import api from "@/lib/api";
import type { User } from "@/lib/auth";
import type { UpdateProfileData } from "../types";

const toApiError = (error: unknown): Error => {
  const err = error as {
    response?: { data?: { message?: string | string[]; error?: string } };
    request?: unknown;
    message?: string;
  };

  if (err.response) {
    const message = err.response.data?.message || err.response.data?.error || "An error occurred";
    return new Error(Array.isArray(message) ? message.join(", ") : message);
  }

  if (err.request) {
    return new Error("Network error. Please check your connection.");
  }

  return new Error(err.message || "An unexpected error occurred");
};

export const updateProfile = async (data: UpdateProfileData): Promise<User> => {
  try {
    const response = await api.patch("/users/me", data);
    return response.data.data;
  } catch (error) {
    throw toApiError(error);
  }
};

export const deleteProfile = async (): Promise<void> => {
  try {
    await api.delete("/users/me");
  } catch (error) {
    throw toApiError(error);
  }
};
