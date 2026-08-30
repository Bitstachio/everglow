import { usersControllerCompleteOnboarding, usersControllerFindMe } from "@/lib/api/generated";
import type { CreateUserDetailsDto, UserResponseDto } from "@/lib/api/generated";
import { unwrapEnvelope } from "@/lib/api/envelope";

export type User = UserResponseDto;
export type OnboardingData = CreateUserDetailsDto;

class AuthService {
  async getUserProfile(): Promise<User | null> {
    try {
      const { data } = await usersControllerFindMe({ throwOnError: true });
      return unwrapEnvelope(data);
    } catch (error) {
      console.error("Get user profile error:", error);
      return null;
    }
  }

  async completeOnboarding(data: OnboardingData): Promise<User> {
    const { data: body } = await usersControllerCompleteOnboarding({ body: data, throwOnError: true });
    return unwrapEnvelope(body);
  }
}

export const authService = new AuthService();
