# Current private-chain rehearsal

Local execution only:

```
node tools/run_python_tool.mjs tools/rehearse_self_serve_v13.py --expected-head <exact-clean-commit> --output <new-local-report.json>
```

This adds a real unmocked runtime/billing proof over the full private migration
chain: role preflight, v1 through v13, and the additive durable-attempt capability.
The legacy public baseline is deliberately replaced by the existing synthetic
public catalog/quarantine fixture. No business records or configured database
URLs are copied. Only already-installed PostgreSQL 17/OpenSSL tooling is used.
Both independent process-local schema settings (trial runtime and owner billing
ledger) are set to 13 before either module is imported. No persistent environment
or provider configuration is changed.

The existing strict v11 production validator must pass BEFORE the three extension
migrations. Its rejection of v13 is retained, not weakened or called acceptable.
The explicit `v13-self-serve` profile must then pass all 33 exact catalog checks
both before exercise and on the restored database. `ok:true` means that these
catalog checks and this runner's 17 local behavior checks passed; it never
authorizes activation. The existing activation callers still select historical
v11 by default and must be deliberately updated with their receipts in a later
reviewed slice; this implementation does not silently relabel old authority.

The runner creates fresh synthetic session rows and calls the actual
PostgresTrialStore for all four product choices, replay, claim collision, durable
quota, tenant isolation and session revocation. Actual BillingLedger methods
prove invoice issue and payment confirmation do not grant entitlement, and that
the runtime role cannot perform the separate owner-only grant. Fixture economics
are reused from existing tests and are not proposed customer prices. There is no
provider Auth signup/email, wallet contact, funds transfer or actual owner decision.

After a custom-format dump, the first cluster stops. A second fresh cluster restores
the dump, compares the full synthetic private-row/session digest, then exercises
runtime readiness, premium visibility and durable quota. Only one cluster runs at
a time. Test clusters and backups are removed; failed cluster shutdown retains its
data rather than deleting it live. The exact output is exclusive-create and a
failed run leaves a failed receipt. Source cleanliness, full HEAD/tree and bound
source bytes are checked both before and after the successful run.

The read-only validator supports `--schema-profile v13-self-serve` on its normal
audit and project-bound activation audit paths. Its four extension catalog
fingerprints were derived from an isolated PostgreSQL 17 installation of the
exact pinned v12, v13 and durable-budget migration bytes (LF-normalized), never
from a supplied target during validation. They bind every column/default/type,
constraint, function body/security/configuration and policy expression in the
extension. The collector also checks all private column grants; exactly UPDATE
on the budget's attempts/claim_conflicts columns is permitted. Existing table,
function, trigger, index, role, RLS and Storage checks remain required.

The adversarial suite damages individual catalog records and introduces actual
temporary database drift (table/column grants, forced RLS, SECURITY DEFINER and
unscoped entitlement policy), checking rejection and restoring the exact state.
This is disposable loopback-only test work, not a provider configuration change.

Remaining release work includes activation-caller profile cutover, canonical
migration/receipt reconciliation, hosted pooler/Auth/Storage/restore journeys and
owner acceptance. No existing release packet is superseded by this local report.

Source guidance: [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations).
Security references: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
and [column privileges](https://supabase.com/docs/guides/database/postgres/column-level-security).
