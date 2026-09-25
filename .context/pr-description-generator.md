# Role & Objective

You write the **PR body**: the description reviewers read on GitHub while the pull request is open. Your job is to let a reviewer understand what changed, why, what it affects, and how it was verified, without opening the diff first.

This is not the squash commit message. When the PR is merged, a separate extended description becomes the permanent commit on main; see [pr-extended-description-generator.md](./pr-extended-description-generator.md). The PR body can be longer, uses Markdown, and carries review-only information (test plan, stacking, follow-ups) that does not belong in history.

# Inputs

- **Full diff against the base branch**: `git diff <base>...HEAD`. Describe the whole branch, not the last commit.
- **Commits**: `git log <base>..HEAD --oneline`, as a guide to what happened, not as the structure of the body.
- **Sibling PRs**: read the two or three most recent PRs in the same area (`gh pr list --state merged`). If the PR continues a series a teammate started, match that teammate's style instead of this template.
- **Linear**: the issue this PR implements. Every PR should have one; if it does not, file it first per [linear-issue-generator.md](./linear-issue-generator.md).

# Title

Conventional Commits with the monorepo scope, imperative mood, lowercase after the colon, no trailing period:

- `feat(api): add event cover image`
- `fix(mobile): keep the join sheet above the keyboard`
- `ci: post mobile test coverage on PRs`

Scopes: `api`, `mobile`, `*` for both, none for repo-level changes (`.github`, `.context`, root docs). Types: feat, fix, refactor, perf, test, docs, build, ci, chore, revert. Do not put the PR number in the title; GitHub adds it on squash.

# Body structure

Use these sections in this order. **Summary, Why and Test plan are required.** The others appear only when they have content; never leave an empty section or a placeholder.

```
Stacked on #N; retarget to main once that merges.

## Summary
- ...

## Why
...

## API
...

## Screenshots
...

## Notes
- ...

## Test plan
- [x] ...
- [ ] CI passes on PR

Closes [EV-N](https://linear.app/mehrshadfb/issue/EV-N). Part of [EV-M](https://linear.app/mehrshadfb/issue/EV-M).
```

## Stacked line (only for stacked PRs)

First line, plain text, before any heading: which PR this is based on and what happens when it merges. Update it after the base merges ("Was stacked on #N, which is now merged; retargeted to main.").

## Summary (required)

Bullets naming the concrete changes, most important first. One or two sentences each. Put identifiers, endpoints, env vars, file paths and error codes in backticks. Group by logical unit (the feature, the refactor it needed, the docs), never one bullet per commit.

## Why (required)

One short paragraph: the problem, who has it, and why this approach. If an alternative was considered and rejected, say so in one sentence. Link the issue or the earlier PR that left this open.

## API (only when the HTTP contract changes)

New or changed endpoints with method, path, status codes and the fields added or removed. This is what the mobile team reads, so be exact:

- `POST /events/:eventId/cover/upload-url` → `{ uploadId, uploadUrl, expiresAt }` (201; 400, 403, 404, 429)
- `coverUrl` added to `EventResponseDto`, nullable

## Screenshots (only for mobile UI changes)

Before and after screenshots, or a short screen recording for flows. Name the device and OS.

## Notes

Anything a reviewer or the next person needs that is not the change itself. Include each of these that applies:

- **Contract change**: whether `api/openapi/openapi.json` changed, and that `mobile/lib/api/generated` was regenerated in the same PR. Name any hand-written mobile file touched (usually only test fixtures).
- **Migration**: the migration name, whether it is additive, and anything a deploy must do in order.
- **Config**: new env vars with their defaults, and whether `.env.example` lists them.
- **Behavior changes** outside the headline, stated plainly.
- **Decisions and trade-offs** a reviewer might question.
- **What is deliberately not done**, and where the follow-up is tracked.
- **Unverified**: anything you could not test, and why.

## After merging main (only when the branch was updated with conflicts)

When a long-lived PR is brought up to date and conflicts had to be resolved, add a section titled `## After merging <base> (#A, #B)` just above the Test plan. List each non-trivial resolution in a sentence so the reviewer knows what changed since their last look.

## Test plan (required)

A checkbox per command or check. **Tick a box only for something you actually ran and saw pass in this branch's final state**, with counts where they help (`npx jest --forceExit` (58 suites, 789 tests)). Leave `- [ ] CI passes on PR` unticked until CI is green, then tick it. For UI changes include the manual steps you took on a device.

Run API commands from `api/` and mobile commands from `mobile/` with pnpm 11.25.0.

## Linear line (required when an issue exists)

Last line, outside any section. Use markdown links, because the repository has no autolink for `EV-` keys:

- `Closes [EV-N](url).` for the issue this PR completes
- `Part of [EV-M](url).` for a parent that stays open (for example, the mobile half is still to do)

# Rules

- No AI attribution anywhere: no "Generated with", no "Co-Authored-By", no tool names.
- Write for a reviewer who knows the codebase but not this branch. State facts; do not narrate how you worked.
- One idea per bullet. No nested bullets deeper than one level.
- Keep the body in sync with the branch. When a later push changes what the PR does, edit the Summary, Notes and Test plan instead of appending "update:" lines.
- Prefer a table only for genuinely tabular data (tiers, error codes, before and after numbers).

# Self-verification

Before posting, check:

- The title follows the Conventional Commits format with the right scope for the directories touched.
- Summary, Why and Test plan exist; every other section present has real content.
- Every ticked box was actually run on the final state; CI is unticked unless green.
- A contract change is called out in Notes together with the mobile client regeneration.
- The Linear line links the right issues with markdown links.
- There is no AI attribution.

# Example

```
## Summary
- Add `Event.coverS3Key` and three cover endpoints on top of the shared image upload module from #76: mint on the `uploads` rate limit tier, confirm with `PUT`, remove with `DELETE`
- Extract `EventsService.getUpdatable`, the load, 404, authorize, 403 block four event methods repeated, and use it for the cover too
- Purge the cover object on event deletion and when account deletion deletes a sole-organizer event
- Register `event-covers/` with the S3 orphan reconciler

## Why
Every event looks the same in the list and on its detail screen. Organizers need a way to give an event a picture, and the avatar work already built the upload mechanics this needs.

## API
- `POST /events/:eventId/cover/upload-url` → `{ uploadId, uploadUrl, expiresAt }` (201; 400, 403, 404, 429)
- `PUT /events/:eventId/cover` with `{ uploadId }` → the event (200; 404, 409, 422)
- `DELETE /events/:eventId/cover` (204)
- `coverUrl` on `EventResponseDto`, nullable, on single reads and the list

## Notes
- Contract change: OpenAPI and `mobile/lib/api/generated` regenerated; `coverUrl: null` added to the event fixture in `mobile/features/events/testing/fixtures.ts`, no app code touched
- Migration `20260921130000_add_event_cover_s3_key` is additive: a nullable unique column
- Covers do not count toward the storage quota
- The events list stays at two queries; presigning each URL is local work

## Test plan
- [x] `npm run typecheck`, `npx eslint`, `npm run format:check`, `npm run build`
- [x] `npx jest --forceExit` (51 suites, 689 tests)
- [x] `npm run test:integration -- --forceExit` (5 suites, 188 tests)
- [x] `pnpm exec tsc --noEmit` and the events tests in `mobile/`
- [x] CI passes on PR

Closes [EV-15](https://linear.app/mehrshadfb/issue/EV-15). Part of [EV-13](https://linear.app/mehrshadfb/issue/EV-13).
```
