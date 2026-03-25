# Framework Integration Backlog

## Order
1. `SQLModel`
2. `Cloud Run` + `Cloud Scheduler` + `Cloud Tasks` + `Secret Manager`
3. `Polars` + `DuckDB`
4. `LangGraph`
5. `PydanticAI`
6. `Stagehand` or `Playwright` as sidecars
7. `Temporal` later

## Why
- `SQLModel` comes first because the ERP/control gaps are mostly record gaps, not model gaps.
- The Cloud Run stack comes next because the machine still depends too much on one laptop.
- `Polars` and `DuckDB` are a fast win because the pilot and target clients are spreadsheet-heavy.
- `LangGraph` matters once flows need checkpoints and approvals.
- `PydanticAI` matters when agents start writing business state more deeply.
- Browser automation belongs at the edge, not at the center.

## What Not To Do
- Do not make browser/computer-use tools the source of truth.
- Do not add a vector stack before receiving, inventory, approvals, and cash records are stronger.
- Do not sell full autonomy before the control and approval layer is deeper.
