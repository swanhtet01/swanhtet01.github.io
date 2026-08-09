# Claude Code: owner-controlled SuperMega review packet

Status: CLAUDE-006 is ready for manual use in the founder's existing Claude Code session. No automated Claude dispatch lane exists in this repository. This packet starts no provider request.

Codex is the sole integrator on the ROG Ally. Autonomous company cycles use loopback Ollama with `llama3.2:1b`, immediate unload, one run at a time, and no cloud fallback. Claude is an optional independent reviewer only; it never replaces the Llama-only autonomous path.

## Assignment CLAUDE-006

Review the exact local product checkpoint `b8808439975ee80f7c456c52a6564b600952864a` for defects in Ecommerce stale or changed quote guidance and its next-action handoff.

Read only these files:

1. `showroom/src/products/ecommerce/ecommerce-buying-lifecycle.ts`
2. `showroom/src/products/ecommerce/EcommerceBuyingWorkspace.tsx`
3. `showroom/src/products/ecommerce/EcommerceProduct.tsx`
4. `tools/verify_app_build.mjs`

Use Read, Grep, and Glob only. Do not use a shell, edit or create files, start an agent or subagent, inspect or control another Claude session, access secrets, browse the web, call a connector, send a message, or change repository, account, database, deployment, domain, payment, customer, or hosted state. Return one response in the founder's current session and stop.

## Review questions

1. Does the pure projection distinguish `idle`, `waiting_shop_review`, `quote_expired`, `checkout_changed`, and `confirmed`, with confirmed order precedence and malformed or boundary-expired time failing closed?
2. Is checkout currentness bound to the exact scope, preview digest, saved-storefront revision/action pair, customer and delivery fields, fulfilment, payment, promotion, stock-valid cart, and quantities?
3. Can an expired or changed request ever leak into the fresh `Request sent` receipt path, Shop metric, next-step copy, or autopilot branch?
4. Does each stale state expose exactly one truthful action: current-total review, changed-checkout review, or add products for an empty cart, while fresh and confirmed states add no duplicate action?
5. Does the action open the existing checkout and focus the first invalid field or enabled request control immediately, with animation-frame reinforcement but no dependency on that frame?
6. Do projection and focus helpers avoid storage, network, navigation, quote creation, Shop writes, orders, stock moves, payment, delivery booking, provider calls, and customer messages?
7. Are adversarial tests meaningful for exact expiry boundary, malformed time, changed checkout, empty-cart recovery, confirmed precedence, source drift, branch ordering, and runtime copy/action mapping?

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
