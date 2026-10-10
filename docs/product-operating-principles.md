# SuperMega product and operating principles

Status: maintained decision guide, updated 10 October 2026. Current execution state and authority live in `../supergoal.md`; this document does not authorize spending or deployment.

## Product promise

Help a business complete real work with fewer steps and reliable records. Sell the outcome supported today. AI is an implementation choice, not a substitute for a working product.

## Design decisions

- Use the accepted reference direction: white surfaces, dark readable text, restrained indigo accents, subtle borders and consistent spacing. Reuse shared tokens rather than starting a new palette in each product. No public theme selector or promotional demo/trial detours.
- Public pages explain Shop, Sites and Commerce with real product screenshots, concrete capabilities and one clear next action. Login stays easy to find.
- Screenshots must come from the implemented product. Illustrative data must be identified; never imply invented customers or sales are real.
- Each working screen has a primary task. Put secondary controls in context and advanced controls behind disclosure. Preserve keyboard access, focus visibility, readable contrast and mobile touch targets.
- Collect business facts, not implementation decisions. Preserve inputs after failures and distinguish a draft, a submitted request and a durable saved record.
- Before a substantial redesign, create a visual concept, compare alternatives, implement the selected direction and compare real screenshots at matching viewport/state. Review error and empty states as well as the happy path.

## Design-thinking delivery contract

Start with Burmese-speaking owners and operators of small retail and service businesses. Do not try to make every industry and enterprise workflow equally prominent. Templates may change business vocabulary and starting content; they must keep the same navigation, saved-record rules and interaction patterns.

| Product | Primary customer job | Interface direction | Proof required |
| --- | --- | --- | --- |
| Shop | Sell an item and know what needs attention next | Today summary with separate readable metrics, product/order tables and contextual tasks; focused counter with search/scan and one checkout action | Sale, stock, payment record, customer receipt and daily close reconcile after reload; keyboard/touch and actual barcode/printer checks |
| Sites | Turn business details into a useful website and answer incoming interest | Page navigation, visible section previews, one edit action per section, Preview/Publish; compact inquiry list with a focused message pane | Details → photo → save → review → publish → received inquiry → accountable follow-up → withdrawal, with managed persistence |
| Commerce | Receive an online order and get it fulfilled | Reuse the Shop catalog; customer storefront and operator fulfilment are distinct views; one selected order with its next action | A real storefront submission arrives once in the right workspace, survives retry/reload, and reaches packing/completion with truthful payment state |
| Public website | Understand the offer and contact us | Short outcome-led pages; distinct current screen captures in a consistent gallery; ordinary Name, Email, Company and Message fields | Gallery controls change the screen; images stay legible on phone; contact submission delivers; claims match accepted capability |

Work each slice through five decisions:

1. **Observe:** capture the current route, task and friction. Mark founder feedback, our observation and a customer test separately; never invent interviews.
2. **Define:** write one problem sentence and a baseline such as extra decisions, a failed save, an unreadable screen or a missing next action.
3. **Choose:** compare two small layouts or interaction paths against the supplied references; prefer the one that removes unnecessary work. Reuse established components.
4. **Build:** implement the real state transition and recovery, then its visual presentation. A persuasive screenshot cannot substitute for a working transition.
5. **Evaluate:** inspect desktop and phone, keyboard/touch, empty/busy/error/read-only states, persistence and relevant isolation. Record PASS, FAIL, BLOCKED or NOT RUN. Revise the observed failure before expanding scope.

Visual acceptance means a clear heading, readable primary content, aligned surfaces, one dominant action per task, visible focus, no accidental horizontal scrolling, appropriate touch targets and no misleading empty-state metrics. Match the reference's hierarchy, not its invented records. Use lists/tables for repeated records; show exceptional controls when relevant. On a phone, a list-to-detail flow should not force the user past a full list every time they act on one item.

