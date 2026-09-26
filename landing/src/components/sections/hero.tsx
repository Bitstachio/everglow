import { HeroBackdrop } from "@/components/sections/hero-backdrop";
import { Container } from "@/components/ui/container";
import { getTranslations } from "next-intl/server";

export const Hero = async () => {
  const t = await getTranslations("common.hero");

  return (
    <section className="relative flex min-h-screen items-center overflow-hidden">
      <HeroBackdrop />
      <Container className="relative z-10 pt-28 pb-24 sm:pt-32">
        <div className="hero-enter max-w-xl md:max-w-lg lg:max-w-xl">
          <h1 className="font-display text-strong text-5xl font-semibold tracking-tight sm:text-6xl md:text-7xl">
            {t("brand")}
          </h1>
          <p className="text-strong mt-7 text-2xl font-medium tracking-tight sm:mt-8 sm:text-3xl">{t("headline")}</p>
          <p className="text-muted mt-5 max-w-md text-lg leading-relaxed sm:text-xl">{t("body")}</p>
        </div>
      </Container>
    </section>
  );
};
