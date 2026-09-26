import { Container } from "@/components/ui/container";
import { FaqItem } from "@/components/ui/faq-item";
import { getTranslations } from "next-intl/server";

const FAQ_KEYS = ["cameraRoll", "join", "others", "ios"] as const;

export const Faq = async () => {
  const t = await getTranslations("faq");

  return (
    <section id="faq" className="scroll-mt-28 border-t border-border">
      <Container className="py-24 sm:py-32">
        <h2 className="text-strong max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">{t("headline")}</h2>
        <div className="mt-10 sm:mt-12">
          {FAQ_KEYS.map((key) => (
            <FaqItem key={key} question={t(`items.${key}.q`)} answer={t(`items.${key}.a`)} />
          ))}
        </div>
      </Container>
    </section>
  );
};
