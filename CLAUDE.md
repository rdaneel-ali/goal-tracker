# CLAUDE.md

Working agreements for Claude Code in this repo. This file is public. Keep private details (account IDs, ARNs, emails, budgets, internal doc locations) in `CLAUDE.local.md`, which is gitignored.

## Project

Goal Tracker: savings goals, deposits and withdrawals, and a paycheck-based dashboard. TypeScript everywhere: React + Vite + Tailwind (`web/`), Node on Lambda (`api/`), shared types and logic (`shared/`), Terraform (`infra/`). One repo, npm workspaces.

## Guardrails

- One goal per session. Park off-topic items in a list at the end.
- Ask clarifying questions first. Confirm before any large result.
- Stop at each step marker and wait for the user.
- Keep changes small and reviewable.
- Never commit, push, or create a PR unless the user says so. The user may commit from VS Code Source Control.
- Commit messages: `Verb: short desc` (e.g. `Add: repo scaffold`, `Fix: payday count`). The description may include a version number but never repeats the verb.
- The user pastes only the last 20-30 lines of error output.
- When the session is getting long, say so and give a handoff playbook: decisions, pending, open options with recommendations, next steps. Minimal prose.
- Never run `terraform apply` or any other change to cloud resources without an explicit OK after reviewing the plan.
- Never put secrets, account IDs, ARNs, or personal data in tracked files.

## Workflow

1. Write tests first where practical (TDD). Use light tooling: the Node built-in test runner, no heavy frameworks.
2. When code is complete, run the tests. They must be green.
3. Run the code-review skill. Never auto-fix findings. Present a short report: each finding with concise options and a recommendation.
4. Iterate until tests are green, no blocking items remain, and every warning and nit is resolved or deferred.
5. Commit and push only on the user's verbal command or approval.
6. When ready for a PR, tell the user. Create the PR only after they say so.

## Pull requests

Keep the body tight. Not a story, and nothing sensitive.

```
## Summary
- What was added, changed, fixed or implemented (bullets)

## Testing
- What was run and the result
```

## Coding standards

Keep it simple. Do not over-engineer.

- Favor modular, reusable, functional pieces. Apply DRY, SOA, and AOP (cross-cutting concerns such as logging, auth, and validation live in one place).
- Functions: `verbNoun`, camelCase (`calculatePaydaysRemaining`).
- Variables: nouns with adjectives (`remainingAmountCents`). No single-letter names except conventional ones: `i`, `j`, `k` in loops; `e` in catch.
- Money is integer cents. Dates are ISO `YYYY-MM-DD`.
- Follow language and framework best practices. Avoid anti-patterns.
- Details and review calibration: `.github/copilot-instructions.md`.
