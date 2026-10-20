# SuperMega AI-native operating loop

Updated: 2026-10-20. Owner: founder; integration writer: CTO. Status: **design, source implementation and local tests only**. This is the execution companion to [SuperGoal](../supergoal.md), not a second queue, agent runtime or launch approval.

## Outcome and decision

“Working autonomously, scaling infinitely” means more *verified merchant value per unit of time and cost*. It does not mean unlimited workers or autonomous production authority. An agent should use AI to generate options, inspect different media, challenge assumptions and discover counterexamples faster than a human can. A tool, test, exact artifact or real operator must then establish whether the result is true. Repeatable failures become evaluation cases; only passing changes become skills, prompts or code. The workcell runs on the already approved paid VPS/cloud capacity when its worker and spending boundary are proved. Browser QA and physical-device QA remain separate.

**Architectural decision:** extend the existing durable work-order, evaluation and mission-stage path in `kernel/agent-company-*.mjs`; do not add another orchestrator or install Agent Substrate/Temporal for a single VPS. The code has scoped plans, role budgets, evidence digests, durable claims, terminal results and accepted evaluations before stage advance. This change binds evaluations to the exact result hash and rejects a stale or mismatched stage advance. Its four acceptance booleans remain a review record, not a substitute for a linked test, source revision or external acceptance. Add verifier receipts and the feedback loop before increasing agent count.

## Current audit (20 October)

| Capability | Grade | Evidence and implication |
| --- | --- | --- |
| Bounded work orders and stage evaluation | **PASS, source only** | `kernel/agent-company-work-orders.mjs` binds plans to evidence hashes and durable claims; `kernel/agent-company-missions.mjs` requires an accepted evaluation to advance. No hosted run follows from source inspection. |
| Cloud/VPS agent execution | **NOT RUN** | The read-only local-company status returned zero active jobs, zero schedules and a parked legacy task. It identified itself as `localOnly`; its local RAM block is irrelevant to hosted readiness. No VPS worker receipt was produced. |
| Independent, source-bound agent quality | **PARTIAL** | This source change hashes the terminal result into each evaluation and requires that exact binding at mission advance; focused tests cover missing, stale and tampered hashes. `accurate`, `complete`, `usable` and `boundarySafe` are still caller-supplied booleans. A grader has not replayed a pinned evaluation case or verified the produced artifact. |
| Product AI in Shop | **BLOCKED for hosted use** | Native photo-to-catalog source and review guards exist, but the hosted model endpoint, per-account meter and operator acceptance remain open in the launch-control record. No paid model call is authorized by this document. |
| Merchant outcome and marketing evidence | **NOT RUN / FAIL for live parity** | Time to first sale, correction rate, recovery and actual customer use are unmeasured. A read-only 20 October fetch of `supermega.dev` still shows three customer-facing product sections, “One SuperMega account,” and illustrative screens. More agents cannot cure that evidence gap. |

**Compatibility gate:** accepted evaluation records written before the result-hash change do not carry `resultHash` and must fail closed at mission advance. Before deploying the change, read active hosted mission/evaluation metadata. If any legacy stage exists, design a separately reviewed re-evaluation or restart path; do not silently stamp an old acceptance onto a current result. No hosted data migration or worker rollout is performed here.

## The one-loop contract

1. **Observe:** take one merchant job and its initial state; capture a source revision, screenshot/build or provider record with provenance. Separate an incumbent's marketing claim from an observed task. Use REA only for authorized packaged/runtime questions, with exact artifact hash and recorded unknowns.
2. **Propose:** one agent creates a small number of candidate fixes. A second, bounded AI pass may generate counterexamples, alternative designs or failure cases. It sees the same task and a separately named evaluation rubric; it does not act as an independent human approver.
3. **Implement:** one writer integrates the selected change. The work order carries in-scope paths, tool/data allowlist, task and spend ceiling, expected artifact, timeout, retry limit and stop condition. External writes, customer contact, production, access and payment remain owner-gated.
4. **Verify:** deterministic tests and exact-source checks run first; then browser, device, managed-data and merchant tasks as applicable. A model can help inspect traces and grade subjective UX, but its grade never upgrades missing test/device/customer evidence. Failed or unknown checks fail closed.
5. **Learn:** add a reproduced failure to a small versioned evaluation set. Compare candidate versus baseline on the *same cases*; measure merchant task completion, corrections, latency, duplicate effects, recovery and model/tool cost. Update one existing skill or runbook only when the improvement repeats. Keep the old behavior available for rollback.

