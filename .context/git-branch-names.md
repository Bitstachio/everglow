# Git branch names

Short-lived branch names for Everglow. Adopt going forward; do not rename old branches.

## Shape

```
<type>/<area>/ev-<n>-<short-kebab-slug>
```

Examples:

- `feat/api/ev-96-product-error-codes`
- `fix/mobile/ev-36-photo-upload-403`
- `docs/repo/ev-117-git-branch-names`

| Part | Values |
| ---- | ------ |
| `type` | Same family as Conventional Commits: `feat`, `fix`, `docs`, `chore`, `ci`, `refactor`, `test`, … |
| `area` | `api`, `mobile`, `landing`, or `repo` (`.context`, `AGENTS.md`, root tooling) |
| `ev-<n>` | Linear issue key, lowercase |
| `slug` | Short kebab description of *this* branch (stacked PRs may share an issue with different slugs) |

Lowercase, hyphens only in the slug. Keep the name scannable.

## Relation to commits and Linear

- **PR title** stays the durable Conventional Commit (`feat(api): …`). Branch names are not commits.
- **Linear** may suggest `username/ev-N-…`. Rename to this shape when you start the branch.
- Always include `ev-<n>` when an issue exists.

## Why no slash after the issue number

Prefer `feat/api/ev-96-product-error-codes`, not `feat/api/ev-96/product-error-codes`.

Git stores branches as a ref tree: **no branch may be a prefix of another**. If `feat/api/ev-96` exists, Git refuses `feat/api/ev-96/product-error-codes` (and the reverse). An issue-only branch like `feat/api/ev-96` is a realistic name for epic or exploratory work, so keep the issue key and slug in one path segment.

Also never create a bare area branch such as `feat/api`: that would block every `feat/api/…` branch.
