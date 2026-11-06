import { LegalDocumentView } from "@/components/sections/legal-document";
import { LocalePageProps, legalPageMetadata, legalStaticParams, resolveLegalPage } from "@/lib/legal-page";

const PrivacyPage = async (props: LocalePageProps) => {
  const { locale, document } = await resolveLegalPage(props, "privacy");
  return <LegalDocumentView locale={locale} document={document} />;
};

export default PrivacyPage;

export const generateMetadata = legalPageMetadata("privacy");

export const generateStaticParams = legalStaticParams;
