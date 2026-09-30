# Founder decision packet — every open founder-only decision, in one ordered list

Date: 2026-08-24 (revised 2026-08-26 — see "Corrections applied on review")
Status: **decision packet for the founder.** This document authorizes nothing:
no deploy, no production write, no migration, no release dispatch, no billing or
entitlement transition, no customer contact, and no gate change. It quotes no
price, because none is approved. It proposes no change to any `CLAUDE.md` hard
limit.

Grounded on `origin/main` at **`6647a2b2`** (PR #551, 2026-08-23) — the same
commit that release run **346** shipped live on 2026-08-23. Every entry below
was re-checked against that commit, not against a summary. Entries that turned
out to be **already decided or already shipped** are listed in section 6 rather
than asked again; that section is a result, not an omission.

**Why this document exists.** `hq/strategy/FOUNDER-BOTTLENECK-STUDY.md` §6
concludes that every path to a first paying client runs through founder gates.
Those gates are currently spread across a dozen documents, six open pull
requests and one machine-readable ledger. Nobody can act on a dozen documents.
This is the one list.

**How to read an entry.** Every entry is a yes/no or a pick-one. Each carries
what is blocked on it, the real consequence of each option, a recommendation you
can simply accept, and what it costs to change your mind later. Where a
decision is referenced somewhere but was never actually specified, the entry
says so instead of reconstructing it.

**Corrections applied on review (2026-08-26).** Six findings against the first
draft were verified against source at `6647a2b2` and applied. Five were correct
and one was correct in part; each is marked in place with what the earlier draft
said and why it was wrong, rather than silently rewritten:

1. **P0 is new.** The product-identity question was filed in section 6 as an
   unspecified gap. It is a founder decision, it precedes pricing, and it is now
   numbered and first.
2. **P2 now asks for the figure, not only the shape.** A shape-only answer
   unblocks nothing — `prepare_managed_invoice.mjs` rejects the config outright.
   The figure is set in `.secrets/`-class local storage, never in this repo.
3. **P5's partial-approval option is withdrawn.** The four sub-approvals are one
   decision; the runbook and the provisioner both enforce it. The caution the
   old recommendation expressed now lives at the runbook-step layer, where it is
   real.
4. **P7's "v12 has never had a proof" claim is corrected.** v12's migration is
   hosted-proven; four specific write-path assertions are not. They are named.
5. **P9's "cheapest useful subset" now includes cadence/volume** — one of the
   six hard gates, without which nothing can be sent.
6. **P9 is conditionally part of the minimum subset**, because the repository
   records zero real leads and cannot tell whether a prospect exists.

---

## P-1 — Repair the `main` ruleset's required check names

**Added 2026-09-01. This was not in the packet's first version, and it should
have been: it gates the DELIVERY of five decisions already in here (P10/#501,
P11/#537, P12/#509, P13/#506, P15/#510) plus every other open pull request.
Approving any of those today changes nothing, because nothing can merge.**

**The finding.** Every pull request in this repository is unmergeable,
regardless of contents, author or CI result. A merge attempt returns:

```
New changes require approval from someone other than the last pusher.
3 of 3 required status checks are expected.
```

**"3 of 3 expected" never moves as checks go green.** That is the diagnostic.
If any check this repo emits were among the three required, the count would
drop as it passed. It does not, at any point.

**Proven by experiment on three pull requests across two agent lanes**, not
inferred:

| PR | Lane | Diff | Checks | Merge |
|---|---|---|---|---|
| #562 | Claude | 3 workflow files | 9 green | blocked |
| #568 | Claude | 2 files | green | blocked |
| #561 | **Codex** | **240 files, 426 commits** | **9 green** | blocked |

#562 was built specifically to run this experiment — it removed the `paths:`
filters so that all nine checks would report on one PR. They did, all green,
and the merge error was unchanged. #561 then reproduced it independently on a
Codex-authored branch with a completely different diff, which rules out the
explanations that could not be eliminated from inside one agent's branches:
file sets, authorship, branch naming.

**Conclusion: the ruleset requires three check names that no workflow in this
repository produces on a pull request.** The names this repo actually emits on
a PR are `validate` (showroom-ci.yml), `verify` and `release`
(kernel-deploy.yml), `hosting-contract` (public-hosting-guard.yml), and
`Audit app` / `Audit kernel` / `Audit platform` / `Audit runtime (pip)`
(dependency-security.yml), plus third-party GitGuardian.

**Which three, most likely — added 2026-09-02.** Two further observations
narrow this from "some three names" to a specific, checkable guess.

First, the combined *commit status* on a green blocked PR is empty:

```
GET /repos/.../pulls/562  -> get_status
{"state":"pending","total_count":0,"statuses":[]}
```

Zero legacy statuses, because everything here is a Checks-API check run. So
nothing is arriving through the older channel either.

Second, and decisively: of the seven workflow jobs in `.github/workflows/`,
**exactly three can never run on a pull request at all**, because none of
them has a `pull_request` trigger:

| Check name | Workflow | Triggers |
|---|---|---|
| `validate-coordinated-authority` | supermega-app-deploy.yml | `workflow_dispatch`, `push` to main |
| `verify-live` | supermega-public-live-health.yml | `workflow_run`, `workflow_dispatch`, `schedule` |
| `verify-deploy-promote` | supermega-public-release.yml | `workflow_dispatch` only (the founder-only typed phrase) |

Three names, permanently unreachable on a pull request, against a message
that reads "**3 of 3** required status checks are expected" and never
decrements. That is a strong match, and it explains the symptom exactly: a
required check belonging to a workflow with no `pull_request` trigger stays
`expected` forever no matter how green the PR is.

**This is inference, not a read of the ruleset** — reading it needs repository
admin, which this lane does not have and should not have. Confirm it in one
look: Settings → Rules → the `main` ruleset → "Require status checks to
pass". If those three names are the required ones, that is the whole bug.

**The fix, if confirmed:** remove those three from the required list and, if
you want a required gate at all, require the names that do run on pull
requests — `validate` for app changes and `verify` for kernel changes. Note
that both are `paths:`-filtered, so requiring either one alone will block PRs
that legitimately touch neither; the honest options are to require none and
rely on review, or to make the required job a small always-runs job. I have
deliberately NOT created such a job, because a check that reports success
without running the work it is named for is a fake protection signal, and
inventing one to satisfy a rule I cannot read would be exactly that.

### What you need to do

Open the `main` branch ruleset in repository settings and compare its required
status check names against that list. Any name not on it can never report, and
therefore blocks every PR forever. **I cannot see the rule** — no ruleset-read
tool exists in my session, so I can observe the symptom precisely and the cause
only by elimination.

### Two gates, only one broken

1. **Broken.** The three required check names. Founder-side, settings-only, no
   code change.
2. **Working as intended.** "Approval from someone other than the last pusher."
   Fixing (1) does **not** make anything self-merge; you still approve each PR.
   That is correct and should not be weakened.

### What I will not do

The mechanical "fix" is to add workflows emitting checks named to match the
rule. **I have refused this and recommend you refuse it too.** It would make
the required checks report green without anything actually verifying what the
rule was written to protect — passing a protection signal by faking it. The
rule would then be worse than absent, because it would look enforced.

**Cost of the fix: minutes. Cost of not fixing it: every piece of finished
work in this repository stays undelivered, and no decision in this packet that
depends on a merge can take effect.**

### While you are in there — a second, smaller conflict to settle

**Draft pull requests in this repository get no CI and no automated review.**
`.github/workflows/showroom-ci.yml`'s `validate` job carries
`if: github.event_name != 'pull_request' || github.event.pull_request.draft == false`,
so on a draft it reports conclusion **`skipped`**, not `success` — and Codex
reviews only on "opened for review" / "marked ready".

That collides directly with the standing instruction agents work under, which
says to open every PR as a draft. Followed literally, every agent PR here ships
with neither validation nor review.

Measured on the same two PRs before and after flipping the flag:

| PR | As draft | After marking ready |
|---|---|---|
| #566 | `validate` skipped, 0s, no review | success, 6m31s |
| #567 | `validate` skipped, 0s, no review | success, 6m34s |
| #568 | opened non-draft | success 6m33s, **two P1 findings within 3 minutes** |

Those two P1s on #568 were both correct and one of them caught a metric that
would have failed a *correct* evaluation run. Opening non-draft is what surfaced
them.

**Pick one:** either drop the `draft == false` condition so drafts are
validated, or tell agents to stop opening drafts here. I have been opening them
non-draft since discovering this, and will keep doing so until you say
otherwise — flagging it because it is a deliberate deviation from a standing
instruction, not an oversight.

### After P-1: the merge order for the forty-six open pull requests

Verified 2026-09-02 against every open PR's base and file list, with the two
independent-PR file overlaps test-merged. **Every PR here is CI-green and
reviewed.** Codex's review quota ran out at 2026-09-02T00:08Z and came back at
13:16Z; the PRs opened in between (#572–#585) were reviewed by me against
source, each carrying that review as a comment, and the code-bearing ones
(#575, #577, #578, #580, #581, #583, #584) were then re-submitted to Codex.
Its findings — five P2s across #575, #577 (two), #578 and #580 — were each
verified against source and fixed with additive commits, and every one was
real; none was a false positive, and none required weakening a test. What
they caught, since the pattern is worth knowing: three of the five were
**tests that looked thorough but measured less than they claimed** — a
completeness check comparing connector keys while never exercising four
capability methods (#575), a concurrency probe running the direct-Postgres
transaction while the prose said it ran the Supabase functions (#577), and
that same probe reusing budget windows so a rerun could fail with the locking
intact (#577). The fourth was a documented invariant stated more narrowly
than the code enforces it (#580: the execution claim is keyed on
`(client-local date, UTC hour)`, not the UTC hour alone). The fifth was a
test importing a package that only arrived transitively (#578). All five are
the same failure mode this repo already warns about — an assertion that
cannot fail is indistinguishable from one that passes — which is why they
were worth a second reviewer. The order below is what lets you work through
them without a single manual conflict.

**Tier 1 — independent, based on `main`, no decision needed. Any order.**
#554, #555 (this packet), #556, #557, #558, #560, #562, #563, #564, #565,
#567, #568, #570, #571, #572, #575, #576, #577, #580, #582, #585, #591.
Twenty-two
PRs. #567 and #570 both edit `tools/verify_app_build.mjs`; test-merged,
auto-merge is clean. #585 is two playbook sentences whose button labels had
drifted from the shipped UI, found by the journeys. #580 (scheduler ceiling and pool pressure measured, kernel test-only)
and #582 (design queue entry P3.10, doc-only) are third-wave and independent.
The three second-wave entries are test-only: #575 (fail-closed contract for
all 64 credentialed connectors, 565/0 kernel), #576 (the one automated 390px
browser journey, which has now run green on a GitHub runner), #577 (the
token-cap overshoot measured at exactly zero and pinned). None touches
product code or `package.json`. Several of
these (#554, #555, #557, #558) sit on an older `main` and will show "behind" —
GitHub's update-branch button is enough; none conflicts.

**Tier 2 — stacked. Merge each only after its base lands, then retarget.**
- #566 → after #563 (both edit the readiness scorecard; #566 is the second pass)
- #569 → after #567 (the boot shell is what makes its measurements valid)
- #573 → after #567 (same reason; also carries the `--transport h2` harness flag)
- #574 → after #573 (uses that flag)
- #578 → after #566 (third edit to the readiness scorecard, a different §5
  item from #563/#566; a whitespace hunk at worst)
- #579 → after #578 (fourth edit to the scorecard, adjacent §5 lines)
- #581 → after #576 (refactors #576's journey into a shared harness and adds
  the Plant journey; both have run green on a runner)
- #583 → after #581 (third journey, Ecommerce request-to-review, on the same
  harness; all three have run green on a runner in one job)
- #584 → after #583 (fourth journey, Website edit-and-publish; every product
  now has one automated 390px journey, all four green on a runner in one job)
- #586 → after #584 (design P3.10 implemented: the Plant phone-width status
  notice wraps under its label instead of hiding; the Plant journey now
  asserts it is visible; pinned CSS byte-identical, px ratchet net zero)
- #587 → after #586 (the 390px measurement sweep, and its answer: across all
  four products and 44 screens there is zero horizontal overflow and no
  second P3.10 — every hidden notice on Shop, Plant and Ecommerce is content
  the operator can open, and Website's two candidates traced to a redundant
  page-stage pill. Also supplies the data P3.10 item 2 was waiting for: seven
  Plant sentences at 8px, four Ecommerce ones at 9px. Tool only, not wired
  into CI)
- #588 → after #587 (P3.10 item 2 for the one element that carries those
  Plant sentences: `.plant-today-source small` moves from the 8px mono
  caption style to `--font-size-xs`, measured 14 → 0 sub-10px strings on
  that element; one EOF-appended CSS rule, pinned originals byte-identical)
