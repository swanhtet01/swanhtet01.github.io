# SuperMega design contract

Status: repository-owned projection of the existing design program. This is
the short contract for Codex, local Ollama workers, and human reviewers. It is
not a second design authority and it does not authorize a release or an
external action.

Detailed history, exceptions, and queued structural work remain in
`hq/strategy/DESIGN-PROGRAM.md`. Product behavior and safety remain governed
by source contracts and tests. If those sources disagree with this summary,
stop, gather rendered evidence, and repair the summary instead of guessing.

## Product doors

Every route opens on one real job. Product depth remains available after that
job, not before it.

| Surface | First job | Required truth boundary |
| --- | --- | --- |
| Shop | Sell from a trade-specific counter | The cashier can see items, local payment choice, total, open-order option, and review action above the fold. Profit Control stays in Today for the owner. |
| Plant | Review today's job, output, or problem | Sample dates are labelled as a scenario; managed status is never inferred from browser-local records. |
| Website | Start from the visible sample or continue an identified saved draft | Saving a local revision is not publishing or deploying. A restored draft never silently replaces the current sample. |
| Ecommerce | Build and review a customer request | A browser-local draft is not a managed Shop receipt, payment, fulfilment, or message. |
| Public site | Understand one business outcome and take one primary next step | Lead, pilot, price, readiness, and integration claims must match observed evidence. |

AI is a supervised capability inside these four products, never a fifth
customer product or an unaccountable actor.

## Interaction rules

1. **Truth before persuasion.** State whether data is sample, browser-local,
   managed, observed, or not observed. Do not let a success-styled control
   imply a write, payment, message, stock movement, deployment, or backup that
   did not occur.
2. **One primary job above the fold.** The product identity, current state,
   primary action, and the information required to make that action safe must
   be visible before secondary modules or architecture language.
3. **Compact safety, complete safety.** Keep critical boundaries beside the
   affected action. Collapse repeated banners and implementation detail that
   push the job out of view.
4. **Depth follows intent.** Advanced operations, evidence, setup, and owner
   controls remain reachable, but do not compete with the operator's current
   task.
5. **Consequential actions are reviewed.** Show the target, effect, actor,
   and reversible boundary before applying a command. Default to the safer
   choice when intent is absent.
6. **Recovery is part of the flow.** Reload, retry, saved-draft provenance,
   idempotency, and rollback states require explicit copy and deterministic
   behavior.

## Visual system

- The canonical application ramps are the custom properties in
  `showroom/src/core/core-app.css`. Typed Website brand packages remain in
  `showroom/src/products/website/website-release-foundation.ts`.
- Reuse existing color, type, spacing, radius, weight, and shadow tokens. Do
  not add a hex or pixel literal when a matching token exists.
- Text on the accent uses `--core-on-accent`; every new root token needs a
  `.theme-dark` counterpart.
- Use system font stacks, including Myanmar support. Do not add font downloads
  to imitate a reference.
- Interactive targets are at least 44 by 44 CSS pixels. Keyboard focus is
  visible, labels are programmatic, status is not color-only, and reduced
  motion is respected.
- The document must not overflow horizontally at 1280 by 900 or 390 by 844.
  The primary job must remain complete at both sizes, not merely present.

## Agent design loop

1. **Diagnose.** Name the user, job, current evidence, viewport, and exact
   failure. Inspect the rendered route before changing source.
2. **Ground.** Select one primary reference and up to two alternatives from
   different design families. Record the first-party URL, access date, useful
   principle, and material mismatch. A reference is evidence, not code to
   copy.
3. **Recommend.** State what is preserved, what changes, why the change helps
   the first job, and what stays explicitly out of scope.
4. **Decompose.** Implement one bounded slice using repository tokens and
   existing components. Avoid broad CSS sweeps and new runtime dependencies.
5. **Verify.** Run focused behavior and contract tests, type/lint checks, and
   `supermega.app-entry-rendered.v2`. Manually inspect the bound screenshots;
   digests prove integrity, not visual quality.
6. **Release separately.** Local rendering is not an exact Vercel preview,
   production acceptance, customer proof, managed persistence, or revenue.
   Preserve every owner and provider gate.

## Review rubric

Score each dimension from 0 (contradicted) to 4 (strongly evidenced). A slice
is reviewable only when every dimension is at least 3 and no safety claim is
unproven.

| Dimension | Evidence required for a passing score |
| --- | --- |
| Job clarity | One named user, one first job, and one primary action are obvious without reading implementation copy. |
| Truth and safety | Sample/local/managed state and every consequential effect are explicit at the decision point. |
| Completion hierarchy | Inputs, total/result, review action, and recovery state form one coherent path above the fold where required. |
| Mobile and access | 390 by 844 layout, 44-pixel targets, keyboard focus, programmatic names, contrast, reduced motion, and no horizontal overflow pass. |
| System coherence | Existing tokens/components are reused; Shop, Plant, Website, and Ecommerce retain a recognizable shared language without erasing their jobs. |

Record disagreements and rejected alternatives. An implementer does not sign
its own visual acceptance.

## Rendered evidence

Follow `docs/APP-ENTRY-RENDERED-PROOF.md`. Evidence must bind the exact clean
commit and tree, built artifact manifest, verifier digest, ordered route and
viewport matrix, screenshot digests, runtime errors, semantic checks, touch
targets, above-fold checks, and overflow state. Use synthetic privacy-safe
fixtures; person-shaped or phone-shaped screenshots remain internal.

## External R&D intake

Design catalogs and public API lists are discovery inputs only. Before adding
any third-party code or connection, require an owner-reviewed record covering:

- official source and license;
- authentication and data classification;
- outbound domains and retained data;
- cost ceiling and rate limits;
- failure and offline behavior;
- maintenance owner and exit path.

The OpenDesign pattern was checked directly against the first-party
`https://github.com/nexu-io/open-design` repository on 2026-08-28. SuperMega
adopted only the repository-owned design contract and critique-loop pattern.
It does not install, fork, or connect that package, desktop runtime, MCP
service, cloud providers, or public-API catalog for this contract.

## Detailed sources

- `hq/strategy/DESIGN-PROGRAM.md` — binding token rules, exceptions, history,
  and structural queue.
- `hq/strategy/DESIGN-REVIEW-2026-08-18.md` — independent review precedent.
- `docs/APP-ENTRY-RENDERED-PROOF.md` — exact rendered-evidence generation and
  disk validation.
- `showroom/src/core/core-app.css` — canonical application tokens.
- `showroom/src/products/website/website-release-foundation.ts` — typed
  Website brand-token contract.
