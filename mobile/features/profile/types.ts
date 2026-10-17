import type { UsersControllerRemoveMeData } from "@/lib/api/generated";

export type {
  BlockedUserResponseDto,
  PasswordChangeTicketResponseDto,
  UpdateUserDto,
  UserDetailsResponseDto,
  UserLimitsResponseDto,
  UserResponseDto,
  UsernameAvailabilityResponseDto,
} from "@/lib/api/generated";

export type DeleteAccountPhotoPolicy = UsersControllerRemoveMeData["query"]["photos"];