- #589 → after #588 (doc only: the sweep's rows classified against source
  into four decisions, one of them — the Ecommerce 9px storefront sentences —
  deliberately left for you because it is the product's voice; corrected
  after Codex review so the Website pill is recorded as no-action)
- #590 → after #589 (Shop quantity steppers widened 40 → 44px on phone
  widths; the sweep measured under-44 targets 3 → 1 with overflow still zero;
  two value-level edits inside existing phone media blocks)
- #592 → after #579 (the observability re-grade #563 asked for: §6 rewritten
  to the measured facts — 16 emit sites, the shipped client error lane, the
  shipped breach alerting, OpenTelemetry Phase A instrumented — and re-graded
  D+ → C with the six remaining gaps cited. **Being restacked**: as opened it
  sits on `main` and conflicts with #563's own §6 edit, so it is being
  rebased onto the #566 chain; do not merge it until its base shows that
  chain. Doc only)

**Tier 3 — waits on a decision in this packet. Merge only after the named one.**
| PR | Decision | What it needs from you |
|---|---|---|
| #495 | P8 | adopt the runbook amendment |
| #501 | P10 | sign off twelve customer-facing lead lines |
| #506 | P13 | **create the bounded billing read role first** — the PR must not merge before it exists |
| #509 | P12 | approve a stored-record shape change |
| #510 | P15 | approve the destructive half of compaction |
| #537 | P11 | approve the backup-headroom warning copy |

**One ordering that matters inside Tier 3: #509 after #568.** They edit the
same two files. #568 (Tier 1) adds the §9 aggregate and, correctly, refuses
to render a gate verdict because the capture layer cannot yet distinguish a
correct non-order from a failed extraction, and counts four of six fields.
**#509 is the capture-layer change that fills exactly those two gaps** — it
adds `channel` and `fulfilment` to the scored fields and introduces
`OrderIntakeOutcome`. So when you approve P12: rebase #509 onto the merged
#568, and in the same pass lift #568's `gateBlockedBy`, which then has
nothing left to block on. Merging #509 first would strand #568's blockers
pointing at a gap already filled.

**Tier 4 — Codex's, listed so nothing is forgotten. Both checked 2026-09-02.**
- **#550** (managed auth into the production client). Was red for eleven days
  on a single `no-useless-assignment` lint error; fixed with an additive commit
  (`cdd45296`), now green, merges clean onto `main`. Its one design trade —
  the audited production env briefly on disk with mode 600 and a `trap`,
  instead of `vercel env run`, so Vite can statically replace
  `import.meta.env.VITE_*` — is Codex's and is stated in the diff. Approve or
  not on that basis; the lint was never the question.
- **#552** (a salvage of an abandoned Codex branch).
- **#561** (release-stack rehearsal, 240 files, 426 real commits). **Its own
  body says it is not approval to merge**, deploy, or activate anything, so
  treat it as a review artefact. Two things verified because it touches
  digest-bound files (root `package.json` +119 lines, `runtime.py` +3): its
  rewritten receipts pass `record_postgres17_rehearsal --verify` (56 checks)
  and the readiness ledger validates against its own tree — no laundering
  signal from the checks this repo provides. And despite sharing files with
  eight of the Tier 1–2 branches, it test-merges onto the two most-overlapping
  ones with **zero conflicts**, so it imposes no ordering on them.

**Total for Tiers 1–2 once P-1 is fixed: thirty-seven approve-and-merge clicks
(twenty-two plus fifteen stacked) in the order above.** Tier 3 is six decisions you
were going to make anyway; the table just says which PR each one releases.

---

## 0. The minimum subset

**One prerequisite, four decisions, plus one conditional, make a first paying
Myanmar client possible. Everything else in this packet changes what happens
after that client, not whether they arrive.**

- **P0** — which product is the first paying client buying: this repo's managed
  Shop, or Shop Counter at `pos.supermega.dev`? **Answer this before P2** — it
  determines the pricing shape, the figure, the invoice line items, and whether
  P21 is a copy fix or a ratification.
- **P1** — may the first payment be taken before the billing rail can record it?
- **P2** — which pricing shape (D1), **and what is the figure**? The shape alone
  does not produce an invoice: `prepare_managed_invoice.mjs` rejects any config
  whose `amount.totalMinor` is not positive and whose line items do not sum to
  it. The figure is set in `.secrets/`-class local storage, never in this repo.
- **P3** — which payment channels appear on the invoice (D2)?
- **P4** — accept the three written recommendations for D3 (currency), D4 (tax)
  and D5 (entitlement lapse)? One "yes" closes all three.
- **P9, conditionally** — *only if you do not already have a named prospect.*
  This repository records **zero real leads**
  (`PRODUCT-CATALOG-AND-PRICING.md` §"Commercial state"), and P9's six GTM gates
  forbid contacting any real business until they are approved. If no prospect
  exists, P9 is not a post-arrival decision — it is the step that produces the
  client, and it belongs on this list. If you already know the person, strike
  this line. **Only you can tell which case you are in**; the repo describes the
  shape of client one and never says whether that person exists.

