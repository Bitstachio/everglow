# Role & Objective

You write the **extended squash commit body**: the paragraph and bullets that sit under the PR title when the pull request is squash-merged to `main`. Your job is a cohesive description of the net change that will live permanently in git history.

**Do not invent a Conventional Commits subject line.** That subject is the PR title, owned by [pr-description-generator.md](./pr-description-generator.md). On merge, the commit is:

```
<PR title>

<this extended body>
```

The PR body reviewers read while the PR is open is a different Markdown document (Summary, Why, Test plan, Linear line). Do not recreate those sections here.

# Why this message matters

After squash merge, feature-branch commits are discarded. The PR title plus this body are what remain on `main`. Write the body as one feature or fix in its final state, not as a changelog of incremental commits.

# Context & Inputs

- **PR title**: use the existing pull request title as the subject. If none exists yet, write the title with [pr-description-generator.md](./pr-description-generator.md) first; do not invent a parallel subject in this file.
- **Full Branch Diff**: Analyze the entire branch relative to its merge base, not just the latest commit. Use `git diff main...HEAD` (substitute the appropriate base branch).
- **Commit Sequence (guide only)**: Use `git log main..HEAD --oneline` to see what will be squashed. Guide only; do not structure the body as one bullet per commit.
- **Commit History Reference**: Review recent MERGE commits on the main branch for tone and structure of the _body_ (how they describe net effect). Match that style. Do not rewrite or replace the PR title.

# Generation Rules & Constraints

1. **Formatting:**
   - Output **only the body**: no Conventional Commits type/scope line, no blank subject placeholder.
   - **Hard-wrap every line at 72 characters.** Insert a real newline before any line would exceed 72 columns. Do NOT rely on soft wrapping. Every physical line, including bullet points and their continuations, must be 72 characters or fewer.
   - For wrapped bullet points, indent continuation lines to align under the text of the bullet (not under the marker).
   - Do NOT wrap identifiers (file names, functions, variables) in backtick code spans within the body; write them as plain text.
2. **Output Protocol (critical):**
   - Output the ENTIRE body inside a single fenced code block (triple backticks) so the 72-character wrapping is visible and copy-pasteable.
   - Output nothing else: no preamble, no explanation, no subject line, no trailing notes outside the code block.
3. **Body Content:**
   - Synthesize the _net effect_ of all commits into a coherent narrative.
   - Where the branch contains back-and-forth (e.g. a bug introduced then fixed on the same branch), describe only the final state.
   - Bullet points should represent logical units of the feature (e.g. "Add X," "Refactor Y to support X," "Update tests for X"), not a 1:1 mapping to individual commits.
   - Do not include Test plan, Screenshots, Linear magic words, stacking notes, or other review-only PR content.
   - No AI attribution: no "Generated with" / "Created by" footers, no tool or model names as authorship, and no `Co-authored-by:` (or other trailers) for Cursor, Claude, Copilot, or any agent. Human co-authors only when a real person collaborated. Same rule as [AGENTS.md](../AGENTS.md) and the PR guide.
4. **Style Alignment:**
   - Match the main branch merge-commit bodies for tone, vocabulary, and structure (paragraph then bullets, emphasis on why vs what, project jargon).

# Self-Verification (do this before responding)

Before emitting the answer, silently audit your draft:

- Confirm there is **no** Conventional Commits subject line in the output.
- Walk every body line and confirm each is ≤ 72 characters. If any line is longer, break it at a word boundary and re-check.
- Confirm the body describes the final net state of the branch, not chronological back-and-forth.
- Confirm there is no AI attribution and no agent `Co-authored-by` trailer in the body.
- Confirm the whole body is wrapped in one fenced code block.
  Only output the final, verified body.

# Example of correctly wrapped output

The ruler below marks column 72; no body line may cross it.

```
123456789012345678901234567890123456789012345678901234567890123456789012
```

If the PR title is `chore: replace .cursor plans with .context prompts`, the generator output is only:

```
Move AI assistant context from editor-specific Cursor plan files into
a portable .context directory so commit-generation prompts live in the
repo and are not tied to local .cursor state.

- Add .context/git-commit-generator.md to produce extended commit
  bodies from the full branch diff and recent merge-commit style;
  72-char wrap, no subject line
- Remove the stale Auth0 mobile integration plan; that work shipped
  in #21

No runtime, API, or mobile code changes.
```
