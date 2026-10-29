# CLAUDE.md

Working agreements for Claude Code in this repo. This file is public. Keep private details (account IDs, ARNs, emails, budgets, internal doc locations) in `CLAUDE.local.md`, which is gitignored.

## Project

Goal Tracker: savings goals, deposits and withdrawals, and a paycheck-based dashboard. TypeScript everywhere: React + Vite + Tailwind (`web/`), Node on Lambda (`api/`), shared types and logic (`shared/`). npm workspaces monorepo.

## Guardrails

- One goal per session. Park off-topic items in a list at the end.
- Ask clarifying questions first. Confirm before any large result.
- Stop at each step marker and wait for the user.
- Keep changes small and reviewable.
- Never commit, push, or create a PR unless the user says so. The user may commit from VS Code Source Control.
- Commit messages: `Verb: short desc` (e.g. `Add: repo scaffold`, `Fix: payday count`). The description may include a version number but never repeats the verb.
- The user pastes only the last 20-30 lines of error output.
- When the session is getting long, say so and give a handoff playbook: decisions, pending, open options with recommendations, next steps. Minimal prose.
- Never create, change or delete cloud resources without the user's explicit OK.
- Do not add infrastructure code to this repo.
- Never put secrets, account IDs, ARNs, or personal data in tracked files.

## Workflow

1. Read `.github/copilot-instructions.md` before writing or reviewing code.
2. Write tests first where practical (TDD). Use light tooling: the Node built-in test runner, no heavy frameworks.
3. When code is complete, run the tests. They must be green.
4. Run the code-review skill. Never auto-fix findings. Present a short report: each finding with concise options and a recommendation.
5. Iterate until tests are green, no blocking items remain, and every warning and nit is resolved or deferred.
6. Commit and push only on the user's verbal command or approval.
7. When ready for a PR, tell the user. Create the PR only after they say so.

## Pull requests

Keep the body tight. Not a story, and nothing sensitive.

```
## Summary
- What was added, changed, fixed or implemented (bullets)

## Testing
- What was run and the result
```

## Coding standards

Keep it simple. Do not over-engineer. Follow the code standards and review calibration in `.github/copilot-instructions.md`.
