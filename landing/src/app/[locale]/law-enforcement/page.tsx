import { LegalDocumentView } from "@/components/sections/legal-document";
import { LocalePageProps, legalPageMetadata, legalStaticParams, resolveLegalPage } from "@/lib/legal-page";

const LawEnforcementPage = async (props: LocalePageProps) => {
  const { locale, document } = await resolveLegalPage(props, "law-enforcement");
  return <LegalDocumentView locale={locale} document={document} />;
};

export default LawEnforcementPage;

export const generateMetadata = legalPageMetadata("law-enforcement");

export const generateStaticParams = legalStaticParams;
