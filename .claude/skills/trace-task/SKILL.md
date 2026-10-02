---
name: trace-task
description: Write a factual, evidence-backed trace of an implementation task (request → actions → changes → decisions → validation → result → remaining risks) to .ai/reports/. Use after finishing or pausing a task, a ticket, or a skill-driven workflow (e.g. tdd, diagnosing-bugs), or when the user asks "what did you do", "trace this", or "write a report".
---

# Trace Task

Produce a trace of **one task** that a human can audit. The trace is built from repository evidence first and your memory second. Anything you can't back with evidence is marked **UNVERIFIED**.

## Rules

1. **Evidence beats memory.** Run the collector script before writing anything. Take changed files, the diff stat, dependencies, branch, commit and linked tickets from its output, not from recollection.
2. **Never claim a pass without proof.** Mark a build or test as PASS only if you ran it in this task and saw it succeed (exit code 0 or a passing summary). Quote the summary line. Otherwise mark it NOT RUN or UNVERIFIED.
3. **Validation states are exactly:** `PASS`, `FAIL`, `NOT RUN`, `PARTIAL` (some ran or some passed; say which).
4. **Changed means changed in git.** A file appears under CHANGE only if the collector lists it as added, modified, deleted, renamed or untracked. Files you only read go under ACTION ("inspected …") or nowhere.
5. **Record failed attempts.** Include meaningful dead ends and reverted approaches as ACTION entries with the reason they were abandoned, even when they left no diff.
6. **Trace the task, not the session.** One task may span several agents, sessions or subagents. Collect evidence from the task's base ref (the branch point or the commit before the task started), so that work by other agents is included. Attribute it when you know who did it, and mark it UNVERIFIED when you don't.
7. **Be brief and factual.** No praise, no hedging prose. One line per entry where possible.

## Entry tags

| Tag | Meaning | Evidence |
|---|---|---|
| `REQUEST` | What was asked: user words, ticket or spec | Quote or link |
| `ACTION` | Something done: command run, file inspected, approach tried or reverted | Command or description |
| `CHANGE` | A file added, modified, deleted or renamed | Collector output |
| `DECISION` | A choice made and why, including ADR or glossary constraints respected | Rationale; ADR link if any |
| `VALIDATION` | A build, test, lint or manual check with its state | Command + quoted result |
| `REMAINING` | Known gaps, follow-ups, risks, TODOs | — |
| `UNVERIFIED` | A claim you believe but can't back with evidence | Say why it can't be verified |

## Process

1. **Identify the task.** Find the request and any ticket/spec reference (issue number, URL, spec file). If the repo documents an issue tracker (e.g. `docs/agents/issue-tracker.md`), use it to fetch the ticket's title and acceptance criteria.
2. **Pick the base ref.** Use the commit the task started from. If you don't know it, use the merge-base with the default branch. On the default branch with uncommitted work only, use `HEAD`.
3. **Collect evidence.** Run:

   ```
   pwsh -NoProfile -File <skill-dir>/scripts/collect-git-context.ps1 -Base <ref> [-Task "<short name>"]
   ```

   It prints a Markdown evidence block (branch, commits, file changes, diff stat, dependency manifest diffs, known build/test commands, issue references in commit messages). If `pwsh` isn't available, run the equivalent git commands listed in the script header and say so in the report.
4. **Validate if you can.** If the build/test commands are known and you haven't run them since your last change, run them now and record the result. If you can't (no time, missing tooling, user said not to), record `NOT RUN` and the reason.
5. **Write the report.** Copy [assets/report-template.md](assets/report-template.md) to `.ai/reports/YYYY-MM-DD-HHmm-<short-task-name>.md` (local time, kebab-case name, at most 5 words). Fill every section. Paste the collector output into the Evidence appendix unchanged.
6. **Check the acceptance criteria.** If the task came from a ticket, list each acceptance criterion with its state (PASS / FAIL / NOT RUN / PARTIAL) and the evidence for it.
7. **Report back** with one line and the report path. Don't paste the report into chat.

## Traceability links

Fill the `issue → implementation → test → commit` chain as far as the evidence allows:

- **issue:** the ticket/spec reference (e.g. `owner/repo#12`).
- **implementation:** changed source files.
- **test:** test files changed or run, with their validation state.
- **commit:** short SHAs in the task's range. Write `uncommitted` if the work isn't committed yet.

Leave a link as `—` rather than guessing.
