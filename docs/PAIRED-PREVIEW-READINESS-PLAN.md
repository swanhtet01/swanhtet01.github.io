# Paired preview readiness planner

This is the first stage of paired preview delivery, not an apply tool or deployment permit.

Run from an exact, clean, independently reviewed tooling checkout:

`node tools/plan_paired_preview.mjs PREPARATION_JSON FULL_CANDIDATE_COMMIT FULL_CANDIDATE_TREE NEW_OUTPUT_JSON`

The planner verifies the existing source-preparation body digest, independently reads both source Git identities/cleanliness, binds its own commit/tree/module digest, and creates a new local evidence file exclusively. Git probes are time-bounded and run without hooks, fsmonitor, lazy fetch or optional locks. Diagnostics never print the receipt or subprocess error payload. It does not read credentials, call providers, build or deploy. Its ten-minute freshness window applies to the local observations only; later execution must recollect evidence.

All generated plans are explicitly blocked and non-executable. Provider ownership/protection and non-production runtime have not been inspected; builds, exact public-to-app binding, reviewed apply tooling and physical owner approval remain missing. Caller-supplied assertions cannot clear those gates. Digests provide integrity and binding, not authenticity or independent approval. No consumer may treat this readiness contract as an executable approval contract.

The fixed projects are megaos and supermega-public under the recorded SuperMega team. Deployment must be app-first, with a protected exact app deployment readback before building the public preview against that origin. A later separately reviewed executor must preserve durable intent, partial success and unknown outcomes without automatic retry; must use the existing default-No physical approval model; and must never modify aliases, domains, production, environment configuration or databases.

Remaining implementation: read-only provider evidence collector, exact preview build provenance, and separate plan/apply owner gates. This module does not claim these features exist. Whole-candidate review, hosted managed journeys, recovery, telemetry and consented customer acceptance remain separate launch requirements. SOL remains separate; Plant is not a marketed/activated product.
