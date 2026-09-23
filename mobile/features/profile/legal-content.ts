import type { LegalSection } from "./components/legal-document";

export const LEGAL_LAST_UPDATED = "September 22, 2026";

export const PRIVACY_POLICY_INTRO =
  "Everglow lets you share photos inside private events. This policy explains what we collect, why we collect it, and the choices you have.";

export const PRIVACY_POLICY_SECTIONS: LegalSection[] = [
  {
    heading: "Information we collect",
    body: "We collect the account details you provide — your display name, username, and email address — along with the photos you upload and the events you create or join. Your sign-in credentials are handled by our authentication provider and are never stored by Everglow.",
  },
  {
    heading: "How we use your information",
    body: "We use your information to run the app: authenticating you, showing your events, delivering your photos to the people you shared them with, and measuring your storage usage. We do not sell your personal information or use your photos to train models.",
  },
  {
    heading: "Who can see your photos",
    body: "Photos are visible to members of the event you uploaded them to. Anyone you invite to an event can view and download the photos shared there, so only invite people you trust with that content.",
  },
  {
    heading: "Data retention",
    body: "We keep your account data for as long as your account is active. When you delete your account you choose whether your uploaded photos stay in shared events or are removed from them. Deleted content is purged from our systems shortly afterward.",
  },
  {
    heading: "Your choices",
    body: "You can edit your profile details, review your storage usage, and delete your account at any time from Account Settings. Deleting your account is permanent and cannot be undone.",
  },
  {
    heading: "Contact us",
    body: "If you have questions about this policy or about the data we hold, reach us at privacy@everglow.app.",
  },
];

export const TERMS_OF_USE_INTRO =
  "These terms are the agreement between you and Everglow. By creating an account or using the app, you agree to them.";

export const TERMS_OF_USE_SECTIONS: LegalSection[] = [
  {
    heading: "Your account",
    body: "You must provide accurate information when creating an account and keep your sign-in credentials secure. You are responsible for the activity that happens under your account.",
  },
  {
    heading: "Acceptable use",
    body: "Do not upload content you do not have the right to share, and do not use Everglow to harass others, share unlawful material, or attempt to access accounts or events you were not invited to.",
  },
  {
    heading: "Your content",
    body: "You keep ownership of the photos you upload. You grant Everglow the limited permission needed to store your photos and display them to the members of the events you share them with.",
  },
  {
    heading: "Events and invitations",
    body: "Event creators control who is invited. When you join an event you can view the photos shared there, and other members can view the photos you add. Removing yourself from an event does not retract photos already shared with its members.",
  },
  {
    heading: "Service availability",
    body: "We work to keep Everglow running reliably, but the app is provided as is, without warranties. Features may change, and we may suspend accounts that violate these terms.",
  },
  {
    heading: "Changes to these terms",
    body: "We may update these terms as the product evolves. Continued use of the app after an update means you accept the revised terms.",
  },
];
