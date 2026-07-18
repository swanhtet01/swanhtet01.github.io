# SuperMega Agent Solutions Foundation

This service turns approved business material into review-ready working drafts. It is the first product foundation for sellable Shop, Plant, and supervised AI Agent Solutions trials.

## What it does now

- Lists ready-to-configure Shop, Plant, and Agent templates.
- Produces non-persistent trial blueprints with first-run steps, data requests, acceptance checks, and an approval boundary.
- Scores customer-imported JSON or CSV lead lists only when their source and permitted-use status are supplied.
- Produces up to 1,000 non-persistent trial blueprints in a batch for approved prospect lists.
- Summarizes customer-provided excerpts into an evidence-linked brief with approvals required for every proposed action.
- Produces computer-use proposals for mobile, desktop, or browser work without executing them.

## What it deliberately does not do

- It does not authenticate to Gmail, Drive, chat platforms, or customer systems.
- It does not fetch websites, scrape directories, send email, create accounts, write CRM records, or contact leads.
- It does not run browser, mobile, or desktop actions.
- It does not persist trial, lead, or source data.
- Insight Reader requests disable Agents SDK tracing because supplied excerpts may be sensitive.

Those capabilities require customer consent, an approved backend, connector-specific scopes, audit storage, and explicit action approval.

## Run locally

The root worktree `.env.local` contains `OPENAI_API_KEY` and is loaded only at runtime. It is ignored by Git and must never be copied into this package or printed.

```powershell
Set-Location agent_solutions
uv sync --extra dev
uv run python -m agent_solutions.main --smoke
uv run python -m agent_solutions.main
```

The service starts at `http://127.0.0.1:8080` by default. Set `PORT` to override it.

## API surface

| Endpoint | Purpose | Side effects |
| --- | --- | --- |
| `GET /health` | Runtime and key configuration status | None |
| `GET /v1/templates` | Template catalog | None |
| `POST /v1/trial-blueprints` | Configures an in-memory trial plan | None |
| `POST /v1/trial-blueprints/batch` | Produces up to 1,000 non-persistent trial plans | None |
| `POST /v1/lead-fit` | Scores imported, permitted leads | None |
| `POST /v1/lead-fit/csv` | Scores a customer-supplied CSV lead list | None |
| `POST /v1/briefs` | Runs the Insight Reader on supplied excerpts | Model call only |
| `POST /v1/action-proposals` | Creates an approval-required computer-use plan | None |

## Example brief request

```json
{
  "template_id": "plant.iso-capa",
  "question": "What needs review before this corrective action is closed?",
  "sources": [
    {
      "source_id": "nc-17",
      "label": "Non-conformance note",
      "source_kind": "provided_text",
      "permission_status": "customer_provided",
      "source_owner": "Quality team",
      "text": "Batch 102 was held after a labeling mismatch. Containment is complete; root cause is not recorded."
    }
  ]
}
```

Every response remains draft-only. `docs/prompt.md` contains the exact operating prompt and its safety constraints.

`POST /v1/briefs` reports `503 model_quota_unavailable` if the configured OpenAI project has no API quota. That is a deployment prerequisite, not a reason to fall back to an unbounded local or connector-based action.

## Lead CSV contract

`POST /v1/lead-fit/csv` accepts UTF-8 CSV files up to 5 MB and 1,000 usable rows. Required columns are `lead_id`, `business_name`, and `permission_status`. Optional columns are `industry`, `city`, `public_summary`, `website`, `source_url`, `source_owner`, and `do_not_contact`.

`permission_status` must be `customer_provided` or `customer_approved` before a row can be recommended for human review. `not_confirmed` and `prohibited` are blocked. `do_not_contact` remains suppressed. The endpoint does not find, enrich, scrape, contact, or store leads.
