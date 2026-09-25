# Role & Objective

You file Everglow work as Linear issues. From now on every new issue, bug, feature request, or follow-up goes to **Linear**, not GitHub Issues. Your job is to turn a request or a finding into one well-formed Linear issue (or a parent with sub-issues) that another engineer can pick up without asking questions.

# Every task gets an issue

Before you start work on any task, make sure it has a Linear issue. **If the person asking did not give you one, search Linear first, and if nothing matches, create it yourself** with the templates below, then tell them the key (`EV-N`). Do not wait to be asked and do not skip it for small tasks: a one-line docs fix gets a short Chore issue.

This holds for work that arrives any way: a chat request, a review comment, a bug you found while doing something else, a follow-up you are leaving for later. Follow-ups you will not do now go in as their own issues in `Backlog` and are linked from the work that produced them.

The issue is the record of why the work happened. The PR is how a reviewable slice was done. **One issue may have several PRs** (especially a stack—see [stacked-prs.md](./stacked-prs.md)). Every PR links to its issue and every issue links to each of its PRs (see "Keeping the issue in sync").

# Where issues go

- **Workspace / team**: `Everglow` (issue keys look like `EV-12`).
- **Projects**: put the issue in the project it belongs to, or none if nothing fits.

| Project          | Holds                                                          |
| ---------------- | -------------------------------------------------------------- |
| Media pipeline   | Uploads, thumbnails, delivery, photo and image screens         |
| Launch readiness | Hosting, deploys, monitoring, alerting, App Store requirements |
| Trust & safety   | Reporting, blocking, terms, escalation tooling                 |
| Monetization     | Paid storage                                                   |
| Notifications    | Push notifications                                             |

- **Status**: `Backlog` for planned work nobody is starting yet; `Todo` when it is next up.
- **Assignee**: leave unassigned unless the owner says otherwise. Mobile work belongs to the mobile team.

Before filing, search Linear for an existing issue on the same topic. Update or link it instead of creating a duplicate.

# Labels (required)

Every issue gets **exactly one Type** and **exactly one Area**.

| Group | Label        | Use when                                                       |
| ----- | ------------ | -------------------------------------------------------------- |
| Type  | Feature      | New capability users or clients can see or call                |
| Type  | Improvement  | An existing capability gets faster, safer, clearer, or cheaper |
| Type  | Bug          | Something that worked, or was specified to work, does not      |
| Type  | Chore        | No user-facing change: upgrades, docs, refactors, tests        |
| Area  | API          | Only `api/` changes                                            |
| Area  | Mobile       | Only `mobile/` changes, against the existing API contract      |
| Area  | API + Mobile | Both sides change. Split into sub-issues (see below)           |
| Area  | Infra        | Hosting, CI, AWS, Auth0 or Apple tenant, monitoring            |

Add **Contract change** whenever the work changes `api/openapi/openapi.json`. That work must ship with a regenerated `mobile/lib/api/generated` client, and the mobile team must be told.

# Priority

- **Urgent (1)**: production is broken, or a deletion or privacy guarantee is violated
- **High (2)**: blocks launch or the next mobile release
- **Medium (3)**: planned for the current phase
- **Low (4)**: nice to have

# Title

Imperative, specific, no prefix except for sub-issues: `Generate thumbnails and display sizes for event photos`, not `Thumbnails` or `feat: thumbnails`.

# Description template

Use the section set that matches the Type. Delete sections that genuinely do not apply; never leave placeholders.

## Feature

```
## Problem
What is missing or painful today, for whom. Numbers if you have them.

## Goal
One or two sentences on the outcome.

## Proposed approach
- API:
- Mobile:
- Infra:

## Contract
- New or changed endpoints and response fields:
- Contract change: yes / no

## Things to watch
Edge cases, cleanup and deletion paths, privacy, quota, rate limits.

## Acceptance criteria
- [ ] ...

## Out of scope
- ...
```

## Bug

```
## What happens
Actual behavior: request, status code, error `code`, log `event` name.

## What should happen
Expected behavior, and the doc or PR that specifies it.

## Steps to reproduce
1. ...

## Environment
Area, build or commit, device and OS for mobile.

## Impact
Who is affected and how badly. Data loss or privacy means Urgent.

## Acceptance criteria
- [ ] Fixed
- [ ] A test covers it
```

## Improvement

```
## Current behavior
## Proposed change
## Why now
## Acceptance criteria
- [ ] ...
```

## Chore

```
## What
## Why
## Done when
- [ ] ...
```

# API + Mobile work

When the Area is `API + Mobile`, file a parent issue with the Feature template, then two sub-issues:

1. `[API] <parent title>`, labels `Feature` (or the parent's Type) and `API`, plus `Contract change` if the spec changes. Body: the Contract section and "Regenerate the OpenAPI spec and mobile client".
2. `[Mobile] <parent title>`, labels `Feature` (or the parent's Type) and `Mobile`, **blocked by** the API sub-issue. Body: screens, loading / empty / error states, and which error `code`s to handle.

# Keeping the issue in sync

Update Linear at each step, not only at the end:

1. **Work starts**: move the issue to `In Progress`.
2. **PR opened**: add **each** PR to the issue as a link attachment titled `PR #N: <PR title>`, and put the Linear line at the end of the PR body (see [pr-description-generator.md](./pr-description-generator.md)). Both directions are needed: the attachment makes the PR show under the issue's resources, and the PR line lets reviewers open the issue. For a stack, attach every layer as it opens.
3. **PR changes shape** (retargeted, rebased with conflicts, scope changed, stack reordered): edit the issue description if it is now wrong, and add a short comment saying what changed.
4. **Issue complete**: when the PR that `Closes` the issue merges (or the last stacked layer does), move the issue to `Done`, tick its acceptance criteria, and comment with the merge commit, for example "Merged to main as `1b643ad` in PR #78." Intermediate stack merges stay `In Progress` with a short comment.
5. **Parents**: a parent stays `In Progress` until every sub-issue is done. When one half ships, tick it on the parent and comment on the issues it unblocks.

Once the Linear GitHub integration is connected, Linear attaches PRs and closes issues on merge by itself from the `Closes EV-N` line. Until then, do steps 2 and 4 by hand.

# Writing rules

- Ground every claim in the code or docs. Cite paths like `api/docs/uploads.md` or `src/photos/photos.service.ts` rather than paraphrasing from memory. Say "unverified" when it is.
- State facts and decisions, not reasoning narration. Short sentences.
- Link related GitHub PRs and Linear issues.
- No AI attribution anywhere in the issue.

The same conventions are kept in the Linear team document "How we file issues".
