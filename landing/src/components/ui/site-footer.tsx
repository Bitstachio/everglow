import { Container } from "@/components/ui/container";
import { EdgeLabel } from "@/components/ui/edge-label";
import { Link } from "@/i18n/navigation";
import { LEGAL_DOCUMENT_IDS } from "@/lib/legal-documents";
import { getTranslations } from "next-intl/server";

export const SiteFooter = async () => {
  const t = await getTranslations("common.footer");

  return (
    <footer className="mt-24">
      <Container className="border-strong flex flex-col gap-4 border-t-2 pt-4.5 pb-18">
        <nav aria-label={t("legalAriaLabel")}>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {LEGAL_DOCUMENT_IDS.map((id) => (
              <li key={id}>
                <Link href={`/${id}`} className="text-edge hover:text-strong no-underline">
                  <EdgeLabel>{t(`legal.${id}`)}</EdgeLabel>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <EdgeLabel className="text-edge">{t("copyright")}</EdgeLabel>
          <a href={`mailto:${t("contact")}`} className="text-edge hover:text-strong no-underline">
            <EdgeLabel>{t("contact")}</EdgeLabel>
          </a>
        </div>
      </Container>
    </footer>
  );
};
