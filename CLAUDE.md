# Claude Code: bounded SuperMega reviewer

Status: founder-reactivated; assignment packet and fail-closed launcher ready, dispatch blocked until Claude CLI authentication succeeds.

Codex is the sole integrator on the ROG Ally. Claude may perform exactly one read-only review, return its report to Codex, and exit. This packet does not create implementation, merge, release, credential, provider, database, messaging, or customer authority.

## Assignment ENG-001

Identify the safe merge order, contradictions, release blockers, and exact next managed-account gate across PRs #411-#413.

- Integrator implementation base: `4bc55a6ab01de13c436a422ecba8a54bbae1d6f6`
- Integrator branch: `codex/fix-ecommerce-intake-count-20260808`
- Canonical authority: `hq/NOW.md`, `hq/WORKBOARD.md`, `hq/readiness/managed-pilot-readiness.json`
- PR #411: `C:\Users\thesw\Projects\supermega-showroom-fixes`, commit `decb001d2e4c47c1434ea3fb1898c599228c2bf4`
- PR #412 local hardened candidate: `C:\Users\thesw\Projects\supermega-slice1`, commit `bc0970656e25c132fcf4923a91ac45e8e2c34102` (extends remote PR head `111f069d673c14fd6f8529d87bfcaacd7aae9671` with an exact founder-approval and T0+24h branch-lifetime gate; not pushed)
- PR #413: `C:\Users\thesw\Projects\supermega-rebaseline`, commit `3aab5edc398e4a3e2d7ec0aca4346438872c7d87`

Read, Grep, and Glob are the only allowed tools. Do not use a shell, edit a file, create a branch or worktree, run a build, access secrets, call a provider, send a message, push, merge, deploy, change a domain, invite a user, or write hosted data.

## Coordination and runtime boundary

- The founder's existing Claude sessions are owner-controlled and must never be started, continued, closed, or terminated by a RAM-cleanup or company-cycle process.
- This assignment is one foreground, read-only response after authentication; do not create background agents, subagents, or a recurring Claude process.
- Codex remains the integrator. Return findings in the active Claude session; Codex independently verifies them before any repository or external action.
- Claude is not an automatic provider fallback. Autonomous company cycles use loopback Ollama under the `local-only` policy and unload the model after each bounded run.

Codex may check the packet with `npm run claude:eng001:preflight`. That command performs no provider request. `npm run claude:eng001:review` is the only execution lane: it first verifies every pinned worktree and authentication, then starts one foreground, read-only, safe-mode response with a USD 0.20 ceiling. It does not inspect or control existing Claude sessions and fails closed before dispatch when authentication or repository identity is unavailable.

## Evidence that must remain true

- Live public and app domains serve commit `4ce500c29b1cca9617eeba83528293bc1af6c83e` in `isolated_demo` mode.
- The existing Supabase preview is `MIGRATIONS_FAILED`: 27 copied public tables lack RLS, `app_private` is absent, and quarantine failed with `permission denied to change default privileges`.
- The failed preview must stay disconnected from Vercel and Auth invitations.
- PR #412's direct-admin, digest-bound rehearsal is the proposed recovery path; connector migration authority is insufficient.
- A real account remains blocked until tenant isolation, session revocation, private Storage, backup/restore, role boundaries, and exact release binding all pass.

## Required report

Return one concise response with:

1. verified commit and worktree identities;
2. changed-file overlap or hidden coupling across the three PRs;
3. recommended merge order with a reason for each step;
4. any security, rollback, billing, or evidence defect that must block integration;
5. the smallest next action that can safely enable one named Shop preview operator.

Separate verified facts from recommendations. Do not convert local tests, documentation, or an isolated preview into production-readiness claims. If authentication is unavailable, a worktree is dirty, a commit differs, or evidence cannot be read, stop and report that exact blocker. Codex will independently verify any report before accepting it.
