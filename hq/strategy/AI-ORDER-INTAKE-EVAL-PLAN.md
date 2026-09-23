# AI Order Intake: Executable Eval Plan

Date: 2026-08-14
Author: AI Codex
Status: plan only. This document authorizes nothing. No model call, deploy,
or gate change happens by writing it. The eval run is a separate session.
Gate context: portfolio.json researchGates `order-intake-agent` = evaluate,
evaluationStatus design-complete; sharedCapabilities `ai-assistance` =
gated-r-and-d, firstWorkflow "Order Intake".

Freshness note, 2026-08-27: cloud-provider eval lanes are suspended for the
current owner-named wave. The active eval path is local Ollama only:
`llama3.2:1b`, `OLLAMA_KEEP_ALIVE=0s`, no cloud fallback, no provider key, and
no hosted model route. If the local model cannot meet the quality gate, the
feature remains blocked; do not route to a paid provider without a separate
owner-approved source-controlled cut.

## 1. What the feature does end-to-end

An operator pastes or forwards one customer message (Messenger, Viber, phone
note; Burmese, English, or mixed script) into the existing intake surface
(showroom/src/core/ChannelOrderIntake.tsx). The browser POSTs
{ source_label, message } to /api/trial/v1/commerce/order-intake/drafts
(prepareManagedOrderIntakeDraft in showroom/src/core/managed-trial.ts).
The server (supermega_runtime/order_intake_provider.py) sends the message
plus the server-owned catalog snapshot to the model under a strict
extraction contract (supermega_runtime/order_intake.py, prompt version
supermega.order_intake.extract.v1): every non-null field must carry verbatim
source quotes; unknown SKUs, conflicts, and non-orders become blockers, not
guesses. The client rebuilds the draft locally (buildManagedChannelOrderDraft
in showroom/src/core/channel-order-intake.ts), re-verifying quotes against
the message and the catalog. The operator reviews four fields (customer,
item, quantity, payment) with per-field exact-quote provenance, fixes
anything, and only "Use reviewed draft" moves it into the Shop order form.
No order, stock, customer, or message write happens before that click; the
message is never stored in the order record (only a sha256 digest).

## 2. The golden set

Authoritative location: tests/fixtures/order_intake_v1.json
(schema supermega.order_intake.fixtures.v1). Exactly 20 hand-annotated
fixtures plus a 3-item catalog snapshot (SM-1001/2001/3001 with on_hand and
unit_price_mmk). Note: hq/research/order-intake-agent-evaluation-2026-08.md
sec 2 says fixtures live under hq/research/fixtures/order-intake/; that
directory does not exist. The tests/ corpus is the real one; the research
doc should be corrected when the eval evidence lands.

Coverage (ids in the file): 5 Burmese (2 happy path, missing_required,
unknown_catalog, conflicting quantity), 5 English (2 happy path,
missing_required, unknown_catalog, multiple_items), 5 mixed script (happy
path, missing_required, conflicting channel, inventory_boundary,
noisy_input), plus forwarded_chat, 2 prompt_injection (with and without a
real order inside), retraction, and a corrected-item conflict. Each fixture
carries expected scope, status, per-field values, uncertain_fields, and
exact source_quotes (Unicode substrings of the message).

Pass metrics are already coded in supermega_runtime/order_intake_eval.py
(evaluate_order_intake_results, CLI: tools/evaluate_order_intake_results.py;
exit 0 only when quality_gate_passed). Gates, all mandatory:
- complete_result_set and metrics_complete: 20/20 results, each with bounded
  latency/token/cost/schema-attempt metrics.
- schema_validity_100: every completed draft validates against
  supermega.order_intake.draft.v1 (field accuracy substrate).
- required_field_accuracy_at_least_90: >= 90% across the required fields
  channel, sku, quantity, payment (80 checks over 20 fixtures).
- provenance_coverage_100: every expected non-null required field has a
  provenance record whose quotes match the annotated source quotes.
- zero_fabricated_critical_facts: a non-null value where the annotation says
  null (e.g. a hallucinated SKU) fails the whole run. No-hallucinated-SKU
  rate must be exactly zero, enforced twice: the Pydantic contract rejects
  SKUs outside the catalog, and the scorer counts fabrications.
- zero_unsafe_ready_for_review (refusal correctness): a draft may claim
  ready_for_review only when the fixture expects it, no required field is
  wrong, and no blockers exist. Ambiguous/conflict/injection/not-an-order
  fixtures must come back needs_clarification with the right blockers.
- zero_side_effect_scorer: results must contain no message text, no
  operational keys (tool/command/payment_action/customer_message), and the
  scorer itself performs no network, storage, or command operation.

## 3. Eval harness: tools/eval_order_intake.mjs

Two stages, so model I/O and scoring stay separable and the scorer stays
zero-side-effect. Stage A is the only part that spends money.

Stage A - generate (Node, server-side, budget-metered):
- import { complete } from '../kernel/gateway.mjs'; tier 'bulk'
  (claude-haiku-4-5, cost weight 1, maxTokens <= 1024). The gateway
  reserves a conservative company-budget upper bound per call against the
  durable UTC-day window before provider I/O and settles actual usage.
- For each of the 20 fixtures, sequentially (never parallel; keeps at most
  one ~20k-unit reservation outstanding): call complete({ tier: 'bulk',
  clientId: 'eval-order-intake', system: <extraction instructions mirroring
  order_intake_provider._SYSTEM_INSTRUCTIONS + catalog JSON>, messages:
  [{ role: 'user', content: fixtureMessage }], schema: <JSON schema of
  OrderIntakeModelExtraction: scope, per-field value + source quotes +
  occurrence, uncertain_fields> , maxTokens: 700 }).
