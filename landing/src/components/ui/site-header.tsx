import { Container } from "@/components/ui/container";
import { EdgeLabel } from "@/components/ui/edge-label";
import { getTranslations } from "next-intl/server";

export const SiteHeader = async () => {
  const t = await getTranslations("common.header");

  return (
    <header className="border-border-muted border-b">
      <Container className="flex items-center justify-between py-7">
        <a href="#home" className="font-display text-strong text-2xl font-semibold tracking-[-0.03em] no-underline">
          {t("brand")}
        </a>
        <a href="#start" className="text-muted hover:text-strong py-3.5 no-underline">
          <EdgeLabel>{t("cta")}</EdgeLabel>
        </a>
      </Container>
    </header>
  );
};
