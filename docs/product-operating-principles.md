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

CTO is the sole integration writer. Current slice starts from `7b70298a386fd3757aee8942af892838e67fe40a`, draft PR #648. This board orders work; it does not report unperformed research or make the candidate production-ready. Keep one implementation slice in progress. The founder's reference images are the visual baseline; old screenshots are evidence of complaints, not proof of today's hosted state.

### What the evidence says

| Evidence | Observed friction | Design response | Validation still needed |
| --- | --- | --- | --- |
| Founder feedback across Shop, Sites and Commerce | Too many controls, technical language and steps obscure the useful task | Task-specific navigation, one selected record, contextual actions; administration lives in Settings | Observe unassisted Burmese-speaking operators; no interviews have been conducted in this slice |
| Actual local Sites capture, `.tmp/sites-private-editor-review-20261010/editor-overview.png` | The large first content card pushes later sections below the fold; the reference exposes multiple sections and page context together | Compact section rows with consistent thumbnails, title and short summary; persistent page navigation and a small checks rail | Re-capture the full authenticated shell at the same viewport; the capture uses a synthetic component harness |
| Local Sites renderer/inbox checks | Editing, rendering and follow-up now work locally, but the managed journey is unproved | Preserve the working transitions while simplifying their presentation | Founder login, real storage, publish, received inquiry, follow-up and withdrawal on one source-bound preview |
| Exact-head App CI at `7b70298a` | Catalog/encoding repairs passed their earlier stages; step 20 found a stale rehearsal inventory | Bind all 27 current migrations; replay the historical 24-file recovery receipt separately, with unknown/omitted migrations still rejected | Passing canonical Linux CI on the corrected commit |
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
