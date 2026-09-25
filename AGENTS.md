# Agent conventions (Everglow)

Shared process docs live in [`.context/`](.context/). Read the matching file in full before doing that work. Do not duplicate those prompts into personal rules or tool-specific copies.

| When you… | Read and follow |
| --- | --- |
| Create, search, update, or link a Linear issue | [`.context/linear-issue-generator.md`](.context/linear-issue-generator.md) |
| Write a PR title/body or run `gh pr create` | [`.context/pr-description-generator.md`](.context/pr-description-generator.md) |
| Write the squash-merge commit message | [`.context/commit-description-generator.md`](.context/commit-description-generator.md) |

## Non-negotiables

- Work is tracked in **Linear** (team Everglow, keys `EV-N`), not GitHub Issues. If a task has no issue, search first, then create one and tell the requester the key.
- Every PR links its issue with a closing magic word and markdown URL (`Closes [EV-N](…)`), and the PR is attached on the Linear issue.
- No AI attribution in issues, PR bodies, or commit messages.

## Cursor

- The Linear plugin is enabled in [`.cursor/settings.json`](.cursor/settings.json). Authenticate Linear once so issue create and search work from chat.
- If Linear is not authenticated, say so and still draft the issue to the template so a person can paste it.