Customer acceptance is a separate gate. Observe Burmese-speaking users doing setup, a sale, order follow-up, site editing and inquiry handling without coaching. Record completion, time, errors and requests for help. Initial hypotheses: the next action is identifiable within ten seconds, routine repeat tasks require no technical configuration, and a prepared first sale needs no more than thirty seconds. These are targets to test, not current performance claims. Do not assign a flattering overall score that hides a failed transaction or access boundary. Defer A/B testing until a stable flow and enough real usage make comparison meaningful.

## Execution board — 10 October

CTO is the sole integration writer. Current slice starts from `bd48e6444482b29a945ccbb7ef584b73ab68b74f`, draft PR #648. This board orders work; it does not report unperformed research or make the candidate production-ready. Keep one implementation slice in progress. The founder's reference images are the visual baseline; old screenshots are evidence of complaints, not proof of today's hosted state.

### What the evidence says

| Evidence | Observed friction | Design response | Validation still needed |
| --- | --- | --- | --- |
| Founder feedback across Shop, Sites and Commerce | Too many controls, technical language and steps obscure the useful task | Task-specific navigation, one selected record, contextual actions; administration lives in Settings | Observe unassisted Burmese-speaking operators; no interviews have been conducted in this slice |
| Actual local Sites capture, `.tmp/sites-private-editor-review-20261010/editor-overview.png` | The large first content card pushes later sections below the fold; the reference exposes multiple sections and page context together | Compact section rows with consistent thumbnails, title and short summary; persistent page navigation and a small checks rail | Re-capture the full authenticated shell at the same viewport; the capture uses a synthetic component harness |
| Local Sites renderer/inbox checks | Editing, rendering and follow-up now work locally, but the managed journey is unproved | Preserve the working transitions while simplifying their presentation | Founder login, real storage, publish, received inquiry, follow-up and withdrawal on one source-bound preview |
| Exact-head App CI at `bd48e644` | Run `38056860170` failed the drift guard because its expected text still said 23 migrations while the current activation runbook says 27 | The local guard now expects the current 27-migration wording; historical 24-file recovery evidence remains separate | The focused guard passes locally; a new exact-head CI run has not been triggered |
| Public-site feedback | Small or repeated imagery and long copy do not explain the product convincingly | A short product selector with legible, distinct real screens and a normal contact form | Audit the current live site; verify every gallery control and actual contact delivery |

### Ordered outcomes

| Order | Deliverable | Completion condition |
| --- | --- | --- |
| Now | Repair exact-source integration checks and retain a reviewable candidate | Whole-database contract, migrations, RLS/privilege drift checks and Linux CI agree; no skipped test is called a pass |
| Local pass; hosted next | Sites editor matching the reference hierarchy | Page navigation, at least three ordinary section summaries in the desktop content area, one Edit per row, clear save state, Preview/Publish at the top; phone focuses on one edit with reliable Back behavior |
| Then | Complete managed Sites journey | A founder can start from a template, edit text/photo, save/reopen, preview, publish and handle an automatically received inquiry without encountering technical configuration forms |
| Then | Commerce fulfilment | A storefront order arrives automatically once, shows items/customer/payment/delivery clearly, and advances through valid next actions; provider connection setup is separate from order handling |
| Then | Shop daily work | Today exposes truthful metrics, product/order rows and actionable exceptions; counter search/scan, payment, receipt, return and daily close reconcile after reload |
| Then | Public website and onboarding | Current product captures, concise understandable offer, normal Name/Email/Company/Message form, working login and first-use setup; no mockup presented as shipped software |
| Before selling | Offer, support and operational readiness | One complete supported offer, capability-backed upgrade boundaries, recovery/support ownership and observed customer completion; prices follow measured costs |

Infrastructure and R&D take work only when they remove a measured obstacle to these outcomes. Keep a single queue and local workers off when idle. More frameworks, dashboards and agent processes are not acceptance criteria.

### Shop/POS R&D update — 10 October

