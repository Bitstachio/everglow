import { SafeAreaView } from "@/components/ui/safe-area-view";
import { LegalDocument } from "../components/legal-document";
import { LEGAL_LAST_UPDATED, TERMS_OF_USE_INTRO, TERMS_OF_USE_SECTIONS } from "../legal-content";

const TermsOfUseScreen = () => (
  <SafeAreaView className="flex-1 bg-background" edges={["left", "right", "bottom"]}>
    <LegalDocument intro={TERMS_OF_USE_INTRO} lastUpdated={LEGAL_LAST_UPDATED} sections={TERMS_OF_USE_SECTIONS} />
  </SafeAreaView>
);

export default TermsOfUseScreen;
