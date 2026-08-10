# Claude Code: owner-controlled SuperMega review packet

Status: CLAUDE-009 is ready for manual use in the founder's existing Claude Code session. A single Codex-launched safe-mode attempt on 2026-08-10 stopped before inference because the CLI was not logged in; it used zero tokens and cost $0.00. No automated Claude dispatch lane exists in this repository. Codex will not retry, authenticate, or control an owner session.

Codex is the sole integrator on the ROG Ally. Autonomous company cycles use loopback Ollama with `llama3.2:1b`, immediate unload, one run at a time, and no cloud fallback. Claude is an optional independent reviewer only; it never replaces the Llama-only autonomous path.

## Assignment CLAUDE-009

Review the exact local product checkpoint `0fc5cf7dfd80fba13418bb311ca268b4c49a99be` for defects in Shop location-setup blocker recovery, next-order focus, zero-blocker return, and accountable cancellation boundaries.

Read only these files:

1. `showroom/src/core/CoreApp.tsx`
2. `tools/verify_app_build.mjs`

Use Read, Grep, and Glob only. Do not use a shell, edit or create files, start an agent or subagent, inspect or control another Claude session, access secrets, browse the web, call a connector, send a message, or change repository, account, database, deployment, domain, payment, customer, or hosted state. Return one response in the founder's current session and stop.

## Review questions

1. Does setup recovery navigate only after a reviewed cancellation has been durably accepted, while local write conflicts and managed revision conflicts fail closed without changing route or focus?
2. Is the next target the first remaining `commerceOrderNeedsAction` record under the same `compareCommerceOrderPromise` ordering shown to the operator, with the cancelled order excluded?
3. After the final blocker, is the cancelled hash removed while `return=location-setup` remains, so the operator sees one `Continue location setup` action and no stale highlight?
4. Can stale closures, another browser tab, a managed version conflict, retrying the same confirmation, browser Back, or navigating while the confirmation dialog is open route to the wrong order or clear a valid blocker?
5. Does the hash effect highlight, scroll, and focus the safest enabled action on the next order without a focus loop, duplicate DOM identity, hidden focus, or mobile overflow?
6. Does this path avoid advancing or cancelling any other order and avoid provider, connector, payment, customer-message, inventory-setup, hosted-state, or network side effects?
7. Which missing adversarial, concurrency, keyboard, screen-reader, mobile, and route-history cases could still confuse a first-time operator?

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
