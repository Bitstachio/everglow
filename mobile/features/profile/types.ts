import type { UsersControllerRemoveMeData } from "@/lib/api/generated";

export type {
  PasswordChangeTicketResponseDto,
  UserStorageResponseDto,
  UpdateUserDto,
  UserDetailsResponseDto,
  UserResponseDto,
} from "@/lib/api/generated";

export type DeleteAccountPhotoPolicy = UsersControllerRemoveMeData["query"]["photos"];
