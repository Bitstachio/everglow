import { Container } from "@/components/ui/container";
import { EdgeLabel } from "@/components/ui/edge-label";
import { LeaderButton } from "@/components/ui/leader-button";
import { getTranslations } from "next-intl/server";

const WAITLIST_URL = process.env.NEXT_PUBLIC_WAITLIST_URL ?? "#start";

export const Cta = async () => {
  const t = await getTranslations("cta");

  return (
    <section id="start" className="scroll-mt-16 pt-28">
      <Container>
        <h2 className="font-display text-strong max-w-[14ch] text-[clamp(2.5rem,6vw,4.75rem)] leading-[0.98] font-semibold tracking-[-0.04em]">
          {t("headline")}
        </h2>
        <div className="mt-8 flex flex-wrap items-center gap-5">
          <LeaderButton href={WAITLIST_URL}>{t("button")}</LeaderButton>
          <EdgeLabel className="text-edge">{t("stores")}</EdgeLabel>
        </div>
      </Container>
    </section>
  );
};
