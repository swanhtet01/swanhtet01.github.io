# Claude Code: owner-controlled SuperMega review packet

Status: CLAUDE-005 is ready for manual use in the founder's existing Claude Code session. No automated Claude dispatch lane exists in this repository. This packet starts no provider request.

Codex is the sole integrator on the ROG Ally. Autonomous company cycles use loopback Ollama with `llama3.2:1b`, immediate unload, one run at a time, and no cloud fallback. Claude is an optional independent reviewer only; it never replaces the Llama-only autonomous path.

## Assignment CLAUDE-005

Review the exact local product checkpoint `f756da119f58c785bdd97abeddcee00731423cf3` for defects in Ecommerce pre-quote checkout recovery after reload or tab closure.

Read only these files:

1. `showroom/src/core/local-workspace-storage.ts`
2. `showroom/src/products/ecommerce/ecommerce-checkout-entry-recovery.ts`
3. `showroom/src/products/ecommerce/EcommerceBuyingWorkspace.tsx`
4. `showroom/src/products/ecommerce/EcommerceProduct.tsx`
5. `showroom/src/products/ecommerce/ecommerce-product.css`
6. `tools/verify_app_build.mjs`

Use Read, Grep, and Glob only. Do not use a shell, edit or create files, start an agent or subagent, inspect or control another Claude session, access secrets, browse the web, call a connector, send a message, or change repository, account, database, deployment, domain, payment, customer, or hosted state. Return one response in the founder's current session and stop.

## Review questions

1. Does an empty checkout or a checkout matching the current saved request avoid redundant recovery while an unfinished draft retains ordered cart lines, exact raw quantity text, removed-line Undo state, raw customer/delivery fields, fulfilment, payment, promotion, and open-panel destination?
2. Is every recovery bound to the exact account scope, storefront preview digest, saved-storefront revision/action pair, buying revision/head digest, and SHA-256 digest of validated Commerce state, current catalogue, preview, and buying history?
3. Does Resume reject changed scope, storefront, catalogue, stock, Commerce policy, buying state, malformed payloads, duplicate lines, valid quantity mismatches, tampering, closed-panel evidence, or newer-tab ownership?
4. Can draft clearing, Discard, Start another order, and a successful reviewed request remove only the exact recovery they own without clearing a newer tab's checkout?
5. Do Resume and Discard avoid creating a quote, Shop request, order, stock move, payment, delivery booking, provider call, customer message, or network mutation?
6. While recovery is pending, are product buttons locked behind one clear Resume/Discard surface, does Start here point to it, and are mobile/desktop layout, focus, raw invalid quantity restoration, and touch sizes understandable to a first-time customer?
7. Are any tests tautological, missing state-digest, successful-write cleanup, source-drift, invalid-raw-quantity, or cross-tab write/clear races, or asserting source strings without meaningful runtime coverage?

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
