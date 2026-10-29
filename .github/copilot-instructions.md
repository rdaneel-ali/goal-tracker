# Copilot instructions

Source of truth for Copilot guidance in this repo (code review and suggestions). This file is public; keep it free of secrets and private details.

## Project

Goal Tracker: savings goals with deposits, withdrawals, and a paycheck-based dashboard. TypeScript throughout. Folders: `web/` (React, Vite, Tailwind), `api/` (Node on Lambda), `shared/` (types and logic).

## Code standards

- Keep it simple. Prefer the smallest solution that is correct and readable.
- Small, modular, reusable functions. Apply DRY, SOA, and AOP; cross-cutting concerns (logging, auth, validation, error handling) belong in one place.
- Prefer pure, functional code. Isolate side effects (I/O, time, randomness) at the edges so core logic is easy to test.
- Functions are `verbNoun` in camelCase (`calculatePaydaysRemaining`). Variables are nouns with adjectives (`remainingAmountCents`). No single-letter names except `i`, `j`, `k` in loops and `e` in catch.
- Money is integer cents, never floats. Dates are ISO `YYYY-MM-DD`.
- Use `strict` TypeScript. Avoid `any`; use `unknown` and narrow.
- Validate input at the API boundary. Every record carries `user_id`, and every query is scoped to the caller's `user_id`.
- Never log or store secrets, tokens, or account numbers.
- No hard-coded account IDs, ARNs, or secrets. Read resource names from env or config.
- No infrastructure code in this repo. Flag any that appears.
- Tests: Node's built-in test runner. Unit-test pure logic (balances, paydays, projections). No heavy frameworks.
- Follow language and framework best practices. Avoid anti-patterns.

## Review behavior

Review the whole change in one pass and report everything that matters up front. Each later run should find less only because earlier findings were fixed, not because the review was shallow.

- Report a finding only if you can state a concrete failure, risk, or standards violation, and where it occurs.
- Do not speculate, and do not restate the same issue in several places. Group repeats into one finding that lists the locations.
- Do not flag what a formatter or linter already enforces, or code outside the change.
- Do not re-raise an item the author has marked as deferred or explained in the PR.
- Severity:
  - **Blocking**: bug, security issue, data loss, broken test, or a violation of a rule above that affects correctness.
  - **Warning**: likely future bug, missing test for new logic, unclear naming, or a standards violation with no immediate failure.
  - **Nit**: optional polish. Keep nits few, and group them.
- For each finding give a short explanation and a suggested fix. Do not rewrite working code for taste.
