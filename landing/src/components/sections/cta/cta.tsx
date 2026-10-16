import { Container } from "@/components/ui/container";
import { EdgeLabel } from "@/components/ui/edge-label";
import { getTranslations } from "next-intl/server";
import { WaitlistForm } from "./waitlist-form";

export const Cta = async () => {
  const t = await getTranslations("cta");

  return (
    <section id="start" className="scroll-mt-[var(--film-nav-h)] pt-28">
      <Container>
        <h2 className="font-display text-strong max-w-[14ch] text-[clamp(2.5rem,6vw,4.75rem)] leading-[0.98] font-semibold tracking-[-0.04em]">
          {t("headline")}
        </h2>
        <WaitlistForm
          emailLabel={t("emailLabel")}
          emailPlaceholder={t("emailPlaceholder")}
          button={t("button")}
          submitting={t("submitting")}
          consent={t("consent")}
          copy={{
            invalidEmail: t("invalidEmail"),
            notConfigured: t("notConfigured"),
            error: t("error"),
            success: t("success"),
          }}
        />
        <EdgeLabel className="text-edge mt-6 block">{t("stores")}</EdgeLabel>
      </Container>
    </section>
  );
};
