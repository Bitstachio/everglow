import { LegalDocumentView } from "@/components/sections/legal-document";
import { LocalePageProps, legalPageMetadata, legalStaticParams, resolveLegalPage } from "@/lib/legal-page";

const ChildSafetyPage = async (props: LocalePageProps) => {
  const { locale, document } = await resolveLegalPage(props, "child-safety");
  return <LegalDocumentView locale={locale} document={document} />;
};

export default ChildSafetyPage;

export const generateMetadata = legalPageMetadata("child-safety");

export const generateStaticParams = legalStaticParams;
