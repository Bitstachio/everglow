import { createContext, useContext, useState, type ReactNode } from "react";
import { useAuth0 } from "react-native-auth0";

type OnboardingDraft = {
  name: string;
  username: string;
  acceptedTerms: boolean;
  setName: (name: string) => void;
  setUsername: (username: string) => void;
  setAcceptedTerms: (accepted: boolean) => void;
};

const OnboardingDraftContext = createContext<OnboardingDraft | null>(null);

/** Auth0 fills `name` with the email for email sign-ups; that is no name to sign frames with. */
const nameFromIdentity = (name: string | undefined) => (name && !name.includes("@") ? name : "");

/**
 * What the person has typed across the onboarding steps. The API takes name,
 * username and accepted terms in one request, so the steps share them here
 * until step 2 submits.
 */
export const OnboardingDraftProvider = ({
  children,
  initial,
}: {
  children: ReactNode;
  /** Starting values, for previews in the design kit. */
  initial?: Partial<Pick<OnboardingDraft, "name" | "username" | "acceptedTerms">>;
}) => {
  const { user } = useAuth0();
  const [name, setName] = useState(() => initial?.name ?? nameFromIdentity(user?.name));
  const [username, setUsername] = useState(initial?.username ?? "");
  const [acceptedTerms, setAcceptedTerms] = useState(initial?.acceptedTerms ?? false);

  return (
    <OnboardingDraftContext.Provider value={{ name, username, acceptedTerms, setName, setUsername, setAcceptedTerms }}>
      {children}
    </OnboardingDraftContext.Provider>
  );
};

export const useOnboardingDraft = (): OnboardingDraft => {
  const draft = useContext(OnboardingDraftContext);
  if (!draft) throw new Error("useOnboardingDraft must be used inside OnboardingDraftProvider");
  return draft;
};
