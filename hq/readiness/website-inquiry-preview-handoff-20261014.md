# Website inquiry hosted preview handoff — 2026-10-14

This is a read-only reconciliation for PR #647. It is **not** permission to create a provider branch, apply SQL, deploy, or enable public intake.

## Current evidence

- Production project `zvtzwcimpvvtkowflhda` reported `ACTIVE_HEALTHY` on 2026-10-14. Its tracked Supabase migration list has 18 entries, including `supermega_atomic_launch_schema13_20260929`, `ecommerce_decision_review_fk_index`, and `app_rls_initplan_optimization`.
- Catalog-only reads found the prerequisite `app_private.workspace_access_controls`, `workspace_memberships`, `workspace_state`, `website_review_can(text)`, `website_review_json(jsonb)`, and `workspace_is_active(text)`. Both inquiry tables and all four inquiry functions are absent. No business rows were read.
- The source directory contains 25 SQL migrations. Its historical filenames and versions differ from the production tracking history; the atomic schema-13 migration is not an exact filename match for the source chain. The older `supabase-preview-rehearsal-proposal.json` uses an August production baseline and must not be treated as a current apply-all instruction.
- All three existing non-default branches reported `MIGRATIONS_FAILED`; none is a clean inquiry rehearsal target.
- [Supabase branching](https://supabase.com/docs/guides/deployment/branching) documents that a new branch inherits its parent schema and [migration history](https://supabase.com/docs/guides/deployment/branching/working-with-branches) and starts without production data by default. Replaying all 25 source migrations against that inherited schema risks duplicate objects. [Preview branches incur usage charges](https://supabase.com/docs/guides/platform/manage-your-usage/branching).

## Bounded provider action after a separate owner decision

1. Confirm the live branch cost and approve one new data-less preview branch. Never select **Include data**. Record its project ref and verify it differs from the production ref and reports `persistent=false`. Do not reuse a failed branch.
2. Inspect the new branch's action status, migration history, required catalog objects, and absence of customer rows before any SQL write. If branch creation or automatic migration fails, stop and delete the preview branch after collecting the failure receipt. Do not repair production migration history.
3. Run the exact existing `v13-self-serve` catalog verification against the new branch. If its inherited schema does not match the source contract, stop and reconcile the discrepancy in a new reviewed candidate. Do not mark missing historical source migrations applied merely to make version lists align.
4. Only if that baseline passes and the inquiry objects are absent, apply **only** `supabase/migrations/20261014011202_website_inquiry_delivery.sql` to the preview project. Its reviewed text SHA-256 is `a90c0cff5e5c817d66939bfb0f12382fbd6dc3666f661c07319f8af2c1a6ff6c`. Recheck the digest immediately before applying.
5. Verify the resulting `v13-inquiry` catalog, anonymous role denial, synthetic Website inquiry publish/withdraw/re-publish behavior, consented receipt idempotency, inbox tenant isolation, and disabled/unavailable responses. Use synthetic data only. Capture branch ref, migration receipt, verifier output, test outcomes, and cleanup receipt without credentials or customer data.
6. Delete the preview branch after the bounded rehearsal, within 24 hours. A passing branch is non-production evidence only. Production migration, Vercel configuration/deployment, public intake, and customer contact each need their own owner decision and acceptance.

The approved PR push/CI preference does not authorize this billed provider action. The connected Supabase `create_branch` operation requires a cost confirmation ID, and the branch must be deleted explicitly after evidence. Do not create the branch until the owner confirms the exact preview scope and cost.
