---
name: implement-issue
description: Hearthhold's recipe for implementing a GitHub issue or spec end to end (diagnose or test-first, verify, self-review, trace, report). Use whenever you implement an issue in this repo, including in the Claude GitHub Actions workflow and from the /issue skill.
---

# Implement an issue in Hearthhold

Matt Pocock's `/implement`, adapted to this repo. The issue (title, body and comments) is the spec. Keep the change small and focused on it.

1. **Orient.** Read `CLAUDE.md`, `CONTEXT.md` (use its terms in code, tests and copy) and the ADRs in `docs/adr/` that touch the area. Find the code involved.
2. **Pick the approach.**
   - **Bug:** invoke the `diagnosing-bugs` skill first: reproduce, find the root cause, then fix it with a regression test.
   - **New behaviour:** invoke the `tdd` skill. Game rules are pure, headless simulation in `src/sim/` (ADR 0001), tested with Vitest; the UI (`src/App.tsx`, `src/Scene.tsx` and friends) only reads state and dispatches actions. Write the chosen seams down before the first test.
   - **Styling, copy, docs or config only:** no new tests needed.
3. **Build in vertical slices:** one failing test, the code to pass it, repeat. Run `npx vitest run <file>` and `npx tsc --noEmit` as you go.
4. **House rules.**
   - No DOM, rendering or wall clock in `src/sim/`; time comes in as an input.
   - Content and balance numbers live in `src/sim/data.ts`.
   - A change to the save format must keep old saves loading (see the save tests).
5. **Verify.** Run `npm test` and `npm run build` (full suite once, at the end) and fix anything they report.
6. **Review.** Invoke the `code-review` skill against `main`, even for small changes. For a small diff (about three files or fewer) it may run Standards and Spec in one pass instead of parallel sub-agents. Fix what it finds and re-run the checks.
7. **Trace.** Write the task trace with the `trace-task` skill (`.claude/skills/trace-task/`).
8. **Report:** what changed, the seams and tests, which skills you used, and how to try it in the game (`npm run dev`).
