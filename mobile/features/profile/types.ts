import type { UsersControllerRemoveMeData } from "@/lib/api/generated";

export type { UpdateUserDto, UserDetailsResponseDto, UserResponseDto } from "@/lib/api/generated";

export type DeleteAccountPhotoPolicy = UsersControllerRemoveMeData["query"]["photos"];