Each work order must contain `job`, `start_state`, `source_revision`, `scope`, `allowed_tools`, `data_class`, `budget`, `artifact`, `acceptance`, `evidence_type`, `stop_condition`, `owner` and `handoff`. Each result must link a durable receipt and say `PASS`, `FAIL`, `BLOCKED` or `NOT RUN`. The result cannot supply its own independent review or reinterpret a synthetic pass as production readiness.

## First task packet, ready for a bounded rehearsal

| Field | Value |
| --- | --- |
| Job | A Myanmar merchant adds a real product, scans/sells it, finds the receipt, and recovers after interruption. |
| Start state | Empty synthetic Shop workspace and a pinned candidate build. No customer records. |
| Inputs | Native source/build and the current launch-control hardware/account gates; two local and two global first-party task references. |
| Agent contribution | Generate no more than three friction hypotheses and one counterexample per hypothesis; propose the smallest testable fix. |
| Artifact | One source-bound task trace, one chosen fix with exact paths, one test/QA result, and a cost/latency receipt. |
| Acceptance | No invented device/payment/hosted claim; first-sale flow preserves money and stock under duplicate/restart cases; a human can complete the named task on a named device. Source checks alone can only earn source-level PASS. |
| Budget and stop | One queued job, bounded time and retries, no model call until provider/task/spend ceiling is explicitly authorized. Stop on missing authority, source mismatch, unverified write, or unavailable evidence. |
| Handoff | CTO integrates one reviewed fix; founder owns production, spend and release gates. |

This packet is **not queued**. The first executable model-free action is to pin a candidate build and create a synthetic baseline task trace. The first hosted workcell proof is one authorized synthetic job on the existing VPS: queue → claim → restart → resume or safe retry → artifact → independent evaluation → cost receipt. Browser and physical-hardware acceptance then run separately.

The source-only scorer `tools/score_ai_native_shop_benchmark.mjs` now implements the first comparison contract. Run `node tools/score_ai_native_shop_benchmark.mjs <synthetic-packet.json>` after collecting all three arms for each pinned case: `current`, `one_agent` and `proposer_challenger`. A packet names one exact 40-character source revision, synthetic case digests, elapsed time, corrections, measured USD cost and a status for every arm. A `PASS` needs a non-model verifier type plus an allowlisted repository receipt whose bytes match its SHA-256 and whose JSON binds the same source, case and arm to an underlying evidence digest. Missing arms, changed cases, unmeasured cost, missing receipts and model-only verdicts fail closed. The result reports receipt-backed pass rate, time, correction and cost per pass. It **does not** prove that a receipt was authored independently or that a merchant, device, hosted worker or customer accepted the result; those remain separate evidence packets. The focused tests use fabricated receipts solely to verify the scorer's rejection and arithmetic rules. No model call or paid job has run.

## Prioritized delivery sequence and gates

