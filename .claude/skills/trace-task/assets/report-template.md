# Trace: <short task name>

- **Date:** YYYY-MM-DD HH:mm
- **Agent(s):** <e.g. Claude Code (Opus), Codex; note subagents>
- **Ticket / spec:** <owner/repo#N, URL or path, or —>
- **Branch:** <branch> · **Base:** <ref> · **Head:** <sha or "uncommitted">
- **Outcome:** <DONE | PARTIAL | BLOCKED | ABANDONED> — <one line>

## Traceability

| Issue | Implementation | Test | Commit |
|---|---|---|---|
| <#N> | <changed source files> | <test files, with state> | <sha(s) or uncommitted> |

## REQUEST

- <quoted request or ticket title + link>

## ACTION

- <command run / file inspected / approach tried>
- <failed or reverted attempt> — abandoned because <reason>

## CHANGE

<!-- Only files the collector lists. Inspected-only files do not belong here. -->

| Status | File | Why |
|---|---|---|
| M | path/to/file | <purpose of the change> |

**Dependencies:** <added / removed / bumped, from the manifest diff, or "none">

## DECISION

- <choice> — because <reason> (<ADR / glossary / ticket ref if any>)

## VALIDATION

| Check | Command | State | Evidence |
|---|---|---|---|
| Tests | `<cmd>` | PASS / FAIL / NOT RUN / PARTIAL | <quoted summary line or reason not run> |
| Build | `<cmd>` | PASS / FAIL / NOT RUN / PARTIAL | <…> |

**Acceptance criteria** (if from a ticket):

- [state] <criterion> — <evidence>

## REMAINING

- <known gap / risk / follow-up>

## UNVERIFIED

- <claim> — <why it can't be verified>

## Appendix: Evidence

<!-- Paste collect-git-context.ps1 output unchanged. -->
