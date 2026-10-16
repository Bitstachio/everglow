import { Container } from "@/components/ui/container";
import { EdgeLabel } from "@/components/ui/edge-label";
import { getTranslations } from "next-intl/server";

export const Gone = async () => {
  const t = await getTranslations("gone");

  return (
    <section id="gone" className="scroll-mt-16 pt-24">
      <Container>
        <div className="bg-paper text-paper-ink grid items-start gap-6 p-6 sm:p-10 md:grid-cols-2 md:gap-14 md:p-14">
          <div>
            <EdgeLabel className="mb-3 block text-[#5c554d]">{t("eyebrow")}</EdgeLabel>
            <h2 className="font-display text-[clamp(2rem,4vw,2.75rem)] leading-none font-semibold tracking-[-0.035em]">
              {t("headline")}
            </h2>
          </div>
          <div>
            <p className="mb-3.5 text-lg leading-[1.55]">{t("body1")}</p>
            <p className="mb-3.5 text-lg leading-[1.55]">{t("body2")}</p>
            <span className="font-hand text-ink-blue text-[1.875rem] leading-none">{t("note")}</span>
          </div>
        </div>

        <div className="border-strong mt-24 grid gap-0 border-t-2 md:grid-cols-2 md:gap-8">
          <div className="py-5">
            <EdgeLabel className="text-strong -mt-[76px] mb-2.5 block">{t("is.label")}</EdgeLabel>
            <p className="text-muted m-0 leading-[1.55]">{t("is.body")}</p>
          </div>
          <div className="py-5">
            <EdgeLabel className="text-strong -mt-[76px] mb-2.5 block">{t("isnt.label")}</EdgeLabel>
            <p className="text-muted m-0 leading-[1.55]">
              <span className="decoration-pencil decoration-2 line-through">{t("isnt.strike")}</span> {t("isnt.body")}
            </p>
          </div>
        </div>
      </Container>
    </section>
  );
};
