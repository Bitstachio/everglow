# Stacked pull requests (Everglow)

Use this guide whenever a Linear issue is larger than one comfortable review, or when you are about to open more than one PR for the same piece of work. Read it before creating branches or calling `gh pr create`.

The goal is **reviewer understanding**, especially of AI-generated code: each PR should be a coherent, manageable unit of change a teammate can reason about without holding the whole feature in their head.

# Issues are not PRs

- **One Linear issue may ship as several PRs.** Do not force a one-to-one mapping between `EV-N` and a single pull request.
- **One PR still always links an issue.** Every PR has a Linear line (`Part of` or `Closes`) and is attached on the issue. Intermediate stack layers use `Part of [EV-N](…)`. The last layer that completes the issue uses `Closes [EV-N](…)`.
- Parent / sub-issue splits (API vs Mobile) are orthogonal to stacking. A single sub-issue can still be multiple stacked PRs when the diff is too large to review well.

# When to stack

Stack when any of these are true:

- The net change is hard to review as one diff (rough rule: more than one clear story, or a review would skip reading)
- Layers have different risk or deploy shape (contract + client regen, then migration; shared helpers, then a screen; API, then mobile)
- Later layers only make sense on top of earlier ones, and reviewers should see each layer's own diff

Do **not** stack when a single focused PR is already easy to review end to end. Do not invent empty layers for ceremony.

# How to split

Split along **review boundaries**, not ticket count or commit count:

- One user-visible journey or one API concern per layer when possible (for example: edit username → onboarding → display / strip email)
- Keep each layer mergeable in order: bottom targets `main`, each next layer targets the branch below
- Prefer a short stack of sharp PRs over one megapr or a long stack of tiny noiseless diffs
- Name what is deliberately out of scope in each PR body (`Notes`), and point at the next layer or follow-up issue

# Create stacks with `gh stack` from the start

Everglow uses **GitHub Stacked PRs** via the official CLI extension. That creates the Stack object on GitHub so reviewers navigate the chain without a website prompt to "create a stack" after the fact.

Classic `gh pr create --base <previous-branch>` alone sets ancestry but does **not** register the GitHub Stack. Do not open independent PRs and rely on the GitHub UI to assemble them afterward.

## Prerequisites

```bash
gh extension install github/gh-stack
```

Requires GitHub CLI 2.90+ and an authenticated `gh`. Docs: https://gh.io/stacks (public preview; commands may evolve).

Optional for Copilot-style agents: `gh skill install github/gh-stack`. Cursor agents in this repo follow `.context/` instead; do not duplicate this guide into personal rules.

## Agent workflow (non-interactive)

1. Plan the layers (titles and scope) before coding. Tell the requester the planned stack when it is non-obvious.
2. Start from an up-to-date `main` (or the agreed trunk):
   ```bash
   git fetch origin main
   git checkout main && git pull --ff-only origin main
   gh stack init <bottom-branch>
   ```
   Or create the whole chain of empty branches up front:
   ```bash
   gh stack init <bottom-branch> <middle-branch> <top-branch>
   ```
3. Implement the bottom layer, commit, then add the next branch when that layer is ready:
   ```bash
   gh stack add <next-branch>
   ```
   Use `gh stack add -Am "message"` only when that matches the repo commit rules; otherwise stage and `git commit` as usual on the current stack branch.
4. Keep the stack linear: `gh stack rebase` after trunk moves; resolve conflicts, then continue. Prefer `gh stack sync` to fetch, rebase, and push when catching up.
5. Open the GitHub Stack and PRs in one step:
   ```bash
   gh stack submit --auto --open
   ```
   `--auto` skips the interactive editor (required for agents). `--open` marks PRs ready for review instead of draft.
6. Immediately replace auto titles/bodies using [pr-description-generator.md](./pr-description-generator.md):
   ```bash
   gh pr edit <n> --title "…" --body "$(cat <<'EOF'
   …
   EOF
   )"
   ```
   Bottom PR targets `main`. Upper PRs keep the stacked first line (`Stacked on #N; …`) from that guide. Attach every PR on the Linear issue. Strip any tool footer or agent co-author line the CLI or editor may have inserted.
7. After a lower PR merges, `gh stack sync --prune` (or rebase/push), retarget as needed, and update the stacked line on remaining PR bodies.

## Recovering a classic chain

If branches already exist with correct parentage but were opened with plain `gh pr create`, link them into a Stack without redoing the work:

```bash
gh stack link <bottom-branch-or-pr> <next> [<next>...]
# or by PR number, bottom to top:
gh stack link 101 102
```

Prefer not to need this: use `gh stack` from the first branch.

# Review expectations

- Reviewers should be able to approve a layer from its own diff and description.
- CI must be meaningful per layer: if a contract change lands in layer N, regenerate OpenAPI and the mobile client in that same layer (see the PR guide Notes).
- Do not leave a broken trunk for later layers: each layer should pass its own checks once its base is merged.

# Related

- PR title/body: [pr-description-generator.md](./pr-description-generator.md)
- Squash commit body: [commit-description-generator.md](./commit-description-generator.md)
- Linear sync: [linear-issue-generator.md](./linear-issue-generator.md)
