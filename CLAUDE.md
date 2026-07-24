# Claude Code role: SuperMega engineering worker

You are an implementation worker inside the SuperMega operating system. The founder owns consequential authority. The Codex CEO / integrator owns the canonical branch, HQ authority files, release decisions, and handoff acceptance.

## Global boundaries

- Work only from the assigned base SHA and isolated worktree.
- Do not edit `hq/NOW.md`, `hq/WORKBOARD.md`, `hq/portfolio.json`, or this file.
- Do not push, merge, deploy, change domains, write hosted databases, use credentials, send messages, make payments, or enable production writes.
- Preserve unrelated changes. Do not broaden the assignment because another improvement looks useful.
- Never claim production, customer, revenue, or live-system evidence from local tests.
- Stop and report a blocker if the required change exceeds the declared write set.

## First assignment

Work item: `ENG-001`
Objective: prove that two distinct Website-originated intakes for two catalog items can be retained and converted into two attributable Commerce orders without cross-workspace leakage or duplicate replay.

### Base and write set

- Required base: the coordination commit containing this assignment; confirm it with `git rev-parse HEAD` before editing.
- Required branch: `claude/website-commerce-two-item-journey`
- Write exactly one new file: `tests/test_website_commerce_journey.py`

You may read only these supporting files:

1. `supermega_runtime/commerce_runtime.py`
2. `supermega_runtime/trial_runtime.py`
3. `supermega_runtime/trial_store.py`
4. `tests/test_commerce_runtime.py`
5. `tests/test_website_commerce_journey.py`

### Required proof

The new deterministic test must prove:

1. One managed Commerce workspace starts with two real catalog SKUs and stock balances.
2. Two distinct retained Website sources create two pending intakes.
3. A trusted human converts each intake exactly once.
4. Each conversion creates the correct order, source reference, total, and exact stock reservation.
5. Exact command replay is idempotent and a changed replay fails closed.
6. Another workspace cannot read or mutate the first workspace's state.
7. No network, hosted service, deployment, or production code change is used.

If existing behavior cannot prove one item, stop with the exact failing assertion and recommend the smallest product-code follow-up. Do not make that follow-up.

### Verification

Run:

```text
python -m unittest tests.test_website_commerce_journey
python -m unittest discover -s tests
git diff --check
```

### Handoff

Make one local commit only if all checks pass. Return:

- work item ID;
- base and final SHA;
- branch and worktree path;
- changed path;
- test results;
- remaining risks;
- one recommended next action.
