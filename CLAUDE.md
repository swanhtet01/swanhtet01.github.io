# Claude Code: owner-controlled SuperMega review packet

Status: CLAUDE-007 is ready for manual use in the founder's existing Claude Code session. No automated Claude dispatch lane exists in this repository. This packet starts no provider request.

Codex is the sole integrator on the ROG Ally. Autonomous company cycles use loopback Ollama with `llama3.2:1b`, immediate unload, one run at a time, and no cloud fallback. Claude is an optional independent reviewer only; it never replaces the Llama-only autonomous path.

## Assignment CLAUDE-007

Review the exact local product checkpoint `2744b28f84ea5b7299f24e33156b468844125e78` for defects in Shop Finance simplification, attention routing, and close deep-link focus.

Read only these files:

1. `showroom/src/core/CoreApp.tsx`
2. `showroom/src/core/ShopToday.tsx`
3. `tools/verify_app_build.mjs`
4. `hq/WORKBOARD.md`

Use Read, Grep, and Glob only. Do not use a shell, edit or create files, start an agent or subagent, inspect or control another Claude session, access secrets, browse the web, call a connector, send a message, or change repository, account, database, deployment, domain, payment, customer, or hosted state. Return one response in the founder's current session and stop.

## Review questions

1. Does Shop Today show `Open finance` only when payment review or a close preview needs attention, while preserving `New sale` otherwise?
2. Does the current Finance link always target `#shop-close-controls`, including when its visible reason is payment review, and what exact routing defect or priority ambiguity follows?
3. Does `Daily close` expose only the close task while preserving all six promotion, delivery, payment, credit, tax, and account-mapping controls inside one accessible setup disclosure?
4. Does removing the duplicate low-stock boundary list preserve stock exception evidence in the close snapshot and keep Stock as the operational surface for reorder work?
5. Does hash navigation open the close disclosure and focus the enabled primary close action only after write readiness, with a safe summary fallback and no focus loop?
6. Do the Today link, disclosures, and focus recovery avoid order, stock, policy, payment, close, storage, network, provider, connector, and customer-message side effects?
7. Are adversarial and rendered checks sufficient for payment-only, close-only, both, neither, already-closed, disabled-control, reload, keyboard, and mobile states?

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
