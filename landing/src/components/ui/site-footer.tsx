import { Container } from "@/components/ui/container";
import { getTranslations } from "next-intl/server";

export const SiteFooter = async () => {
  const t = await getTranslations("common.footer");

  return (
    <footer className="border-t border-border">
      <Container className="flex items-center justify-center py-10 sm:py-12">
        <p className="text-muted text-sm tracking-tight">{t("copyright")}</p>
      </Container>
    </footer>
  );
};
