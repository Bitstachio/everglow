import { routing } from "@/i18n/routing";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

type HomePageProps = {
  params: Promise<{ locale: string }>;
};

const HomePage = async ({ params }: HomePageProps) => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);
  const t = await getTranslations("common.hero");

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-24">
      <h1 className="text-strong text-5xl font-bold tracking-tight sm:text-6xl">{t("brand")}</h1>
      <p className="text-strong mt-6 text-2xl font-medium tracking-tight">{t("headline")}</p>
      <p className="text-foreground mt-4 max-w-xl text-lg leading-relaxed">{t("body")}</p>
    </main>
  );
};

export default HomePage;

export const generateStaticParams = () =>
  routing.locales.map((locale) => ({
    locale,
  }));
