# Claude Code: owner-controlled SuperMega review packet

Status: CLAUDE-005 is ready for manual use in the founder's existing Claude Code session. No automated Claude dispatch lane exists in this repository. This packet starts no provider request.

Codex is the sole integrator on the ROG Ally. Autonomous company cycles use loopback Ollama with `llama3.2:1b`, immediate unload, one run at a time, and no cloud fallback. Claude is an optional independent reviewer only; it never replaces the Llama-only autonomous path.

## Assignment CLAUDE-005

Review the exact local product checkpoint `b7797f23f1794824026180363950551706834bff` for defects in Website inquiry-entry recovery after reload or tab closure.

Read only these files:

1. `showroom/src/core/local-workspace-storage.ts`
2. `showroom/src/products/website/website-inquiry-entry-recovery.ts`
3. `showroom/src/products/website/WebsiteProduct.tsx`
4. `showroom/src/products/website/website-product.css`
5. `tools/verify_app_build.mjs`

Use Read, Grep, and Glob only. Do not use a shell, edit or create files, start an agent or subagent, inspect or control another Claude session, access secrets, browse the web, call a connector, send a message, or change repository, account, database, deployment, domain, payment, customer, or hosted state. Return one response in the founder's current session and stop.

## Review questions

1. Does an empty or closed inquiry form avoid creating recovery evidence while an active form retains the exact raw name, contact, request, consent choice, source page, and open-panel state?
2. Is every recovery bound to the exact account scope, Website revision/content revision, lead-ledger revision, source-page identity, and SHA-256 digest of the complete canonical Website and inquiry records?
3. Does Resume reject changed scope, Website or inquiry state, missing or renamed source pages, malformed payloads, tampering, closed-panel evidence, or newer-tab ownership?
4. Can field clearing, Discard, and a successful confirmed inquiry write remove only the exact recovery they own without clearing a newer tab's entry?
5. Do Resume and Discard avoid creating a lead, sending a customer message, changing Website content, publishing, deploying, charging payment, or calling a network mutation?
6. While recovery is pending, are normal Website actions hidden behind one clear recovery-only Resume/Discard surface that remains usable in light/dark themes, at mobile touch sizes, and by keyboard?
7. Are any tests tautological, missing a state-digest or cross-tab write/clear race, or asserting source strings without meaningful runtime coverage?

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
