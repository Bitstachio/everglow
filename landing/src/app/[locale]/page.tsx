import { Cta } from "@/components/sections/cta";
import { Faq } from "@/components/sections/faq";
import { Gone } from "@/components/sections/gone";
import { Hero } from "@/components/sections/hero";
import { PhotoStrip } from "@/components/sections/photo-strip";
import { Usual } from "@/components/sections/usual";
import { What } from "@/components/sections/what/what";
import { SiteFooter } from "@/components/ui/site-footer";
import { SiteHeader } from "@/components/ui/site-header";
import { SiteNav } from "@/components/ui/site-nav/site-nav";
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
      <SiteHeader />
      <main>
        <Hero />
        <SiteNav />
        <PhotoStrip />
        <Usual />
        <What />
        <Gone />
        <Faq />
        <Cta />
      </main>
      <SiteFooter />
    </>
  );
};

export default HomePage;

export const generateStaticParams = () =>
  routing.locales.map((locale) => ({
    locale,
  }));
