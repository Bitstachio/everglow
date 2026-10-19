import { takeLandingRoute } from "@/lib/pending-invite";
import { router } from "expo-router";
import { useLabCard } from "./use-lab-card";

/** 02.9 Lab card ready: the finished card, stamped, then on to Home, or to the envelope that brought them (06.3). */
export const useOnboardingReadyScreen = () => {
  const { card, firstName } = useLabCard();
  return { card, firstName, onGo: () => router.replace(takeLandingRoute()) };
};