This is a source and public-document review, not a customer trial. The attached Shop image is mounted through `tools/build_shop_browser_fixture.mjs`: its QA strip identifies synthetic records, blocks network access, and exposes isolated test controls. Those buttons are not Shop's customer interface. The real `ShopToday` source has the reference's core hierarchy—three daily metrics, product and order lists, one sales-insight area, and quick tasks—but this source inspection does not prove pixel-level parity in the authenticated app.

REA status is **BLOCKED** for runtime/artifact reverse engineering in this session. `analyze_javascript_application` was attempted on the exact built `showroom/dist` directory, then its transport closed without producing evidence; no browser debugging endpoint was available for a passive page capture. I therefore make no REA-derived runtime claims. The observations below are source inspection plus first-party public documentation. No competitor trial accounts, private screens, credentials, or customer data were used.

| Product | First-party public capability claim | Design implication for Shop |
| --- | --- | --- |
| Square | Its item library supports spreadsheet bulk import and recommends exporting a backup first. Offline card acceptance is conditional, carries a deadline and payment risk, and excludes some order/reporting functions. ([bulk import](https://squareup.com/help/us/en/article/5153-import-items-online), [offline payments](https://squareup.com/help/us/en/article/7777-process-card-payments-with-offline-mode)) | Match safe import, preview, reversible recovery, and explicit offline status. Do not imitate offline card acceptance without a supported Myanmar payment path and a documented risk policy. |
| Shopify POS | It supports camera and HID barcode scanners. Its offline documentation spells out which actions stop, which manual payments remain possible, and what does not sync until connectivity returns; Bluetooth/USB receipt printers and scanners can operate locally. ([barcode scanners](https://help.shopify.com/en/manual/sell-in-person/hardware/barcode-scanners), [offline features](https://help.shopify.com/en/manual/sell-in-person/shopify-pos/selling-offline/offline-features)) | Put hardware and connectivity readiness in one simple device check. Tell staff what can proceed offline and what is queued, instead of presenting dead controls. |
| Autumn POS / Autumn Online Sale | The Google Play listing claims offline sales, Myanmar/English, camera barcode scanning, printed/electronic receipts, and Bluetooth/network receipt printers. Autumn Online Sale claims automatic order capture from social, messaging, web and TikTok channels, barcode packing checks, POS stock sync, and automatic invoicing. These are vendor claims, not independently trial-verified. ([Autumn POS listing](https://play.google.com/store/apps/details?id=com.autumn.rtpos), [Autumn Online Sale](https://autumnos.com/)) | The local baseline is both reliable counter operation and social-commerce order flow. A manual “paste message/add order” tool is not a substitute for a connected inbox. |
| IRRATECH Myanmar | Its public pricing page advertises POS, inventory, sales reports, Facebook/Telegram integration, and branch/user limits in MMK. ([pricing and feature claims](https://www.irratechmyanmar.com/en/pricing)) | Make channel coverage, branches, user limits, migration help, and price visible in the offer; feature breadth alone is not proof of quality. |

The product source currently has a careful CSV import path: five Shop fields, MMK validation, source/catalog digests, duplicate and conflicting-SKU detection, and a human confirmation boundary. Its catalog-mapping proposal validator rejects stale or unsafe model output and never grants import authority, but repository search found it only in its evaluator/tests, not the Shop import UI. The user-facing first-catalog path still asks for a CSV, column matching, row repair, and confirmation. I moved the CSV template action beside the file chooser and left the detailed field guide optional; this removes a hidden prerequisite without changing import authority. There is no photo/invoice extraction route or integrated AI suggestion in that flow. Burmese column support was partial; I added the common reorder-threshold headers `အနည်းဆုံးလက်ကျန်` and `ပြန်မှာယူရန်အဆင့်`. Existing accepted Burmese item-code, name, stock, and price headers remain intact.

The source stores a product code as `sku`; `CommerceItem` has no separate barcode field. Camera scans use browser `BarcodeDetector` and place the result in the same SKU/search field; keyboard-wedge scanners can type into that input. Receipt output uses the browser print dialog. The receipt implementation itself documents that it has never been printed on thermal hardware; physical Android scanner/printer compatibility remains **NOT RUN**. Barcode-label printing is not receipt-printer certification.

#### Ranked Shop/POS work

1. **Make new orders arrive, rather than asking staff to paste them.** Build one chosen, official channel connection that writes incoming events to a deduplicated order inbox. Normalize customer, item/variant, quantity, delivery, payment and source evidence into a reviewable candidate. Unknown products, conflicting sizes, ambiguous payment and duplicate events become exceptions. Confirming an order is a separate action; the connector must not send customer replies, collect payment, or mutate stock twice. Start from an actual customer channel choice and provider permission review, not scraping private accounts.
2. **Replace CSV-only setup with guided catalog intake.** Preserve the safe deterministic importer. Accept the common spreadsheet formats first; add optional photo/invoice extraction only as a draft with exact source evidence, confidence, unit/currency checks and a one-screen review. Auto-map only unambiguous columns. Never invent price, opening stock, SKU or currency; no AI proposal may write the catalog. Keep the source local by default and make any hosted processing opt-in, disclosed, and separately authorized.
3. **Separate a barcode from the business SKU.** Support multiple codes per sellable variant, duplicate detection, scan-to-add at the counter, scan-to-count/receive, and an inexpensive HID scanner path. Add model-by-model Android and low-light camera checks. Do not call a device supported until the actual scan, reconnect, duplicate and wrong-product flows pass.
4. **Prove receipts, offline behavior and recovery on real devices.** Test Myanmar text, MMK totals, tax/discount lines, 58/80 mm print layout, Bluetooth/LAN/USB routes and printer reconnects on selected devices. For offline sales, specify durable queued records, idempotent replay, conflict and stock-staleness rules, visible sync status and restart/reload recovery. Treat card payments as online-only unless a payment provider explicitly supports a locally compliant offline mode.
5. **Make AI insights lead to one useful action.** Begin with explainable deterministic reorder and exception suggestions from the tenant's own sales/stock history. Show the evidence and next action; keep speculative forecasts labeled. Measure whether staff act on and correct a suggestion before expanding agent autonomy or pricing tiers.

Use a small visual surface: one Today workspace, a single next action, and a queue that receives online orders automatically. Keep setup, channel connections and advanced controls behind the relevant task. The first acceptance run should measure time, corrections, duplicate rate, recovery and help needed with unassisted Burmese-speaking operators before setting targets or claiming savings. A/B tests belong after one stable flow has enough real usage; generated screens and synthetic records do not establish adoption.

The article's proposals around OCR, autonomous purchasing, CRDT sync, third-party commerce engines and general-purpose automation are hypotheses, not dependencies. Do not swap the commerce schema or add a new sync service until a measured workload demonstrates why the existing audited import, ledger and outbox cannot meet the acceptance target. Let deterministic validation own money, stock and permissions; use AI for bounded extraction and suggestions, with operator approval on consequential changes.

#### Immediate completion sequence

| Order | Outcome | Acceptance evidence |
| --- | --- | --- |
| 0 | Keep the candidate reviewable and make its drift guard current | Local guard 15/15 and catalog-mapping suite 11/11 pass; latest source remains unpushed and no new Actions run is claimed |
| 1 | Finish the managed Shop first-sale task and simplify import repair | Keep the CSV template beside the file chooser and the field list optional; exact-source saved/reloaded catalog, Burmese labels/headers, realistic row conflicts, accessible phone layout, no unsupported currency, and a measured first-sale task |
| 2 | Connect one real inbound order channel | Provider-approved sandbox webhook, duplicate/replay tests, one order surfaced automatically, ambiguous order held, no unauthorized customer message/payment |
| 3 | Verify offline and physical hardware | Named Android/browser/scanner/printer matrix, printed Burmese receipt evidence, outage/restart/restore results, explicit supported/unsupported behaviors |
| 4 | Validate action-led insights and product tiers | Source-explained insight, operator usefulness feedback, cost per accepted result; pricing remains uncommitted until measured |

No production/provider writes, trial account access, credentials, customer contact, push or deployment occurred in this slice.

### Sites design decision and local result

Two alternatives were considered: (A) compact section rows with editing opened in place, and (B) an always-open form beside a full page preview. A was implemented because the reference emphasizes scanning content and opening one edit; B would preserve the long form and compete for phone space. This is a design hypothesis, not an A/B or customer study. Preview remains one action away and unsaved drafts remain intact. Retain validation and revision checks behind clear outcomes such as Saved, Saving and Could not save; keep raw release evidence in administration.

Use the existing white/indigo tokens. Give headings, body text, labels and metadata distinct consistent sizes; avoid tiny uppercase operational labels. Use equal thumbnail proportions and align row actions. A photo must illustrate the customer's content; synthetic test images are not marketing assets. On desktop, the checks rail helps finish the page without competing with its content. On phone, collapse supporting checks into a plainly labeled status and keep the current task visible. Avoid nested accordions and duplicate navigation.

Local evaluation on 10 October used the actual `WebsiteProduct` and `ContentWorkspace` in isolated in-memory fixtures at 1280, 768 and 390 pixels. Desktop page navigation and checks now flank compact section rows. Three summaries fit above y=755 at 1280×900. Phone editing hides other sections and repeated preview content; Back restores focus to the edited row. Text edit, page-switch draft retention, Save/reopen, section reorder, remove/undo, adding a section, Burmese text and photo save/reopen passed. A mobile grid-placement defect found during inspection was fixed and rechecked: the thumbnail is 72×54 with 232 pixels of adjacent text at 390px. No horizontal overflow or observed console warnings/errors. Evidence: `.tmp/sites-layout-review-20261010/`.

These checks do not establish managed persistence, authenticated-shell fidelity, hosted publishing, customer acceptance or low-bandwidth performance. Keep the next sequence explicit: finish exact-source CI → exercise the full managed Sites journey → address actual failures → move to automatic Commerce intake and Shop daily work → refresh public screenshots from accepted routes. Do not expand the feature inventory to compensate for an unproved primary task.

### Acceptance card for every slice

Record these together with the source commit and route. A failure stays visible; do not average it into an overall score.

- **Task:** a single sentence describing what the user finishes, with before/after decisions and clicks measured from the real interface.
- **Visual:** compare the same viewport and realistic state to the accepted reference; readable hierarchy, consistent rows, no clipped controls, no accidental horizontal scroll and no misleading metrics.
- **Interaction:** mouse, keyboard and phone work; focus is visible; loading prevents duplicates; errors preserve input and explain the next useful action.
- **Reliability:** save/reload, interruption, retry and concurrent change behave correctly; data and permissions remain scoped to the correct workspace.
- **Language:** plain task labels, Myanmar text rendering, MMK and Yangon time where relevant; Burmese comprehension is a separate observed test, not inferred from successful text rendering.
- **Customer:** test a small invited cohort on setup and each primary task without coaching. Record completion, errors, time and help required. Recruitment/contact requires the established owner authority. Status is NOT RUN until observed.
- **Release:** current exact-source CI, supported runtime and hosted acceptance; marketing screenshots are captured only after the corresponding product is accepted.

Run the cycle as observe → define → compare two options → implement one → test → revise. Defer A/B experiments until a stable, instrumented task has enough real usage. Keep only events needed to measure task completion; do not capture customer message bodies or private form contents for analytics.

## Architecture decisions

- Keep customer hosting and data separate from the internal agent worker. An offline worker must not stop customer login, orders or record access.
- Reuse Vercel/Supabase and existing integrations where fit is proven. Keep provider adapters behind validated interfaces; do not migrate solely to reduce the number of vendors.
- One durable queue and a serial executor are the initial internal operating model. Job roles are not separate always-running models.
- Use deterministic code for calculations, validation, backups and routine checks. Use models for bounded interpretation, drafting and proposals.
- A job records its input references, scope, deadline, retry ceiling, permitted actions and acceptance result. Never treat process completion as accepted output.
- Keep inference private, disable cloud fallback by default and load models on demand. Pin deployment versions before hosted acceptance. Test backup restore and restart recovery before relying on a server.
- A second machine is justified by measured capacity, isolation or recovery needs. Add distributed queues, Kubernetes or more agent frameworks only when a demonstrated constraint warrants their operational cost.

## Cost and quality decisions

- Measure cost per accepted result, including infrastructure, paid inference, failed attempts and correction time. No API token charge does not mean zero cost.
- Send small task packets, not entire historical conversations. Retrieve source excerpts by relevance, cache unchanged inputs and stop unchanged retries.
- Local models must pass the same protected tests and business checks as paid models. Smaller models are not assumed equivalent to expert engineering.
- Escalation is explicit: report why the bounded worker failed and propose the exact larger-model/cloud task and ceiling. Never silently route to a paid provider.

## R&D decisions

Start with a real bottleneck, a deterministic baseline and a falsifiable hypothesis. Run one bounded experiment at a time.

First experiment: propose mappings for messy customer catalogs. Preserve supplied values, reject ambiguity and unsupported currencies, and require review before import. Compare real model output with the existing corpus and time the correction burden. Adopt only if accepted quality is maintained and measured operator work falls; otherwise retain the deterministic importer.

## Review method

Use first principles to identify the necessary customer outcome; systems thinking to trace intake through persistence, delivery, support and revenue; and eliminate/reduce/raise/create to simplify the interface.

For every proposed change, answer: What observed problem does it solve? What existing capability can we reuse? What could it break? What evidence would prove improvement? What is the rollback or stop condition?

### From observation to accepted change

Start with the current product and a concrete task, not a list of frameworks. Record the source commit and compare the same task/state against a reference. Distinguish a vendor claim, an exercised reference workflow and our own verified behavior. Use REA for shipped artifacts or runtime questions that source cannot answer; ordinary source review does not need a reverse-engineering tool.

Remove unnecessary decisions before adding decoration. Prefer one selected record with contextual actions over repeated action buttons; show editable content beside its actual output when that removes a navigation step. Keep drafts scoped to the account and record, preserve failed work, and test empty, busy, read-only, error and restored states. Synthetic data must exercise the real components, never replace missing capabilities with a persuasive mockup.

For substantial changes, exercise the primary task at desktop and 390px phone width, inspect the actual render and console, and verify save/reopen plus relevant isolation. Compare step count, correction effort and completion failures with the previous flow. These are baseline checks, not a substitute for a Burmese-speaking customer completing the task. Capture marketing images only from the accepted product route, with provenance and illustrative-data disclosure where needed.

Reuse existing test runners, UI primitives and fixtures before installing another skill or framework. Adopt a tool only for a named capability gap, with license/maintenance review, a bounded experiment and measurable improvement. Keep the operating brief small; store receipts once and link them rather than reproducing the backlog in every document.

## Release and commercial truth

Local checks, CI, hosted acceptance and customer acceptance are different evidence levels. Public availability and marketing claims follow the weakest required level. Do not claim ISO certification, guaranteed universal latency, automatic settlement or a functioning workforce without the corresponding evidence.

Founder acceptance requires private login, assigned workspaces, create/save/reload, access isolation and recovery. Commercial readiness additionally needs a clear offer, delivery scope, support owner, cost basis and an accepted customer outcome. Production release, spending and customer contact retain their explicit approval gates.
