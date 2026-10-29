import { routeForIncomingLink } from "@/features/events/lib/invite";

/**
 * Links that open the app. Invite links land on the envelope (chapter 06),
 * whichever path they use; everything else, the Auth0 callback included,
 * goes where Expo Router would send it.
 */
export const redirectSystemPath = ({ path }: { path: string; initial: boolean }): string => routeForIncomingLink(path);
