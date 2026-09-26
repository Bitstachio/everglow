import { Faq } from "@/components/sections/faq";
import { Hero } from "@/components/sections/hero";
import { How } from "@/components/sections/how";
import { SiteNav } from "@/components/ui/site-nav";
import { routing } from "@/i18n/routing";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

type HomePageProps = {
  params: Promise<{ locale: string }>;
};

const HomePage = async ({ params }: HomePageProps) => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  setRequestLocale(locale);

  return (
    <>
      <SiteNav />
      <main>
        <Hero />
        <How />
        <Faq />
      </main>
    </>
  );
};

export default HomePage;

export const generateStaticParams = () =>
  routing.locales.map((locale) => ({
    locale,
  }));
