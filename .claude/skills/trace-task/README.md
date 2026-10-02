# trace-task

A small, agent-agnostic skill for writing a **factual trace** after an implementation task:

> request → actions → changes → decisions → validation → result → remaining risks

## Why this exists

When a coding agent finishes, its summary comes from its own memory of the conversation. That memory can drift. Agents claim tests passed that never ran, list files they only read as "changed", and forget the approach they tried and reverted. This skill makes the agent collect **repository evidence first** (git state, diff, dependency changes, detected build/test commands, ticket references) and then write a report. Every claim is tagged, validation has explicit states (`PASS` / `FAIL` / `NOT RUN` / `PARTIAL`), and anything the agent can't back up goes under `UNVERIFIED`.

It works alongside workflow skills such as Matt Pocock's (`to-spec` → `to-tickets` → `tdd` / `diagnosing-bugs` → `code-review`). Those skills do the work; `trace-task` records what was actually done for a ticket.

## How to use it

- **Claude Code:** keep this folder at `.claude/skills/trace-task/`. Run `/trace-task`, or ask "trace this task".
- **Codex and other agents:** point the agent at `SKILL.md` (e.g. "follow .claude/skills/trace-task/SKILL.md"), or copy the folder to wherever that agent loads skills from. The instructions are plain Markdown with no agent-specific features.
- **Collecting evidence by hand:**

  ```
  pwsh -NoProfile -File .claude/skills/trace-task/scripts/collect-git-context.ps1 -Base main -Task "save versioning"
  ```

  The script needs PowerShell 7+ (`pwsh`; it runs on Windows, macOS and Linux) and git. It is read-only.

Reports are written to `.ai/reports/YYYY-MM-DD-HHmm-<short-task-name>.md`, following `assets/report-template.md`.

## Why trace tasks, not sessions

A single task often spans several sessions, agents (Claude Code for the spec, Codex for the implementation) or subagents. A session summary only covers one of those and only what that session remembers. A task trace is anchored to the task's **base ref** and the ticket. So it captures everything that changed for the task, whoever made the change, and it links `issue → implementation → test → commit`, which is what you need when reviewing or auditing.

## Committing reports

`.ai/reports/` starts out gitignored, so traces stay local while you try the workflow. When a trace is worth keeping (a tricky ticket, a decision record, an audit trail), commit it with `git add -f .ai/reports/<file>`, or remove the ignore rule to commit all of them. The reports are plain Markdown with stable headings, so they diff cleanly.

## Copying into another repo

Copy the whole `trace-task/` folder and add `.ai/reports/` to `.gitignore`. Nothing else is required.
