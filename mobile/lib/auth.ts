import { usersControllerCompleteOnboarding, usersControllerFindMe } from "@/lib/api/generated";
import type { CreateUserDetailsDto, UserResponseDto } from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";

export type User = UserResponseDto;
export type OnboardingData = CreateUserDetailsDto;

export const authService = {
  getUserProfile: async (): Promise<User | null> => {
    try {
      const { data } = await usersControllerFindMe({ throwOnError: true });
      return unwrapEnvelope(data);
    } catch (error) {
      console.error("Get user profile error:", error);
      return null;
    }
  },

  completeOnboarding: async (data: OnboardingData): Promise<User> => {
    const { data: body } = await usersControllerCompleteOnboarding({ body: data, throwOnError: true });
    return unwrapEnvelope(body);
  },
};
