/**
 * Every public contact address, on the one domain the site is served from.
 * Each is a role alias the owner creates at the mail host; the people behind
 * an alias can change without the pages changing.
 */
export const CONTACTS = {
  /** General questions. */
  hello: "hello@everglow.social",
  /** Privacy questions and requests: access, correction, deletion. Quebec Law 25 and CCPA contact. */
  privacy: "privacy@everglow.social",
  /** Child safety (the Play Console child-safety contact) and takedown requests for intimate images. */
  safety: "safety@everglow.social",
  /** Law enforcement, preservation requests, legal process and the terms. */
  legal: "legal@everglow.social",
} as const;

export type ContactRole = keyof typeof CONTACTS;

/** An inline `[address](mailto:address)` link for legal copy (see `parseInlineLinks`). */
export const mailLink = (role: ContactRole) => `[${CONTACTS[role]}](mailto:${CONTACTS[role]})`;
