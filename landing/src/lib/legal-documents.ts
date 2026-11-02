import type { Locale } from "@/i18n/config";

/**
 * The legal pages: each a document per locale under `src/messages/<locale>/legal/`.
 * The order is the footer's order.
 */
export const LEGAL_DOCUMENT_IDS = ["privacy", "terms", "child-safety", "takedown", "law-enforcement"] as const;

export type LegalDocumentId = (typeof LEGAL_DOCUMENT_IDS)[number];

/**
 * Text may carry `[label](href)` links: `/terms` for another page, `mailto:` or `https:` for the rest.
 *
 * `pending` marks text that depends on an open legal decision. The page shows a
 * visible "Pending review" note next to it; the string says what is open, for
 * the reviewer, and is kept in a `data-pending` attribute.
 */
export type LegalBlock =
  | { kind: "p"; text: string; pending?: string }
  | { kind: "list"; items: string[]; pending?: string }
  | { kind: "table"; caption: string; head: string[]; rows: string[][]; pending?: string };

export type LegalSection = {
  /** Anchor on the page: `/privacy#retention`. */
  id: string;
  /**
   * The doc section, code or issue the text comes from, so a later change there
   * can find the copy to update. Rendered as `data-source` on the section.
   */
  source: string;
  heading: string;
  pending?: string;
  blocks: LegalBlock[];
};

export type LegalDocument = {
  title: string;
  /** The page's meta description. */
  description: string;
  /** ISO date of the last change to the text. */
  updated: string;
  intro: string[];
  sections: LegalSection[];
};

type DocumentLoader = () => Promise<{ default: LegalDocument }>;

// Typed against every locale, so a new locale can't ship without its legal pages.
const LOADERS: Record<Locale, Record<LegalDocumentId, DocumentLoader>> = {
  en: {
    privacy: () => import("@/messages/en/legal/privacy"),
    terms: () => import("@/messages/en/legal/terms"),
    "child-safety": () => import("@/messages/en/legal/child-safety"),
    takedown: () => import("@/messages/en/legal/takedown"),
    "law-enforcement": () => import("@/messages/en/legal/law-enforcement"),
  },
};

export const loadLegalDocument = async (locale: Locale, id: LegalDocumentId) => (await LOADERS[locale][id]()).default;

export const formatLegalDate = (locale: Locale, isoDate: string) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${isoDate}T00:00:00Z`));
