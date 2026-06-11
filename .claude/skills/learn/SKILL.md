---
name: learn
description: Distills a session's findings into actionable updates for CLAUDE.md, docs, memory, or new skills. Use at the end of a working session to capture gotchas, bugs, decisions, conventions, reusable patterns, and project state before closing.
---

# Learn

Capture what this session taught us before closing.

## Process

### Step 1 — Scan the conversation

Review the full conversation for findings in these five categories:

- **Gotchas / bugs hit** — things that tripped us up; mistakes Claude made that were corrected; rules that would prevent recurrence
- **Architecture / design decisions** — explicit choices made about how the system works
- **Conventions discovered** — patterns, rules, or habits that should be codified
- **Reusable workflows** — multi-step processes worth packaging as a skill
- **Project state** — new context, ongoing work, or decisions that future conversations need

Skip anything already documented in `CLAUDE.md`, `docs/`, or memory.

### Step 2 — Present overview

List all findings as a numbered summary. For each, show the finding in one sentence and its suggested destination. If nothing found, say so and stop.

### Step 3 — Work through each finding

For each finding in order:

1. Describe the finding and why it's worth capturing
2. Show the **exact proposed text** to add (or for a skill: describe what it would do and where)
3. Ask: **apply / edit / skip**
   - **apply** → write it immediately
   - **edit** → user provides corrected text, then write
   - **skip** → move on
4. Confirm what was written before moving to the next finding

## Target routing

| Category | Destination |
|---|---|
| Gotcha / bug hit | `CLAUDE.md` — add a rule under the relevant section |
| Architecture / design decision | `docs/claude/` — see routing note below |
| Convention | `docs/claude/conventions.md` |
| Reusable workflow | Describe the skill; tell user to run `/write-a-skill` to build it |
| Project state | Memory — follow the memory file format (frontmatter + Why/How to apply) |

**Routing docs/** — Read `CLAUDE.md`'s "Reference docs" section to discover all available doc files (the list may grow over time). Pick the most relevant file based on content. If genuinely ambiguous between two files, ask before drafting.

## Writing guidelines

- Match the existing style and voice of the target file
- For `CLAUDE.md`: slot rules under the most relevant existing section; create a new section only if nothing fits
- For memory: use the established frontmatter format and link related memories with `[[name]]`
- Be terse — one sharp rule beats a paragraph of explanation
