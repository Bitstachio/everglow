import { SafeAreaView } from "@/components/ui/safe-area-view";
import { LegalDocument } from "../components/legal-document";
import { LEGAL_LAST_UPDATED, PRIVACY_POLICY_INTRO, PRIVACY_POLICY_SECTIONS } from "../legal-content";

const PrivacyPolicyScreen = () => (
  <SafeAreaView className="flex-1 bg-background" edges={["left", "right", "bottom"]}>
    <LegalDocument intro={PRIVACY_POLICY_INTRO} lastUpdated={LEGAL_LAST_UPDATED} sections={PRIVACY_POLICY_SECTIONS} />
  </SafeAreaView>
);

export default PrivacyPolicyScreen;