That is the whole minimum. It is small on purpose, and the smallness is the
most useful fact in this document: **no engineering work stands between the
company and its first kyat.** `CLIENT-READINESS-BRIEF.md` §2 ("The honest
shortest path, with its cost named") establishes that the pilot-fee and
design-partner shapes charge for the founder's five days of setup and attention
— a service the company can deliver today, on a local device, with no hosted
infrastructure — and that such a fee needs only D1 and can be collected by bank
or wallet transfer outside the product.

The cost of that path is equally plain and is P1's whole subject: the first
commercial transaction would then have no accountable record inside a system
whose entire differentiator is that every transaction has one.

**What the minimum subset does NOT include, and why.** Production activation,
the migration set, tenant #1, the hosted acceptance run, the Burmese counter
slice and every item in sections 3-5 are all real and all founder-gated — but
none of them is required for a first paying client under P1's fast path. P9 is
the one entry outside section 1 that can be on this path, which is why it is
listed above conditionally rather than deferred wholesale. They
are required for a first *managed* client, for an in-rail invoice, and for
scale. Section 2 sequences them honestly rather than implying they are on the
critical path.

---

## 1. The minimum subset, in full

### P0 — Which product is the first paying client buying?

**Answer with:** managed Shop (this repository), or Shop Counter
(`pos.supermega.dev`), or both as one bundle.

**Why this is numbered, and why it is first.** An earlier draft of this packet
listed it in section 6 as "referenced but never specified" — a search result
rather than a question. That was the wrong classification: it is the one
decision that changes the *content* of the next three. Until it is answered,
P2's shape, its figure and its invoice line items are all ambiguous, because
they would describe two different products with different delivery costs; P3's
payment channels are ambiguous, because the two products are billed by different
entities' rails; and P21 cannot be answered at all, because whether the price
already published on `pos.supermega.dev` is *your* price depends entirely on
whether that is the product you are selling.

**Blocked on this:** P2, P3 and P21 in substance, and P0's answer also
determines whether section 2's whole managed-activation sequence is on the
client-one path or not at all.

**The two products are genuinely different things, and this repo already knows
it.** `POS-PAGE-CLAIM-AUDIT.md` establishes that `pos.supermega.dev` is served
by the Vercel project `spa-desk-pilot`, built from the repository
`swanhtet01/supermega-workspace` in `spa-desk-pilot/` — **not** from this
repository. This repo enforces the separation in its build gate:
`tools/verify_app_build.mjs` lists `pos.supermega.dev` in its retired-context
string set and fails the showroom build with `retired_context:pos.supermega.dev`
if that string appears anywhere in the built app. (Cited by
`POS-PAGE-CLAIM-AUDIT.md` as line 6582; that line number has since drifted —
the check is at ~7280 on `6647a2b2`. The failure code is the stable reference.)

**Options and their real cost.**

- **Managed Shop (this repository).** Everything in this packet applies as
  written. Cost: the audit scores this product **2 delivered, 6 partial, 1 not
  built** against the nine sentences the POS page advertises — it is the weaker
  product on the advertised feature surface today. It is also the product with
  no approved price, so P2 starts from nothing (which is the honest starting
  point, not a defect).
- **Shop Counter (`pos.supermega.dev`).** Cost, and this is the decisive one:
  **this packet does not govern it.** Its code is in another repository, its
  price is already public (P21), and none of section 2 — production activation,
  the migration set, tenant #1, the billing rail — is what delivers it. Choosing
  this makes most of this document not your critical path, and makes P21 a
  ratification rather than a copy fix. It scores **4 delivered, 5 partial, 0 not
  built** on the same nine sentences.
- **Both, as one bundle.** Cost: two codebases, two release paths and two claim
  surfaces to keep honest simultaneously, from client one, with no shared
  billing rail between them. The audit's most actionable finding is that the two
  products have "close to opposite strengths", so a bundle is genuinely coherent
  as a *product* story — it is the *operational* story that is expensive.

**Recommendation: decide it explicitly, and this packet does not pick for you.**
This is the one entry where the repository gives no basis for a recommendation:
the choice turns on what you have actually promised a prospect and on which
codebase you intend to maintain, and neither fact is in this repository. What
the packet can say is the shape of the answer's consequence — if you answer
Shop Counter, stop after P0, P21 and P3, because sections 2-5 are then about a
product you are not selling first.

**One thing that is NOT open, so you are not deciding it here:** whichever you
pick, the figure itself is still unset and must be set per P2, in
`.secrets/`-class local storage. Answering P0 "Shop Counter" does not import
the published figure by default — that is exactly what P21 asks.

**Reversibility:** high before a client, low after. Nothing in either repository
changes on this answer; what is hard to reverse is telling a named prospect they
are buying one product and then delivering the other.

**Source:** `hq/strategy/POS-PAGE-CLAIM-AUDIT.md` ("First, a correction: this
page does not sell the software in this repo", and the tally);
`tools/verify_app_build.mjs` (`retired_context` string set); **P21**; **P2**.

---

### P1 — May the first payment be taken before the billing rail can record it?

**Answer with:** yes (charge now, reconcile later) or no (wait for the rail).

**Blocked on this:** the sequencing of everything else in this packet. A "yes"
makes P2+P3+P4 the entire critical path. A "no" makes section 2 the critical
path and pushes first revenue behind production activation, tenant #1, and a
five-day acceptance run.

**Options and their real cost.**

- **Charge now, outside the product.** Revenue can begin as soon as a price
  exists and a design partner agrees. The cost is exact and non-trivial: the
  first commercial transaction has no `billing.invoice.issued` /
  `billing.payment.confirmed` record, so the company's first act of taking money
  is the one act it cannot show evidence for. `CLIENT-READINESS-BRIEF.md` §2
  names this cost in those terms and says to take it deliberately if at all.
- **Wait for the rail.** Every kyat is recorded from the first one, with the
  digest-sealed evidence spine `BILLING-RAIL-DESIGN.md` §4.2 defines. The cost
  is the whole of section 2 first: production writes are still unauthorized
  (`hq/readiness/managed-pilot-readiness.json` → `securityAudit.productionMutationAuthorized: false`),
  production is at managed schema **v11** while `billing_rail.py`'s
  `BILLING_SCHEMA_VERSION` defaults to **12**, and every `BillingLedger` method
  is workspace-scoped so it needs a tenant that does not yet exist.

**Recommendation: yes — charge now, and reconcile into the ledger after
activation.** Reasoning: the thing being sold at client one is the founder's
five days on the shop floor (`docs/pilot-kit/`), which is deliverable today and
is not improved by waiting. Take the mitigation that costs nothing: write the
invoice packet with `tools/prepare_managed_invoice.mjs` anyway (it is
zero-network, deterministic and takes every monetary value from a founder-supplied
config file), keep the digest, and replay it as `issue-invoice` /
`confirm-payment` once the rail reaches production. The record is then late,
not absent.

**That mitigation has one hard prerequisite, and it is P2's second half.** The
preparer is not runnable on a shape alone: `validateInvoiceConfig` fails
`config_total_minor_invalid` unless `amount.totalMinor` is a positive integer,
and fails `config_total_mismatch` unless the line items plus decided tax sum
exactly to it (`tools/prepare_managed_invoice.mjs:128-129,154-155`). So "charge
now and keep the digest" requires the actual figure to exist in the founder's
private config file first. Answering P1 "yes" without P2's figure produces no
digest and no late record — it produces an unrecorded payment, which is the
option this recommendation was chosen to avoid.

**Reversibility:** high. The invoice can be recorded after the fact against the
same digest. What cannot be undone is the fact that the first transaction's
record was created retrospectively — so if that specific fact matters to you as
a matter of principle, answer no.

**Source:** `hq/strategy/CLIENT-READINESS-BRIEF.md` §2 (critical path table,
rows 1 and 10, plus "The honest shortest path, with its cost named");
`hq/strategy/BILLING-RAIL-DESIGN.md` §3, §6; `hq/readiness/managed-pilot-readiness.json`.

---

### P2 — Which pricing shape (D1), and what is the figure?

**Answer with:** two things, and the first is not sufficient without the second.

1. **The shape:** A, B, or C.
2. **The figure:** set the actual amount, currency and line-item split in a
   founder-private config file in `.secrets/`-class local storage — outside this
   repository, on your machine. Do not put it in a PR, an issue, a commit
   message, or any file in this repo. `CLAUDE.md`'s hard limits forbid prices
   anywhere in this public repo, `BILLING-RAIL-DESIGN.md` D1 confirms "no number
   appears in this document or in code", and `FOUNDER-BOTTLENECK-STUDY.md` §4 A3
   states the storage requirement in those exact terms.

**Why the shape alone is not enough, stated mechanically.** Answering only A, B
or C leaves the price unset, and an unset price is not a documentation gap — it
is a hard validation failure. `validateInvoiceConfig` rejects the config with
`config_total_minor_invalid` when `amount.totalMinor < 1`, and with
`config_total_mismatch` when the line items plus decided tax do not sum exactly
to `totalMinor` (`tools/prepare_managed_invoice.mjs:128-129,154-155`). It also
requires at least one line item with a non-zero amount
(`config_line_items_all_zero`). So a shape-only answer to P2 unblocks nothing:
not the invoice config, not P1's charge-now path, not critical-path step 10.
**Both halves, or the blocker stands.**

**Blocked on this:** everything downstream of money. `prepare_managed_invoice.mjs`
takes every monetary value from a founder-supplied config that does not exist
until D1 does — and that config is rejected outright until the figure exists too. `FOUNDER-BOTTLENECK-STUDY.md` §4 A3 states the prerequisite
literally: "there is nothing to generate before a price exists". Critical-path
step 10 (`CLIENT-READINESS-BRIEF.md` §2) cannot begin. This is the single most
blocking item in the entire repository.

**The three shapes, with their real consequences** (restated from
`BILLING-RAIL-DESIGN.md` §7; all three produce identical records, so this
decision changes only what the line items say — it blocks the first invoice, not
the build):

- **A — Fixed 30-day pilot fee.** One invoice, one payment, one grant, a day-30
  go/no-go. Consequence: no recurring-revenue signal at all, a re-quote
  negotiation at conversion, and a real risk that the pilot figure anchors as
  the product figure.
- **B — Setup fee plus monthly subscription.** Consequence: you commit to the
  verify-and-grant cycle per customer per month from customer one (fine at tens;
  `FOUNDER-BOTTLENECK-STUDY.md` §2 puts the ceiling in the hundreds of clients),
  and a subscription framing invites uptime and term expectations the claims
  boundary in `MARKETING-POSITIONING.md` §(e) does not yet permit you to meet.
- **C — Design-partner arrangement.** Discounted or deferred fee in exchange for
  scheduled operator access and structured feedback. Consequence: best fit for
  the named Spa pilot the ledger actually points at
  (`hq/portfolio.json` shop `localAutomation.workOrderId: "shop-spa-owner-pilot"`),
  buys the operator access the eval gates need, low anchoring risk — but a
  deferred fee can mean the rail's first real payment confirmation happens very
  late, and the feedback obligations need written bounds of their own.

**No amount appears anywhere in this document, in `BILLING-RAIL-DESIGN.md`, or
in any code. That is by guard-enforced decision (`capability-tiers.ts` asserts
no amount ever appears in it) and this packet does not weaken it — which is
precisely why the figure has to be set somewhere else, and why "somewhere else"
is named above as `.secrets/`-class local storage rather than left implicit.**
Before you set a figure, `BILLING-RAIL-DESIGN.md` §7's own input list applies:
delivery hours, support load, hosting and recovery cost, the customer's baseline
value, currency, taxes, payment method, cancellation terms, and your minimum
margin.

**Recommendation: C for client one, with a nominal non-zero fee, then B from
client two onward — and set that fee's figure before you act on P1.** Reasoning: C matches the only pilot the ledger is shaped
for, and §7's own counsel — "consider a nominal non-zero invoice so the full
record path is exercised with real money once, early" — converts C's single
weakness into its strength: you exercise the whole invoice→transfer→confirm→grant
path with real money at low stakes, which is exactly the rehearsal you want
before a full-price customer. B afterwards, because the rail was built for a
monthly cadence and that is the only shape that produces an honest recurring
signal.

**Reversibility:** the shape is cheap to change — invoice packets are immutable,
so renegotiation is "void the draft, prepare a new `invoiceId`"
(`BILLING-RAIL-DESIGN.md` §3), a per-invoice act. The expensive and
hard-to-reverse half is the **anchor**: the first figure a customer sees, and
especially any figure that reaches a public page (see **P22**), is very hard to
raise later.

**Source:** `hq/strategy/BILLING-RAIL-DESIGN.md` D1 and §7;
`hq/strategy/FOUNDER-BOTTLENECK-STUDY.md` §4 A3; `hq/strategy/CLIENT-READINESS-BRIEF.md` §2 row 1.

---

### P3 — Which payment channels appear on the invoice, with what labels and references (D2)?

**Answer with:** a named list — which KBZPay/WavePay wallets, which bank
accounts, in what order, under what labels.

**Blocked on this:** any invoice at all. `paymentChannels[]` is limited to
`bank_transfer | mobile_money | cash` with **founder-supplied labels**, config-supplied
per invoice and never hardcoded (`BILLING-RAIL-DESIGN.md` §4.1). There is no
default and no fallback: an invoice without a channel cannot tell the customer
where to send money, and `confirm-payment` verifies against "the named channel
reference".

**Options and their real cost.** This is not really a menu; it is a completeness
question. One channel is simplest and fails whenever that customer cannot use
it. Two or three channels cost you nothing structurally (the contract already
takes an array) but each one you list is one more account whose transfers you
must personally check before running `confirm-payment` — that check is
`CLAUDE.md`'s permanent founder-only boundary and does not amortize.

**Recommendation: name exactly two — one mobile wallet and one bank account —
and add cash only if you intend to accept it in person.** Reasoning: two covers
the realistic failure case (a customer who cannot use one rail) at the cost of
one extra account to watch, and it keeps the "did the money arrive" check to a
number of places you can hold in your head at the end of a day.

**Hard constraint on where the answer lives:** the labels, account numbers and
references go in your local invoice config, in `.secrets/`-class storage, and
**never** in this public repository — `CLAUDE.md` forbids the founder's payment
details anywhere in it. This packet therefore records that you must decide them,
not what they are.

**Reversibility:** total. Channels are per-invoice config; the next invoice can
carry a different set with no migration and no code change.

**Source:** `hq/strategy/BILLING-RAIL-DESIGN.md` D2, §3, §4.1;
`hq/strategy/CLIENT-READINESS-BRIEF.md` §2 row 1.

---

### P4 — Accept the three written recommendations for D3, D4 and D5?

**Answer with:** yes (accept all three), or name the one you want changed.

**Blocked on this:** the first invoice's shape (D3, D4) and the steady-state
per-client founder cadence (D5). None of the three is genuinely open in the
sense D1 and D2 are — each already carries a written recommendation in
`BILLING-RAIL-DESIGN.md`'s decision table, and this packet's job is to let you
close them with one word.

**What you are accepting.**

- **D3 currency — MMK, integer amounts, exponent 0.** Cost of accepting: a
  USD-denominated design-partner deal would need a per-invoice override (the
  contract stays parameterized, so this is possible, not blocked). Cost of not
  deciding: the first invoice cannot be prepared.
- **D4 tax — `tax.decided: false` on every v1 invoice, and no tax-invoice claim
  of any kind.** Cost of accepting: you cannot present these as tax invoices,
  which some buyers will ask for. Cost of the alternative: a compliance claim
  the claims boundary does not permit and no code enforces.
- **D5 entitlement lapse — no automatic expiry; you review monthly and revoke
  manually.** This one has a measurable consequence and is worth a sentence:
  `FOUNDER-BOTTLENECK-STUDY.md` §2 shows that under this reading step 11
  (`grant-entitlement`) runs **once per client at onboarding and never again** —
  the code refuses an already-granted entitlement (`billing_rail.py:1091-1092`)
  — so the recurring per-client load is step 10's two commands per cycle. Under
  the alternative (re-establish the entitlement each cycle) you add
  `revoke-entitlement` + `grant-entitlement` per client per cycle, **roughly
  doubling** the steady-state founder billing load. Auto-expiry is not on the
  menu at all: it would be an automated entitlement change and breaches
  `CLAUDE.md`.
- **A consequence of D5 worth knowing:** under the recommended reading the
  entitlement row stays bound to the first paid invoice and is never revisited,
  so `premiumUnlocked` answers "was this workspace ever granted", **not** "is
  this client current on payments". Whether a paying client has stopped paying
  is visible only in invoice and payment history — which is what **P13**'s
  overdue projection exists to surface.

**Recommendation: yes to all three, exactly as written.** Reasoning: each was
written with its alternative examined, none forecloses anything (currency stays
parameterized, tax stays a per-invoice field, entitlement stays manually
reversible), and leaving them open leaves the steady-state cadence genuinely
undefined — which `FOUNDER-BOTTLENECK-STUDY.md` §6 flags as the one caveat no
amount of code reading resolves.

**Reversibility:** total for all three. D3 and D4 are per-invoice fields; D5 is
a habit, and the rail supports both readings without code change.

**Source:** `hq/strategy/BILLING-RAIL-DESIGN.md` D3, D4, D5;
`hq/strategy/FOUNDER-BOTTLENECK-STUDY.md` §2 ("Why step 11 does not recur") and §6.

---

## 2. Decisions that unblock the first *managed* tenant

Everything in this section is required for an in-rail invoice, for premium
entitlement, and for the hosted acceptance evidence. **None of it is required
for a first paying client under P1's fast path.** It is ordered so that P5 comes
first because it gates the rest.

### P5 — Grant the production-activation approval? (one decision, four named sub-approvals)

**Answer with:** one yes or one no, covering all four named sub-approvals
together. **They are not four independently grantable approvals** — see "Why
this is one decision and not four" below.

The four are already named machine-readably in
`hq/readiness/managed-pilot-readiness.json` → `overall.nextAction.requires`, and
pinned by `tools/verify_hq_contract.mjs:1082`:

1. `approve_runtime_role_provisioning`
2. `approve_first_named_owner_identity`
3. `approve_exact_production_release`
4. `approve_managed_activation_window`

**Blocked on this:** every hosted gate except this one is already
`ready-hosted`. `production_activation` is the **single** blocking gate
(`overall.blockingGateCount: 1`). Downstream of it: tenant #1, the hosted
acceptance run that closes the Shop `nextGate`, any in-rail invoice, premium
entitlement, and the enterprise ladder's first rung.

**What has already been cleared, so you are not deciding it again.** Production
is PostgreSQL 17 at managed schema **v11**, zero drift from the local target,
advisor **clear**, browser roles denied (`securityAudit`, recorded
2026-08-20). Migration v11 is **already live** — the current runbook §0 says
"Do not apply it again as an activation step". Release run **346** shipped
`6647a2b2` — the current head of `main` — live on 2026-08-23, so the "exact
candidate merged to trunk and released as a paired, live-verified commit"
precondition is satisfiable by pointing at that run rather than by dispatching
anything new. **The approval receipt is the one thing genuinely missing**
(`founderDecision.approvalReceipt: null`).

**Options and their real cost.**

- **Approve all four now.** You get an activatable production target. Cost:
  runbook step D remains what it calls itself — "the one genuinely
  consequential, hardest-to-reverse step: once real customer tenants exist, they
  exist." Steps A-C stay reversible (env flags flip back; v11 is additive).
- **Approve a subset.** ~~Legitimate and cheap.~~ **Not available**, and an
  earlier draft of this packet was wrong to offer it. See below.
- **Approve none yet.** Nothing changes; the fast path in section 1 is
  unaffected.

**Why this is one decision and not four.** The four sub-approvals are the
`requires` array of a **single** decision — `nextAction.decisionId:
"managed-production-activation"` in `hq/readiness/managed-pilot-readiness.json`
— not four separately grantable items, and the runbook is explicit about the
consequence. `PRODUCTION-ACTIVATION-RUNBOOK.md` step A says: "Keep the committed
target `protected-unapproved` until the founder approves the exact release,
first named owner, runtime-role provisioning, and activation window **in one
reviewed receipt**", and only "after that receipt and its separate
`activation-approved` guard commit exist" may
`tools/provision_supermega_runtime_role.py` run. The provisioner enforces this
independently: `authorize_target` raises
`production_target_not_activation_approved` whenever the production target's
`package.json` status is anything other than `activation-approved`
(`tools/provision_supermega_runtime_role.py`), and `_assert_package_guard_committed`
additionally refuses to run against an uncommitted `package.json`.

So approving only 1 and 3 leaves the target at `protected-unapproved`, the guard
commit unmade, and the provisioner failing closed — **the runtime login cannot
be provisioned at all under a partial approval.** Worse, making the guard commit
anyway in order to unblock the provisioner would record `activation-approved`,
which asserts all four; that would misrepresent approvals 2 and 4 as granted
when they were not. There is no version of the subset that both works and is
honest.

**Recommendation: grant all four in one receipt when you are ready to activate
at all — then stop after runbook steps A-B and hold C-D until you have a named
client.** Reasoning: the caution behind the old subset recommendation was
correct, but it belongs at the *runbook-step* layer, where it is genuinely
separable, not at the *approval* layer, where it is not. Steps A-B (provision
and validate the runtime login; tell the store to expect v11) expose nothing to
any customer — the runbook says so directly: "Steps A-B are safe prep (no
customer can create anything until C+D). ... You can do A-B, watch, then C-D."
Step C is the customer-facing switch and step D is the one-way door. That
sequencing gets you the surprise-surfacing value of provisioning early, with no
customer exposure and no false approval record.

If you are not ready to grant all four, the correct answer is **"approve none
yet"**, and P6 below still determines which door client one eventually walks
through when you are.

**A real cost you should know before you plan the timing.** Recording the
approval is not a five-minute edit. It requires flipping
`package.json`'s `supermega.productionSupabaseTargetStatus` from
`protected-unapproved` to `activation-approved` — and `package.json` is
digest-bound, so the change requires the rehearsal cascade
(`database:postgres17:record` → `readiness:managed:write`) that `CLAUDE.md`
documents. That cascade needs a **local loopback PostgreSQL 17 from the EDB
Windows x86-64 binaries**. I ran the preflight from this Linux sandbox on
`6647a2b2` and it reports `{"error":"postgres17_tooling_missing","ready":false}`
— so **this is work on your Windows machine, not agent work**, and three
verifiers (`verify_hq_contract.mjs:1091` and `:1142`,
`verify_supabase_security_advisor_audit.mjs:339`) currently assert the
un-approved state and must be updated in the same commit.

**Reversibility:** the approval receipt itself and runbook steps A-C are
reversible (the runtime login can be rotated; the env flags flip back; v11 is
additive). Step D (`SUPERMEGA_TRIAL_WRITES_ENABLED=true`) is the one-way door,
and only once a real tenant has been created through it.

**Source:** `hq/readiness/managed-pilot-readiness.json` (`founderDecision`,
`overall.nextAction`, `securityAudit`, `gates`);
`hq/strategy/PRODUCTION-ACTIVATION-RUNBOOK.md` §0-§4;
`tools/verify_hq_contract.mjs:1082,1091,1142`;
`tools/provision_supermega_runtime_role.py:73,126`; release run 346.

---

### P6 — For client one: open the public self-serve window, or activate one named tenant with the window shut?

**Answer with:** self-serve, or named-tenant.

**Blocked on this:** which runbook you follow after P5, and what your exposure
is on day one. This decision did not exist when `CLIENT-READINESS-BRIEF.md` was
written; a second, fully documented path landed on `main` between 2026-08-21 and
2026-08-23 (`docs/CLIENT-TENANT-ACTIVATION.md`, 475 lines, plus the
`client:portal:workspace` and `client:pilot:workspace` commands).

**The two doors, and they are genuinely different.**

- **Self-serve window** (`PRODUCTION-ACTIVATION-RUNBOOK.md` step C:
  `SUPERMEGA_SELF_SERVE_ACTIVATION_WINDOW=open`). Any stranger with a verified
  email and a claim code can create a tenant, with no human in the loop and a
  per-actor rate limit of 5 (`trial_store.py`). Cost: your first day of
  production writes is also your first day of open public signup, and the
  identity half of that path is **not finished** — `signup-account.ts` is
  deliberately dead code, unimported, with the panel and the Supabase `signUp`
  call still unbuilt (see **P24**).
- **Named-tenant activation** (`docs/CLIENT-TENANT-ACTIVATION.md` §1-§5:
  `managed_activation prepare → validate → authorize → apply`, then
  `client:activation:requery`). One atomic transaction inserts one access
  control, one owner membership and one immutable activation event for one named
  business with an explicitly listed product set. The self-serve window stays
  shut — verified: `self_serve_activation_window_open()`
  (`trial_runtime.py:138-148`) gates *only* the self-serve tenant-creation
  endpoint, nothing else. Cost: more founder steps per tenant (a private owner
  invitation through the Supabase Auth administrator, an approval UUID, a
  reviewed plan), and it does not exercise the self-serve path you eventually
  want.

**Recommendation: named-tenant for client one.** Reasoning: it lets you take a
real client onto production without simultaneously opening a public signup door
whose identity leg is admittedly unbuilt, it produces exactly the reviewed,
digest-bound evidence the Spa pilot gate asks for, and it keeps
`additional_tenant_activation` in `founderDecision.doesNotAuthorize` meaningful
— one tenant, deliberately. Open the self-serve window later as its own decision,
after P24.

**Reversibility:** high in both directions. The window unsets to a 503; a named
tenant, once created, exists (the same one-way property as step D).

**Source:** `docs/CLIENT-TENANT-ACTIVATION.md`;
`supermega_runtime/trial_runtime.py:138-148`;
`hq/strategy/PRODUCTION-ACTIVATION-RUNBOOK.md` §1-§2;
`hq/readiness/managed-pilot-readiness.json` `founderDecision.doesNotAuthorize`.

---

### P7 — Which migration set goes into the activation window?

**Answer with:** stay at v11, add v12, or add v12+v13.

**Blocked on this:** whether the billing rail can run against production at all,
and whether `premiumUnlocked` ever resolves true.

**Correction to the sources first, because two of them are stale on this point.**
`CLIENT-READINESS-BRIEF.md` §2 row 6 and PR **#495**'s fork table both present
the choice as "v11 only / v11→v12 / v11→v12→v13". **v11 is already live on
production** (`securityAudit.liveSchemaVersion: 11`, drift 0; the current runbook
§0 says do not apply it again). The live fork is therefore v12 and v13 only, and
both documents need that correction — it is folded into **P8**.

**The three options, with their real cost.**

- **Stay at v11.** No billing at all: the three billing tables ship in v12, so
  `billing_rail.py` cannot operate against a v11 database whatever the env says
  (`_assert_schema` requires PostgreSQL 17 **and** an exact schema-version match,
  `billing_rail.py:693`). No new migration proof needed. You keep the fast path
  in section 1 and reconcile later.
- **Add v12.** Billing becomes operable: issue, confirm, void, record refund.
  Cost: `_premium_unlocked` stays `false` in-product, so **nothing the customer
  sees changes when they pay** — plus the narrow, named proof gap below.
- **Add v12 and v13.** Billing operable *and* the premium flag actually
  resolves. Both migrations are already proven to *apply* on a disposable hosted
  PostgreSQL 17 branch (`hq/readiness/billing-entitlement-read-proof.json`).
  Cost: the narrow proof gap below, plus two live hazards PR #495 documents —
  the policy-predicate
  fingerprint (`BILLING_ENTITLEMENT_READ_POLICY_DIGEST`) is a hash over
  PostgreSQL's *deparsed* rendering, so a server that deparses a correct policy
  differently takes billing down on an otherwise-correct database; and the
  env-scope trap below.

**Correction: v12's migration proof is not missing — a narrower thing is.** An
earlier draft of this packet said "v12 has never had" a disposable-branch proof.
That is wrong, and the checked-in evidence says so plainly.
`hq/readiness/billing-entitlement-read-proof.json` records the **full chain
replayed from scratch, v1 through v13, each internal version guard enforced in
sequence** (`instrument.migrationCount: 14`,
`instrument.schemaVersionProven: 13`) on a fresh disposable hosted PostgreSQL
17.6 branch, and `PRODUCT-CATALOG-AND-PRICING.md` describes v12 as hosted-proven
on that basis. v12 applied cleanly on real hosted infrastructure. Do not ask for
a generic re-proof of that.

**What is genuinely unproven, named exactly.** That receipt's seven proofs all
exercise the *runtime* role (`supermega_trial_backend`) and all concern v13's
entitlement read, including the two that touch v12's tables only to show they
stay dark (`billing_invoices_stays_dark`, `billing_events_stays_dark` →
`permission_denied_no_policy_no_grant`). By design, v12 grants that role
nothing, so **no recorded proof exercises v12's founder-privileged write path on
hosted infrastructure.** The specific unproven assertions are:

1. `BillingLedger.issue_invoice` writes a `billing.invoice.issued` row and event
   against a hosted v12 database, under the privileged CLI connection rather
   than the runtime role.
2. `confirm_payment`, `void_invoice` and `record_refund` each produce their
   expected immutable event and leave the invoice's one-way status machine in
   the expected terminal state.
3. `grant_entitlement` / `revoke_entitlement` write and revise the entitlement
   row that v13's read policy then exposes — i.e. the two migrations compose in
   the write→read direction, which the v13 receipt only ever tested from
   pre-seeded fixtures.
4. `_assert_schema`'s `require_write_privilege=True` branch passes against the
   real hosted role attributes, not just against local fixtures.

If you want that proof, ask for **those four assertions** on a disposable
branch. If you do not, the honest statement of the risk is that v12's DDL is
hosted-proven and v12's *usage* is only locally tested — which is a smaller and
much cheaper gap than "v12 is unproven", and it is a gap you can also close
after activation, before the first real invoice, because zero tenants means zero
exposure.

**The env-scope trap, which applies to every option except "stay at v11".** Two
runtimes fail closed on an **exact** schema-version match read from an
environment variable, not from the database: `trial_store.py`'s
`TRIAL_SCHEMA_VERSION` (env `SUPERMEGA_TRIAL_SCHEMA_VERSION`, default 10) and
`billing_rail.py`'s `BILLING_SCHEMA_VERSION` (env
`SUPERMEGA_BILLING_SCHEMA_VERSION`, default 12). They live in **different
processes** — the billing CLI reads its value in your shell, not in Vercel — and
`trial_store.py:320`'s `if TRIAL_SCHEMA_VERSION >= 12:` also changes the trigger
inventory the store demands. So database and env must move together, in both
directions, or every managed read and write fail-closes on a live tenant.

