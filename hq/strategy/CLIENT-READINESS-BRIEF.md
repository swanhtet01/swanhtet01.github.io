# Client readiness brief — what stands between today's product and a paying client

Date: 2026-08-20
Status: synthesis (no deploy, production write, founder-gated action, or gate
change is authorized by this document).
Question answered, in the founder's framing: *what stands between today's
product and a paying client, in order, with what each step costs.*
Rule inherited from `PRODUCT-SUPREMACY-ROADMAP.md`: every claim cites a repo
file or names the gap outright. Where two current sources disagree, both are
cited and the disagreement is stated rather than smoothed.

Sources read for this brief: `hq/readiness/managed-pilot-readiness.json` and
its generator `kernel/managed-pilot-readiness.mjs`, `hq/portfolio.json`,
`hq/strategy/PRODUCT-SUPREMACY-ROADMAP.md`,
`hq/strategy/PRODUCT-CATALOG-AND-PRICING.md`,
`hq/strategy/PRODUCTION-ACTIVATION-RUNBOOK.md`,
`hq/strategy/BILLING-RAIL-DESIGN.md`, `hq/strategy/GTM-AI-OPERATIONS.md`,
`hq/strategy/ENTERPRISE-READINESS-SCORECARD.md`,
`hq/strategy/ANDROID-PERFORMANCE-BASELINE.md`, `docs/pilot-kit/` (all four
documents), `docs/demo-playbooks/shop.md`, and the product source files cited
in section 3.

**Freshness note, 2026-08-26:** current release/readiness authority has moved
from the self-serve activation framing in this brief to the owner-named Shop
pilot sequence captured in `COMPETITIVE-EXECUTION-CUT.md`,
`AI-NATIVE-ARCHITECTURE.md`, and
`hq/readiness/managed-pilot-readiness.json`. Protected production is now schema
v11 with zero drift from the local v11 target, browser roles denied, public
browser quarantine recorded, managed writes disabled, and pilot mode
`owner_named`. Treat any instruction below that asks the founder to apply v11
as historical unless re-confirmed against the runbook and readiness ledger.

---

## 1. Where we actually are

**Zero managed tenants, zero revenue, and no lead list committed to this
repo.** This is verified against the ledger, not inherited: the 2026-08-19
readiness ledger (`hq/readiness/managed-pilot-readiness.json`) records
`productionWritesEnabled: false`, `databaseWrites: 0`, `storageBucketCount: 0`,
`externalWritesPerformed: false`, and the `production_activation` gate as
`blocked` with the evidence line "The production Supabase target remains
protected-unapproved." No customer tenant can exist, because the two env flags
that would allow one (`SUPERMEGA_SELF_SERVE_ACTIVATION_WINDOW`,
`SUPERMEGA_TRIAL_WRITES_ENABLED`) are founder-only steps C and D of
`PRODUCTION-ACTIVATION-RUNBOOK.md` and have not been run. All four products
sit at `status: "release-candidate-local"` in `hq/portfolio.json`. Three of the
four `nextGate`s name an isolated hosted tenant nobody has provisioned;
**Website's does not** — it asks for "one named-business brief through accepted
responsive preview and retained managed artifact", and its `blockingReason` is
"Needs named business brief and accepted owner review; sample cannot close the
gate", which is a customer input rather than infrastructure (the "managed
artifact" clause still ties its final retention to the managed side, so it is
the cheapest gate to *advance*, not a gate that closes locally). Revenue is
structurally zero: `PRODUCT-CATALOG-AND-PRICING.md` §4 states "no price has
ever been founder-approved, and no prices exist anywhere in the code by
guard-enforced decision," and the six founder asks D1–D6
(`BILLING-RAIL-DESIGN.md` lines 49–54) are all still open. What *is* real and
live today is the free tier — the whole single-device business, enforced by the
`FREE_FOREVER` CI invariant in `showroom/src/core/capability-tiers.ts` — plus
a materially better phone product than existed 48 hours ago (section 3).

### Contradictions found while checking that paragraph — do not smooth these

1. **"First lead batch produced" has no artifact.**
   `PRODUCT-SUPREMACY-ROADMAP.md` §2 item 6 says the GTM lattice is "Already
   specced; first lead batch produced 2026-08-19."
   `GTM-AI-OPERATIONS.md` (same date) opens with "**Nothing in this document
   has been sent, posted, or contacted**", states in (b) that no real CRM or
   lead database exists and a lead list would be "a plain file … for the
   founder to review", and leaves all six founder checkboxes in (f) unticked.
   A repo-wide search finds no lead-list file. The only committed 2026-08-19
   GTM output is three trade-specific email variants added beside the
   pre-existing generic draft in (c) — (c).1 is labelled "original draft,
   unchanged" — plus the three trade-specific post drafts in (e).
   **Treat "zero real leads" as the true
   state** and the roadmap line as either shorthand for "the draft sets landed"
   or an uncommitted artifact. Either way, no business has been contacted.

