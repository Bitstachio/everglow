import { mailLink } from "@/lib/contacts";
import type { LegalDocument } from "@/lib/legal-documents";

// Each section's `source` names where its facts come from. Change the copy when that source changes.
const privacy: LegalDocument = {
  title: "Privacy policy",
  description: "What Everglow collects, why, where it is kept, for how long, who can see it, and how to ask us about it.",
  updated: "2026-11-02",
  intro: [
    "Everglow is an app for shared photo albums. Each event gets a roll: one album that the host and the people they invite add photos to, which closes after a set time.",
    "This policy says what we collect, why, where it is kept, for how long, who can see it, and what you can ask of us. It covers the Everglow app and this website.",
  ],
  sections: [
    {
      id: "who-we-are",
      source: "docs/moderation.md (intro: launch markets)",
      heading: "Who we are",
      blocks: [
        {
          kind: "p",
          text: "Everglow is offered in Canada and the United States. In this policy, “Everglow”, “we” and “us” mean the company that runs the app and this website.",
          pending: "The legal entity's name and postal address must be added here.",
        },
        {
          kind: "p",
          text: `Questions about this policy or about your information go to ${mailLink("privacy")}.`,
        },
      ],
    },
    {
      id: "what-we-collect",
      source:
        "docs/authentication.md §1; docs/credential-changes.md; api/prisma/schema.prisma (User, UserDetails, Event, Photo, Report, UserBlock, EventBan); docs/photos-architecture.md §1, §2; docs/moderation.md §1, §10; landing/README.md (waitlist)",
      heading: "What we collect",
      blocks: [
        {
          kind: "list",
          items: [
            "**Your account.** Your name, your username and, if you add one, a profile photo. When you accepted the terms.",
            "**Sign-in.** You sign in with an email and password, or with Apple or Google, through our sign-in provider, Auth0. Auth0 holds your email address and password. Everglow never sees your password, and our own database doesn't store your email address.",
            "**Rolls.** For each roll: its name, description, date, cover photo, how long it stays open, who is on it and their role (host, adds photos, or view only), and its invite links.",
            "**Photos.** Each photo you add, as the original file, with its size, type, who added it and when. We also make a small preview and a display copy of each photo.",
            "**Safety records.** Reports you file (the reason and any note you write), people you block, removals and bans from a roll, and account suspensions.",
            "**Technical records.** Our servers log each request: the time, what was asked for, the result, and the ids of the account, roll or photo involved. Our storage keeps a record of each photo upload and download, including the IP address it came from.",
            "**Website waitlist.** If you join the waitlist on this website, your email address. Nothing else.",
          ],
        },
        {
          kind: "p",
          text: "If your camera saved details inside a photo, such as when and where it was taken, they stay in the original file, which members of the roll can open and save. Our previews and display copies leave them out. If you don't want to share where a photo was taken, turn off location for your camera, or remove it before you add the photo.",
        },
        {
          kind: "p",
          text: "The app uses your camera and photo library only when you choose to take, pick or save photos, or to scan an invite code. We don't collect your contacts or your device's location, and the app has no ads, analytics or tracking tools. This website sets no cookies and uses no analytics.",
        },
      ],
    },
    {
      id: "how-we-use-it",
      source: "docs/moderation.md §2–§9; docs/event-quotas.md; docs/photo-privacy.md",
      heading: "How we use it",
      blocks: [
        {
          kind: "list",
          items: [
            "To run Everglow: sign you in, show you your rolls, and show each roll's photos and members to the people on it.",
            "To apply the plan's limits, such as how many rolls you can have open and how much room a roll has.",
            "To keep people safe: to handle reports, hide reported photos, review rolls, remove content and accounts that break our [terms](/terms), and report child sexual abuse material to the authorities (see [Child safety](/child-safety)).",
            "To keep Everglow secure: to spot and investigate misuse, and to know who read a photo outside the app.",
            "To email you once when Everglow launches, if you joined the waitlist.",
          ],
        },
        {
          kind: "p",
          text: "We don't sell your personal information, share it for advertising, or use your photos to train AI models.",
        },
      ],
    },
    {
      id: "screening",
      source: "docs/moderation.md §11 (Planned)",
      heading: "Checking photos",
      blocks: [
        {
          kind: "p",
          text: "Today, photos are not checked automatically when they are added. People on a roll can report a photo, and hosts and our moderators act on reports.",
        },
        {
          kind: "p",
          text: "We plan to check new photos with an image moderation service from Amazon Web Services, to catch nudity, violence and exploitation before others see them. We will update this policy before that starts.",
        },
      ],
    },
    {
      id: "who-can-see-it",
      source: "docs/moderation.md §2, §3, §5, §6, §8; docs/photo-privacy.md; docs/photos-architecture.md §3",
      heading: "Who can see it",
      blocks: [
        {
          kind: "list",
          items: [
            "**People on the roll** see its photos, its details and its members (name, username and profile photo). They can open and save the original of any photo they can see. We can't remove copies someone has already saved to their phone.",
            "**Hosts** also see the reports on photos and members of their roll, and who added a reported photo. They never see who filed a report. They don't see reports for child safety or intimate images, or the photos those reports are about.",
            "**Blocks.** If you block someone, you stop seeing each other's photos on every roll you share, except on rolls one of you hosts. They aren't told.",
            "**Everglow's moderators** look at reported content only to decide a report, through a link that lasts five minutes. Every look is recorded.",
            "**Nobody else at Everglow** can browse photos. Our storage refuses to show photos to staff, and every attempt is recorded and raises an alert.",
          ],
        },
        {
          kind: "p",
          text: "We give information to the police or a court only when the law requires it (see [Law enforcement](/law-enforcement)). We report apparent child sexual abuse material to NCMEC in the United States and to Cybertip.ca and the police in Canada.",
        },
      ],
    },
    {
      id: "service-providers",
      source: "docs/photo-privacy.md; docs/authentication.md §1; api/copilot/api/manifest.yml; landing/README.md",
      heading: "Service providers",
      blocks: [
        {
          kind: "p",
          text: "These companies process information for us, only to provide their service:",
        },
        {
          kind: "list",
          items: [
            "**Amazon Web Services:** our servers, photo storage and logs.",
            "**Auth0 (Okta):** sign-in.",
            "**Apple and Google:** sign-in, if you choose to sign in with them.",
            "**Our database host:** account, roll and report records.",
            "**Resend and Cloudflare:** the website waitlist.",
            "**GitHub Pages:** hosts this website.",
          ],
          pending: "Name the database host once chosen, and confirm a data processing agreement with each provider.",
        },
      ],
    },
    {
      id: "where-it-is-kept",
      source: "api/infra/main.tf (region us-east-1); docs/photo-privacy.md",
      heading: "Where it is kept",
      blocks: [
        {
          kind: "p",
          text: "In the United States. Our servers and photos are in Amazon Web Services' US East (N. Virginia) region. If you live in Canada, including Quebec, your information is stored and processed outside your province and country, and courts and authorities there may be able to reach it under their laws.",
          pending:
            "Quebec Law 25 asks for a privacy impact assessment before information leaves Quebec; confirm it is done and the wording above. Confirm the database host's region.",
        },
      ],
    },
    {
      id: "retention",
      source:
        "docs/moderation.md §7 (Retention); docs/account-deletion.md §6a; docs/photos-architecture.md §12; docs/event-quotas.md; docs/authentication.md §6 (tombstones, EV-200); docs/photo-privacy.md (logs, EV-199)",
      heading: "How long we keep it",
      blocks: [
        {
          kind: "table",
          caption: "Retention schedule",
          head: ["What", "Kept for", "Then"],
          rows: [
            [
              "Photos on a roll",
              "Until the roll closes: 3, 7, 14 or 30 days after it opens, as the host chose, or earlier if a host closes it. A photo with an open report is kept, hidden, until the report is decided.",
              "Removed within an hour of the roll closing. The roll itself, its details and its members stay.",
            ],
            ["A photo you delete", "Removed for everyone at once.", "Its files are deleted straight away, unless it was reported (below)."],
            [
              "Your account (name, username, profile photo)",
              "Until you delete your account.",
              "Deleted. See [Deleting your account](#deleting-your-account).",
            ],
            [
              "A roll",
              "Until a host deletes it after it closes, or its only member deletes their account.",
              "Deleted with its photos and cover.",
            ],
            [
              "Reports, their notes, and copies of reported photos",
              "Up to a year after the report is closed.",
              "Removed by a daily job.",
            ],
            [
              "A removed intimate image",
              "The copy is deleted when the image is removed. Only a fingerprint (a hash of the file) and the report's details are kept, for up to a year after the report is closed.",
              "Removed by a daily job.",
            ],
            [
              "Records under a legal hold",
              "Until the hold ends. A child-safety report sent to NCMEC or the police is kept a year from the date it was sent, or longer if they ask. A police preservation request holds records for 90 days, which they can renew.",
              "Removed as above.",
            ],
            [
              "Blocks and bans from a roll",
              "Until they are lifted, or the roll or account is deleted.",
              "Deleted. A ban from a roll can outlive the account (next row).",
            ],
            [
              "A record that a deleted account signed in with Apple, Google or an email (a hash, not the identity itself)",
              "30 days after the account is deleted. If the account was suspended or banned from a roll: at least a year after deletion, and as long as any report about the account is kept.",
              "Deleted. While it exists, signing in again with the same identity brings a suspension or ban back.",
            ],
            ["Server logs", "Up to 90 days.", "Deleted automatically."],
            ["Photo processing logs and failed upload notices", "14 days.", "Deleted automatically."],
            ["Record of each photo upload and download (with IP address)", "1 year.", "Deleted automatically."],
            [
              "Waitlist email",
              "Until we send the launch email, or you ask us to remove it.",
              "Deleted.",
            ],
          ],
          pending:
            "Retention periods are pending the legal review in EV-62. The sign-in record and the 90-day log periods depend on EV-200 and EV-199; the waitlist period is not yet set.",
        },
        {
          kind: "p",
          text: "We keep reports and their evidence for a year because US law asks us to preserve a report of child sexual abuse material for a year, and because it lets us recognise people who break the terms again. We keep nothing longer than this table says, except under a legal hold.",
        },
      ],
    },
    {
      id: "deleting-your-account",
      source: "docs/account-deletion.md §6a, §6b, “No grace period”; docs/moderation.md §1 (What happens on delete), §7",
      heading: "Deleting your account",
      blocks: [
        {
          kind: "p",
          text: "You can delete your account at any time in the app, under You. It is deleted at once, and can't be undone. Before you confirm, you choose what happens to the photos you added:",
        },
        {
          kind: "list",
          items: [
            "**Keep them:** they stay on their rolls until the rolls close, no longer linked to you.",
            "**Delete them:** they are removed from every roll, for everyone.",
          ],
        },
        {
          kind: "p",
          text: "Your name, username and profile photo are deleted, and you are removed from every roll. A roll you host alone is handed to the person who has been on it longest. A roll with nobody else on it is deleted.",
        },
        {
          kind: "p",
          text: "Some records are kept after deletion, for safety and legal reasons: reports, including reports about you or filed by you, and copies of the photos they are about, are kept for up to a year after the report is closed. If the law requires us to preserve them, we keep them until that hold ends. Then they are removed. We also keep the sign-in record described in the table above.",
        },
      ],
    },
    {
      id: "your-rights",
      source: "docs/moderation.md (intro: PIPEDA, Quebec Law 25); EV-62",
      heading: "Your rights",
      blocks: [
        {
          kind: "p",
          text: "You can ask us:",
        },
        {
          kind: "list",
          items: [
            "for a copy of the personal information we hold about you, and how we use it;",
            "to correct it, if it is wrong;",
            "to delete it;",
            "to stop using it where you gave consent, which may mean deleting your account.",
          ],
        },
        {
          kind: "p",
          text: `You can change your name, username and profile photo, and delete your account, in the app. For anything else, email ${mailLink("privacy")} from the email address you sign in with. We may ask you to confirm it is you before we answer. We answer within 30 days.`,
          pending: "Confirm the identity check and the response time with the lawyer.",
        },
        {
          kind: "p",
          text: "We may keep some records you ask us to delete when the law requires or allows it, such as reports under a legal hold. We will tell you what we kept and why.",
        },
        {
          kind: "p",
          text: "If you are not satisfied with our answer, you can complain to the Office of the Privacy Commissioner of Canada, or, in Quebec, to the Commission d'accès à l'information.",
        },
      ],
    },
    {
      id: "quebec",
      source: "docs/moderation.md (intro: Quebec Law 25), §10; docs/incident-register.md",
      heading: "If you live in Quebec",
      blocks: [
        {
          kind: "p",
          text: `Under Quebec's privacy law (Law 25), you can also ask for your information in a structured, commonly used format, and ask us to stop spreading information about you. Our person in charge of the protection of personal information can be reached at ${mailLink("privacy")}.`,
          pending: "Law 25 asks us to publish the title of the person in charge of the protection of personal information.",
        },
        {
          kind: "p",
          text: "We keep a register of confidentiality incidents. If one creates a risk of serious injury, we tell the Commission d'accès à l'information and the people affected.",
        },
      ],
    },
    {
      id: "california",
      source: "EV-203 (CCPA/CPRA)",
      heading: "If you live in California",
      blocks: [
        {
          kind: "p",
          text: `Where the California Consumer Privacy Act, as amended by the CPRA, applies to us, you can ask to know what personal information we collect, use and disclose, and ask us to correct or delete it. We don't sell or share personal information for advertising, and we don't use sensitive personal information to infer anything about you. We won't treat you differently for using these rights. Email ${mailLink("privacy")}, or have someone you authorise do it for you.`,
          pending: "Confirm whether the CCPA applies to Everglow at launch (revenue and user thresholds).",
        },
      ],
    },
    {
      id: "children",
      source: "docs/moderation.md §10 (the minimum age is not decided)",
      heading: "Children",
      pending: "Placeholder until the minimum age is decided with the lawyer.",
      blocks: [
        {
          kind: "p",
          text: `Placeholder: the minimum age to use Everglow is not decided yet. Everglow is not meant for children under 13, and we don't knowingly collect personal information from them. In Quebec, a parent's consent is needed under 14. If you think a child under the minimum age has an account, email ${mailLink("privacy")} and we will delete it.`,
        },
      ],
    },
    {
      id: "security",
      source: "docs/photo-privacy.md (The layers); docs/incident-register.md",
      heading: "How we protect it",
      blocks: [
        {
          kind: "p",
          text: "Photos are stored encrypted, with a key only our servers can use. The app reaches them only through links that expire. Every read of a photo outside the app is recorded and raises an alert, and so is any change to who may read them.",
        },
        {
          kind: "p",
          text: "If something goes wrong, we record it, and we tell you and the regulators when the law requires it.",
        },
      ],
    },
    {
      id: "changes",
      source: "docs/moderation.md §10 (versioned acceptance)",
      heading: "Changes to this policy",
      blocks: [
        {
          kind: "p",
          text: "When we change this policy, we update the date at the top. If a change affects how we use information you already gave us, we will ask for your consent again where the law requires it.",
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
            `Privacy questions and requests: ${mailLink("privacy")}`,
            `Child safety and takedown requests: ${mailLink("safety")}`,
            `Law enforcement and legal requests: ${mailLink("legal")}`,
            `Anything else: ${mailLink("hello")}`,
          ],
        },
      ],
    },
  ],
};

export default privacy;
