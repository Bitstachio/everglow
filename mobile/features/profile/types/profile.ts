import type { User } from "@/lib/auth";

export type ProfileUser = User;

export type UpdateProfilePayload = {
  name?: string;
  email?: string;
};

export type AvatarUploadPayload = {
  uri: string;
  fileName: string;
  mimeType: string;
};