2. **The runbook and the pricing doc disagree on whether activation's last
   precondition is satisfied.** `PRODUCTION-ACTIVATION-RUNBOOK.md` §0 (updated
   2026-08-19) says the remediation branch must be "merged to trunk **and
   released** (paired release, live verified)" and calls this "**the one
   precondition still open — do not run steps B-D until that release is
   live**." `PRODUCT-CATALOG-AND-PRICING.md` §7 (2026-08-17) says #419 and
   #420 "are both merged to `main` as of 2026-08-17 — this precondition is
   satisfied." Merged-to-main and released-as-a-paired-live-deploy are
   different events, and the release dispatch is founder-only and typed-phrase
   gated (`CLAUDE.md` hard limits). **This must be resolved by looking at the
   release workflow's run history before step B is run** — it is a
   two-minute check that currently blocks the entire hosted path.

3. **The ledger's headline next action is stale against its own body.**
   `overall.nextAction` asks for the `bounded-managed-pilot-rehearsal`
   decision, whose `proposedActions` include
   `run_hosted_isolation_storage_recovery_proof`. But the same file already
   records `storagePrivacy.proofComplete: true`,
   `managedPersistence.proofComplete: true`, and
   `selfServePilot.proofComplete: true`. Reading
   `kernel/managed-pilot-readiness.mjs` explains why: `overall.nextAction` is
   built from module constants (`NEXT_ACTION_DECISION_ID`,
   `NEXT_ACTION_REQUIREMENTS`, lines 326–333) and is never recomputed from
   gate state. The *gate-level* next action is the current one: the
   `self_serve_pilot` gate says "Run
   hq/strategy/PRODUCTION-ACTIVATION-RUNBOOK.md as the founder
   production_activation decision."

4. **The ledger structurally cannot report success.** In
   `kernel/managed-pilot-readiness.mjs`, `overall.status` is the literal
   `'blocked'` and `hostedActivationReady` the literal `false` (lines 322–324),
   and `validateManagedPilotReadiness` (line 407) *fails* any value where
   `status !== 'blocked'`, `hostedActivationReady !== false`, or
   `blockingGateCount < 1`. This is the anti-overclaim design working as
   intended, but the consequence matters for planning: **after the founder
   activates, there is no machine-readable place to record it.** Recording
   activation needs a v5 contract, and `kernel/managed-pilot-readiness.mjs` is
   one of the ledger's own `sourceReceipts`, so changing it requires the
   `database:postgres17:record` → `readiness:managed:write` cascade that
   `CLAUDE.md` records as currently blocked on PG17 access.

