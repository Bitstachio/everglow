# Role & Objective

You are an expert software engineer and git historian. Your task is to analyze the full set of changes on the current feature branch and generate a highly accurate, professional squash-merge PR description.

# Why this message matters

This message becomes the PERMANENT commit on the main branch history after the branch is squash-merged. The individual commits on the feature branch are discarded; only this single message survives. Write it as a cohesive description of one feature or fix, not as a changelog of incremental commits.

# Context & Inputs

- **Full Branch Diff**: Analyze the entire branch relative to its merge base, not just the latest commit. Use `git diff main...HEAD` (substitute the appropriate base branch) for the full content of what changed across the whole branch.
- **Commit Sequence (guide only)**: Use `git log main..HEAD --oneline` to see every commit that will be squashed. Treat this as a guide to what individual pieces of work happened and in what order, not as the structure for your output.
- **Do NOT** scope your analysis to the most recent commit only. Squash merge collapses all commits into a single commit on main, so this message must represent the entire feature branch as one unit.
- **Commit History Reference**: Review recent MERGE commits on the main branch to evaluate the project's established style, conventions, and tone. These permanent main-branch messages are the style precedent, not feature-branch commits.

# Generation Rules & Constraints

1. **Formatting:**
   - Prefix the summary line with a Conventional Commits keyword that
     reflects the net change: feat, fix, chore, refactor, docs, test,
     perf, build, ci, style, or revert.
   - This is a monorepo. Include the affected scope in parentheses
     immediately after the keyword: (api), (mobile), etc. If multiple
     scopes are affected, use (_). If no specific scope applies, omit
     the parentheses entirely. Examples: feat(api): ...,
     fix(mobile): ..., chore(_): ..., docs: ...
   - Write a concise, imperative-mood summary line, including the
     keyword and scope prefix (max 50 characters total).
   - Leave a blank line after the summary line.
   - **Hard-wrap the body at 72 characters.** Insert a real newline
     character before any line would exceed 72 columns. Do NOT rely on
     soft wrapping. Every physical line in the body, including bullet
     points and their continuations, must be 72 characters or fewer.
   - For wrapped bullet points, indent continuation lines to align under
     the text of the bullet (not under the marker).
   - Do NOT wrap identifiers (file names, functions, variables) in
     backtick code spans within the body; write them as plain text.
2. **Output Protocol (critical):**
   - Output the ENTIRE message inside a single fenced code block
     (triple backticks). This preserves the literal newlines so the
     72-character wrapping is actually visible and copy-pasteable.
   - Output nothing else: no preamble, no explanation, no trailing notes
     outside the code block.
3. **Body Content:**
   - Synthesize the _net effect_ of all commits into a coherent
     narrative, rather than listing each commit chronologically.
   - Where the branch contains back-and-forth (e.g. a bug introduced and
     then fixed within the same branch), describe only the final state,
     not the intermediate history.
   - Bullet points should represent logical units of the feature (e.g.
     "Add X," "Refactor Y to support X," "Update tests for X"), not a 1:1
     mapping to individual commits.
4. **Style Alignment:**
   - Analyze the main branch's merge commit history. Match its tone,
     vocabulary, and structural style exactly (e.g., whether it uses
     bullet points, emphasizes why over what, or uses specific technical
     jargon native to this codebase).

# Self-Verification (do this before responding)

Before emitting the answer, silently audit your draft:

- Confirm the summary line starts with the correct Conventional
  Commits keyword, and that the scope (or absence of scope) matches
  the directories actually touched in the diff.
- Count the characters of the summary line (including the keyword and
  scope prefix); it must be <= 50.
- Walk every body line and confirm each is <= 72 characters. If any
  line is longer, break it at a word boundary and re-check.
- Confirm the body describes the final net state of the branch, not the
  chronological back-and-forth of individual commits.
- Confirm the whole message is wrapped in one fenced code block.
  Only output the final, verified message.

# Example of correctly wrapped output

The ruler below marks column 72; no body line may cross it.

```
123456789012345678901234567890123456789012345678901234567890123456789012
```

Example response shape:

```
chore: replace .cursor plans with .context prompts

Move AI assistant context from editor-specific Cursor plan files into
a portable .context directory so commit-generation prompts live in the
repo and are not tied to local .cursor state.

- Add .context/git-commit-generator.md to produce extended commit
  descriptions from the full branch diff and recent merge-commit
  style; imperative subject (max 50 chars), 72-char body wrap
- Remove the stale Auth0 mobile integration plan; that work shipped
  in #21

No runtime, API, or mobile code changes.
```
