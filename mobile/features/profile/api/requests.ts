import api from "@/lib/api";
import type { ApiEnvelope } from "@/lib/api/envelope";
import { unwrapEnvelope } from "@/lib/api/envelope";
import type { UpdateUserDto, UserResponseDto } from "../types";

export const updateProfile = async (data: UpdateUserDto): Promise<UserResponseDto> => {
  const { data: body } = await api.patch<ApiEnvelope<UserResponseDto>>("/users/me", data);
  return unwrapEnvelope(body);
};

export const deleteProfile = async (): Promise<void> => await api.delete("/users/me");
