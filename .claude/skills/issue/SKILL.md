---
name: issue
description: Implement a GitHub issue end to end and open a PR. Use when the user says "do issue #N", "work on issue N", "pick up the next issue", or invokes /issue with a number.
---

# Implement a GitHub issue

Hearthhold is a single-player idle town-builder in the browser. Keep each PR small and focused on one issue.

1. **Read the issue.** `gh issue view <N> --comments`. With no number, list open issues with `gh issue list --label ready-for-agent` and ask which one. If the issue is ambiguous in a way that changes what you build, ask before coding.
2. **Branch from fresh main.** `git switch main && git pull --ff-only && git switch -c issue-<N>-<short-slug>`.
3. **Implement** with the `implement-issue` skill (diagnose or test-first, verify, self-review, trace).
4. **Play it.** For anything the player can see, run `npm run dev` and try the change in the game.
5. **Open the PR.** Commit, push, and `gh pr create` with `Closes #<N>` in the body, a short summary, and how to try it in the game.
6. **Report** the PR link and the CI result. Do not merge unless the user asks.
