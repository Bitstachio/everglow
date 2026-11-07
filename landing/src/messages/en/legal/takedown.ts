import { mailLink } from "@/lib/contacts";
import type { LegalDocument } from "@/lib/legal-documents";

// Each section's `source` names where its facts come from. Change the copy when that source changes.
const takedown: LegalDocument = {
  title: "Takedown requests for intimate images",
  description:
    "How to ask Everglow to remove an intimate image of you shared without your consent, even if you don't use Everglow.",
  updated: "2026-11-02",
  intro: [
    "If an intimate image of you is on Everglow without your consent, you can ask us to remove it. You don't need an account. We remove it within 48 hours of a valid request, as the US TAKE IT DOWN Act requires.",
    "If the person shown is under 18, see [Child safety](/child-safety) instead.",
  ],
  sections: [
    {
      id: "in-the-app",
      source:
        "docs/moderation.md §2 (NON_CONSENSUAL_INTIMATE_IMAGE), §5 (rule 4), §7 (Intimate images); mobile report sheet (EV-181)",
      heading: "If you are on the roll",
      blocks: [
        {
          kind: "p",
          text: "Report the photo in the app and choose “Intimate image shared without consent”. It is hidden from everyone at once, hosts included, and the report goes only to Everglow. That report is your request; you don't need to send anything else.",
        },
      ],
    },
    {
      id: "by-email",
      source: "docs/moderation.md §7 (Intimate images: outside the app); 47 U.S.C. §223a; EV-116 (web form planned)",
      heading: "If you are not on the roll",
      blocks: [
        {
          kind: "p",
          text: `Email ${mailLink("safety")} with “Takedown request” in the subject. Include:`,
        },
        {
          kind: "list",
          items: [
            "**Your signature.** Typing your full name counts. If you are writing for the person shown, say so and how you are allowed to act for them.",
            "**How to find the image.** The roll's name or invite link, who added the image and when, if you know, and a short description of it. Please don't send the image itself.",
            "**A statement** that you are the person shown (or act for them) and believe in good faith that the image was shared without consent, with anything that helps us see that.",
            "**How to reach you:** an email address or phone number.",
          ],
        },
        {
          kind: "p",
          text: "We plan to add a form on this page for these requests. Until then, email is the way to send them.",
        },
      ],
    },
    {
      id: "what-we-do",
      source:
        "docs/moderation.md §7 (Intimate images, Retention), §8 (24/48-hour target); api/docs/moderation-runbook.md (intimate_image)",
      heading: "What we do",
      blocks: [
        {
          kind: "p",
          text: "Requests, in the app or by email, go straight to our moderators. We remove the image within 48 hours of receiving a valid request. We don't ask you to prove who you are beyond what is listed above.",
          pending:
            "When the 48-hour clock starts for an emailed request (receipt, or once it is complete) is an open decision for the lawyer.",
        },
        {
          kind: "p",
          text: "When we remove the image, we also delete our own copy of it. We keep only a fingerprint (a hash of the file) and the details of the request, for up to a year after the report is closed, unless the law requires us to keep more. We use the fingerprint to find and remove identical copies elsewhere on Everglow, and to stop the same file being added again.",
          pending: "Identical-copy removal and refusing re-uploads depend on EV-201 (#284, #285) being live at launch.",
        },
        {
          kind: "p",
          text: "We will email you when it is done. If we can't find the image, or need more to act, we will tell you what is missing.",
        },
      ],
    },
    {
      id: "more-help",
      source: "EV-116",
      heading: "More help",
      blocks: [
        {
          kind: "list",
          items: [
            "[StopNCII.org](https://stopncii.org) helps adults stop intimate images being shared on many platforms, without sending the image to anyone.",
            "[Take It Down](https://takeitdown.ncmec.org), run by NCMEC, does the same for images taken when the person shown was under 18.",
            "If someone is threatening to share an image of you, you can report it to the police.",
          ],
        },
      ],
    },
  ],
};

export default takedown;
