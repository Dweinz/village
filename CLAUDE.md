# Hearthhold

Real-time idle town-builder: React Three Fiber on top of a headless TypeScript simulation. Read `CONTEXT.md` for the domain language and `docs/adr/` before changing game rules.

- `npm run dev` / `npm test` / `npm run build`
- All game rules live in `src/sim/` (no DOM, no rendering, no wall clock). UI and scene only read state and dispatch actions (ADR 0001).

## Agent skills

### Issue tracker

Specs and tickets are GitHub issues in `Dweinz/village`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Task tracing

After implementing a ticket (or when asked what was done), write an evidence-backed trace with the `trace-task` skill in `.claude/skills/trace-task/`. Reports go to `.ai/reports/` (gitignored by default). Other agents can follow its `SKILL.md` directly.
