# Paired preview readiness planner

This is the first stage of paired preview delivery, not an apply tool or deployment permit.

Run from an exact, clean, independently reviewed tooling checkout:

`node tools/plan_paired_preview.mjs PREPARATION_JSON FULL_CANDIDATE_COMMIT FULL_CANDIDATE_TREE NEW_OUTPUT_JSON`

The planner verifies the existing source-preparation body digest, independently reads both source Git identities/cleanliness, binds its own commit/tree/module digest, and creates a new local evidence file exclusively. Git probes are time-bounded and run without hooks, fsmonitor, lazy fetch or optional locks. Diagnostics never print the receipt or subprocess error payload. It does not read credentials, call providers, build or deploy. Its ten-minute freshness window applies to the local observations only; later execution must recollect evidence.

All generated plans are explicitly blocked and non-executable. Provider ownership/protection and non-production runtime have not been inspected; builds, exact public-to-app binding, reviewed apply tooling and physical owner approval remain missing. Caller-supplied assertions cannot clear those gates. Digests provide integrity and binding, not authenticity or independent approval. No consumer may treat this readiness contract as an executable approval contract.

The fixed projects are megaos and supermega-public under the recorded SuperMega team. Deployment must be app-first, with a protected exact app deployment readback before building the public preview against that origin. A later separately reviewed executor must preserve durable intent, partial success and unknown outcomes without automatic retry; must use the existing default-No physical approval model; and must never modify aliases, domains, production, environment configuration or databases.

Remaining implementation: read-only provider evidence collector, exact preview build provenance, and separate plan/apply owner gates. This module does not claim these features exist. Whole-candidate review, hosted managed journeys, recovery, telemetry and consented customer acceptance remain separate launch requirements. SOL remains separate; Plant is not a marketed/activated product.

## Current exact handoff — 24 October 2026

- Immutable source checkpoint: `b44d14359cd0419af8aaec5a320218770c1d938e`
  / tree `490461c02af20049966842ad0c720dad397df33c`.
- `CURRENT.md` has a later documentation-only successor; it must not be used as
  the app/public build source unless the build is deliberately rebound and all
  exact-source checks are rerun.
- Team: `team_wI4l7ZgSxcEztQPSlCCYVeJ5`; app project:
  `prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG`; public project:
  `prj_Yaf0cZYbiFXcLkMcKaAm4alPWMhR`.
- Provider readback confirms both intended projects exist and their latest
  deployments are protected previews, but it does not expose their effective
  preview environment values or backend binding.
- The same Git repository is linked to `prj_jCl9c6cRPbt5uZO5xsseVE0drVyH`
  and `prj_XtqLLba4RX03FsS9LwwVQaXvNsVc`. Repository `vercel.json` disables
  Git deployment, but current provider read APIs do not expose the effective
  per-project Git deployment switch. Therefore a branch push is not yet proven
  CI-only and must not be described as a non-production-only action.
- The current native tree differs from the pinned gallery source. Exact-head
  native CI and a reviewed capture/provenance successor are prerequisites for
  any public preview build.

The controlled sequence is:

1. Resolve or explicitly disposition branch-push provider side effects, then
   fast-forward the sole PR #734 lane and obtain exact-head App/Native/security
   evidence. Never force-push or create a parallel product branch.
2. Regenerate and verify the native gallery from that exact source. Stabilize
   the product head, then obtain a new one-run approval for the exact-head
   PostgreSQL-17 rehearsal and its matching evidence successor.
3. From two distinct clean exact-source checkouts, build the app preview first
   for the fixed app project. Deploy only after commit-specific authorization;
   use preview target only and do not assign aliases or domains.
4. Read back app project, protection, exact source/build metadata and immutable
   preview origin. An unknown or partial result stays blocked; there is no
   automatic retry.
5. Build the public preview with the verified four-key
   `SUPERMEGA_PUBLIC_PREVIEW_APP_BINDING`, then separately authorize and deploy
   it to the fixed public project as preview only.
6. Verify the exact protected pair and EN/MY 390/768/1440 journeys. A real login
   journey additionally requires a separately approved isolated backend,
   synthetic user, tenant, membership, role and Shop entitlement.

Missing apply prerequisite: a reviewed executor that pins the CLI version,
team/project IDs, commit/tree and preview target; validates the returned URL and
provider readback; records partial/unknown outcomes durably; redacts credentials;
and never changes aliases, domains, environment configuration or databases.
