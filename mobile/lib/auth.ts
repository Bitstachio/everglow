import { usersControllerCompleteOnboarding, usersControllerFindMe } from "@/lib/api/generated";
import type { CreateUserDetailsDto, UserResponseDto } from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";
import { isConnectionError } from "@/lib/api/errors";

export type User = UserResponseDto;
export type OnboardingData = CreateUserDetailsDto;

export const authService = {
  /**
   * The signed-in person, or null when the API refuses. Throws when the API
   * can't be reached, so callers can offer to retry instead of signing out.
   */
  getUserProfile: async (): Promise<User | null> => {
    try {
      const { data } = await usersControllerFindMe({ throwOnError: true });
      return unwrapEnvelope(data);
    } catch (error) {
      if (isConnectionError(error)) throw error;
      console.error("Get user profile error:", error);
      return null;
    }
  },

  completeOnboarding: async (data: OnboardingData): Promise<User> => {
    const { data: body } = await usersControllerCompleteOnboarding({ body: data, throwOnError: true });
    return unwrapEnvelope(body);
  },
};
