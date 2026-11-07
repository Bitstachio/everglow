import { CONTACTS, mailLink } from "@/lib/contacts";
import type { LegalDocument } from "@/lib/legal-documents";

// Each section's `source` names where its facts come from. Change the copy when that source changes.
const childSafety: LegalDocument = {
  title: "Child safety standards",
  description:
    "Everglow's standards against child sexual abuse and exploitation, how to report it, and what we do when we find it.",
  updated: "2026-11-02",
  intro: [
    "Everglow does not allow child sexual abuse or exploitation, in any form. This page sets out our standards, how to report a concern, what we do with a report, and who to contact.",
  ],
  sections: [
    {
      id: "standards",
      source: "docs/moderation.md §2 (CHILD_SAFETY), §10 (terms forbid child sexual exploitation)",
      heading: "Our standards",
      blocks: [
        {
          kind: "p",
          text: "Our [terms](/terms#not-allowed) forbid, and we remove:",
        },
        {
          kind: "list",
          items: [
            "child sexual abuse material (CSAM): any image that shows the sexual abuse of a minor or sexualises a minor;",
            "anything else that sexualises a minor, including drawings, edited and AI-made images;",
            "grooming: building trust with a minor in order to abuse or exploit them;",
            "sextortion: threatening a minor, or anyone, to get sexual images or money;",
            "any other attempt to endanger, exploit or traffic a child.",
          ],
        },
      ],
    },
    {
      id: "report",
      source:
        "docs/moderation.md §2 (Reasons: CHILD_SAFETY valid on a photo, a member and the event); mobile report sheet (EV-181)",
      heading: "How to report",
      blocks: [
        {
          kind: "p",
          text: "**If a child is in immediate danger, call 911 or your local police first.**",
        },
        {
          kind: "list",
          items: [
            "**In the app:** report the photo, the person or the roll, and choose “A child is at risk” (for a person, “Putting a child at risk”). The report goes only to Everglow, never to the roll's hosts.",
            `**By email:** write to ${mailLink("safety")}. Say which roll or person it is about. Don't send us the image, and don't save or forward it.`,
            "**To the authorities directly:** in the United States, the [NCMEC CyberTipline](https://report.cybertip.org); in Canada, [Cybertip.ca](https://www.cybertip.ca).",
          ],
        },
      ],
    },
    {
      id: "what-we-do",
      source: "docs/moderation.md §5 (rule 4), §7 (Child safety); api/docs/moderation-runbook.md (Child safety)",
      heading: "What we do with a report",
      blocks: [
        {
          kind: "list",
          items: [
            "The photo, or the roll's cover, is hidden from everyone at once, hosts included.",
            "Our moderators are alerted at once. They look only as far as they need to decide, through a recorded review, and never copy or forward the content.",
            "We report apparent child sexual abuse material to the **NCMEC CyberTipline** in the United States, as US law requires (18 U.S.C. §2258A), and for Canada to **Cybertip.ca** and the police, as Canadian law requires (S.C. 2011, c. 4).",
            "We remove the content and suspend the account. We don't tell the account why, so nothing gets in the way of an investigation.",
            "We keep the report and a locked copy of the content for a year from the date we report it, or longer if the authorities ask, and then delete them. Only our moderators can reach it, and every look is recorded.",
          ],
        },
        {
          kind: "p",
          text: "Deleting the photo or the account doesn't make a report go away. A copy is kept for the review.",
        },
      ],
    },
    {
      id: "prevention",
      source: "docs/moderation.md §6 (invite links), §10, §11 (Planned)",
      heading: "How Everglow is built to prevent it",
      blocks: [
        {
          kind: "list",
          items: [
            "Rolls are private. Only people with a roll's invite link can join it, and there is no public search or feed.",
            "Everyone accepts the terms, which forbid child sexual exploitation, before they can see or add a photo.",
            "Hosts can remove and ban people from their roll, and anyone can block another person.",
            "We plan to check new photos automatically before others see them. That is not in place yet.",
          ],
        },
      ],
    },
    {
      id: "contact",
      source: "EV-116 (Play Console child-safety contact); landing/src/lib/contacts.ts",
      heading: "Child safety contact",
      blocks: [
        {
          kind: "p",
          text: `Our child safety contact handles these reports and questions about these standards: ${mailLink("safety")}. Law enforcement can also use ${mailLink("legal")} (see [Law enforcement](/law-enforcement)).`,
          pending: `Name the person behind ${CONTACTS.safety} in Play Console, and confirm the NCMEC and Cybertip.ca registrations.`,
        },
      ],
    },
  ],
};

export default childSafety;
