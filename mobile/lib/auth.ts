import api from "./api";

export interface UserDetails {
  name: string;
  email: string;
  avatarUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// Mirrors the backend UserResponseDto (api/src/users/dto/user-response.dto.ts).
// A freshly provisioned Auth0 user has `isOnboarded: false` and `details: null`
// until they complete onboarding.
export interface User {
  id: string;
  isOnboarded: boolean;
  details: UserDetails | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface OnboardingData {
  name: string;
  email: string;
}

class AuthService {
  async getUserProfile(): Promise<User | null> {
    try {
      const response = await api.get("/users/me");
      return response.data.data;
    } catch (error) {
      console.error("Get user profile error:", error);
      return null;
    }
  }

  async completeOnboarding(data: OnboardingData): Promise<User> {
    try {
      const response = await api.post("/users/me/onboarding", data);
      return response.data.data;
    } catch (error: unknown) {
      throw this.handleError(error);
    }
  }

  private handleError(error: any): Error {
    if (error.response) {
      const message = error.response.data?.message || error.response.data?.error || "An error occurred";
      return new Error(Array.isArray(message) ? message.join(", ") : message);
    } else if (error.request) {
      return new Error("Network error. Please check your connection.");
    }
    return new Error(error?.message || "An unexpected error occurred");
  }
}

export const authService = new AuthService();
