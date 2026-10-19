# Shop-first launch gate — 19 October 2026

**Decision: NO-GO.** Candidate PR #682 is being advanced from `4681f104e287d976532b95fe8736220100fdb3e9`; the current local Shop source commit is `aee11c592f3696a6d93b7edcafd783a135d83b8a`. Customer-managed access is Shop-only; Sites and Commerce stay internal. This is a review candidate, not a production release. Production promotion, customer access, commercial claims, customer contact, and hardware acceptance remain separate gates.

| Gate | Result | Current evidence |
|---|---|---|
| Shop-only customer scope | **PASS — local source only** | The candidate visibility manifest and its 11 product-visibility tests keep customer access limited to Shop. This does not prove hosted login or tenant isolation. |
| Public website | **FAIL — live content is not release-ready** | The live [SuperMega site](https://supermega.dev/) still shows Shop, Sites, and Commerce with “illustrative records” images. No production website update was made. |
| Local website candidate | **PASS — review-only** | `node tools/create_public_vercel_output.mjs` and `node tools/verify_app_build.mjs` pass. The generated 7-route output includes the refreshed Shop gallery; app output is 3,331,781 bytes with a 284,820-byte largest JavaScript asset. This verifies local assets, not a hosted deployment. |
| Product capture provenance | **PASS — current Shop code capture; not production evidence** | `node tools/capture_public_gallery.mjs` captured 22 actual-component views from clean Shop source `aee11c5` (tree `021606874edcbdca7ce107be35890ff3ad071f32`): 12 Shop captures across desktop, tablet, and phone, plus internal Sites/Commerce captures. External requests denied: 0; synthetic records/media are identified; `publicationReady=false`. Twelve Shop captures now feed the local website build with “sample data” labels. No deployment was performed. |
| Shop payment and fulfilment semantics | **PASS — prior exact-head CI; new local commit pending CI** | Payment-due status is separate from a delivery promise. App CI passed at prior PR head `4681f10`; the new responsive CSS and gallery update still need exact-head CI. Hardware payment settlement remains unproven. |
| Multi-product acceptance approvals | **PASS — prior exact-head CI and local checks** | Commit `4681f10` gives each product a distinct approval ID and keeps product approvals separate from activation approval. Verifier self-test (14 checks), launch-proof tests (4/4), Shop/runtime acceptance test, and prior exact-head CI pass. No hosted acceptance write was run. |
| Full English / Burmese experience | **FAIL — incomplete** | `node tools/audit_shop_locale_surface.mjs` reports `coverageComplete=false`, 1,226 raw English fragments across six Shop surfaces. |
| Managed preview migration chain | **FAIL — last observed state** | The approved data-less branch `supermega-shop-preview-20261019` (branch ID `e9593100-0304-49af-8a2b-b357a3707603`; project ref `tnzgzimmqzbwbjpvkfer`) was last observed as `MIGRATIONS_FAILED` because the repository legacy baseline is missing from production migration history. The baseline verifier passes for 27 tables and 2 sequences. A fresh Supabase branch read now returns a permission error. Separate approval to apply that baseline to this preview branch is pending; production and the older failed branch are untouched. |
| Managed Auth / tenant isolation / hosted reload | **NOT RUN / NOT PROVEN** | No approved two-user synthetic journey, cross-tenant denial, save/reload, or hosted recovery was verified on the new preview. No customer identities were created. |
| Shop barcode scanner / receipt printer | **NOT RUN** | No named device/browser matrix or physical scanner, printer, paper, and Myanmar-font test is bound to this candidate. |
| Paid-VPS agents | **NOT RUN — access evidence incomplete** | Current network check reaches RDP port 3389; SSH port 22 is closed. No authenticated VPS desktop, worker installation, heartbeat, or isolated job completion was verified. The local company coordinator reports `localOnly=true`, zero running/queued work, and is not VPS evidence. Local Ollama/inference is not used as a hosted-readiness substitute. |
| Exact-head CI and security | **BLOCKED** | App CI, kernel verification, and dependency audits passed for prior PR head `4681f10` (App CI run `39186282022`). The responsive fix and refreshed captures pass local build/capture checks at Shop source commit `aee11c5`; exact PR CI for this update is pending. GitGuardian still fails on a `Generic Password` finding in a nested-error test fixture at older PR commit `941182c`; the value was not exposed. |
| Independent review | **BLOCKED** | PR #682 has no eligible independent approval (`reviewDecision` is blank). Automated review does not satisfy GitHub’s independent-review rule. |
| Production release | **NOT RUN — separate owner gate** | No production migration, deployment, domain update, customer action, or commercial claim was made. |

## Next actions

1. After the separate owner approval, apply only `supabase/migrations/20260711081300_public_legacy_baseline.sql` to the new data-less preview, then verify the full migration chain, RLS, Auth, and cross-tenant denial. Do not apply it to production.
2. Finish exact-head CI, resolve the GitGuardian history finding through an owner-approved remediation, and obtain an eligible independent reviewer. Do not bypass either gate.
3. Recapture the product gallery from the reviewed exact source, make English and Burmese complete, and inspect the rendered desktop, tablet, and mobile captures before considering website publication.
4. Complete the named scanner/printer and paid-VPS worker acceptance runs; retain their evidence in the release packet.
5. Re-read live website, hosted access, and release gates before any separately authorized production decision.

The candidate remains **NO-GO** until every required gate is supported by current, exact-candidate evidence.
