# Claude Code: owner-controlled SuperMega review packet

Status: CLAUDE-004 is ready for manual use in the founder's existing Claude Code session. No automated Claude dispatch lane exists in this repository. This packet starts no provider request.

Codex is the sole integrator on the ROG Ally. Autonomous company cycles use loopback Ollama with `llama3.2:1b`, immediate unload, one run at a time, and no cloud fallback. Claude is an optional independent reviewer only; it never replaces the Llama-only autonomous path.

## Assignment CLAUDE-004

Review the exact local product checkpoint `bdcb6a58d9615f4d73f0d2b4b7afd16c65468a82` for defects in Plant output-entry recovery after reload or tab closure.

Read only these files:

1. `showroom/src/core/plant-output-entry-recovery.ts`
2. `showroom/src/core/CoreApp.tsx`
3. `showroom/src/core/core-app.css`
4. `tools/verify_app_build.mjs`

Use Read, Grep, and Glob only. Do not use a shell, edit or create files, start an agent or subagent, inspect or control another Claude session, access secrets, browse the web, call a connector, send a message, or change repository, account, database, deployment, domain, payment, customer, or hosted state. Return one response in the founder's current session and stop.

## Review questions

1. Does a closed or inactive output panel avoid creating recovery evidence while an active entry retains the exact job, raw quantity, good or scrap choice, shift text, and panel state?
2. Is every recovery bound to the exact account scope, production revision, and SHA-256 digest of the complete canonical Plant state?
3. Does Resume reject changed scope or Plant state, unknown or completed jobs, malformed payloads, tampering, closed-panel evidence, or newer-tab ownership?
4. Can Discard, explicit Close, and successful reviewed output or short-close completion remove only the exact recovery they own without clearing a newer tab's draft?
5. Do Resume and Discard avoid recording output or material use, changing equipment or stock state, posting accounting evidence, sending a message, or calling a network mutation?
6. While recovery is pending, are normal Plant actions hidden behind one clear recovery-only Resume/Discard surface that remains usable in light/dark themes, at mobile touch sizes, and by keyboard?
7. Are any tests tautological, missing a state-digest or write/clear race, or asserting source strings without meaningful runtime coverage?

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
