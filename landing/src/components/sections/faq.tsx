import { Container } from "@/components/ui/container";
import { EdgeLabel } from "@/components/ui/edge-label";
import { FaqItem } from "@/components/ui/faq-item";
import { getTranslations } from "next-intl/server";

const FAQ_KEYS = ["cameraRoll", "join", "others"] as const;

/** Single-column accordion — not a title/answers two-column split. */
export const Faq = async () => {
  const t = await getTranslations("faq");

  return (
    <section id="faq" className="scroll-mt-[var(--film-nav-h)] pt-24">
      <Container>
        <EdgeLabel className="text-edge mb-3 block">{t("eyebrow")}</EdgeLabel>
        <h2 className="font-display text-strong text-[clamp(2rem,4vw,2.75rem)] leading-none font-semibold tracking-[-0.035em]">
          {t("headline")}
        </h2>
        <div className="border-strong mt-8 border-t-2">
          {FAQ_KEYS.map((key) => (
            <FaqItem key={key} question={t(`items.${key}.q`)} answer={t(`items.${key}.a`)} />
          ))}
        </div>
      </Container>
    </section>
  );
};