1. **P0 — close the real Shop journey:** signed installer/update path, account/workspace isolation, offline outbox + sync/restore, named scanner/printer and Burmese receipt, first-sale usability. Keep exact-source and real-device evidence. Do not divert this lane into new agent infrastructure.
2. **P0 — repair public truth:** make `supermega.dev` explain and show only verified Shop capabilities, distinguish internal Sites/Commerce, use source-bound imagery, and connect a verified build/download or sign-in route. Run real browser QA before promotion.
3. **P1 — prove the paid-VPS agent loop:** one bounded synthetic job, durable restart, scoped credentials, redacted traces, independent evaluation, cost receipt and explicit rollback. Remove local RAM from the cloud readiness decision. Scale concurrency only after baseline queue time and cost per accepted result are measured.
4. **P1 — product AI:** evaluate reviewed menu-photo extraction and grounded stock suggestions against a Burmese/English fixture with source evidence, correction time, privacy, failure and cost limits. Operator confirms every catalog or payment-affecting write. Meter paid use server-side.
5. **P2 — compound advantage:** convert recurring production failures and user confusion into reproducible evaluations; compare prompts/models/tools on the same cases, keep successful changes, and retire unused agents. Add durable workflow infrastructure only if the existing queue demonstrably fails measured reliability or concurrency targets.

The first scorecard tracks: median and p90 time to first sale, successful unassisted completion, catalog correction rate, duplicate-sale/stock incidents, recovery time, exact-source claim coverage, evaluation replay pass rate, queue-to-accepted-artifact time, and cost per accepted improvement. Until measured, each is **NOT RUN**, never zero. Collect minimal metadata and avoid raw customer prompts, messages or credentials in traces.

## Benchmark decisions, not vendor adoption

- [OpenAI agent evaluations](https://developers.openai.com/api/docs/guides/agent-evals) describe traces, graders, datasets and eval runs. Adopt the *principle* of trace-backed regression and repeatable cases; provider-hosted grading or API spending needs its own ceiling and approval.
- [Anthropic's agent patterns](https://www.anthropic.com/engineering/building-effective-agents) favor simple composable workflows before more complex agents; its [agent evaluation guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) calls for multiple grader types and end-to-end outcomes. Use this to resist a large role fleet without a measurable gain.
- [Temporal's execution model](https://docs.temporal.io/) and [idempotency guidance](https://docs.temporal.io/nexus/operations) are reliability references for replay/retry design, not a decision to self-host Temporal now.
- [OpenTelemetry's GenAI conventions](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/) give a trace vocabulary and explicitly warn that message/tool attributes may contain sensitive data. Record IDs, timing, cost and status by default; capture content only under a separate reviewed policy.
- [Agent Substrate](https://github.com/agent-substrate/substrate) is a Kubernetes-oriented, pre-release path to isolated suspendable agents. Its own [security policy](https://github.com/agent-substrate/substrate/security) describes preview maturity and best-effort fixes. Defer adoption until measured isolation or utilization needs outweigh cluster and upgrade cost.

No incumbent comparison here proves SuperMega parity. The merchant baseline is still the observed Shop task on real hardware and a real account; public competitor documentation only suggests test cases. Record every future R&D adoption with immutable revision, license, threat/data boundary, cost, rollback and a passing task benchmark.

For that first merchant benchmark, [ZayTap's official page](https://www.hextechsoftware.com/zaytap.php) advertises English/Burmese switching, offline operation, held and printed receipts, Android/Windows downloads and local support. [Square's scanner guide](https://squareup.com/help/us/en/article/5143-bar-code-scanners-with-square-point-of-sale) describes USB, Bluetooth and built-in-camera scanning into a sale, and its [printer guide](https://squareup.com/help/us/en/article/8246-connect-a-printer-to-square) describes discovery and default setup before advanced profiles. These are vendor claims and documentation, not hands-on test results. They set three concrete comparison jobs for Shop: first sale after a real product is added; barcode-to-basket with keyboard, touch and camera fallbacks; and printer discovery, test receipt, failure recovery and reprint. AI may reduce catalog correction time, but a score gain cannot compensate for a sale, receipt or restore failure. The live [SuperMega Shop page](https://supermega.dev/shop/) currently provides neither an installable-build path nor equivalent live proof, so claim parity stays **FAIL** until the actual build and workflow are verified.
