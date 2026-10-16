import { Container } from "@/components/ui/container";
import { EdgeLabel } from "@/components/ui/edge-label";
import { LeaderButton } from "@/components/ui/leader-button";
import { PencilUnderline } from "@/components/ui/pencil-underline";
import { getTranslations } from "next-intl/server";
import Image from "next/image";

export const Hero = async () => {
  const t = await getTranslations("common.hero");

  return (
    <section id="home" className="scroll-mt-24">
      <Container className="grid items-center gap-10 py-12 md:grid-cols-2 md:gap-14 md:py-16 lg:gap-14">
        <div className="hero-enter">
          <EdgeLabel className="text-edge mb-5 block">{t("eyebrow")}</EdgeLabel>
          <h1 className="font-display text-strong max-w-[11ch] text-[clamp(3rem,8.5vw,6.75rem)] leading-[0.95] font-semibold tracking-[-0.045em]">
            {t("headlineBefore")}{" "}
            <PencilUnderline>{t("headlineMark")}</PencilUnderline>
          </h1>
          <p className="text-muted mt-7 max-w-[54ch] text-xl leading-[1.55]">{t("body")}</p>
          <div className="mt-9 flex flex-wrap items-center gap-5">
            <LeaderButton href="#start">{t("cta")}</LeaderButton>
            <span className="font-hand text-pencil text-[1.75rem] leading-none">{t("note")}</span>
          </div>
        </div>
        <div className="justify-self-center">
          <Image
            src="/design/hero-phone.jpg"
            alt={t("imageAlt")}
            width={600}
            height={1200}
            priority
            className="border-border block w-full max-w-[300px] rounded-[40px] shadow-[0_0_0_1px_var(--border-default)]"
            sizes="300px"
          />
        </div>
      </Container>
    </section>
  );
};
