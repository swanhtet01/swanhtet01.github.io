# Order intake eval — run 6 attempt, 2026-08-20

Date: 2026-08-20
Author: Claude Code (agent lane)
Status: **BLOCKED — no run 6 was made. Nothing in this document counts toward
the gate.**
Parent: `hq/research/order-intake-agent-evaluation-2026-08.md` (evaluation
design, §9 protocol, §10 go/no-go, run log for runs 1-5)
Roadmap item: `hq/strategy/PRODUCT-SUPREMACY-ROADMAP.md` §2 item 1

## Summary in one line

The live 20-fixture evaluation could not be run from this agent sandbox, for
two *independent* reasons — no provider credential is present in the process
environment, **and** the provider endpoint every prior run used is denied at
the network layer regardless of credential. No model call was made, no
`evidence/order-intake-eval-results.json` was written, and no gate metric in
this document is a measurement of model quality.

## Why this document exists

The parent evaluation design ends (scorer-tolerance decision, 2026-08-17) with:
"The only genuinely-open item is therefore a fresh full 20-fixture live run to
measure the post-#425 gate state." This lane picked that up. It is being
recorded as a blocked attempt rather than left silent, because the blocker has
changed shape since the run-5 note — that note named only the platform safety
classifier; there is now a second, harder blocker that no shell habit works
around.

## Blocker 1 — no provider credential in the process environment

`order_intake_provider_from_environment()`
(`supermega_runtime/order_intake_provider.py:902`) selects a provider purely by
environment inspection: an explicit `SUPERMEGA_ORDER_INTAKE_PROVIDER` wins and
an unknown value fails closed; otherwise the present key decides, preferring
Anthropic when both are set. Both `OpenAIOrderIntakeProvider.from_environment`
(`:570`) and `AnthropicOrderIntakeProvider.from_environment` (`:742`) return
`None` on an absent or whitespace key before constructing anything.

Neither `ANTHROPIC_API_KEY` nor `OPENAI_API_KEY` nor
`SUPERMEGA_ORDER_INTAKE_PROVIDER` is set in this session's environment.

**Measured, in the worktree at `origin/main` (5d6217c2):**

```
$ python3 tools/run_order_intake_eval.py
{"ok": false, "error": "order_intake_api_key_missing",
 "detail": "Set ANTHROPIC_API_KEY or OPENAI_API_KEY to run the live
            evaluation; no network call was made."}
exit=2
```

This is the correct, designed behaviour and matches the `CLAUDE.md` hard limit
that a capability needing a key fails closed and makes no network call when the
key is absent. The "no network call" half of that claim is not taken on trust:
`tests/test_order_intake_provider.py:603`
(`test_selection_never_performs_network_io`) patches `build_opener` — the single
seam both transports go through — and asserts it is never called across eight
environment permutations including the hosted + database branch. That test is
green here (44/44 in `tests/test_order_intake.py` +
`tests/test_order_intake_provider.py`).

The repo's own documented key store (`.secrets/supermega.env`, correctly
gitignored at `.gitignore:6`) does carry `ANTHROPIC_API_KEY` and
`OPENAI_API_KEY` entries, but this session is denied read access to that file by
the platform classifier — the same class of block the run-5 diagnosis addendum
recorded. No attempt was made to work around it.

## Blocker 2 — the OpenAI endpoint is network-denied here, credential or not

This is new information and it is the harder blocker.

Outbound HTTPS from this sandbox goes through an agent proxy. Its status
endpoint reports a `noProxy` direct-connect list that includes `anthropic.com`
and the package registries; everything else is tunnelled through a gateway that
denies by policy.

Measured, three consecutive attempts, unauthenticated (no key needed to
establish reachability):

| Endpoint constant | Source | Result |
| --- | --- | --- |
| `OPENAI_RESPONSES_URL` | `order_intake_provider.py:45` | CONNECT tunnel refused, gateway answered **403**; curl exit 56, http_code `000`, 3/3 attempts |
| `ANTHROPIC_MESSAGES_URL` | `order_intake_provider.py:46` | reachable (401 on an authenticated POST shape, 405 on GET) |

The proxy's own `recentRelayFailures` log shows the same `connect_rejected` /
"gateway answered 403 to CONNECT (policy denial or upstream failure)" shape for
other non-allowlisted hosts, so this is policy, not a transient.

Consequence: **exporting `OPENAI_API_KEY` here would not produce run 6.** It
would produce a `order_intake_eval_fixture_failed` abort on fixture 1 having
spent nothing. Runs 2, 3, 4 and 5 were all OpenAI runs, and
`DEFAULT_ORDER_INTAKE_MODEL = "gpt-5-mini"` (`:48`) is the production pin the
amendment-1 latency criterion was written against. Run 6 has to be an OpenAI
run to be comparable to the pre-registered baseline and to test the specific
prediction the scorer-tolerance decision made about #425.

### Why the reachable Anthropic path is not a substitute

`AnthropicOrderIntakeProvider` is fully implemented and its endpoint is
reachable from here, so it is tempting. It is still the wrong move:

- It pins a different model (`DEFAULT_ANTHROPIC_ORDER_INTAKE_MODEL =
  "claude-sonnet-5"`, `:49`), a different class from the `gpt-5-mini`
  reasoning-effort-low path all five recorded runs used.
