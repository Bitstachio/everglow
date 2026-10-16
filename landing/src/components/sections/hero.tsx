import { BrandMark } from "@/components/ui/brand-mark";
import { Container } from "@/components/ui/container";
import { EdgeLabel } from "@/components/ui/edge-label";
import { LeaderButton } from "@/components/ui/leader-button";
import { PencilUnderline } from "@/components/ui/pencil-underline";
import { getTranslations } from "next-intl/server";
import Image from "next/image";

/** Fills the opening viewport above the film-strip nav. */
export const Hero = async () => {
  const t = await getTranslations("common.hero");

  return (
    <section id="home" className="flex min-h-0 flex-1 flex-col">
      <Container className="grid min-h-0 flex-1 items-center gap-8 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:items-stretch md:gap-6 md:py-5 lg:gap-8">
        <div className="hero-enter flex min-w-0 flex-col justify-center">
          <BrandMark className="font-display text-[clamp(1.75rem,3.5vw,2.5rem)] leading-none font-semibold tracking-[-0.03em]">
            {t("brand")}
          </BrandMark>
          <EdgeLabel className="text-edge mt-5 mb-4 block sm:mt-6 sm:mb-5">{t("eyebrow")}</EdgeLabel>
          <h1 className="font-display text-strong max-w-[11ch] text-[clamp(2.25rem,6.5vw,4.75rem)] leading-[0.95] font-semibold tracking-[-0.045em]">
            {t("headlineBefore")}{" "}
            <PencilUnderline>{t("headlineMark")}</PencilUnderline>
          </h1>
          <p className="text-muted mt-4 max-w-[54ch] text-base leading-[1.55] sm:mt-5 sm:text-lg md:text-xl">
            {t("body")}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-4 sm:mt-7 sm:gap-5">
            <LeaderButton href="#start" className="min-h-12 px-6 sm:min-h-[58px] sm:px-8">
              {t("cta")}
            </LeaderButton>
            <span className="font-hand text-pencil text-[1.5rem] leading-none sm:text-[1.75rem]">{t("note")}</span>
          </div>
        </div>
        <div className="relative hidden min-h-0 md:block">
          <Image
            src="/design/hero-phone.jpg"
            alt={t("imageAlt")}
            width={600}
            height={1200}
            priority
            className="border-border absolute top-0 left-1/2 h-full w-auto max-w-full -translate-x-1/2 rounded-[36px] object-contain shadow-[0_0_0_1px_var(--border-default)] lg:rounded-[40px]"
            sizes="(min-width: 1024px) 45vw, 42vw"
          />
        </div>
      </Container>
    </section>
  );
};