**Recommendation: v12 and v13 together, in one window, before any tenant exists
— and treat the four named v12 write-path assertions above as a proof you may
run either before the window or after it and before the first real invoice, not
as a blocker on the window itself.** Reasoning: the
unavoidable window in which database and env disagree costs **nothing** while
there are zero tenants and zero customers, and it is expensive and
customer-visible later (a planned outage on a live partner). Do not take v12
alone: a customer who pays and sees nothing change is the worst of the three.

**Reversibility:** migrations are additive; reversing needs a new migration. Env
flags flip back freely. The genuinely irreversible thing here is doing it *after*
a live tenant exists, which is what the recommendation avoids.

**Source:** `hq/strategy/BILLING-RAIL-DESIGN.md` D6 and §6;
`hq/strategy/CLIENT-READINESS-BRIEF.md` §2 "The schema-version trap";
PR [#495](https://github.com/swanhtet01/swanhtet01.github.io/pull/495);
`hq/readiness/billing-entitlement-read-proof.json`;
`hq/readiness/managed-pilot-readiness.json` `securityAudit.liveSchemaVersion`.

---

### P8 — Adopt PR #495's runbook amendment?

**Answer with:** merge, merge-with-edits, or reject.

**Blocked on this:** PR #495 itself, which is a draft by design because it
amends a founder-owned procedure. Nothing else.

**Options and their real cost.**

- **Merge.** The runbook gains a section 2a and three "what you should NOT do"
  entries covering the env-scope trap in P7. Cost: near zero — one prose file,
  no verifier pins it, sections 0-1 and steps A-D are byte-identical.
- **Reject.** The runbook stays as-is: it sequences only v11, never mentions
  `SUPERMEGA_BILLING_SCHEMA_VERSION`, and its "do not" list carries no warning
  about schema/env divergence. Cost: the document you follow literally during an
  activation stays silent about the one failure mode that produces a dead tenant
  mid-activation.

**Recommendation: merge, with one correction applied first** — the PR's fork
table still offers "v11 only" as a live option, which P7 shows is stale now that
v11 is live on production. Ask for the table to be re-cut as v12 / v12+v13
before it lands, so the amended runbook is not itself out of date on the day you
follow it.

**Reversibility:** total. It is a documentation change with no verifier pin.

**Source:** PR [#495](https://github.com/swanhtet01/swanhtet01.github.io/pull/495);
`hq/strategy/PRODUCTION-ACTIVATION-RUNBOOK.md` §2, §4.

---

### P9 — Approve the six GTM outreach gates, or skip outreach for client one?

**Answer with:** six yes/nos, or "skip — I have a prospect".

**Read this entry as part of the minimum subset unless you already have a named
prospect.** Section 0 lists it conditionally for that reason. This repository
records **zero real leads** (`PRODUCT-CATALOG-AND-PRICING.md`, "Commercial
state: zero real leads, zero managed tenants, zero revenue"), and the gates
below forbid contacting any real business. If no prospect exists, no combination
of P0-P4 produces a paying client, because there is nobody to sell to — P9 is
then the step that *produces* the client, not a decision about what happens
after one arrives. Only you can tell which case you are in; see the note at the
end of this entry on exactly why the repository cannot.

The six, from `GTM-AI-OPERATIONS.md` §(f), all currently unticked: approve the
target lead list; approve the outreach copy; connect a real sending identity and
consent to send under it; connect a social account; decide cadence and volume
limits; decide how replies are tracked and who answers them.

**Blocked on this:** any contact with any real business. Lead research and draft
personalization can run at zero external effect without it
(`CLIENT-READINESS-BRIEF.md` §2 row 3 is the only agent-executable row on the
whole client path), but nothing may be sent. `(f)` calls itself "a hard gate,
the same way `production_activation` is a hard gate."

**Options and their real cost.**

- **Approve all six.** Outreach can begin at your approved cadence. Cost: your
  time reviewing each batch — permanent and non-delegable, though the contract
  already permits **batch** granularity rather than per-message, so its per-client
  cost is a policy choice you already hold rather than an engineering gap
  (`FOUNDER-BOTTLENECK-STUDY.md` §3).
- **Approve a subset.** The cheapest subset that can actually send anything is
  list + copy + sending identity + **cadence and volume limits** +
  replies-to-your-inbox — five of the six. Cadence is not optional padding: it
  is one of the six hard gates in its own right ("Decide on cadence and volume
  limits. How many businesses get contacted per week, how many follow-ups"), so
  a subset that omits it leaves outreach blocked no matter what else is
  approved. **The social account is the only separable one** — it buys nothing
  for a first client, and the posting-cadence half of the cadence gate travels
  with it, so approving cadence for email volume and follow-up count alone is
  coherent.
- **Skip entirely.** Legitimate: the pilot the ledger is shaped for
  (`shop-spa-owner-pilot`) is one named business. If you already know that
  person, this whole entry is not on your path.

**Recommendation, and it is conditional on a fact only you hold.**

- **If you already have a named prospect:** skip for client one; approve the
  five-gate subset (list + copy + sending identity + cadence/volume +
  replies-to-your-inbox) when you want client two. Reasoning: a design partner
  you already know converts faster than any cold batch, and every approval here
  is a standing consent you would rather grant once you know what the first
  engagement actually taught you.
- **If you do not:** approve that same five-gate subset **now**, as part of the
  minimum subset, before or alongside P2. It is the only path in this packet
  that produces a first client from a standing start, and holding it back does
  not make client one arrive later — it makes client one not arrive.

In both cases, leave the social account unconnected — it is a second public
surface to police for no first-client benefit.

**Note on what the repo does and does not tell me:** `hq/portfolio.json` and the
readiness ledger describe the pilot as "one named Spa owner", and
`docs/CLIENT-TENANT-ACTIVATION.md` works a `beauty-spa` example through the whole
activation. **No document in this repository names an actual prospect** — the
private intake it refers to is not in the repo, correctly. So I cannot tell you
whether you have one; you can.

**Reversibility:** total up to the moment a message is sent. A sent message is
not reversible.

**Source:** `hq/strategy/GTM-AI-OPERATIONS.md` §(f);
`hq/strategy/CLIENT-READINESS-BRIEF.md` §2 rows 2-3;
`hq/portfolio.json` shop `localAutomation`; `kernel/managed-pilot-readiness.mjs`
(`customer_message` in `forbiddenUntilReady`).

---

## 3. Decisions on work that is built and waiting on one word

Each of these is a finished branch or a finished document that cannot move
because it needs a founder sentence. They are cheap to answer and every "yes"
converts completed work into shipped work.

### P10 — PR #501: approve the twelve plain-language lead lines?

**Answer with:** yes, yes-with-edits, or no.

**Blocked on this:** PR #501 (draft), and `DESIGN-PROGRAM.md` P3.8 batches 2-3
which sequence behind it. The PR reproduces all twelve sentences verbatim in its
body, so approval is one read.

**Options and their real cost.** Approving ships a plain sentence above each
compliance litany, so an owner reading a screen top-down meets what the screen is
*for* before a boundary assertion. Not approving leaves the litany-first reading
order that P3.8 exists to fix. There is no third option worth naming: no pinned
string is edited, so nothing is at risk either way.

**Recommendation: yes.** Reasoning: every line was checked against all sixteen
do-not-say rules in `MARKETING-POSITIONING.md` §(e), and — the part that earns
the approval — each was re-checked against its **empty state** after review
caught one lead asserting that customers had gone quiet on a panel that read "No
managed queue". Four leads are now conditional and three were verified to hold
in both states. The copy is more careful than the litanies it sits above.

**Reversibility:** total. Copy edits ship in an ordinary PR.

**Source:** PR [#501](https://github.com/swanhtet01/swanhtet01.github.io/pull/501);
`hq/strategy/P3-8-LEAD-LINE-PROPOSAL.md`; `hq/strategy/DESIGN-PROGRAM.md` §P3.8.

---

### P11 — PR #537: approve the device backup-headroom warning copy?

**Answer with:** yes, yes-with-edits, or no.

**Blocked on this:** PR #537, held open by its author for exactly this reason
("Not merging. This puts new words in front of a customer.").

**Options and their real cost.** Approving means an owner sees "Backup room
filling up" in Settings roughly 644 Plant jobs before the wall, and "Backup room
almost gone" roughly 214 jobs before it — both measured, with a test that fails
if the warning band ever narrows below 500 jobs. Declining leaves the current
behaviour: the wall is explained only on arrival, when the device can no longer
be backed up at all and "Reset this device" has no restore point.

**Recommendation: yes.** Reasoning: the failure this prevents is the one where a
shop's records are already unrecoverable, and the copy is unusually disciplined —
it never promises room can be reclaimed (a test fails on the words *compact*,
*reclaim*, *clean up*, *delete old*), and it refuses to blame a product unless
that product holds a strict majority of the file.

**One thing to check before merging:** the PR is currently `mergeable_state:
dirty` and needs a rebase onto `6647a2b2`. That is engineering work, not your
decision.

**Reversibility:** total.

**Source:** PR [#537](https://github.com/swanhtet01/swanhtet01.github.io/pull/537).

---

### P12 — PR #509: approve a stored-record shape change and a new customer-facing control?

**Answer with:** yes or no.

**Blocked on this:** PR #509 (draft), and with it the ability to ever compute the
order-intake §9 correction-effort metric from real operator behaviour.

**Options and their real cost.** Approving changes an on-device record's schema
and storage key to v2 (v1 records are deliberately **not** migrated — inventing
an operator name would fabricate the very thing §9 requires be real) and adds a
"Not an order" button so an operator's correct refusal is recorded as a named
judgement rather than as silence. Declining leaves the metric uncomputable, which
means the AI-assistance gate can never be measured against real usage even after
**P14** unblocks the eval.

**Recommendation: yes.** Reasoning: every defect this PR fixes erred in the same
direction — *understating* correction effort, making the `<= 0.20` gate easier to
pass. A metric that fails wrongly gets investigated; one that passes wrongly
ships. Approving is choosing the harder scorer over the flattering one.

**Reversibility:** high for the control; medium for the record shape — v1 records
are left intact rather than migrated, so nothing is destroyed, but a third shape
later means a third key.

**Source:** PR [#509](https://github.com/swanhtet01/swanhtet01.github.io/pull/509);
`hq/research/order-intake-agent-evaluation-2026-08.md` §9.

---

### P13 — PR #506: provision the bounded billing READ role, or hold the PR?

**Answer with:** provision, or hold.

**Blocked on this:** PR #506 (draft), and the top-ranked item of
`FOUNDER-BOTTLENECK-STUDY.md` §5 — making "who owes me money" answerable without
the credential that can also move money.

**Options and their real cost.**

- **Provision the role and merge.** You create one PostgreSQL role — `login
  nosuperuser bypassrls`, `SELECT` only on the three billing tables plus
  `trial_schema_meta`, and **none** of the other seven table privileges — and put
  its URL in a service secret. Overdue detection and dunning *preparation* stop
  being your tasks; you still perform every transition. Cost: one more credential
  to manage, and the role must be exactly right — though that is now enforced in
  code rather than by care (the probe refuses all 21 non-`SELECT` cells across
  the three tables and names the offenders).
- **Hold the PR.** Status quo: every overdue query runs from your shell under the
  superuser-class write credential.
- **What you must not do: merge #506 without provisioning the role.** The PR
  states the breaking change plainly — after it merges, the write credential can
  no longer run `billing_rail.py status`, because that credential holds 21/21
  non-`SELECT` privileges by construction. Merging alone removes your ability to
  ask who owes you money.

**Recommendation: provision — but only when you have a paying client, and do it
in the same sitting as the merge.** Reasoning: the defect is real and verified on
a live PostgreSQL 17.10 server (a `SELECT`+`TRUNCATE` role emptied all three
billing tables while `DELETE` was denied; a `SELECT`+`TRIGGER` role silently
voided the founder's insert), but the saving it buys — minutes per client per
cycle, plus prevented silent revenue leakage — is worth nothing while there are
zero invoices. It is post-first-revenue work, sequenced deliberately.

**Two conditions this packet does not propose relaxing:** the read role's URL
never enters this public repo, and the **write** URL never enters any service
context — possession of that file is the actual security boundary on billing.

**Reversibility:** high. Drop the role; revert the PR. No migration, no data
change.

**Source:** PR [#506](https://github.com/swanhtet01/swanhtet01.github.io/pull/506);
`hq/strategy/FOUNDER-BOTTLENECK-STUDY.md` §4 A2 and §5.

---

### P14 — Will you run the order-intake evaluation from a shell that can reach the provider?

**Answer with:** yes (your machine), yes (a CI job with the secret), or no.

**Blocked on this:** the `ai-assistance` gate, and therefore premium's first
workflow (order intake from chat) — the single highest-value AI feature for the
Myanmar channel-commerce reality, per `PRODUCT-SUPREMACY-ROADMAP.md` §2.

**What is actually blocking, verified 2026-08-20.** Two independent blockers,
neither of which an agent can clear: no provider credential is readable from an
agent environment (the harness fails closed correctly and makes **zero** network
calls), **and** the agent proxy denies CONNECT to the OpenAI endpoint every prior
run used — so a key alone would not unblock it. It needs a founder or CI shell
with egress to that endpoint and `OPENAI_API_KEY` exported.

**Options and their real cost.**

- **Run it from your machine.** One 20-fixture run produces run 6 and a real gate
  reading. Cost: your time, plus provider spend for 20 fixtures.
- **Give CI the secret and the egress.** Repeatable, and future runs cost you
  nothing. Cost: a provider key in CI, which is a standing exposure to weigh.
- **Do neither.** The gate stays unmeasured indefinitely.

**Recommendation: run it once from your machine first, then decide about CI.**
Reasoning: you want to know the number before you decide whether it is worth
standing infrastructure. **Do not substitute the reachable Anthropic path** — it
pins a different model class, so a run against it would be run 1 of a second
baseline, not run 6, and scoring it against thresholds calibrated on the OpenAI
path is exactly the goalpost-moving the scorer-tolerance decision already
refused.

**Reversibility:** n/a — it is a measurement, and measurements are only ever
additive.

**Source:** `hq/research/order-intake-eval-run6-attempt-2026-08-20.md`;
`hq/strategy/PRODUCT-SUPREMACY-ROADMAP.md` §2 item 1 and §3 item 4;
`hq/portfolio.json` researchGate `order-intake-agent`.

---

### P15 — PR #510: approve the destructive half of Shop workspace compaction?

**Answer with:** non-destructive batches only, or full approval, or neither.

**Blocked on this:** implementing compaction. The document's own header requires
founder approval before the destructive half, which is why the PR is not
self-merging.

**The problem it addresses, measured not estimated:** a shop with no hosted
account keeps its whole commerce workspace in one browser-local JSON document
that grows monotonically and is never pruned — 1,502 bytes per completed sale,
exactly linear, hitting the ceiling at **1,390 sales** (or **731** for a
location-inventory shop). Crossing it turns the till read-only mid-trading, and
today's only remedy destroys every record.

**Options and their real cost.**

- **Non-destructive batches only** (headroom meter, archive export). Deliberately
  separated so they can ship without approval. Cost: the ceiling still arrives,
  the owner just sees it coming.
- **Full approval.** The fold reclaims ~99% of the bytes and lets the shop keep
  trading. Cost: it permanently drops settled-order detail, and the PR's most
  important finding is a trap — an obvious-looking fold that passes every
  validation check, writes successfully, and **permanently ends that workspace's
  ability to close a trading day**, silently, because one close missing
  `orderIds` makes every future close expectation return `null`. Any
  implementation must preserve `close.orderIds` and `close.businessDate`.

**Recommendation: approve the non-destructive batches now; hold the destructive
fold until a real shop is measurably approaching the ceiling.** Reasoning: no
workspace anywhere is near 1,390 sales, because there are no clients. Approving a
destructive operation for a problem nobody has yet spends your irreversibility
budget on a hypothetical.

**Reversibility:** the meter and export are fully reversible. The fold, by
definition, is not — for the records it drops. That asymmetry is the whole reason
it is gated.

**Source:** PR [#510](https://github.com/swanhtet01/swanhtet01.github.io/pull/510).

---

## 4. The Burmese counter slice (G1)

`ERP-COMPETITIVE-ROADMAP.md` §6.6 is blunt: the binding constraint is
distribution, "with one product precondition", and the precondition is G1 —
"an English-only till cannot be distributed to Burmese-speaking cashiers no
matter how good the ledger underneath it is."

**Honest placement: this is not on the minimum path to a first paying client if
you are personally on the shop floor for five days** — you are the operator's
support. It is on the path to the *second* client, to any client whose cashier
you do not train personally, and to every distribution effort converting at all.
It is placed here rather than in section 1 for that reason, and it is the highest
item that is not revenue-blocking today.

**Measured state on `6647a2b2`** (counted in
`showroom/src/core/i18n-actions.ts`, not quoted from a document): **93 entries —
33 `confirmed`, 60 `pending_native_review`.** The G1 document records 92/33/59;
one entry has been added since. Nothing pending ever renders: `bi()` falls back
to English for anything not confirmed, so a partial pass cannot surface an
unreviewed guess.

### P16 — Will you commission the native-speaker review of the 60 pending entries, and who does it?

**Answer with:** a name, or "not yet".

**Blocked on this:** the till reading Burmese at all. This is the expensive half
of G1 and it is review time, not build time — the mechanisms for both remaining
string classes are decided and ship ahead of sign-off.

**Options and their real cost.** Commissioning it converts 60 drafted lines into
a bilingual counter, one status flip per line, no call site moving. Not
commissioning leaves the counter English, and every engineering hour spent on G1
buys nothing until a reviewer exists. There is no agent substitute: safety rule 1
of the table is that unverified Burmese never surfaces to an operator, and it is
load-bearing.

**Recommendation: commission it as one batch, and set expectations honestly —
this does not finish G1.** Reasoning: after full sign-off of every drafted line,
the counter is bilingual and the back office, Settings, onboarding, Plant,
Website and Ecommerce are still English (432 of the app's 446 attribute sites and
the great majority of its sentences). That is the L scope G1 always described.
The printed acknowledgement stays English deliberately — it is an evidence
document carrying action ids and digests, not a shop's customer slip.

**Reversibility:** total, and unusually cheap: every line is a one-word status
flip in either direction.

**Source:** `showroom/src/core/i18n-actions.ts` (measured);
`hq/strategy/ERP-COMPETITIVE-ROADMAP.md` §6.4 G1 and §6.6;
`hq/strategy/G1-STRING-MECHANISM-DECISION.md` §8.

---

### P17 — G1 question 5: may a screen reader ever read a control's name in two languages? Plus: which word order?

**Answer with:** yes/no, and verb-first or verb-final.

**Blocked on this:** every further `confirmed` flip of any string that becomes an
accessible name — which, after the mechanism decision, is most of them.

**Why this one is overdue rather than upcoming.** It is not a question about
leftover sites. Every mechanism examined — nodes, a joined `aria-label`, even
`lang` on the element — produces the same flat mixed-language string, so the
question reaches *any* string that becomes an accessible name. And **seven such
names are already live on merged `main`** (five distinct strings, four on the
cashier path), shipped by #536. So the AT check validates behaviour already in
front of users.

**Options and their real cost.** Answering "yes" ratifies shipped behaviour and
unblocks the rest. Answering "no" means a one-line status flip back to pending
for each affected entry — cheap by construction, but visible to users, hence your
call on a marginal result. The ordering half is the reviewer's: English wants the
verb first, Burmese is verb-final, and one flat name can carry only one order.

**Recommendation: run the real-device screen-reader check before answering, and
treat that check as the single most overdue item in the G1 lane.** Reasoning: this
is the one G1 question where an opinion is worth less than five minutes with a
device — and it is the only one where the answer could change the mechanism for
every string at once. This sandbox has no assistive technology; you or the
reviewer do.

**Reversibility:** high — a one-line status flip per entry, in either direction.

**Source:** `hq/strategy/G1-STRING-MECHANISM-DECISION.md` §7 question 5, §3.1,
§3.1a.

---

### P18 — G1 question 4: Burmese or Arabic numerals for numbers the app computes?

**Answer with:** Burmese, or Arabic.

**Blocked on this:** confirming the first count template — i.e. every
parameterised string ("{n} in stock", "{n} open orders", "{price} each"), which
is roughly half the counter's remaining English words.

**Options and their real cost.** The repo is currently inconsistent with itself:
the data layer already uses Burmese numerals
(`shop-service-scheduling.ts`), while the counter's own numbers are Arabic.
Whichever you choose, the answer reaches money formatting, the receipt and the
printed acknowledgement — so it is not a per-string call and cannot be deferred
into the review batch.

**Recommendation: Arabic — but ask the reviewer before you commit to it.**
Reasoning: the numbers a cashier reconciles against a wallet screen, a bank slip
and a printed acknowledgement are Arabic in every one of those places, and a
till that renders them differently from the receipt it prints creates a
reconciliation error rather than a comprehension aid. **This is the weakest
recommendation in this packet** and the document says why: the question needs
native input, and I am reasoning from consistency rather than from how a Yangon
cashier actually reads a shelf label.

**Reversibility:** medium. It is a formatting rule, so changing it later is a
code change rather than a status flip, and it would change the appearance of
printed documents already given to customers.

**Source:** `hq/strategy/G1-STRING-MECHANISM-DECISION.md` §7 question 4, §4.5.

---

### P19 — G1 questions 1-3: the drafted phrasings themselves

**Answer with:** these go to the native reviewer, not to you alone.

Three separate calls are queued for the reviewer: the 14 batch-2 phrase
translations; the Option-A question (on a composed English label, is a Burmese
verb-only gloss *helpful* — "this is a save-type action" — or *misleading* —
"saves, but saves WHAT?"); and the batch-3 per-entry calls, of which
`Create order` (it reserves stock and does not take money), `Stock` (goods, not
shares) and `Print receipt` (two loanwords in one label) are flagged as most
likely to come back wrong.

**What is blocked:** the Option-A answer determines whether a whole family of
ops-console and parameterised labels can be covered for free, or stays English
until someone phrases each one.

**Recommendation: bundle all three into P16's review brief.** They are the same
reviewer, the same sitting, and asking them separately wastes the scarce
resource.

**Reversibility:** total.

**Source:** `hq/strategy/DESIGN-PROGRAM.md` "BLOCKED on native-speaker sign-off —
two questions" and "Batch 3 — the counter slice";
`hq/strategy/G1-STRING-MECHANISM-DECISION.md` §7.

---

## 5. Decisions that block nothing today

These are real founder decisions with real consequences, and none of them stands
between the company and revenue. They are here so the list is complete and so
nobody re-opens them by accident.

### P20 — E1: does the published website carry a product catalog at all? And if yes, which corner of the trilemma?

**Answer with:** no catalog (recommended), or yes + which corner.

**Blocked on this:** the E1 photo lane, and nothing else. The prerequisite is
narrower and more answerable than "photos": **there is no product in the
published site to attach a photo to.** `WebsiteArtifact` is
schema/siteName/fingerprint/contentDigest/source/pages; a page is navigation +
hero + sections + seo; a section is id/eyebrow/title/body. All text. No SKU, no
price, no catalog row reaches the published file. Publishing a catalog is a new
customer-facing surface and a scope call against the "finite reviewable site"
wedge.

**If you say yes, this is a genuine trilemma. Pick any two:** (a) photo bytes
appear in the published file; (b) the published file is determined by the sealed,
approved artifact, so it reproduces identically on any device; (c) photo bytes
stay out of `localStorage`.

- **Seal the bytes into the artifact → (a)+(b), gives up (c).** The seal is
  reachable only through the workspace, which is re-serialized whole into
  `localStorage` on every write, and every snapshot prepends another publish
  record carrying its own full artifact copy. So photo bytes land in
  `localStorage`, N copies over — the one place `product-image-store.ts` explicitly
  forbids them. The ceiling is hard and measurable, not soft: the workspace key is
  a portable backup key, and restore throws above a **4 MB** per-record bound
  (12 MB whole-snapshot cap on create), on top of the ~5 MB origin quota shared
  with every other product. At 137-411 KB per photo, a 4-page site with six photos
  is 0.8-2.5 MB per retained artifact — **the second retained publish can alone
  break company backup.**
- **Resolve from IndexedDB in the async download handler → (a)+(c), gives up
  (b).** Nothing enters `localStorage` and both export pins survive. But the
  emitted bytes are no longer determined by the sealed artifact: photos are
  per-origin IndexedDB and deliberately excluded from company backup, so a second
  device signed into the same managed company finds an empty database and exports
  a text-only file. **The owner re-uploads and the live site silently loses every
  picture.**
- **Ship nothing → (b)+(c).** Today's state.
- **Fund hosted image storage.** The only option that buys all three, and it is
  its own founder decision about hosted infrastructure and cost.

**The size fact that should inform the answer:** a full 3-page starter export is
**11,123 bytes** today. One photo at the ingest bound is 137-411 KB as a data URI
— **12× to 37× the entire current file for a single picture** — and a ten-item
catalog lands at 1.4-4.1 MB in one uncacheable HTML file the owner hand-uploads
over a Myanmar mobile connection. The published CSP (`default-src 'none'`, no
`img-src`) also blocks `data:` images today and would have to be widened.

**Recommendation: no catalog for now, plus one cheap honest interim** — say on
the publish screen that the downloaded site file is text-only, so an owner who has
uploaded photos learns it *before* uploading rather than after. Reasoning: every
"yes" corner has a failure mode that shows up on a real client's device rather
than in a test — a broken company backup, or a site that silently loses its
pictures. The interim sentence costs one line and removes the surprise. That
sentence is customer-facing copy and needs your sign-off, same rule as P10.

**Reversibility:** high while nothing ships. The expensive direction is the seal
route, because retained artifacts accumulate and a workspace that has crossed the
backup bound cannot be un-crossed by a later code change.

**Source:** `hq/strategy/PRODUCT-SUPREMACY-ROADMAP.md` §3 item 3 (which also
records two over-claims it withdrew — the migration objection and the
determinism objection are both defeated, and this entry does not resurrect them).

---

### P21 — pos.supermega.dev: ratify the published price, or remove the offers block?

**Answer with:** ratify, or remove.

**Blocked on this:** nothing in this repository, but it is downstream of **P0**.
It is here because it is the only place in the whole estate where a price is
already public, and it directly contradicts P2. **P0 decides which of the two
questions this entry actually is:** if client one buys Shop Counter, this is a
ratification of your own product's price; if client one buys the managed Shop,
it is a copy fix on a page selling a different product.

**The situation, stated without quoting the figure.** The page at
`pos.supermega.dev` publishes a specific setup figure four times — in
`<meta name="description">`, `og:description`, `twitter:description`, and in a
`schema.org` `offers` block with `priceCurrency: MMK` and
`availability: InStock`. It does **not** appear in the visible on-page copy.
Project memory records the current position as custom quote per customer with no
public prices. **These cannot both be current.**

**Two things make this more urgent than an ordinary copy inconsistency**, and
they are the audit's reasoning, not mine: because the figure lives in meta and
structured data rather than visible copy, it is invisible to a human reading the
page but fully legible to machines; and `schema.org` `offers` markup with a
concrete price and `InStock` availability is precisely the format search engines
and AI assistants ingest, cache and repeat. It is the form most likely to be
quoted back at you by a prospect who never visited the page.

**Options and their real cost.** Ratifying makes it your price and settles part
of P2 by default — but that page sells **Shop Counter / DeskPOS, a different
codebase in a different repository** (`swanhtet01/supermega-workspace`,
`spa-desk-pilot/`), and its nine claims audit to 4 delivered / 5 partial, so
ratifying the price without the copy fixes ratifies the partials too. Removing
means going quote-per-customer everywhere — and the audit is specific that the
`offers` block should be **deleted rather than merely hidden**, because caches
persist.

**Recommendation: answer P0, then P2, then make that page match them — and if
the answer is quote-per-customer, delete the `offers` block rather than hiding
the figure.** Reasoning: a published price you did not decide is worse than either
choice made deliberately, and it will be repeated back to you by third parties
regardless of what this repo's documents say.

**Reversibility:** low, and that is the point. Page text is instantly editable;
a cached `Offer` in a search index or an AI assistant's memory is not.

**Source:** `hq/strategy/POS-PAGE-CLAIM-AUDIT.md` "Flagged, not resolved: the
published price", "First, a correction: this page does not sell the software in
this repo", and recommended fix 7.

---

### P22 — W1: widen the website template library, or confirm the finite-reviewable-site wedge?

**Answer with:** widen, or confirm.

**Blocked on this:** nothing. It is tagged FD-check precisely so nobody widens
speculatively.

**Options and their real cost.** Today there are exactly three layouts:
`business-presence`, `lead-generation`, `catalog-showcase`. Widening buys visual
variety against Wix/Shopify libraries; it costs the wedge — "a finite reviewable
site" is the stated differentiator, and a library is the thing that makes a site
un-reviewable. Confirming costs nothing and closes the question.

**Recommendation: confirm the wedge.** Reasoning: template count is not why a
Myanmar shop chooses or rejects this product — `ERP-COMPETITIVE-ROADMAP.md` §6.6
puts the binding constraint on distribution and names G1 as the one product
precondition, and W1 is not on that list. Competing on library size is competing
where you are structurally weakest.

**Reversibility:** total in the "confirm" direction. Widening is harder to undo
— a template a client's live site uses cannot be withdrawn.

**Source:** `hq/strategy/PRODUCT-SUPREMACY-ROADMAP.md` §1 W1;
`showroom/src/products/website/website-starter.ts`; `hq/portfolio.json` (the
finite-reviewable-site wedge).

---

### P23 — Will you run the three device tests?

**Answer with:** yes/no per test.

Three shipped features carry an open founder device check, all in the same class
— an agent cannot run any of them:

1. **Camera barcode scanning** on any Android phone (Shop counter, both catalog
   SKU fields, and both Plant shop-floor fields).
2. **A thermal printer** — the print path has never been exercised on a real roll
   printer. `ERP-COMPETITIVE-ROADMAP.md` §6.4 G2 is explicit that the fix is a
   print-media rule (S) rather than the Web Bluetooth ESC/POS build (large), and
   that the founder gate is not on the CSS but on the **claim**: nobody has ever
   printed a SuperMega receipt on a thermal printer, so it may not appear in sales
   copy before the test.
3. **The 390 px keyboard and touch pass** on the Shop bottom-nav work modes.

**Recommendation: yes to all three, in one sitting, once the G2 print rule
lands.** Reasoning: each is minutes of your time and each converts a shipped
feature from "believed to work" into "known to work"; the printer one additionally
unlocks or forbids a sales sentence, which is the only one with commercial
consequence. **Do not claim thermal printing until test 2 passes.** Note the roll
width is unverified — treat 58 mm/80 mm as an owner setting or something to
measure, not a constant to hardcode.

**Reversibility:** n/a. They are tests.

**Source:** `hq/strategy/PRODUCT-SUPREMACY-ROADMAP.md` §1 rows S1, S4, P2, F1;
`hq/strategy/ERP-COMPETITIVE-ROADMAP.md` §6.4 G2.

---

### P24 — Self-serve identity: eight open design questions

**Answer with:** one "accept the recommendations" for six of them, plus two that
genuinely need you.

**Blocked on this:** PR-2 of `SELF-SERVE-IDENTITY-DESIGN.md` — the create-account
panel and the Supabase `signUp` call. PR-1 has shipped and is **deliberately dead
code**: `showroom/src/core/signup-account.ts` exists, imports nothing, is imported
by nothing, makes no network call, and a test fails if anything in `showroom/src`
references it. Even after PR-2, the surface stays dark until you set
`SUPERMEGA_SELF_SERVE_SIGNUP_WINDOW` to exactly `open` **and** turn the
provider-side toggle on.

**The six with defaults you can accept in one word:** CAPTCHA (none until abuse
is observed), allowed email domains (accept any address — the claim code, window
flag and rate limits already bound the blast radius), claim-code-optional signup,
the proposed rate-limit numbers, the password-plus-confirmation flow in place of
the spec's OTP, and sequencing behind production activation.

**The two that genuinely need you, because neither has a default:**

- **Email provider and volume.** Supabase built-in SMTP is a few mails an hour —
  fine for a two-or-three-shop pilot, dead on arrival for real traffic. Moving to
  a transactional provider on the verified domain has a free-tier ceiling; the
  question is whether that ceiling is acceptable for the quarter or you budget a
  paid tier.
- **Terms of service.** The panel records literal-`true` acceptance — **of what
  document, hosted where, versioned how?** There is no canonical terms artifact
  anywhere. This is the one item in this packet with legal rather than
  engineering weight, and it has no recommendation because writing your terms is
  not an engineering act.

**Recommendation: accept the six, answer the email-provider question when you
decide P6's timing, and treat the terms artifact as a standalone task that must
exist before any stranger can create an account.** Reasoning: an account-creation
flow that records acceptance of a document that does not exist is the kind of
defect that is cheap now and expensive after the hundredth signup.

**Reversibility:** the six are config. The terms artifact is versioned by nature,
so it is amendable — but acceptances already recorded were recorded against
whatever existed at the time, which is exactly why it should exist first.

**Source:** `hq/strategy/SELF-SERVE-IDENTITY-DESIGN.md` §8;
`showroom/src/core/signup-account.ts` (module header);
`tools/test_signup_account.mjs`.

---

### P25 — Four items to leave parked: confirm?

**Answer with:** yes (leave parked), or name the one you want built.

Four roadmap items are founder-gated and, on current evidence, should stay
exactly where they are. This entry exists so parking them is a decision rather
than a drift.

- **S5 — multi-register / staff sessions.** Already built (10 roles) and
  deliberately behind the staff-roles researchGate sequence, which requires
  `verified-statements` on a managed tenant first — i.e. it is behind P5 anyway.
  Cost of building further now: work that cannot be sequenced.
- **S3 PR3 — promote loyalty into `CommerceState`.** Blocked by construction: the
  deployed backend's exact-field contracts reject any new state key on every
  managed sync, and the backend moves only by the founder-only release dispatch.
  Loyalty already works locally and its redemption already syncs. Cost of building
  now: a release dispatch and a backend contract change for a feature that already
  functions.
- **E3 — abandoned-cart / follow-up messaging.** Needs hosted messaging
  infrastructure, a credential, and your consent to contact customers. Cost:
  a whole new outbound surface, for a problem no client has yet reported.
- **P3.8 batches 2-3 — the Operations regrouping.** `DESIGN-PROGRAM.md` requires
  the same founder-probe-first treatment P3.7's strip got. Cost of building now:
  there is nobody to probe.

**Recommendation: yes, leave all four parked, and revisit each only when a real
client asks.** Reasoning: each is gated on something that does not exist yet (a
managed tenant, a release, a messaging rail, a user to probe), so building any of
them now converts founder attention into inventory.

**Reversibility:** total. Nothing is being deleted.

**Source:** `hq/strategy/PRODUCT-SUPREMACY-ROADMAP.md` §1 rows S3, S5, E3 and §3
item 5; `hq/strategy/DESIGN-PROGRAM.md` §P3.8.

### P24 — Should a device-local Website workspace have an on-screen path to the file checklist?

**Blocked on this:** nothing. Recorded because the fourth automated browser
journey (#584) had to reach the checklist by URL, and the reason turned out
to be a scope choice worth confirming rather than a defect.

**Verified 2026-09-02 against `showroom/src/products/website/WebsiteProduct.tsx`:**

- The `Prepare file` button that opens the file checklist renders only when
  `storageMode === 'managed'` (~1265). A device-local workspace's action bar
  ends at `Download preview`.
- The Start here primary action (~960-993) downloads the preview and returns
  whenever `localPreviewReady` is true, and `localPreviewReady` (~820) is true
  for every device-local workspace past the starter with no unsaved changes.
  So the handler's `openWorkspaceView('publish')` branch is unreachable on
  this device.
- The same screen's Review metric reads `Not required` for device-local
  workspaces (`releaseRecordRequired` false, ~930), which says the omission is
  deliberate: a browser-local site needs no release record.
- The checklist itself is shipped for device-local workspaces: `?view=publish`
  mounts it, it renders its own `This device only` boundary, and it persists
  real evidence, approval and site-file records with generated ids. #584
  drives exactly that path and proves the records are digest-bound.

**The question:** keep it this way (device-local sites never see the review
checklist; it exists for the managed tier and is reachable by URL), or add one
button on the ready panel so a solo owner can record their own review notes
before handing a file to a hosting provider?

**Recommendation:** keep it as is for client one. The managed tier is where a
named reviewer exists; a solo owner reviewing their own site adds ceremony
without accountability. If a pilot client asks for it, the change is one
button and no model change, because the records already work.

**Cost of deciding later:** none; nothing waits on it.

---

## 6. What I looked for and did not find — and what turned out already closed

This section is a result, not a gap. Every item here was expected to be an open
decision and is not, or is referenced somewhere without ever having been
specified. Each is listed with what closed it, so nobody re-asks.

**Already decided or already shipped — do not put these in front of the founder:**

1. **The order-intake "scorer-tolerance decision."**
   `CLIENT-READINESS-BRIEF.md` §5 lists it as an open founder decision and
   `PRODUCT-CATALOG-AND-PRICING.md` §7 calls it "the last product judgement
   blocking the order-intake evaluation gate". **It was made on 2026-08-17:**
   "DO NOT loosen the scorer"
   (`hq/research/order-intake-agent-evaluation-2026-08.md:610`). The real blocker
   is credential plus egress — **P14**. Both citing documents are stale on this.
2. **The `ecommerce-storefront` capability copy over-reach.**
   `MARKETING-POSITIONING.md` §(e) item 8 flags "Show a catalog online" as a copy
   fix awaiting the founder. It is already fixed on `main`:
   `capability-tiers.ts:112-124` now reads "Show your catalog on this device and
   take order requests into Shop for review", with the old string preserved only
   in a comment explaining why it was wrong.
3. **Runbook migration v11.** `CLIENT-READINESS-BRIEF.md` §2 rows 6-7 and PR #495
   both still offer "apply v11" as a live fork. Production is already at v11 with
   zero drift and the current runbook §0 says not to apply it again. Folded into
   **P7** and **P8**.
4. **The runbook's §0 release precondition.** The version of the runbook current
   until 2026-08-20 named "the remediation branch merged and released" as the one
   open precondition. It is satisfiable now: release run **346** shipped
   `6647a2b2` — the current head of `main` — live on 2026-08-23. What remains open
   is the approval receipt, which is **P5**.
5. **"The founder does not run releases."** Three production releases were
   dispatched successfully on 2026-08-22 and 2026-08-23 (runs 344, 345, 346).
   Release dispatch is routine, not a bottleneck, and no entry in this packet
   treats it as one.

**Referenced but never specified — I could not find where these were decided,
and I have not reconstructed them:**

6. **Which product is being sold to a first paying Myanmar client — promoted to
   P0.** This was listed here as an unspecified gap in an earlier draft. That was
   the wrong place for it: it is the most consequential unwritten decision in the
   estate *and* it is answerable by the founder in one word, which makes it a
   decision, not a search result. It is now **P0**, at the head of section 1,
   with an answer format and its consequences for P2, P3 and P21 spelled out.
   The finding that produced it stands unchanged: this repo's documents assume
   the showroom Shop / managed tier and record that no price has ever been
   approved, while `pos.supermega.dev` sells **Shop Counter**, built from a
   different repository, with a published price and `InStock` structured data,
   and no document anywhere states which of the two the first paying client is
   buying.
7. **Whether a real prospect exists.** `hq/portfolio.json`, the readiness ledger
   and `docs/CLIENT-TENANT-ACTIVATION.md` all describe the pilot as one named Spa
   owner and work a `beauty-spa` example through activation. The private intake
   they refer to is correctly not in this repository, so the repo describes the
   *shape* of client one and never says whether that person exists. This is the
   one unknown in section 6 that changes the **minimum subset** rather than only
   annotating it: if the answer is "no prospect", **P9** joins section 0's list.
   Section 0 and **P9** both now carry that condition explicitly.
8. **Who runs the billing shift when step 10 binds.**
   `FOUNDER-BOTTLENECK-STUDY.md` §2 concludes the correct answer is a second
   trusted human rather than automation, and that the ceiling binds "somewhere in
   the hundreds" of clients. No document names that person or a hiring trigger.
   Not urgent, and not invented here.
9. **A contradiction I did not resolve.** `hq/portfolio.json` previously required
   a founder-selected pilot operator, while `hq/WORKBOARD.md` OPS-744 records a
   founder decision that made pilots self-serve with users naming themselves. On
   `6647a2b2` the portfolio's shop work order reads "A named owner, reviewed client
   data, protected release, and approved isolated tenant are still required", which
   reads as a return to a named operator. I found no document that retires either
   position, so I am flagging the tension rather than picking a side.

**Deliberately excluded from this packet:**

10. **Amounts, of any kind, in any currency.** None is approved and none appears
    here, and none may ever appear here — `CLAUDE.md`'s hard limits forbid prices
    anywhere in this public repo. **P2** and **P21** are the entries that ask you
    to set one; **P2** now also names where it must live (`.secrets/`-class local
    storage, outside this repository) and what breaks until it does.
11. **The `infra-http.mjs` DNS-rebinding TOCTOU gap** (`CLAUDE.md` queue item 4).
    It is verified, unfixed, and blocked on tooling — not on a founder decision.
    It is engineering work waiting on a Node-24-verified approach or on the PG17
    cascade, so it does not belong in a decision packet.
12. **Readiness ledger v5.** A recording gap blocked on the same PG17 rehearsal
    cascade **P5** describes; zero founder minutes per client; not a decision.

---

## 7. If you answer nothing else

Answer **P0** first (which product), then **P1**, then **P2** — *both* halves of
P2: the shape and the figure, the figure set in `.secrets/`-class local storage
— then **P3**, and say **yes to P4**. If you do not already have a named
prospect, add the five-gate subset of **P9**, because in that case nothing else
on this list produces a client.

That is the whole minimum. On current evidence nothing else in this document
stands between the company and its first paying client.

Then, in order: **P5** (all four sub-approvals in one receipt — they are not
grantable separately), **P6** (which door client one walks through), **P7** (the
migration set), and **P16** (commission the Burmese review) — because that is
the shortest sequence from "a client is paying" to "a client is paying, on
record, on hosted infrastructure, using a till their cashier can read."

---

## What this document does not do

It authorizes no deploy, no production write, no migration, no release dispatch,
no billing or entitlement transition, no customer contact, and no gate change. It
quotes no price. It proposes no change to any `CLAUDE.md` hard limit. Where its
sources disagree with each other it says so and cites both, rather than smoothing
it into a single confident sentence — sections 5 and 6 exist for exactly that
reason.
