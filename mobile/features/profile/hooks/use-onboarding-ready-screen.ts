import { useBlockHardwareBack } from "@/hooks/use-block-hardware-back";
import { takeLandingRoute } from "@/lib/pending-invite";
import { router } from "expo-router";
import { useLabCard } from "./use-lab-card";

/**
 * 02.9 Lab card ready: the finished card, stamped, then on to Home, or to the
 * envelope that brought them (06.3). Android's system back stays here too.
 */
export const useOnboardingReadyScreen = () => {
  const { card, firstName } = useLabCard();
  useBlockHardwareBack();
  return { card, firstName, onGo: () => router.replace(takeLandingRoute()) };
};
