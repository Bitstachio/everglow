import { mailLink } from "@/lib/contacts";
import type { LegalDocument } from "@/lib/legal-documents";

// Each section's `source` names where its facts come from. Change the copy when that source changes.
const lawEnforcement: LegalDocument = {
  title: "Law enforcement requests",
  description:
    "How police and courts send Everglow preservation requests and legal process, and what we can give to victims.",
  updated: "2026-11-02",
  intro: [
    `This page is for police, prosecutors and courts. Send every request to ${mailLink("legal")}. For child safety, see also [Child safety](/child-safety).`,
  ],
  sections: [
    {
      id: "act-quickly",
      source: "docs/photos-architecture.md §12; docs/moderation.md §7 (Retention)",
      heading: "Act quickly",
      blocks: [
        {
          kind: "p",
          text: "Everglow removes a roll's photos when the roll closes, days or weeks after it opens, and deletes reports and their evidence a year after they close. If you may need records, send a preservation request first. See the [retention schedule](/privacy#retention).",
        },
      ],
    },
    {
      id: "preservation",
      source: "docs/moderation.md §7 (holds); api/docs/moderation-runbook.md (Law enforcement and legal requests)",
      heading: "Preservation requests",
      blocks: [
        {
          kind: "p",
          text: "We preserve records on a request from a government entity under 18 U.S.C. §2703(f), or the Canadian equivalent, for 90 days, and for another 90 days if you renew it. Preserved records are kept out of our normal deletion until the hold ends.",
          pending:
            "Confirm with the lawyer how Canadian preservation demands and orders (Criminal Code s. 487.012) are handled.",
        },
        {
          kind: "p",
          text: "Include: your agency, name, title and contact details; the username, roll name or invite link, and the dates you are interested in; and the legal basis for the request.",
        },
      ],
    },
    {
      id: "legal-process",
      source: "api/docs/moderation-runbook.md (Legal process for content); EV-62 (Stored Communications Act §2702)",
      heading: "Legal process",
      blocks: [
        {
          kind: "p",
          text: "We give the content of an account, such as its photos, only in response to valid legal process, such as a search warrant or a court order, as the US Stored Communications Act requires. Other records, such as account details, need the legal process the law requires for them.",
        },
        {
          kind: "p",
          text: "Requests from outside the United States may need to come through a mutual legal assistance treaty or a US court.",
          pending: "Confirm the wording for Canadian production orders and foreign requests with the lawyer.",
        },
      ],
    },
    {
      id: "what-we-have",
      source: "landing/src/messages/en/legal/privacy.ts (What we collect); docs/authentication.md §1",
      heading: "What we may have",
      blocks: [
        {
          kind: "list",
          items: [
            "Account details: name, username, profile photo, when the account was created and accepted the terms. Email addresses and passwords are held by our sign-in provider, Auth0, not by Everglow.",
            "Rolls the account is or was on, and its role on them.",
            "Photos, only while their roll is open, or as evidence attached to a report.",
            "Reports, blocks, bans and suspensions, within the retention schedule.",
            "Records of photo uploads and downloads with IP addresses, for a year.",
          ],
        },
        {
          kind: "p",
          text: "Everglow has no messages or chat.",
        },
      ],
    },
    {
      id: "victims",
      source: "api/docs/moderation-runbook.md (A victim asking for proof); EV-62",
      heading: "If you reported something to us",
      blocks: [
        {
          kind: "p",
          text: `If you reported content on Everglow and need proof for the police or a court, email ${mailLink("legal")} from the account or address you reported from. We can confirm what you reported and when. We can't send you the content itself: we give content only to police or a court. Ask them to send us a preservation request and legal process.`,
        },
      ],
    },
    {
      id: "ncmec",
      source: "docs/moderation.md §7 (Child safety)",
      heading: "Child sexual abuse material",
      blocks: [
        {
          kind: "p",
          text: "We report apparent child sexual abuse material to the NCMEC CyberTipline and, for Canada, to Cybertip.ca and the police, and keep each report and its evidence for a year from the date we send it. If you are investigating a CyberTipline report about Everglow, include its number in your request.",
        },
      ],
    },
  ],
};

export default lawEnforcement;