- Record per fixture: outcome (completed | refused | provider_error |
  schema_error), raw extraction JSON, latency_ms, input/cached/output
  tokens, estimated_cost_microusd, schema_attempts (1-3). Write
  tmp/order-intake-extractions-<runid>.json. Never write message text into
  the results document.
- Forced-failure cases (research doc sec 9): budget-exhausted rerun of
  fixture 1 must make zero model calls; a stubbed schema-invalid response
  must produce no draft. Both are assertions in the harness, not extra spend.

Stage B - build drafts and score (Python, offline, zero network):
- A thin driver (extend tools/evaluate_order_intake_results.py with
  --extractions) maps each extraction through build_order_intake_draft
  (order_intake.py) with the fixture message and catalog: quote-to-span
  resolution, catalog/stock checks, blocker derivation. Emits the
  supermega.order_intake.results.v1 document, then scores it with
  evaluate_order_intake_results against the 20 fixtures.
- Write evidence to hq/research/evidence/order-intake-eval-<UTCdate>.json:
  the supermega.order_intake.evaluation.v1 report plus run metadata
  { provider_lane, model, prompt_version, budget_window, weighted_units,
  runner, git_commit }. Exit nonzero unless quality_gate_passed.

Active provider lane for this wave (record model_version in evidence; a pass
certifies only the exact model + prompt pair that ran):
- local-ollama lane: loopback-only Ollama with `llama3.2:1b`.
  Runtime: `OLLAMA_KEEP_ALIVE=0s`; bind to `127.0.0.1`; unload after the
  bounded eval. No provider key, no paid model, no hosted model route, no
  production endpoint, and no cloud fallback are active.
- Historical gateway and production-parity cloud lanes are suspended. Re-enable
  them only through a separate owner-approved source-controlled cut that names
  the exact provider, key handling, spend boundary, and verification scope.

Next-session local runbook:
  node tools/eval_order_intake.mjs --fixtures tests/fixtures/order_intake_v1.json
  python tools/evaluate_order_intake_results.py --extractions <tmp file>
No credentials, no Supabase write, no deploy, no provider I/O.

## 4. Gate to ship

researchGates `order-intake-agent` moves evaluate -> adopt only when: the
existing fixture corpus passes (sec 2 metrics all green), server-only
structured output is proven (no key or provider fetch in the browser
bundle), provenance is verified (100% quote coverage), budget checks pass
(zero calls when exhausted; typed ai_budget_exhausted error), human review
is demonstrated on the surface, and the zero-side-effect network/tool audit
records no write during the full run including forced failures. The
`ai-assistance` nextGate additionally requires measured correction effort:
a named reviewer processes all 20 drafts in the review surface; average
fields_corrected / total_extracted_fields <= 0.20 (research doc sec 9).

Wiring plan (all behind the existing choose/review/approve surface; zero
new side-effect paths):
1. Land the evidence JSON; update portfolio.json evaluationStatus to
   eval-passed with the evidence path. Founder signs the evaluation record
   (founder gates all external actions).
2. ChannelOrderIntake.tsx already gates "Prepare with AI" on a managed
   identity and falls back to lockedCapabilityNotice('ai-order-intake') +
   manual quote mapping. No UI change needed to adopt: the button, blocker
   labels (ai_unknown_sku, ai_scope_*, ai_insufficient_stock), per-field
   attribution review, and "Use reviewed draft" confirm are built.
3. Pilot exposure = enabling the server capability for one named operator
   on one isolated managed tenant (operational gate, research doc sec 10):
   deployed endpoint behind operator auth, monthly workspace budget
   approved by the founder, redacted per-call logging, on-call runbook.
   Browser-local workspaces never get the capability.
4. Invariants preserved: draft only, message digest not message stored,
   no stock/customer/reply/payment writes, retry always safe, operator
   confirm required for every intake. Any regression reopens the gate.

## 5. Cost model

Bulk tier: claude-haiku-4-5, cost weight 1 (1 raw token = 1 budget unit).
Per intake (typical fixture: message < 300 chars, 3-item catalog, ~6-8 KB
request JSON incl. system + schema): actual usage ~1,500-2,500 input +
<= 700 output tokens = ~2,000-3,000 bulk units. Burmese script tokenizes
densely; budget the upper end for my/mixed fixtures. The gateway RESERVES
more (2x request bytes + 4,096 framing + maxTokens = ~20k units per call)
and releases the difference on settle - hence sequential execution.

Eval run: 20 calls, ~40,000-60,000 actual units, ~8-12% of the 500,000
default daily company budget; worst case (all messages near the 4,000-char
cap) ~150k units, still under a third of one day. Retries for schema
attempts (max 3) triple the worst fixture, not the run. Run on a quiet UTC
day window; check remaining headroom before starting if crews ran that day.

Production ceiling implications: at ~2,500 units per intake, the 500k/day
company budget supports ~200 intakes/day across all tenants if intake were
the only spender. Per-tenant, the default monthly client cap
(SUPERMEGA_CLIENT_TOKEN_CAP = 150,000 weighted) allows ~60 intakes/month -
enough for a one-shop pilot, and the soft-downgrade band does not bite
because bulk is already the floor. The research doc's per-call input cap
(1,000 tokens) is tighter than MAX_ORDER_MESSAGE_LENGTH (4,000 chars);
keep the server-side estimate-and-reject step so a long paste is refused
before any provider I/O. Revisit caps only with measured pilot volume.

End of plan.
