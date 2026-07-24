# Codex task brief: choose the first SuperMega pilot workflow

Work item: `QA-001`
Role: Product / QA operator
Base SHA: `f2aaa82`
Mode: read-only
Token mode: lean

## Objective

Choose one pilot workflow that is already closest to a real, measurable business outcome:

- Commerce: order intake to fulfilment, payment reconciliation, stock exception, and daily close.
- Production: recurring job to output, problem record, resolution evidence, and owner review.

## In-scope paths

1. `hq/NOW.md`
2. `hq/portfolio.json`
3. `showroom/src/core/CoreApp.tsx`
4. `showroom/src/core/commerce-workspace.ts`
5. `showroom/src/core/production-workspace.ts`

## Out of scope

- No file edits, branches, worktrees, commits, pushes, deployments, or connector writes.
- No YTF, POS, lead-ledger, agent marketplace, new product, or broad visual redesign.
- Do not propose autonomous sends, payments, publishing, production writes, or unsupported revenue claims.

## Deliverable

Return one compact decision packet:

1. Recommended pilot and why it wins now.
2. A five-to-eight-step operator workflow using existing screens and records.
3. The top three P0/P1 blockers to a real pilot, with exact code or UI evidence.
4. One baseline metric, one target metric, one responsible human role, and one review date.
5. The single smallest implementation slice that would improve pilot readiness.
6. What should explicitly wait.

Prefer the workflow with the shortest path to attributable evidence, not the largest feature list.

## Acceptance

- Exactly one pilot recommendation.
- No more than three blockers.
- Every claim points to an inspected path or current HQ fact.
- The next implementation slice fits one task, five paths, and a focused verification command.
