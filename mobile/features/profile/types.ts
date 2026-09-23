import type { UsersControllerRemoveMeData } from "@/lib/api/generated";

export type {
  UserStorageResponseDto,
  UpdateUserDto,
  UserDetailsResponseDto,
  UserResponseDto,
} from "@/lib/api/generated";

export type DeleteAccountPhotoPolicy = UsersControllerRemoveMeData["query"]["photos"];
