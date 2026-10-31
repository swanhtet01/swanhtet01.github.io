# Current private-chain rehearsal

The first section preserves the historical hosted PostgreSQL/Supabase
`v13-self-serve` helper for baseline and adversarial checks. The authoritative
full release rehearsal described below is the current PostgreSQL schema-v14
contract. Both are independent of native Shop's SQLite `user_version`.

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
authorizes activation. Activation callers now explicitly select schema 13 and this
profile with a new project/release-bound plan fingerprint; historical approval
cannot authorize the new target. Canonical integration and hosted acceptance
remain separate gates.

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
extension, including column collation identity/determinism. The collector also
checks all private column grants; exactly UPDATE
on the budget's attempts/claim_conflicts columns is permitted. Existing table,
function, trigger, index, role, RLS and Storage checks remain required.

The adversarial suite damages individual catalog records and introduces actual
temporary database drift (table/column grants, forced RLS, SECURITY DEFINER and
unscoped entitlement policy), checking rejection and restoring the exact state.
This is disposable loopback-only test work, not a provider configuration change.

Remaining release work includes canonical activation-caller integration,
migration/receipt reconciliation, hosted pooler/Auth/Storage/restore journeys and
owner acceptance. No existing release packet is superseded by this local report.

Source guidance: [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations).
Security references: [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
and [column privileges](https://supabase.com/docs/guides/database/postgres/column-level-security).

## Full release database rehearsal

The source-owned release runner applies the exact 24 private migrations through
schema 14 and the `v14-shop-correction` profile. It runs all 79 exact behavior
and recovery checks. Both fresh and restored catalogs must pass the exact
33-name current validator matrix. Legacy helper defaults remain solely for
baseline and adversarial tests; the release entry explicitly selects
`CURRENT_MIGRATIONS` and the current v14 profile for both databases.

New receipt production is currently blocked before PostgreSQL starts because no
reviewed provenance profile yet binds the verified installer and every separate
PostgreSQL/OpenSSL/Python/Psycopg source to the complete runtime closure. The commands below are the intended flow
only after that source-controlled profile is complete and independently reviewed;
Linux and caller-supplied tool paths are not approved substitutes.

The pending profile is recorded at
`hq/research/postgres17-toolchain-profile.json`. Its `sources[]` and `bindings[]`
model must authenticate each actual source independently and bind every executed,
imported or non-system loaded file to that source. PostgreSQL, Python,
Psycopg/native extensions and OpenSSL may not inherit one another's provenance.
Synthetic fixtures prove tamper rejection but can never authorize a real
recording. Until complete Windows source identities, file hashes, runtime-load
closure, retained evidence digests and independent approval are present, the
recorder fails before starting PostgreSQL.

The verified PostgreSQL source candidate is EDB's official Windows x64
`postgresql-17.11-5-windows-x64.exe`: 413,001,200 bytes, SHA-256
`612c7f5400a003aaffa0372cb273eed52278f93c680ab911eb9cb2229e329072`.
Two read-only downloads matched those bytes and Microsoft Winget's independent
manifest. Windows reported a valid embedded `Authenticode` signature, required
code-signing EKU `1.3.6.1.5.5.7.3.3`, signer raw-DER SHA-256
`558b34d97944a53cefc13c031ea46845be00f0b9bb87f47dc3110eaee07f82d3`
and timestamp-certificate raw-DER SHA-256
`2da09da7f4131f9fe72db6c5e6e9c9656755af043f1ea742cc0d2120e141ebfc`.
The installer was not executed. The canonical observer still must emit and
retain a digest-bound evidence file before the policy can be independently
approved. A URL, filename, subject string or secondary checksum alone is never
authority.

The Node recorder is the sole receipt authority. It revalidates the canonical
profile immediately before launch and after confirmed cleanup, launches the
exact verified Python executable with verified PostgreSQL and OpenSSL paths,
and reconstructs the sanitized receipt from the raw non-authoritative Python
report plus current source/toolchain evidence. Direct Python output cannot mint
an accepted receipt.

The reviewed trust boundary is a fresh, single-purpose isolated Windows x64
runner with no concurrent or interactive same-user workload and no
attacker-writable source/runtime directories. Hostile same-host mutation is out
of scope for this minimal path; if it becomes a requirement, a separately
approved immutable staging/execution-lock design must be restored. Pre/post
hashing is not represented as protection against swap-execute-restore by a
hostile same-user process. The remaining required evidence is the retained
canonical Authenticode observation, complete authenticated multi-source
bindings/load closure, materialized runtime inventory, Windows execution and
independent profile approval.

Then run once from an exact clean committed checkout, using the approved tools:

```
node tools/record_postgres17_rehearsal.mjs --output <fresh-external-receipt.json>
node tools/record_postgres17_rehearsal.mjs --verify --input <fresh-external-receipt.json> --expected-head <exact-clean-commit>
```

The raw `supermega_postgres17_rehearsal_v2` result is retained beside the receipt
as `<fresh-external-receipt.json>.raw.json`. The sanitized
`supermega.hq.database-rehearsal.v3` receipt binds clean source commit/tree,
LF-normalized implementation bytes, exact migration names/profile, both catalogs,
all behavior checks and equal full private-row/session snapshot digests. The
consumer rebuilds it from the raw report; digest integrity is not independent
authenticity or an owner approval. All hosted/production authority remains false.

Keep four digest labels distinct when recording evidence: the sanitized receipt
file's byte SHA-256, the external raw JSON file's byte SHA-256 and line-ending
form, the tracked LF-normalized raw file's byte SHA-256, and the receipt's
canonical `rawReportDigest`. None can be substituted for another, and a GitHub
artifact archive digest would be a fifth, separate value.

Use a new output outside the checkout. Existing outputs fail before database work;
no historical tracked HQ receipt is overwritten. A failed run retains its safe raw
result, without a successful receipt. A repository-wide lock shared by all Git
worktrees plus a destination lock prevent concurrent recording. Timeout, signal,
missing raw result or unconfirmed cleanup retains both markers, blocking even a
different output path. Never remove them or retry automatically: first reconcile
the complete launcher/Python/PostgreSQL process tree and any delayed raw output.
Only a terminal launcher result plus the raw current-contract cleanup confirmation
(or failure before launching) releases the owned markers. A shutdown failure
retains the temporary cluster directory, never
deleting a possibly live database. Successful runs stop one cluster before starting
the restore cluster and clean both up. No full app verifier is invoked.

This database dump proves synthetic private rows and session fixtures, not provider
Auth, uploaded payment images or Storage object recovery. Supabase database backups
do not contain Storage object bytes, and custom-role passwords require separate
restoration. Those remain explicit hosted recovery gates; see
[Supabase backups](https://supabase.com/docs/guides/platform/backups).