5. ~~**Two stale gap claims in `PRODUCT-CATALOG-AND-PRICING.md`**~~ —
   **CLOSED 2026-08-20.** Both are corrected in place, citing the shipping
   file and PR: §2.1's "no barcode scanning" (shipped as
   `showroom/src/core/BarcodeScanButton.tsx`, roadmap S1, #459) and §2.4's
   "no product images" (shipped as `showroom/src/core/product-image-store.ts`,
   roadmap E1, #459). The receipt-printer/cash-drawer half of the §2.1 claim
   was re-verified and is still true, so it stays (roadmap S4 is founder-gated
   on hardware).

   The same pass swept every other "we do not have X" claim in that document
   against live source and found three more that were false — and, unlike the
   two above, false *when written*, not overtaken since: §2.3's "no
   sitemap/robots/Open Graph" (the export has emitted a `robots` directive and
   Open Graph tags since 2026-07-24), §2.1's "no dedicated guard suite" on
   replenishment/demand intelligence, and §2.4's "no dedicated guard test yet"
   on activation packets (both guard suites predate the document). All three
   understated the product. Five shipped modules the catalog omitted
   outright — camera barcode scanning (#459), merchant payment QR (#465),
   customer loyalty points (#469/#472/#482), product photos (#459), and
   Plant shop-floor scanning (#489, merged to `main` as `a7d3977d`) — were
   added as rows. Every
   remaining gap in that document was re-verified as still true; §2.2's "12
   materials/12 operations per plan" in particular looked wrong against the
   data contract's limit of 100 and is in fact correct at the authoring path,
   and now carries an inline note saying so.

   Because three of the five false claims were wrong *when written* rather
   than overtaken since, the 2026-08-17 inventory that document was built
   from contained authoring errors, not merely stale entries. A spot-check of
   six quantitative claims outside the gap sweep confirmed this: §2.1's
   "8 Myanmar trades … registry-enforced at exactly 8" was wrong on both
   halves — there are **10** (`beauty-spa` and `bakery` landed in #421) and
   the guards assert a `>= 7` floor, not an exact count. Corrected in the
   same commit. Five other figures held (Plant's 5 industry packs, Shop's 6,
   the 14-account chart, PBKDF2 600k, the 15-minute checkout quote).

   The pass swept the document for "we do not have X" claims; it did **not**
   re-derive every quantitative figure. The untouched rows should be treated
   as unverified, and the catalog now carries a standing note saying so.

---

## 2. The critical path to a first paying client

Two tracks are routinely conflated in the existing docs and must be kept
apart. **Track A** is a named design partner running the product for real —
free, local, no hosted anything, and the thing the pilot kit is built for.
**Track B** is a managed tenant on hosted infrastructure, which is what the
portfolio gates, the billing rail, and every premium/enterprise capability
actually require. A first *paying* client needs Track B for the money and
Track A for the trust; the ordering below reflects that.

Legend: **[founder-only]** = `CLAUDE.md` hard limit or an explicit founder
decision in a cited contract · **[buildable-now]** = an agent can complete it
against current tooling · **[blocked-by X]** = ready except for X.

| # | Step | Tag | Cost / what it actually takes |
|---|---|---|---|
| 1 | **Decide what is being sold, and for what.** D1 pricing shape and amounts, D2 payment channels, D3 currency posture, D4 tax posture, D5 entitlement-lapse policy (`BILLING-RAIL-DESIGN.md` 49–53; the table's sixth ask, D6, is the v13 apply and appears here as steps 6-7). | [founder-only] — `CLAUDE.md`: "Billing/entitlement transitions are founder actions via the billing CLI; never automate them." | One founder sitting. D3, D4, D5 already carry written recommendations in that table; only D1 (shape **and** amounts) and D2 (channels) have no default. Nothing downstream can charge until D1 exists. |
| 2 | **Approve who gets contacted and what is sent.** The six unticked boxes in `GTM-AI-OPERATIONS.md` (f): approve the lead list, approve the copy, connect and consent to a sending identity, connect a social account, set cadence/volume, decide who answers replies. | [founder-only] — (f) calls itself "a hard gate, the same way `production_activation` is a hard gate" | Founder review time. The lead-research and drafting agents can run first at zero external effect (they sit in the same class as the ledger's `safeAutomatedActions`). |
| 3 | **Produce the lead list and personalize the four drafts.** | [buildable-now] | Agent work. Blocker to note: the drafts require a trade-specific setup link built by `shopBusinessTemplateSetupPath` (`showroom/src/products/shop/business-templates.ts:559-561`), never the bare `/shop/` route — see the doc-truth item in section 5. |
| 4 | **Recruit one named design partner and run the pilot kit.** Baseline form, agreement outline, four start gates, five-day rehearsal (`docs/pilot-kit/`). | [founder-only] to run (on-site, with the owner); the kit itself is already written | Five founder days on the partner's floor plus a pre-day-1 baseline session. **What the kit prepares:** a named business, a named operator, a measured baseline, a signed-off agreement, and a proven process. **What it explicitly does not do:** its own README and the acceptance checklist's mapping table both mark the Shop gate's "on isolated hosted tenant" clause "**NOT satisfied by this kit**". |
| 5 | **Resolve the runbook §0 open precondition** (contradiction 2 above): confirm the paired release carrying the seven self-serve fixes is live, or dispatch it. | [founder-only] — release dispatch is typed-phrase founder-only | Minutes to check the workflow run history; a release dispatch if it has not shipped. This currently gates everything below it. |
| 6 | **Decide the migration set for the activation window** (see "The schema-version trap" below): either take v11 **plus** v12 and v13 in one window, or v11 alone and defer billing to a later planned outage. | [founder-only] — and it is a decision, not a step to execute blind | Minutes to decide, but it determines steps 7 and 9. The runbook sequences **only v11**; whichever fork is chosen, the runbook needs updating to match before it is followed. |
| 7 | **Run production activation, steps A→D** (`PRODUCTION-ACTIVATION-RUNBOOK.md` §2): apply the chosen migrations, set the runtime schema envs to the version now live, open the activation window, enable writes. | [founder-only]; steps B–D are [blocked-by step 5] | A–B are safe prep and reversible; C is the customer-facing switch; D is the runbook's own "one genuinely consequential, hardest-to-reverse step". Closes the `self_serve_pilot` gate's stated next action. **The env values in runbook step B are correct only for the v11-alone fork.** |
| 8 | **Create and verify tenant #1.** Steps C and D open the endpoint and permit writes; **they do not create a workspace.** The runbook's own "Verify end-to-end" block is the actual creation path: sign up on app.supermega.dev, get a claim code, submit the activation request, use the managed login, then confirm in the database one `workspace_access_controls` row (`self_serve_claim_v1`), one owner membership (15 caps), and one immutable `company.workspace.created` event. | [founder-only]; [blocked-by step 7] | Under an hour, but it is a distinct operation. From the documented zero-tenant start state **nothing downstream works until this exists** — every `BillingLedger` method is workspace-scoped (`_workspace_id`, `where workspace_id = %s`), and there is no tenant for the acceptance run to run on. |
| 9 | **Run the hosted acceptance evidence run** — one authenticated order-to-close plus return exception on that tenant, with the operator and baseline from step 4 (`hq/portfolio.json` shop `nextGate`; runbook §5 sequences it exactly here). | [blocked-by step 8] | Five days, but they are the *same* five days as step 4 re-run against the real tenant — which is precisely why running step 4 first is worth it. |
| 10 | **Issue the invoice, receive the transfer, then confirm the payment.** `issue-invoice` records the invoice at status `issued` and stops there; the customer pays through whichever D2 channel was chosen; the founder then runs `confirm-payment` (`--invoice-id`, `--expected-revision`, `--payment-reference`, `--channel-category`, `--paid-at`). | [founder-only]; [blocked-by steps 1, 7, 8] | **This is where "paying client" actually becomes true** — at the confirmed transfer, not at invoice issuance. An issued invoice is a request for money, not revenue. |
| 11 | **Grant the entitlement.** `grant-entitlement` against the exact invoice digest. | [founder-only]; [blocked-by step 10] | Cannot be merged into step 10: `BillingLedger.grant_entitlement` re-reads the invoice by digest and raises `BillingRailConflict("Entitlement grants require the exact paid invoice digest.")` unless its status is already `paid`. Its own docstring calls it "A separate founder action from confirm_payment". |

**Where billing sits, stated plainly:** steps 1, 6, 7, 10 and 11 are all
founder actions, and no agent may perform or automate any of them. The
engineering is done; what is missing is a decision (D1), a migration-set
decision, the production applies, and a real transfer.

### The schema-version trap — the one thing in this brief most likely to break a live activation

Both runtimes fail closed on an **exact** schema-version match, against a
number that comes from an environment variable, not from the database:

- `supermega_runtime/trial_store.py` — `TRIAL_SCHEMA_VERSION = _env_schema_version()`
  (default `10`, read from `SUPERMEGA_TRIAL_SCHEMA_VERSION`), and `_assert_schema`
  raises `TrialNotReadyError(("schema_ready",))` when
  `int(row["schema_version"]) != TRIAL_SCHEMA_VERSION`.
- `supermega_runtime/billing_rail.py` — `BILLING_SCHEMA_VERSION = _env_schema_version()`
  (default `12`, read from `SUPERMEGA_BILLING_SCHEMA_VERSION`), and its
  `_assert_schema` raises unless the live database is PostgreSQL 17 **and**
  `schemaVersion == BILLING_SCHEMA_VERSION`.

So applying v12 and v13 while runbook step B still sets
`SUPERMEGA_TRIAL_SCHEMA_VERSION=11` puts the database at 13 and the store at
11 — **every managed read and write fails closed**, and a founder following
the sequence literally would be mid-activation with a dead tenant. The billing
CLI would reject the same database from the other side, since its default of
12 does not match 13 either. It is not only a number, either:
`trial_store.py:320`'s `if TRIAL_SCHEMA_VERSION >= 12:` block adds the billing
tables to `_PRIVATE_HARDENING_TRIGGER_CONTRACT`, and `_assert_schema` also
rejects a trigger-inventory length mismatch — so the env and the database must
move together in both directions.

**The two safe forks, either of which the founder may take:**

- **Fork A (recommended) — migrate everything before tenant #1 exists.** In
  step 7's window apply v11, v12 and v13 so the database is at 13, then set
  **both** `SUPERMEGA_TRIAL_SCHEMA_VERSION=13` and
  `SUPERMEGA_BILLING_SCHEMA_VERSION=13` and redeploy, and only then run C and
  D. Database first, env second, exactly as runbook §4 already insists for
  v11 ("Do not set … before v11 is applied to production … the store will
  fail-closed"). The unavoidable window where database and env disagree costs
  nothing, because no tenant and no customer exist yet.
- **Fork B — v11 alone now, billing later.** Follow the runbook verbatim
  (v11, env `11`), get tenant #1 and the acceptance run done, and treat
  v12+v13 as a **planned maintenance window** later: the tenant is fail-closed
  from the migration until the redeploy lands, so it must be scheduled and the
  partner warned.

**What is NOT safe under either fork:** applying v12/v13 as a quiet
add-on "alongside step A" while leaving the env at 11. An earlier revision of
this brief said exactly that; it was wrong, and it is corrected here.
`BILLING-RAIL-DESIGN.md` D6's "alongside v12" refers to which runbook action
applies the migration, not to leaving the runtime env untouched.

**Why steps 10–11 cannot be pulled forward — checked in the code, not
assumed.** Production is at v11 (`securityAudit.liveSchemaVersion` in the
ledger), while billing schema v12/v13 remains separately gated; `billing_rail`'s
`_assert_schema` rejects the current production posture. Every ledger method is
also workspace-scoped (`_workspace_id`,
`where workspace_id = %s`), and no workspace row exists until step 8 creates
one. So an `issue-invoice` run against production today fail-closes twice
over. **Steps 7 and 8 are prerequisites for step 10, not parallel tracks.**

**The honest shortest path, with its cost named.** If the goal is the *first
kyat* rather than the first managed tenant, the pilot-fee and design-partner
shapes in `BILLING-RAIL-DESIGN.md` §7 charge for the founder's five days of
setup and attention (step 4) rather than for a hosted capability, so they need
only decision D1 — but they can only be **collected outside the product**, by
bank transfer or wallet, because the billing rail cannot record an invoice
until steps 7 and 8 are done. That is a real and legitimate shortcut, and its
real cost should be stated rather than hidden: the first commercial
transaction would then have no accountable record inside a system whose entire
differentiator is that every transaction has one. Take it deliberately if at
all, and reconcile it into the ledger after activation.

---

## 3. What is genuinely ready to demo TODAY

Everything below runs on a shop owner's own device, from
`https://app.supermega.dev/settings/?product=shop`, with no account and no
server write.

**Bring connectivity to the first demo.** "Works offline" is true of the
*workflow*, not of the *first load*: a fresh or cache-cleared device must
download the app over HTTPS before any of it exists, and offline operation
starts only once that load registers and populates the service worker
(`showroom/index.html` loads `/sw-register.js`, which registers `/sw.js`;
`tools/write_app_release_metadata.mjs` generates both at release time and
`showroom/scripts/seal-offline-precache.mjs` seals the precache list into the
worker after the build). A founder who arrives at a shop with no connectivity
and a fresh phone reaches none of the surfaces below. After that first
successful load the honest claim holds in full: no account, no server, and no
network needed to sell, count stock, or close the day.

**Correction, 2026-08-20.** The paragraph above was accurate about *when*
offline starts and wrong about *whether* it started at all. Until this date the
registration was an inline `<script>`, and both content policies serving this
app carry `script-src 'self'` with no hash and no nonce — so the browser
refused it, no service worker was ever installed, and nothing worked offline on
any device. Underneath that sat the gap the competitive re-scan logged as G3:
the precache only ever covered the entry graph, and `/shop/` and `/plant/` are
a lazy chunk, so the till was not in it either. Both are fixed and both are now
checked in the gate (`app_shell_inline_script_blocked_by_content_policy` and
`service_worker_precache_omits_operations_route` in `tools/verify_app_build.mjs`).
Measured after the fix, with the local server killed: `/shop/` and `/plant/`
open, a sale line builds on the counter, and the four Shop work modes navigate
with no failed requests. **F1 still stands** — none of this has been run on real
Myanmar hardware over a real dropped connection, and the phone test is what
turns a measured claim into a demonstrated one.

`docs/demo-playbooks/shop.md` §2 is still the correct setup path, and §3 now
covers the Shop phone surfaces that matter for a first owner demo: camera scan,
keyboard fallback, bottom task bar, product photo, display-only payment QR,
loyalty chip, current `Paid & handed over` handoff, and the online-first/offline
drop smoke pass. `tools/prepare_shop_android_smoke_packet.mjs` packages that
script into a private founder hardware rehearsal packet. **F1 still stands**:
the packet makes the real-phone run repeatable, but it does not prove hosted
pilot readiness, promotion evidence, or managed activation. Two rows (Plant job
board, Ecommerce storefront cards) are not Shop phone surfaces at all and have
their own playbooks. The limits column is not hedging; it is what must be said
out loud so a demo does not become an overclaim.

| Surface | Where it lives | Honest limit to say out loud |
|---|---|---|
| One-tap cash sale — the counter's `Paid & handed over` primary | `CoreApp.tsx:6955` renders the button, `:3990` queues the `order_settle` action (design phase 2 item 1, PR #436; `DESIGN-PROGRAM.md` lines 67 and 159 — its cited line numbers have since drifted, the strings above are current) | Records a sale; captures no money. Payment state changes only through the owner-confirmed reconciliation action, and the counter gate says so on screen. |
| Phone bottom-nav work modes — Today / Sell / Orders / Stock | `showroom/src/core/commerce-tabs.ts`, rendered by `CoreShell.tsx` `.mobile-nav` (roadmap F1, #459; keyboard batch 1 #486) | Roadmap F1 still lists "Open: on-device keyboard/touch pass". Only batch 1 of the keyboard regression has run. No real phone has been through it. |
| Camera barcode scan at the counter and both catalog SKU fields | `showroom/src/core/BarcodeScanButton.tsx` (roadmap S1, #459); local guard `tools/test_barcode_scan_boundary.mjs` | Built on the platform `BarcodeDetector` API alone — the component **renders nothing at all** on Firefox and desktop Safari, by design. The 2026-08-25 local guard pins fallback behaviour, stream cleanup, six call sites, keyboard-wedge continuity, and no scan-triggered domain writes. Roadmap S1's open item is an "on-device camera smoke test (founder, any Android phone)": **this has never run on real hardware.** |
| Product photos on inventory rows, counter tiles, and storefront preview | `showroom/src/core/product-image-store.ts`, `use-product-image.ts` (roadmap E1, #459) | IndexedDB, device-local, downscaled on ingest. Deliberately **no `imageId` on the workspace record** (the deployed backend enforces exact-field item contracts), so photos do not sync and do not travel with a managed workspace. |
| Photo-first storefront preview cards | `showroom/src/products/ecommerce/ecommerce-product.css:1964` (`:has()` selector; roadmap E1 follow-through, #483) | Falls back to the byte-identical artwork card in any browser without `:has()`. Photos are **not** in the exported/published site — `website-export.ts` is untouched and contains no image handling (roadmap §3 item 3 lists this as a separate, undecided slice). |
| Merchant payment QR at checkout and on the amount-due receipt dialog | `showroom/src/core/payment-qr-store.ts`, `PaymentQr.tsx`, `use-payment-qr-image.ts` (roadmap S2, #465) | **Display-only, and this must be said.** The store's own header: "THIS IS NOT A PAYMENT CAPABILITY … No network call of any kind happens here." It shows the owner's own provider-issued static QR; money moves inside the customer's banking app, invisible to this system. |
| Loyalty points — balance chip at the counter, redemption, receipt line | `showroom/src/core/shop-loyalty.ts` (roadmap S3 PR1+PR2, #469/#472/#482) | Settings are device-local; the accrual is a pure projection, so refunds reverse structurally. Redemption rides the existing credit-correction mechanism (so it *does* sync in managed mode). Promoting loyalty into `CommerceState` proper is PR3 — founder-gated and deferred. `ACT-DEMO-`-prefixed sample orders accrue nothing. |
| Plant visual job board with due-date lanes | roadmap P1, #484 | **Display-only** — no drag-and-drop rescheduling, because rescheduling is a domain write and a separate slice. |
| Guided samples in every product | `actionId` prefix `ACT-DEMO-` (`commerce-workspace.ts` ~2184) | A guided sample never earns a proof counter: an Ecommerce request stops at `pending_shop_review`, a guided Plant shift releases no batch, a guided Website sample publishes nothing (`CLAUDE.md`). Say "sample", never "customer". |

**Two limits that apply to the whole demo, on every surface above:**

- **Device-local, no hosted sync, no account** — after the first load. No
  surface above writes to a server. That is the pitch (`Stays on this device.
  Nothing is sent or published.`), and it is also the ceiling: there is no
  multi-device, no staff sign-in, no cloud backup, and no managed workspace to
  show, because none exists (section 1).
- **~3.9–4.2 s to first paint on the target device class.**
  `ANDROID-PERFORMANCE-BASELINE.md` measured median FCP of 3,940 ms (`/`),
  4,088 ms (`/shop/?tab=counter`) and 4,100 ms (`/shop/?tab=orders`) under ×6
  CPU throttling and a 400 ms-RTT / 400 kbit/s link on a Galaxy A13 profile —
  and FCP lands *after* the load event on all seven measured routes, so the
  owner watches a blank screen for four seconds. The counter and orders tabs
  also carry the worst main-thread boot (1,767 ms and 2,031 ms of long tasks;
  longest single task 745–758 ms, during which a tap does nothing). Quote the
  document's own limitation when using these numbers: a throttled sandbox x86
  core is not a Galaxy A13's core, so **the relative ranking is the reliable
  signal, not the absolute milliseconds** — and a real Myanmar mobile link will
  be worse and more variable than the jitter-free emulation.

---

## 4. The three biggest risks to a first client engagement

### Risk 1 — There is nothing to charge for yet that is also built

**Evidence.** Every capability above the free tier is dark.
`PRODUCT-CATALOG-AND-PRICING.md` §4: `ai-order-intake` "runs against the
managed-tenant endpoint; model calls currently fail closed pending activation
and the pre-registered evaluation (no live eval run yet)"; `ai-demand-advice`
is "**Tier declaration + locked-notice UI only; no backing implementation
exists in the repo.** Do not list it as a feature"; `cloud-backup` is
"Declared; no hosted implementation yet". The enterprise three
(`shared-workspace`, `staff-roles`, `verified-statements`) are behind the
sequenced `enterprise-capabilities` researchGate in `hq/portfolio.json`, which
requires each tier "proven in production before the next" — and production has
zero tenants. Meanwhile the free tier is the entire working business by
CI-enforced invariant, so there is no in-product pressure to pay at all.

**Cheapest mitigation.** Sell a shape that needs no unbuilt capability: the
pilot-fee or design-partner shapes in `BILLING-RAIL-DESIGN.md` §7, where what
is paid for is the founder's five days of setup, training, and attention —
all of which section 3 can back today. Cost: decision D1, plus the honest
trade-off named under the critical path (money collected before steps 7–8
cannot be recorded by the billing rail and must be reconciled into it later).
No engineering either way. The alternative — waiting until a premium
capability is live — means waiting on the order-intake evaluation gate *and*
production activation *and* an AI budget hosted-activation proof, in series.

### Risk 2 — The best new surfaces have never run on the hardware they were built for

**Evidence.** Roadmap S1's status column carries an explicit open item —
"on-device camera smoke test (founder, any Android phone)" — and F1's is "Open:
on-device keyboard/touch pass". `ANDROID-PERFORMANCE-BASELINE.md`'s own
Limitations section states the measurement was headless Chromium with "no
touch input, no scroll/interaction measurement — this profiles cold navigation
only, not tap latency inside the app". `ENTERPRISE-READINESS-SCORECARD.md` §5
coverage gap 2 records that `CoreApp.tsx` has "zero component tests … no
automated browser E2E exists in any workflow", verified by manual 390 px
journeys. So the barcode scanner, the phone bottom bar, and the QR dialog —
the three things most likely to be demoed first on a phone — are proven by
build gates and desktop emulation only. A camera permission prompt behaving
unexpectedly in front of a shop owner is a first-meeting-ending failure.

**Cheapest mitigation, in order of cost:** (a) the founder walks one Android
phone through the updated Shop playbook and `shop:android-smoke:packet` output
for an afternoon. The playbook now covers the camera, QR, photo, loyalty, and
bottom-nav surfaces; the packet keeps the evidence private and fail-closed. Zero
build cost, zero gate spend, and it turns S1's and F1's open items into a real
hardware decision instead of a synthetic claim.
(b) ship the app-shell skeleton that `ANDROID-PERFORMANCE-BASELINE.md`'s "What
to optimize first" item 3 describes — a static skeleton inside the 4 KB
`index.html`, which "moves first visual feedback to well under 1 s on this
profile **with no JS changes**". That is the cheapest measurable win in the
whole performance queue.

### Risk 3 — Running the pilot kit and calling it "the pilot" would overclaim the Shop gate

**Architecture bridge.** POS-independent Shop Profit Control is the public and
owner first-use acquisition and diagnostic wedge. Its first job selects and
prioritizes one accountable money leak or operating risk, with the accountable
role, due point, next action, and objective closure made explicit. It does not
replace a POS and it does not turn a local projection into customer, pilot, or
commercial proof.

The existing shop-spa-owner-pilot remains the first bounded named vertical
proof. It uses the existing Spa package sale, treatment redemption, daily close,
and recovery workflow to validate one real end-to-end operating workflow and
measured correction effort. Spa is not Shop's product identity, and success in
this bounded vertical does not prove all Myanmar trades.

Both paths remain owner-gated. Synthetic, sample, browser-local, and
local-rendered evidence cannot close the real pilot.

**Evidence.** `hq/portfolio.json`'s `shop-spa-owner-pilot` requires a named Spa
owner to complete reviewed client import, reconciled package sale, matching
treatment redemption, daily close, and recovery on an isolated hosted tenant.
It also requires setup time, correction effort, and five-day evidence, and
explicitly rejects sample data as client proof. `docs/pilot-kit/README.md` and
`docs/pilot-kit/acceptance-checklist.md` therefore frame browser-local work as
rehearsal only. The failure mode is not technical: five good days with sample
data still leave the real-client gate open, so downstream claims or invoice
justification would overstate the evidence.

**Cheapest mitigation.** Zero build cost: schedule step 4 and step 7 of the
critical path in the same fortnight, exactly as `PRODUCTION-ACTIVATION-RUNBOOK.md`
§5 already sequences them ("Once the window is open and one real tenant exists,
run the five-day evidence plan"). Run the local Spa package flow as recruitment
and operator training; run it again with the named owner and reviewed client
data on the real tenant as evidence. Keep "rehearsal" on every local artifact.

---

## 5. The two-week plan

Nothing here is authorized by this document; the founder column is what only
the founder can do, per the cited contract in each row.

### Agent-autonomous, [buildable-now]

| Item | Cites | Note |
|---|---|---|
| **A1 — F2 batch 1: first-paint fix.** Static app-shell skeleton in `showroom/index.html` plus `<link rel="modulepreload">` for the route's known chunk chain. | `ANDROID-PERFORMANCE-BASELINE.md` "What to optimize first" #3; roadmap §3 item 1 | The single cheapest measured win (Risk 2b). Roadmap §3.1 requires its own planning pass first. |
| **A2 — F2 batch 2: cut the eager-model edge.** Make `workspace-runtime.ts`'s static `commerce-workspace` / `production-workspace` imports lazy or per-product. | Baseline "What to optimize first" #1 (110.4 KB gz off every surface, ≤22 % of it executed) | Roadmap §3.1 warns "those imports are load-bearing for every product surface" — planning pass before code. |
| **A3 — P2: Plant shop-floor scanning.** Reuse `BarcodeScanButton.tsx` for material issue and job dispatch. | Roadmap §1 P2 ("NOW after S1 ships"), §3 item 2 | Small-medium; no new dependency, no gate spend. |
| **A4 — Doc-truth fix in the Shop demo playbook.** `docs/demo-playbooks/shop.md` §2's parallel-lane note says a `?template=` deep link "is not in the app at this commit — do not add a template parameter to app URLs in a live demo". It **is** in the app: `ProductOnboardingPage.tsx:105` reads `?template=` and `business-templates.ts:559-561` builds the path. | The two source lines above; `GTM-AI-OPERATIONS.md` (c) mechanism note | Directly unblocks step 3 of the critical path — the outreach drafts promise a trade-specific sample and the playbook currently forbids the link that delivers it. `docs/` is drift-guarded, so `node tools/test_demo_playbooks.mjs` must stay green. |
| **A5 — Reconcile the two stale gap claims** in `PRODUCT-CATALOG-AND-PRICING.md` §2.1 and §2.4 (contradiction 5, section 1). | Roadmap S1/E1 SHIPPED rows | Doc-only. That document is the one sales copy is lifted from. |
| **A6 — CLOSED LOCAL 2026-08-25: extend `docs/demo-playbooks/shop.md` §3 to the surfaces that shipped 2026-08-19.** | Section 3 of this brief; roadmap S1/S2/S3/E1/F1 SHIPPED rows; `tools/prepare_shop_android_smoke_packet.mjs` | The on-device smoke test now has a repeatable script and private evidence-field packet. This closes the local doc/tooling slice only; founder item F1 still needs real Android hardware. Same drift guard as A4: `node tools/test_demo_playbooks.mjs` plus `npm run shop:android-smoke:self-test` must stay green. |
| **A7 — Propose the runbook amendment for the schema-version trap.** `PRODUCTION-ACTIVATION-RUNBOOK.md` §2 sequences only v11 and hardcodes `SUPERMEGA_TRIAL_SCHEMA_VERSION=11`; it never mentions `SUPERMEGA_BILLING_SCHEMA_VERSION` at all, and its §4 "What you should NOT do" list does not warn about the v12/v13 case. Draft the amended step B for both forks, for founder confirmation. | "The schema-version trap" in section 2; `trial_store.py:52`/`3218`, `billing_rail.py:63`/`543` | The runbook is the document a founder follows literally at 2am during activation. Amending it is doc work an agent can draft; **adopting** it is the founder's call, and the runbook stays founder-owned. |

### Founder-only

| Item | Cites | Why only the founder |
|---|---|---|
| **F1 — One Android phone smoke test** over section 3's nine rows: camera scan, bottom nav, QR dialog, one-tap sale, product photo, loyalty chip. Run it from the A6-updated playbook and the `shop:android-smoke:packet` evidence fields. Do the first load **on connectivity**, then drop the network and confirm the workflow still runs — that tests the offline claim honestly instead of assuming it. | Roadmap S1 and F1 open items | Needs real hardware. Closes two open roadmap items for the cost of an afternoon and retires most of Risk 2. |
| **F2 — Make D1–D6, plus the migration-set fork** (critical-path step 6: Fork A all-migrations-before-tenant, or Fork B v11-now-billing-later). | `BILLING-RAIL-DESIGN.md` 49–54; "The schema-version trap" in section 2 | `CLAUDE.md` hard limit. D3/D4/D5 carry written recommendations, so the genuinely open ones are D1, D2, and the fork. D6 is not a free-standing scheduling call once the trap is understood — it comes with the two runtime env values. |
| **F3 — Resolve the runbook §0 precondition** (contradiction 2): check whether the paired release carrying the self-serve fixes is live. | `PRODUCTION-ACTIVATION-RUNBOOK.md` §0; `PRODUCT-CATALOG-AND-PRICING.md` §7 | Release history is founder-visible; the dispatch itself is founder-only. Everything hosted is behind this. |
| **F4 — Tick or explicitly defer the six GTM boxes.** | `GTM-AI-OPERATIONS.md` (f) | Named there as a hard gate. Deferring is a legitimate answer; leaving them ambiguous is what stalls Track A. |

## The six-week plan

### Founder-only, in order

1. **Production activation A→D** (`PRODUCTION-ACTIVATION-RUNBOOK.md` §2), after
   F3 clears — with the migration set and **both** runtime schema envs decided
   together per "The schema-version trap" (critical-path steps 6–7).
2. **Create and verify tenant #1** — the runbook's "Verify end-to-end" block.
   Activation permits a tenant; it does not create one (critical-path step 8).
3. **The hosted acceptance run** for `shop-spa-owner-pilot` on that tenant,
   using the named Spa owner, reviewed client data, and baseline produced by
   `docs/pilot-kit/` — the only thing that closes the Shop `nextGate` in
   `hq/portfolio.json`.
4. **Invoice → transfer → `confirm-payment` → `grant-entitlement`** via
   `python -m supermega_runtime.billing_rail`, once D1 and D2 exist. Four
   distinct actions, not one; the entitlement grant fail-closes on any invoice
   that is not already `paid` (critical-path steps 10–11).
5. **The scorer-tolerance decision** on quote-literal wording variance that
   `PRODUCT-CATALOG-AND-PRICING.md` §7 names as the last product judgement
   blocking the order-intake evaluation gate.

### Agent-autonomous or clearly blocked

| Item | Tag | Cites |
|---|---|---|
| **Order-intake golden-set evaluation** — a fresh full 20-fixture live run once the scorer-tolerance decision lands. | [blocked-by the scorer-tolerance decision], then [buildable-now] | Roadmap §3 item 4: "server-only and spends no hosted gate" — it can run in parallel with everything else. Gate text: `hq/portfolio.json` `ai-assistance` `nextGate`. |
| **Observability floor — OpenTelemetry local phase.** | [buildable-now] | `ENTERPRISE-READINESS-SCORECARD.md` §8 rec 1 and its own summary: "the decision is already made, the redaction rules are already written, and it requires no founder gate until managed mode". Enters through the existing `opentelemetry` researchGate. |
| **F2 remaining items** — split `core-app-*.js` (100 KB gz, 9 % executed on the counter), then break up the Shop boot long tasks. | [buildable-now], sequenced after A1/A2 | Baseline "What to optimize first" #2 and #4; the document itself says #4 is "worth doing after 1–2, since smaller chunks shrink these tasks for free first". |
| **First automated 390 px browser journey in CI.** | [buildable-now] | Scorecard §5 highest-leverage item: "it protects the largest untested surface (`CoreApp.tsx`)". Directly reduces Risk 2 for every future demo. |
| **Enterprise ladder step 1 — `verified-statements` on the managed tenant.** | [blocked-by production activation] | `hq/portfolio.json` `enterprise-capabilities` gate sequence; `enterprise-staff-roles.ts` header states its own prerequisite. `staff-roles` cannot precede it. |
| **Readiness ledger v5 so activation is recordable** (contradiction 4). | [blocked-by the PG17 rehearsal cascade] | `kernel/managed-pilot-readiness.mjs` is one of the ledger's `sourceReceipts`; editing it needs `database:postgres17:record` → `readiness:managed:write`, which `CLAUDE.md` records as currently impossible. Do not attempt it as a side effect of other work. |

---

## What this brief does not do

It authorizes no deploy, no production write, no migration, no release
dispatch, no billing or entitlement transition, no customer contact, and no
gate change. It quotes no price, because none is approved. It records no
improvement claim, no customer, and no revenue, because none exists. Where the
sources disagree it says so rather than choosing; resolving contradictions 2
and 3 in section 1 is founder work, and doing so is the cheapest thing on this
whole page.