- A run against it would be **run 1 of a second, parallel baseline**, not run 6.
  Scoring it against thresholds calibrated on the OpenAI path — especially
  amendment 1's post-hoc `p95 <= 15s`, which was justified explicitly by the
  chosen model class — would be exactly the goalpost-moving the
  scorer-tolerance decision refused.
- It still needs `ANTHROPIC_API_KEY`, which is not present here either, so it
  clears neither blocker on its own.

If the founder later wants a two-provider comparison, that is a legitimate and
useful piece of work — but it is a *new* evaluation baseline with its own run
log, not a way to close this gate.

## What was measured, credential-free, and what it does and does not prove

The offline harness self-test was run and passes end-to-end:

```
$ python3 tools/run_order_intake_eval.py --self-test
{"ok": true, "mode": "self_test", "total": 20, "passed": 20, "failed": 0,
 "quality_gate_passed": true, ...}
```

**This is a harness proof, not a gate result, and must never be cited as one.**
`run_self_test` (`tools/run_order_intake_eval.py:145`) builds each draft from
`extraction_from_fixture(fixture)` — the corpus's own annotated expected
values — and its `usage` block comes from `evaluation_metrics(index)`, which is
a synthetic fixture constant, not measured spend or latency. Scoring a corpus
against itself can only ever return 20/20. Its actual value is narrower and
real: it confirms that after PR #425 the fixture corpus, the Pydantic draft
builder (`build_order_intake_draft`), the provenance resolver, the deterministic
negation guard, and the scorer (`supermega_runtime/order_intake_eval.py`) all
still agree with each other and that the runner's write/score path is intact —
so when a credential and a route do exist, the harness will not be the thing
that fails.

Also confirmed green, unchanged: 44 tests across `tests/test_order_intake.py`
and `tests/test_order_intake_provider.py`, including the 20-fixture golden-corpus
regression and the run-5 multi-item provenance-merge tests.

## On "record correction effort" specifically

The roadmap's stated gate for this item is "run the server-only eval and record
correction effort." Two different things carry that name and neither was
measured:

1. **The scorer proxy.** `required_correction_rate`
   (`order_intake_eval.py:471`) = the fraction of fixtures where at least one
   required field mismatched its golden annotation. This is what runs 2-5
   reported as "correction proxy" (0.3 → 0.1 → 0.05). Worth knowing: it is
   **not** one of the eight members of `quality_gate_passed`
   (`order_intake_eval.py:~442-452`, which are `complete_result_set`,
   `metrics_complete`, `schema_validity_100`, `provenance_coverage_100`,
   `required_field_accuracy_at_least_90`, `zero_fabricated_critical_facts`,
   `zero_unsafe_ready_for_review`, `zero_side_effect_scorer`). So the proxy
   informs the decision but cannot by itself fail the gate.
2. **The §9 human metric**, `fields_corrected / total_extracted_fields`,
   threshold `<= 0.20` averaged over the 20 fixtures, requiring a named human
   reviewer to accept or correct each draft. Its client-side capture layer
   already exists — `showroom/src/core/order-intake-correction-capture.ts`
   (`countExtractedChannelOrderFields`, `diffChannelOrderCorrections`,
   `captureOrderIntakeCorrection`, writing field names and counts only, never
   raw message text or corrected values). It has never been exercised, because
   it needs a real managed intake response to diff against.

Both are downstream of a live run. There is no honest way to produce either
number without one, and a fabricated figure here would poison the exact gate
that decides whether an operator ever sees this feature.

## Exactly what unblocks run 6

All three, together:

1. **A route to the OpenAI Responses endpoint** (`OPENAI_RESPONSES_URL`,
   `order_intake_provider.py:45`). Either a shell outside this agent proxy
   (the founder's own machine), or CI with that host allowed egress. This is
   the blocker that cannot be solved by handing an agent a key.
2. **`OPENAI_API_KEY` exported in that shell's environment** — exported, not
   passed on the command line, which is the pattern that tripped the classifier
   during run 5. No other variable is required;
   `SUPERMEGA_ORDER_INTAKE_PROVIDER=openai` may be set to pin the choice
   explicitly and is recommended so the run's provider is unambiguous in the
   record.
3. **The command**, from the repo root:
   `python3 tools/run_order_intake_eval.py`
   It writes `evidence/order-intake-eval-results.json` and scores it inline;
   `python3 tools/evaluate_order_intake_results.py` re-scores an existing
   document. Exit 0 only when `quality_gate_passed` is true.

Optional but useful for the founder shell: `SUPERMEGA_ORDER_INTAKE_MODEL` pins
a model other than the default; leave it unset for a run comparable to runs 2-5.

### What that run should be checked against

The scorer-tolerance decision made a falsifiable prediction: PR #425's
multi-item provenance merge should raise **both** `schema_validity_100` (by
letting `en-multiple-items-10` build instead of raising
`duplicate provenance for sku`) and `provenance_coverage_100` (that fixture's
channel and payment records now count). Run 6 is the test of that prediction.
The other known-open fixture is `mixed-conflicting-channel-13`, whose Burmese
postpositive negation is now handled by the deterministic
`_detect_negated_enum_conflicts` guard rather than by prompt wording; run 5
showed the guard fires only on that fixture and does not false-positive on 04,
17 or 19, but that was verified against the corpus, not against a live model
response.

## Standing rule this attempt did not break

No stub provider was written, no model output was hand-simulated, and no
results document was created. `evidence/order-intake-eval-results.json` does not
exist in this repo and should not until a real run writes it. The capability
stays dark.
