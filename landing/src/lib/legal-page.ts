import { routing } from "@/i18n/routing";
import { LegalDocumentId, loadLegalDocument } from "@/lib/legal-documents";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

export type LocalePageProps = {
  params: Promise<{ locale: string }>;
};

/** The locale and document for a legal route; unknown locales are a 404. */
export const resolveLegalPage = async ({ params }: LocalePageProps, id: LegalDocumentId) => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return { locale, document: await loadLegalDocument(locale, id) };
};

export const legalPageMetadata =
  (id: LegalDocumentId) =>
  async ({ params }: LocalePageProps): Promise<Metadata> => {
    const { locale } = await params;
    const normalized = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
    const document = await loadLegalDocument(normalized, id);
    return { title: `${document.title} · Everglow`, description: document.description };
  };

export const legalStaticParams = () => routing.locales.map((locale) => ({ locale }));
