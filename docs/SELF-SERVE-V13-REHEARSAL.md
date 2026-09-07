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

The existing strict v11 production validator must pass BEFORE the three extension
migrations. Its rejection of v13 is then retained as an explicit unresolved
production gate, not weakened or called acceptable. `ok:true` means only that
this runner's 17 local behavior checks passed; it never authorizes activation.

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

Remaining release work includes v13 production-validator contracts, canonical
migration/receipt reconciliation, hosted pooler/Auth/Storage/restore journeys and
owner acceptance. No existing release packet is superseded by this local report.

Source guidance: [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations).
