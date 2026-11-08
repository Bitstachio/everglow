import { mailLink } from "@/lib/contacts";
import type { LegalDocument } from "@/lib/legal-documents";

// Each section's `source` names where its facts come from. Change the copy when that source changes.
const terms: LegalDocument = {
  title: "Terms of use",
  description: "The agreement between you and Everglow, including what is not allowed and what we do about it.",
  updated: "2026-11-02",
  intro: [
    "These terms are the agreement between you and Everglow. By creating an account or using the app, you agree to them, and to our [privacy policy](/privacy).",
  ],
  sections: [
    {
      id: "who-we-are",
      source: "docs/moderation.md (intro: launch markets)",
      heading: "Who we are",
      blocks: [
        {
          kind: "p",
          text: "Everglow is offered in Canada and the United States. “Everglow”, “we” and “us” mean the company that runs the app.",
          pending: "The legal entity's name and address, the governing law and how disputes are settled must be added.",
        },
      ],
    },
    {
      id: "age",
      source: "docs/moderation.md §10 (the minimum age is not decided)",
      heading: "Who can use Everglow",
      pending: "Placeholder until the minimum age is decided with the lawyer.",
      blocks: [
        {
          kind: "p",
          text: "Placeholder: the minimum age is not decided yet. You must be at least 13 to use Everglow, and in Quebec at least 14 or have a parent's consent.",
        },
      ],
    },
    {
      id: "your-account",
      source: "mobile/features/profile/legal-content.ts (Your account)",
      heading: "Your account",
      blocks: [
        {
          kind: "p",
          text: "Give accurate information when you create an account, and keep your sign-in secure. You are responsible for what happens under your account. You can delete it at any time in the app.",
        },
      ],
    },
    {
      id: "rolls",
      source:
        "docs/event-quotas.md (Free); docs/moderation.md §6 (invite links, removing a member); docs/photos-architecture.md §9, §12",
      heading: "Rolls, hosts and invitations",
      blocks: [
        {
          kind: "list",
          items: [
            "A host starts a roll and shares its invite link or code. Anyone with the link can join until the roll closes, so share it only with people you trust.",
            "Hosts can remove people from their roll, with or without the photos they added, and stop them from joining again. They can make another member a host.",
            "When you join a roll you can see the photos on it, and the other people on it can see the photos you add. They can save copies to their phones, and we can't take those copies back.",
            "A roll stays open for the length the host chose, or until a host closes it. Then no more photos can be added, and **its photos are removed**. Save the ones you want before it closes.",
            "The plan's limits, such as how many rolls you can have open and how much room each has, are shown in the app and may change.",
          ],
        },
      ],
    },
    {
      id: "your-content",
      source: "mobile/features/profile/legal-content.ts (Your content); docs/moderation.md §7 (Evidence)",
      heading: "Your photos",
      blocks: [
        {
          kind: "p",
          text: "You keep ownership of the photos you add. You give Everglow permission to store them, make previews of them, show them to the people on the roll you added them to, and keep a copy of a reported photo for as long as our [privacy policy](/privacy#retention) says. This permission ends when the photo is removed, except for those copies.",
        },
        {
          kind: "p",
          text: "Only add photos you have the right to share, and of people who would be fine with being shared on that roll.",
        },
      ],
    },
    {
      id: "not-allowed",
      source: "docs/moderation.md (intro: guideline 1.2), §2 (Reasons), §10",
      heading: "What is not allowed",
      blocks: [
        {
          kind: "p",
          text: "**We have no tolerance for objectionable content or abusive users.** Don't use Everglow to add, share or ask for:",
        },
        {
          kind: "list",
          items: [
            "**Child sexual abuse or exploitation.** Any image or content that sexualises a minor, and any attempt to groom, exploit or endanger a child. We remove it, suspend the account, and report it to the National Center for Missing & Exploited Children (NCMEC), Cybertip.ca and the police. See [Child safety](/child-safety).",
            "**Intimate images shared without consent**, or threats to share them. See [Takedown requests](/takedown).",
            "Nudity or sexual content.",
            "Harassment, bullying, threats, or hate against people for who they are.",
            "Violence or gore, or encouraging violence or self-harm.",
            "Anything illegal, or that you don't have the right to share.",
            "Spam, scams, or pretending to be someone else.",
          ],
        },
        {
          kind: "p",
          text: "Don't try to get into accounts or rolls you weren't invited to, collect other people's photos or details in bulk, or disrupt Everglow.",
        },
      ],
    },
    {
      id: "reporting",
      source: "docs/moderation.md (Who moderates), §2, §3, §6, §8",
      heading: "Reporting and blocking",
      blocks: [
        {
          kind: "list",
          items: [
            "You can report a photo, a person or a whole roll from the app. Hosts handle most reports on their roll first. Hosts never see who filed a report.",
            "Reports about a host, about a roll itself, and every report for child safety or an intimate image go only to Everglow. So does any report a host leaves for 24 hours.",
            "Our aim is to act within 24 hours of a report reaching us, and within 48 hours for an intimate image shared without consent.",
            "You can block anyone you share a roll with. You stop seeing each other's photos, and they aren't told.",
          ],
        },
      ],
    },
    {
      id: "enforcement",
      source: "docs/moderation.md §4, §5, §8; api/docs/moderation-runbook.md",
      heading: "What we do when the terms are broken",
      blocks: [
        {
          kind: "p",
          text: "Depending on what happened, a host or Everglow may hide or remove the content, remove the person from the roll and stop them from joining it again, pause or suspend the roll, or suspend the account everywhere. We report what the law asks us to report.",
        },
        {
          kind: "p",
          text: `A suspended account can still sign in to see that it is suspended, and to delete itself. If you think we got it wrong, write to ${mailLink("safety")}.`,
        },
        {
          kind: "p",
          text: "Deleting your account and signing in again with the same Apple or Google account doesn't lift a suspension or a ban from a roll.",
          pending: "Depends on the suspension and ban carry-over (EV-200, #276) being live at launch.",
        },
      ],
    },
    {
      id: "availability",
      source: "mobile/features/profile/legal-content.ts (Service availability)",
      heading: "The service",
      blocks: [
        {
          kind: "p",
          text: "We work to keep Everglow running reliably, but it is provided as is, without warranties. Features may change. Photos are removed when their roll closes, so don't use Everglow as your only copy of a photo.",
          pending:
            "Warranty disclaimer and limits of liability need the lawyer's wording, including Quebec consumer protection rules.",
        },
      ],
    },
    {
      id: "changes",
      source: "mobile/features/profile/legal-content.ts (Changes to these terms); docs/moderation.md §10",
      heading: "Changes to these terms",
      blocks: [
        {
          kind: "p",
          text: "We may update these terms as Everglow changes. We change the date at the top when we do. Using the app after an update means you accept the new terms.",
          pending:
            "Decide whether material changes need a new acceptance in the app (docs/moderation.md §10, versioned acceptance).",
        },
      ],
    },
    {
      id: "contact",
      source: "landing/src/lib/contacts.ts",
      heading: "Contact",
      blocks: [
        {
          kind: "list",
          items: [
            `Questions about these terms: ${mailLink("legal")}`,
            `Child safety and takedown requests: ${mailLink("safety")}`,
            `Privacy: ${mailLink("privacy")}`,
          ],
        },
      ],
    },
  ],
};

export default terms;
