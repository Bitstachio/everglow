import { Container } from "@/components/ui/container";
import { EdgeLabel } from "@/components/ui/edge-label";
import { getTranslations } from "next-intl/server";

const STEP_KEYS = [0, 1, 2, 3] as const;

export const Usual = async () => {
  const t = await getTranslations("usual");

  return (
    <section id="usual" className="scroll-mt-[var(--film-nav-h)] pt-24">
      <Container className="grid gap-6 md:grid-cols-2 md:gap-16">
        <div>
          <EdgeLabel className="text-edge mb-3 block">{t("eyebrow")}</EdgeLabel>
          <h2 className="font-display text-strong text-[clamp(2rem,4vw,2.75rem)] leading-none font-semibold tracking-[-0.035em]">
            {t("headline")}
          </h2>
        </div>
        <ol className="border-strong border-t-2">
          {STEP_KEYS.map((i) => (
            <li
              key={i}
              className="border-border-muted grid grid-cols-[48px_1fr] border-b py-4 text-[17px] leading-[1.55]"
            >
              <EdgeLabel className="text-edge leading-[26px]">
                {String(i + 1).padStart(2, "0")}
              </EdgeLabel>
              <span>{t(`steps.${i}`)}</span>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  );
};
