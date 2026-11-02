import type { UsersControllerRemoveMeData } from "@/lib/api/generated";

export type {
  AccountDeletionEventOutcome,
  AccountDeletionPreviewResponseDto,
  BlockedUserResponseDto,
  PasswordChangeTicketResponseDto,
  UpdateUserDto,
  UserDetailsResponseDto,
  UserLimitsResponseDto,
  UserResponseDto,
  UsernameAvailabilityResponseDto,
} from "@/lib/api/generated";

export type DeleteAccountPhotoPolicy = UsersControllerRemoveMeData["query"]["photos"];
