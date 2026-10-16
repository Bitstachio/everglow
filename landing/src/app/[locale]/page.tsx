import { Cta } from "@/components/sections/cta";
import { Faq } from "@/components/sections/faq";
import { Gone } from "@/components/sections/gone";
import { Hero } from "@/components/sections/hero";
import { PhotoStrip } from "@/components/sections/photo-strip";
import { Usual } from "@/components/sections/usual";
import { What } from "@/components/sections/what/what";
import { SiteFooter } from "@/components/ui/site-footer";
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
      {/* Hero fills the fold; film-strip sits on the bottom edge */}
      <div className="flex h-[calc(100svh-var(--film-nav-h))] flex-col">
        <Hero />
      </div>
      {/* Sibling so sticky works for the rest of the page */}
      <SiteNav />
      {/* Bottom pad so every section (incl. Start) can scroll under the sticky nav */}
      <main className="pb-[45svh]">
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
