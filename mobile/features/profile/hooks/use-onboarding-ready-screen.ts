import { router } from "expo-router";
import { useLabCard } from "./use-lab-card";

/** 02.9 Lab card ready: the finished card, stamped, then on to Home. */
export const useOnboardingReadyScreen = () => {
  const { card, firstName } = useLabCard();
  return { card, firstName, onGo: () => router.replace("/events") };
};
