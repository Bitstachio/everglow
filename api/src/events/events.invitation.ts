export const EVENT_INVITATION_BASE_URL = process.env.EVENT_INVITATION_BASE_URL ?? "https://events.everglow.app/invite";

export const buildInvitationUrl = (token: string): string => `${EVENT_INVITATION_BASE_URL}/${token}`;

export const extractInvitationToken = (input: string): string => {
  const trimmed = input.trim();

  if (!trimmed.includes("/")) {
    return trimmed;
  }

  try {
    const segment = new URL(trimmed).pathname.split("/").filter(Boolean).at(-1);
    return segment ?? trimmed;
  } catch {
    return trimmed.split("/").filter(Boolean).at(-1) ?? trimmed;
  }
};
