import api from "@/lib/api";
import type { UpdateUserDto, UserResponseDto } from "../types";

export const updateProfile = async (data: UpdateUserDto): Promise<UserResponseDto> =>
  (await api.patch("/users/me", data)).data.data;

export const deleteProfile = async (): Promise<void> => {
  await api.delete("/users/me");
};
