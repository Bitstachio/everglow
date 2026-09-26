import type { Metadata } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ReactNode } from "react";
import { isRtlLocale, Locale } from "@/i18n/config";
import { routing } from "@/i18n/routing";

type LocaleLayoutProps = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export const generateMetadata = async ({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> => {
  const { locale } = await params;
  const normalizedLocale: Locale = hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
  const t = await getTranslations({ locale: normalizedLocale, namespace: "common.metadata" });

  return {
    title: t("title"),
    description: t("description"),
  };
};

const LocaleLayout = async ({ children, params }: LocaleLayoutProps) => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const messages = await getMessages({ locale });

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div lang={locale} dir={isRtlLocale(locale) ? "rtl" : "ltr"}>
        {children}
      </div>
    </NextIntlClientProvider>
  );
};

export default LocaleLayout;
