# Claude Code: owner-controlled SuperMega review packet

Status: CLAUDE-008 is ready for manual use in the founder's existing Claude Code session. No automated Claude dispatch lane exists in this repository. This packet starts no provider request.

Codex is the sole integrator on the ROG Ally. Autonomous company cycles use loopback Ollama with `llama3.2:1b`, immediate unload, one run at a time, and no cloud fallback. Claude is an optional independent reviewer only; it never replaces the Llama-only autonomous path.

## Assignment CLAUDE-008

Review the exact local product checkpoint `969fae032ee99482a03e40f8c48ca953c01b7c31` for defects in completed Ecommerce order truth, reload-safe next-order reset, retained-customer privacy, and exact Shop history focus.

Read only these files:

1. `showroom/src/products/ecommerce/EcommerceBuyingWorkspace.tsx`
2. `showroom/src/products/ecommerce/ecommerce-buying-lifecycle.ts`
3. `showroom/src/core/CoreApp.tsx`
4. `tools/verify_app_build.mjs`

Use Read, Grep, and Glob only. Do not use a shell, edit or create files, start an agent or subagent, inspect or control another Claude session, access secrets, browse the web, call a connector, send a message, or change repository, account, database, deployment, domain, payment, customer, or hosted state. Return one response in the founder's current session and stop.

## Review questions

1. Can a request appear `Completed in Shop` only when its exact source-bound Shop order is completed, while an in-progress order remains clearly confirmed and the retained checkout cannot create a duplicate request?
2. Is the request-receipt dismissal marker canonical, schema- and workspace-bound, strict about the ECR identity, and confirmed after write; do malformed, cross-workspace, or unavailable-storage states fail closed without restoring prior customer data?
3. Does `Start another order` save that marker before clearing anything, then remove cart, name, phone, address, instructions, fulfilment, payment, promotion, and open-checkout state without changing the authoritative order, stock, payment, close, or history records?
4. After reload, reorder, replacement, and a newly sent request, can the marker hide only the intended old receipt without hiding newer work or resurrecting stale checkout recovery?
5. Does the exact Shop order link work for active and archived orders, open the completed-order disclosure, select the correct paginated record, highlight it, and focus the safest useful target without duplicate DOM identities or a focus loop?
6. Do the lifecycle, reset, history link, and focus paths avoid network, provider, connector, payment, customer-message, order, stock, fulfilment, close, and hosted-state side effects?
7. Which missing adversarial, multi-tab, accessibility, keyboard, mobile, malformed-storage, and pagination cases could still make this flow confusing or unsafe for a first-time operator?

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
