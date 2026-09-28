# SuperMega product and operating principles

Status: maintained decision guide, 28 September 2026. Current execution state and authority live in `../supergoal.md`; this document does not authorize spending or deployment.

## Product promise

Help a business complete real work with fewer steps and reliable records. Sell the outcome supported today. AI is an implementation choice, not a substitute for a working product.

## Design decisions

- Use the established white, graphite and cobalt system. No public theme selector or promotional demo/trial detours.
- Public pages explain Shop, Sites and Commerce with real product screenshots, concrete capabilities and one clear next action. Login stays easy to find.
- Screenshots must come from the implemented product. Illustrative data must be identified; never imply invented customers or sales are real.
- Each working screen has a primary task. Put secondary controls in context and advanced controls behind disclosure. Preserve keyboard access, focus visibility, readable contrast and mobile touch targets.
- Collect business facts, not implementation decisions. Preserve inputs after failures and distinguish a draft, a submitted request and a durable saved record.
- Before a substantial redesign, create a visual concept, compare alternatives, implement the selected direction and compare real screenshots at matching viewport/state. Review error and empty states as well as the happy path.

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

## Release and commercial truth

Local checks, CI, hosted acceptance and customer acceptance are different evidence levels. Public availability and marketing claims follow the weakest required level. Do not claim ISO certification, guaranteed universal latency, automatic settlement or a functioning workforce without the corresponding evidence.

Founder acceptance requires private login, assigned workspaces, create/save/reload, access isolation and recovery. Commercial readiness additionally needs a clear offer, delivery scope, support owner, cost basis and an accepted customer outcome. Production release, spending and customer contact retain their explicit approval gates.
