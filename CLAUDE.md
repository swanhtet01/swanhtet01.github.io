# Claude Code: owner-controlled SuperMega review packet

Status: ENG-002 is ready for manual use in the founder's existing Claude Code session. No automated Claude dispatch lane exists in this repository. The local CLI authentication check was unavailable on 2026-08-09, so no provider request was started.

Codex is the sole integrator on the ROG Ally. Autonomous company cycles use loopback Ollama with `llama3.2:1b`, immediate unload, one run at a time, and no cloud fallback. Claude is an optional independent reviewer only; it never replaces the Llama-only autonomous path.

## Assignment ENG-002

Review the exact local product checkpoint `b6dfc3d31473819b7bdda3afa5c5da0df44d7b88` for defects in Ecommerce storefront edit recovery after reload or tab closure.

Read only these files:

1. `showroom/src/products/ecommerce/storefront-edit-recovery.ts`
2. `showroom/src/products/ecommerce/EcommerceProduct.tsx`
3. `showroom/src/products/ecommerce/ecommerce-product.css`
4. `tools/verify_app_build.mjs`

Use Read, Grep, and Glob only. Do not use a shell, edit or create files, start an agent or subagent, inspect or control another Claude session, access secrets, browse the web, call a connector, send a message, or change repository, account, database, deployment, domain, payment, customer, or hosted state. Return one response in the founder's current session and stop.

## Review questions

1. Does an unchanged first-run storefront avoid creating recovery evidence?
2. Does a real edit retain the exact name, summary, SKU order, merchandising, view, and device without saving or sending?
3. Does Resume reject a changed scope, saved revision, saved fingerprint, catalog digest, unknown SKU, malformed payload, or newer-tab recovery?
4. Can Discard or Save remove only the exact recovery they own without clearing a newer tab's draft?
5. While recovery is pending, are editing, storefront switching, add-to-cart, and consequential buying actions blocked behind one clear Resume/Discard decision?
6. Does the single Start-here surface remain usable in light/dark themes and at mobile touch sizes without adding another page or duplicate callout?
7. Are any tests tautological, missing a race, or asserting source strings without meaningful runtime coverage?

## Required report

Return one concise report containing:

1. verified checkpoint and files read;
2. prioritized defects with exact file and line references;
3. missing adversarial or concurrency cases;
4. UX/accessibility defects that would confuse a first-time operator;
5. a final verdict: `accept`, `accept-with-follow-up`, or `block`.

Separate verified findings from recommendations. Do not claim that local tests, browser-local storage, or an isolated demo prove hosted persistence, tenant isolation, managed security, deployment, customer demand, or production readiness. If the checkpoint or a required file cannot be verified, stop and report that exact blocker.

## Coordination boundary

- Do not start, continue, close, terminate, or inspect any existing Claude or Bionic process on behalf of Codex.
- Do not create a recurring Claude process or automatic provider fallback.
- Codex independently reproduces every accepted finding before changing source.
- No push, merge, deployment, connector write, account invite, external send, or paid resource is authorized by this packet.
