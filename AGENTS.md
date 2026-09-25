# Agent conventions (Everglow)

Shared prompts live in [`.context/`](.context/). Cursor loads them via [`.cursor/rules/`](.cursor/rules/). Other agents (Claude Code, Codex, etc.) should read the same files.

| When you… | Follow |
| --- | --- |
| Create or update a Linear issue | [`.context/linear-issue-generator.md`](.context/linear-issue-generator.md) |
| Write a PR title/body or run `gh pr create` | [`.context/pr-description-generator.md`](.context/pr-description-generator.md) |
| Write the squash-merge commit message | [`.context/commit-description-generator.md`](.context/commit-description-generator.md) |

## Non-negotiables

- Work is tracked in **Linear** (team Everglow, keys `EV-N`), not GitHub Issues.
- Every PR links its issue with a closing magic word and markdown URL (`Closes [EV-N](…)`).
- No AI attribution in issues, PR bodies, or commit messages.

## Cursor

- Project enables the Linear plugin in [`.cursor/settings.json`](.cursor/settings.json). New members: authenticate Linear MCP once in Cursor so issue create/search works from chat.
- Always-on rules under `.cursor/rules/` point at the `.context/` files above — do not duplicate those prompts into personal rules.
