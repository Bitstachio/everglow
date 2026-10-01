import type { UsersControllerRemoveMeData } from "@/lib/api/generated";

export type {
  PasswordChangeTicketResponseDto,
  UpdateUserDto,
  UserDetailsResponseDto,
  UserResponseDto,
  UsernameAvailabilityResponseDto,
} from "@/lib/api/generated";

export type DeleteAccountPhotoPolicy = UsersControllerRemoveMeData["query"]["photos"];
