# Role & Objective

You write the **PR title and body**: what appears on GitHub while the pull request is open. The title is the Conventional Commits subject that will become the squash commit subject on `main`. The body lets a reviewer understand what changed, why, what it affects, and how it was verified, without opening the diff first.

This is not the squash commit **body**. When the PR is merged, a separate extended description (body only) is written under that title; see [commit-description-generator.md](./commit-description-generator.md). The PR body can be longer, uses Markdown, and carries review-only information (test plan, stacking, follow-ups) that does not belong in git history.

# Inputs

- **Full diff against the base branch**: `git diff <base>...HEAD`. Describe the whole branch, not the last commit. For a stack layer, `base` is the parent branch (or `main` for the bottom), not the whole feature.
- **Commits**: `git log <base>..HEAD --oneline`, as a guide to what happened, not as the structure of the body.
- **Sibling PRs**: read the two or three most recent PRs in the same area (`gh pr list --state merged`). If the PR continues a series a teammate started, match that teammate's style instead of this template.
- **Stack**: if this work is more than one reviewable unit, follow [stacked-prs.md](./stacked-prs.md) **before** opening PRs. Use `gh stack` so GitHub gets a Stack object; do not open standalone PRs and link them later in the UI.
- **Linear**: the issue this PR implements. Every PR has one. One issue may have several PRs. If the task came without an issue, create it before opening the PR, per [linear-issue-generator.md](./linear-issue-generator.md).

# Title (required)

This line is the permanent Conventional Commits subject on `main` after squash. Write it once here; do not invent a second subject in the commit-description generator.

Rules:

- Prefix with a Conventional Commits type: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `perf`, `build`, `ci`, `style`, or `revert`.
- Monorepo scope in parentheses immediately after the type: `(api)`, `(mobile)`. Use `(*)` when both are affected. Omit the parentheses for repo-level changes (`.github`, `.context`, root docs).
- Imperative mood, lowercase after the colon, no trailing period.
- **Max 50 characters total**, including the type and scope prefix. Count before posting.
- Do not put the PR number in the title; GitHub adds it on squash.

Examples:

- `feat(api): add event cover image`
- `fix(mobile): keep join sheet above keyboard`
- `ci: post mobile test coverage on PRs`
- `chore(*): align agent workflow docs`

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

## Stacked line (required for every PR above the bottom of a stack)

First line, plain text, before any heading: which PR this is based on and what happens when it merges. Update it after the base merges ("Was stacked on #N, which is now merged; retargeted to main.").

Create the stack with `gh stack submit` (see [stacked-prs.md](./stacked-prs.md)). The stacked line in the body is for humans reading the PR; the GitHub Stack object is what navigates the chain in the product UI.

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

## Linear line (required)

Last line, outside any section. Use markdown links, because the repository has no autolink for `EV-` keys, and use Linear's magic words so its GitHub integration can link and close the issue once connected:

- `Part of [EV-N](url).` on every intermediate stack layer (and whenever this PR alone does not finish the issue)
- `Closes [EV-N](url).` only on the PR that completes the issue (often the top of the stack, or a single PR when there is no stack)
- `Part of [EV-M](url).` for a parent that stays open (for example, the mobile half is still to do)

The link has to go both ways. Also add **each** PR to the issue as a link attachment, so they all appear in the issue's resources; the PR body line alone does not do that until the Linear GitHub integration is connected. See "Keeping the issue in sync" in [linear-issue-generator.md](./linear-issue-generator.md).

# Rules

- No AI attribution anywhere: no "Generated with", "Created by", "Written by", or similar footers naming Cursor, Claude, Copilot, ChatGPT, or any other tool or model. Do not put tool or model names in the body as authorship. Different teammates (and the same person across revisions) may use different tools on one PR; leave no stamps.
- No `Co-Authored-By` (or any other git trailer) for an agent or tool in commit messages that land on the branch. Human `Co-authored-by` only when a real person collaborated.
- Write for a reviewer who knows the codebase but not this branch. State facts; do not narrate how you worked.
- One idea per bullet. No nested bullets deeper than one level.
- Keep the body in sync with the branch. When a later push changes what the PR does, edit the Summary, Notes and Test plan instead of appending "update:" lines.
- Prefer a table only for genuinely tabular data (tiers, error codes, before and after numbers).

# Self-verification

Before posting, check:

- The title follows Conventional Commits with the right scope, is ≤ 50 characters, imperative, lowercase after the colon, no trailing period.
- Summary, Why and Test plan exist; every other section present has real content.
- Every ticked box was actually run on the final state; CI is unticked unless green.
- A contract change is called out in Notes together with the mobile client regeneration.
- The Linear line links the right issues with markdown links, and the issue has the PR attached.
- There is no AI attribution: no tool/model footers, no agent `Co-authored-by`.

# Example

**Title:** `feat(api): add event cover image`

**Body:**

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
