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
