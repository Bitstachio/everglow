import { LegalDocumentView } from "@/components/sections/legal-document";
import { LocalePageProps, legalPageMetadata, legalStaticParams, resolveLegalPage } from "@/lib/legal-page";

const TakedownPage = async (props: LocalePageProps) => {
  const { locale, document } = await resolveLegalPage(props, "takedown");
  return <LegalDocumentView locale={locale} document={document} />;
};

export default TakedownPage;

export const generateMetadata = legalPageMetadata("takedown");

export const generateStaticParams = legalStaticParams;
