import { LegalDocumentView } from "@/components/sections/legal-document";
import { LocalePageProps, legalPageMetadata, legalStaticParams, resolveLegalPage } from "@/lib/legal-page";

const TermsPage = async (props: LocalePageProps) => {
  const { locale, document } = await resolveLegalPage(props, "terms");
  return <LegalDocumentView locale={locale} document={document} />;
};

export default TermsPage;

export const generateMetadata = legalPageMetadata("terms");

export const generateStaticParams = legalStaticParams;
