# Supervised draft help inside three products

Status: local R&D; not enabled in the app or hosted. This document adds no release, provider, installation or customer-contact authority.

## Product positioning and interaction

Shop remains the operating counter: sell, retain a table ticket, reconcile and close. AI can help draft item/service descriptions or extract a proposed order; it must not invent prices, availability, payment confirmation, stock, appointments or profitability.

Ecommerce is the catalog and request door into Shop. Prioritize a clear product image, title, factual description and request action. Put optional description help beside the description editor; do not place chat in front of shopping.

Website is the business presence and inquiry door. Start with the rendered site and one Customize action. Put optional headline, service description and CTA drafts in the section editor. Do not add a large AI dashboard above the preview.

Shared flow: select a template and content field → choose the facts to use → generate a proposal → compare current and proposed text → edit or reject → explicitly save through the existing product workflow. No automatic publishing or business-record mutation. Manual editing must keep working when inference is absent, slow or unavailable.

## Reuse boundary

- `supermega_runtime/trial_runtime.py`: reuse authenticated principal/workspace/capability admission patterns, not the order-extraction route for unrelated creative content.
- `supermega_runtime/order_intake_provider.py`: reuse bounded server-side requests, timeout, durable daily budget and no-key failure. A hosted inference call transmits data and consumes budget even if it makes no product write.
- `showroom/src/core/channel-order-intake.ts`: reuse exact source/freshness binding discipline. A matching quote is evidence of occurrence, not evidence that a business claim is true.
- Website edit sessions and draft comparison remain the save/recovery path.
- `product-image-store.ts`: keep workspace scope and image byte limits. Current photos are device-local, omitted from company backups, and not a cross-device asset library.

No new SDK, framework, repository fork, runtime or paid service is needed for the first bounded text experiment. Existing maintained dependencies remain unchanged.

## Image generation

Use generated artwork for banners, backgrounds and clearly labeled concept illustrations. Keep real item photographs as the default for purchasable goods. Do not generate fake before/after results, customer testimonials or misleading depictions of what is supplied.

Before in-product generation, implement source/generated provenance, explicit replacement preview, scope/revision checks after asynchronous completion, deletion/retention rules and hosted backup/delivery semantics. Private reference images need a specific approved destination and consent. Never use customer payment screenshots as generation inputs. Prompt-only illustration experiments do not prove these asset-management requirements.

## First bounded evaluation

Run `node --test tools/product_copy_experiment.test.mjs` then `node tools/product_copy_experiment.mjs <new-output.json>`.

The runner admits only built-in synthetic English fixtures for Website, Ecommerce and Shop; two prompt styles; the existing loopback llama3.2:1b model; serial requests; 45-second timeout; bounded output; exclusive result creation; no cloud fallback; keep_alive zero. The source-owned baseline is recorded for comparison. It is an offline prompt comparison, NOT randomized customer A/B testing.

Review each result for factual support, clear next action, unnecessary words and usability. Schema pass is not semantic acceptance. Keep raw outcomes, including failures, and report runtime cost. Do not keep iterating prompts until a success can be selectively reported.

## Implementation order and exits

1. Pure shared content proposal contract: exact product/template, workspace scope, source revision/digest, allowlisted bounded text fields, generated classification and review-required status. Reject stale and cross-scope proposals, unknown fields, HTML and authority-bearing fields.
2. Website section adapter: side-by-side current/proposed text, editable proposal, reject/apply-to-draft controls, no overwrite of newer changes. Test keyboard/mobile/tablet and inference failure.
3. Ecommerce and Shop description adapters reuse the contract; services remain draft catalog content, not booked appointments or clinical advice.
4. Only after local quality acceptance: separately configured hosted inference admission and budget, tenant denial, cancellation/race tests and restricted telemetry. No content or identifying context in telemetry.
5. Myanmar copy needs native-reader assessment, font rendering and operator comprehension tests; English-only results do not qualify it.
6. Customer experiment after deploy acceptance: compare manual baseline versus optional drafting, measure accepted output, editing time and first-task completion, report sample size and uncertainty. Never randomize authorization, money, stock, prices or safety boundaries.

## First observed outcome (2026-09-15)

Six serial local generations completed in 55,381ms total (6,329–16,358ms each). All six were shape-valid. Manual source comparison rejected both Ecommerce and both Shop service results: invented delivery/location conditions, Buy Now instead of request, unprovided expert-stylist claims, and booking/confirmation wording unsupported by the facts. The two Website outputs were roughly fact-aligned but not demonstrably better than the supplied short baseline. No customer preference was measured and no winner was selected.

Raw report: `supermega-product-copy-local-experiment.20260915-v1.json` in the owner's OneDrive workspace; body digest `sha256:0d1c9a8709021912760e2345a73d65324637181b527a9ac006355cb883d5cda2`. Raw meaningReviewed fields intentionally remain false; this narrative is a separate human-readable assessment, not a rewritten receipt. The model was confirmed unloaded afterward.

Decision: no automatic use and no in-app generative CTA field. Keep CTA label/destination source-owned. First adapter should propose bounded descriptive text only, explicitly label it AI-generated and unverified, retain facts beside it, and preserve reject/manual-edit/save. Source freshness and schema checks alone cannot establish factuality. This small English evaluation is a negative result for unattended use, not a verdict on every possible model or prompt.

## References

Ollama structured output schema and response validation: https://docs.ollama.com/capabilities/structured-outputs

Ollama generation API, keep_alive and response completion: https://docs.ollama.com/api/generate

Existing local operating policy: `docs/supermega-local-coding-agent.md`. Revalidate deployed configuration before any hosted claim.
