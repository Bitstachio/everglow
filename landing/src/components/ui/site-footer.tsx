import { Container } from "@/components/ui/container";
import { EdgeLabel } from "@/components/ui/edge-label";
import { getTranslations } from "next-intl/server";

export const SiteFooter = async () => {
  const t = await getTranslations("common.footer");

  return (
    <footer className="mt-24">
      <Container className="border-strong flex flex-wrap items-center justify-between gap-2 border-t-2 pt-4.5 pb-18">
        <EdgeLabel className="text-edge">{t("copyright")}</EdgeLabel>
        <a href={`mailto:${t("contact")}`} className="text-edge hover:text-strong no-underline">
          <EdgeLabel>{t("contact")}</EdgeLabel>
        </a>
      </Container>
    </footer>
  );
};
