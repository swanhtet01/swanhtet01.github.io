"""Exact-source, disposable full private-chain account/billing/restore proof.

No remote/database URL arguments. Reuses the established PostgreSQL 17 harness;
does NOT replace its strict v11 production validator or grant release authority.
Run in a fresh process so schema-version configuration precedes runtime imports.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from tools import rehearse_supermega_postgres17 as pg

CONTRACT = "supermega.self-serve-v13-rehearsal.v1"
EXTRAS = (
    "20260817090000_private_trial_backend_v12_billing_rail.sql",
    "20260818090000_private_trial_backend_v13_billing_entitlement_read.sql",
    "20260907024457_self_serve_durable_attempt_budget.sql",
)
MIGRATIONS = (*pg.MIGRATIONS, *EXTRAS)
PRODUCTS = ("commerce", "production", "website", "ecommerce")
TABLES = (
    "approval_requests", "billing_entitlements", "billing_events", "billing_invoices",
    "self_serve_attempt_budgets", "trial_schema_meta", "workspace_access_controls",
    "workspace_events", "workspace_memberships", "workspace_state",
)
CHECKS = (
    "v11_baseline_validator_passed", "full_private_chain_applied",
    "four_product_workspaces_created", "product_entitlements_exact",
    "exact_create_replay", "claim_conflict_without_takeover", "durable_budget_enforced",
    "actor_directory_isolated", "cross_actor_read_denied", "revoked_session_denied",
    "unpaid_invoice_not_entitled", "payment_confirmation_not_entitlement",
    "separate_entitlement_grant_visible", "runtime_billing_write_denied",
    "backup_restored_exactly", "restored_runtime_readable", "restored_budget_enforced",
)


def digest(value):
    return "sha256:" + sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                        ensure_ascii=True).encode()).hexdigest()


def require(condition, code):
    if not condition:
        raise pg.RehearsalFailure(code)


def configure_local_schema():
    # Separate runtime and owner-ledger settings must agree with the migrated DB.
    os.environ["SUPERMEGA_TRIAL_SCHEMA_VERSION"] = "13"
    os.environ["SUPERMEGA_BILLING_SCHEMA_VERSION"] = "13"
    os.environ["SUPERMEGA_OTEL_DISABLED"] = "1"


def source_identity(expected_head):
    def git(*args):
        return subprocess.check_output(["git", *args], cwd=ROOT, text=True,
                                       stderr=subprocess.DEVNULL).strip()
    require(bool(re.fullmatch(r"[0-9a-f]{40}", expected_head)), "expected_head_invalid")
    require(not git("status", "--porcelain"), "source_dirty")
    require(git("rev-parse", "HEAD") == expected_head, "source_head_mismatch")
    observed = tuple(sorted(p.name for p in (ROOT / "supabase/migrations").glob("*.sql")
                            if p.name != "20260711081300_public_legacy_baseline.sql"))
    require(observed == MIGRATIONS, "private_migration_inventory_mismatch")
    paths = sorted(set([
        "tools/rehearse_self_serve_v13.py", "tools/run_python_tool.mjs",
        "supermega_runtime/billing_rail.py", "tests/test_billing_rail.py",
        "tests/test_self_serve_v13_rehearsal.py", *pg.IMPLEMENTATION_PATHS,
        *(f"supabase/migrations/{p}" for p in MIGRATIONS),
    ]))
    return {"head": expected_head, "tree": git("rev-parse", "HEAD^{tree}"),
            "files": [{"path": p, "sha256": sha256((ROOT / p).read_bytes()).hexdigest()}
                      for p in paths]}


@contextmanager
def cluster(bin_path, openssl, password, label):
    temporary = tempfile.TemporaryDirectory(prefix="supermega-v13-proof-")
    root = Path(temporary.name).resolve()
    require(root.parent == Path(tempfile.gettempdir()).resolve()
            and root.name.startswith("supermega-v13-proof-"), "temporary_path_invalid")
    data = root / "data"
    environment = pg._clean_environment(bin_path)
    port = pg._free_loopback_port()
    try:
        pg._initialize_cluster(postgres_bin=bin_path, openssl=openssl,
            data_directory=data, admin_password=password, port=port, environment=environment)
        pg._start_cluster(postgres_bin=bin_path, data_directory=data,
            log_file=root / f"{label}.log", port=port, environment=environment)
        yield port, environment
    finally:
        if data.exists() and not pg._stop_cluster(postgres_bin=bin_path,
                data_directory=data, environment=environment):
            temporary._finalizer.detach()
            raise pg.RehearsalFailure("cluster_cleanup_failed_data_retained")
        require(root.parent == Path(tempfile.gettempdir()).resolve()
                and root.name.startswith("supermega-v13-proof-"), "cleanup_path_invalid")
        temporary.cleanup()


def snapshot(admin_url):
    from psycopg import sql
    result = {}
    with pg._connect(admin_url) as conn:
        conn.execute("set transaction read only")
        conn.execute("set local timezone = 'UTC'")
        names = conn.execute("select tablename from pg_tables where schemaname='app_private' "
                             "order by tablename").fetchall()
        require(tuple(row[0] for row in names) == TABLES, "private_table_inventory_mismatch")
        for table in TABLES:
            result[table] = conn.execute(sql.SQL(
                "select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) "
                "from app_private.{} t").format(sql.Identifier(table))).fetchone()[0]
        result["auth_sessions"] = conn.execute("select coalesce(jsonb_agg(to_jsonb(t) "
            "order by to_jsonb(t)::text),'[]'::jsonb) from auth.sessions t").fetchone()[0]
    return digest(result)


def exercise(admin_url, runtime_url, head):
    from supermega_runtime.trial_store import (
        PostgresTrialStore, TrialPrincipal, TrialClaimConflict, TrialRateLimited,
        TrialNotReadyError, SELF_SERVE_PRODUCT_ACTIVATION_IDS, self_serve_owner_capabilities,
    )
    from supermega_runtime.billing_rail import BillingLedger, BillingRailError, _digest
    from tests.test_billing_rail import sample_packet

    os.environ["SUPERMEGA_SUPABASE_PROJECT_REF"] = "a" * 20  # synthetic target, never contacted
    os.environ["SUPERMEGA_RELEASE_COMMIT"] = head
    actors, sessions = [str(uuid4()) for _ in range(2)], [str(uuid4()) for _ in range(2)]
    with pg._connect(admin_url) as conn:
        for actor, session in zip(actors, sessions):
            conn.execute("insert into auth.sessions(id,user_id) values (%s::uuid,%s::uuid)", (session, actor))
    store = PostgresTrialStore(runtime_url, reducer=lambda *_: None, write_enabled=True)
    def principal(workspace, actor=0):
        return TrialPrincipal(workspace_id=workspace, actor_id=actors[actor], actor_kind="human",
            authenticated=True, session_id=sessions[actor], identity_provider="supabase")
    def create(index=0, actor=0, product="commerce"):
        return store.create_self_serve_workspace(actor_id=actors[actor],
            claim_code=f"SM-TEST-000{index}", business_name="Synthetic company",
            product=product, session_id=sessions[actor], identity_provider="supabase")
    created = []
    require(tuple(SELF_SERVE_PRODUCT_ACTIVATION_IDS) == PRODUCTS, "product_matrix_changed")
    for index, product in enumerate(PRODUCTS):
        entry = create(index, product=product)
        ready = store.readiness(principal(entry.workspace_id))
        require(ready.write_ready, "created_workspace_not_ready")
        # Activation event names are Shop/Plant; runtime grants use commerce/production.
        require(ready.product_entitlements == (product,)
                and ready.capabilities == self_serve_owner_capabilities(product),
                "product_entitlement_mismatch")
        created.append(entry)
    repeated = create()
    require(repeated.idempotent_replay and repeated.workspace_id == created[0].workspace_id,
            "create_replay_failed")
    try:
        create(5)
        raise pg.RehearsalFailure("budget_bypassed")
    except TrialRateLimited:
        pass
    try:
        create(actor=1)
        raise pg.RehearsalFailure("claim_takeover")
    except TrialClaimConflict:
        pass
    second = create(6, actor=1)
    listed, truncated = store.list_actor_workspaces(principal(second.workspace_id, 1))
    require(not truncated and [p.workspace_id for p in listed] == [second.workspace_id],
            "directory_actor_leak")
    try:
        store.get_state(principal(created[0].workspace_id, 1), "commerce")
        raise pg.RehearsalFailure("cross_actor_read_allowed")
    except TrialNotReadyError:
        pass
    with pg._connect(admin_url) as conn:
        conn.execute("delete from auth.sessions where id=%s::uuid", (sessions[1],))
    try:
        store.get_state(principal(second.workspace_id, 1), "commerce")
        raise pg.RehearsalFailure("revoked_session_allowed")
    except TrialNotReadyError:
        pass

    workspace = created[0].workspace_id
    packet = sample_packet()  # retained existing synthetic economics, NOT an offer
    packet["invoice"]["workspace"] = {"id": workspace, "name": "Synthetic company"}
    packet["invoiceDigest"] = _digest(packet["invoice"])
    control = packet["proposedControlRecord"]
    control["tenant_id"] = workspace
    control["record_key"] = f"managed-billing-invoice:{workspace}:{packet['invoice']['invoiceId']}"
    control["plan_hash"] = packet["invoiceDigest"][7:]
    def evidence(action, reference):
        return {"actionId": action, "capturedAt": "2026-09-07T00:00:00.000Z",
                "actor": "synthetic_owner", "reason": "Disposable test only; no real payment or delivery.",
                "evidenceReference": reference}
    ledger = BillingLedger(admin_url)
    ledger.issue_invoice(packet, workspace_id=workspace, evidence=evidence("issue-test", "synthetic-issue"))
    require(not store.readiness(principal(workspace)).premium_unlocked, "unpaid_invoice_unlocked")
    ledger.confirm_payment(workspace_id=workspace, invoice_id=packet["invoice"]["invoiceId"],
        expected_revision=1, payment_reference="synthetic-transfer", channel_category="mobile_money",
        paid_at="2026-09-07T00:00:00.000Z", evidence=evidence("confirm-test", "synthetic-transfer"))
    require(not store.readiness(principal(workspace)).premium_unlocked, "confirmation_auto_unlocked")
    grant_args = dict(workspace_id=workspace, invoice_digest=packet["invoiceDigest"],
        expected_revision=0, evidence=evidence("grant-test", "synthetic-decision"))
    try:
        BillingLedger(runtime_url).grant_entitlement(**grant_args)
        raise pg.RehearsalFailure("runtime_billing_write_allowed")
    except BillingRailError:
        pass
    ledger.grant_entitlement(**grant_args)
    require(store.readiness(principal(workspace)).premium_unlocked, "explicit_grant_not_visible")
    return {"workspace": workspace, "actor": actors[0], "session": sessions[0]}


def run(expected_head):
    source = source_identity(expected_head)
    require("supermega_runtime.trial_store" not in sys.modules
            and "supermega_runtime.billing_rail" not in sys.modules, "fresh_process_required")
    configure_local_schema()
    binary, openssl = pg._default_postgres_bin(), pg._default_openssl()
    require(pg._preflight(binary, openssl).get("ok") is True, "local_postgres17_required")
    admin_secret, runtime_secret = pg._password(), pg._password()
    with tempfile.TemporaryDirectory(prefix="supermega-v13-backup-") as temporary:
        root = Path(temporary).resolve()
        require(root.parent == Path(tempfile.gettempdir()).resolve()
                and root.name.startswith("supermega-v13-backup-"), "backup_path_invalid")
        backup = root / "test.dump"
        with cluster(binary, openssl, admin_secret, "primary") as (port, environment):
            admin = pg._connection_url("postgres", admin_secret, port, pg.DATABASE_NAME)
            runtime = pg._connection_url(pg.RUNTIME_ROLE, runtime_secret, port, pg.DATABASE_NAME)
            pg._create_database_and_roles(pg._connection_url("postgres", admin_secret, port, "postgres"), pg.DATABASE_NAME)
            pg._create_auth_session_fixture(admin)
            pg._create_public_browser_fixture(admin)
            pg._apply_public_browser_quarantine(postgres_bin=binary, admin_password=admin_secret,
                port=port, database_name=pg.DATABASE_NAME, environment=environment)
            pg._apply_migrations(postgres_bin=binary, admin_password=admin_secret,
                admin_database_url=admin, port=port, environment=environment)
            pg._provision_runtime(admin, runtime_secret)
            pg._bootstrap_local_storage_catalog_fixture(admin)
            pg._run_validator(runtime, admin, environment)  # Real strict v11 baseline.
            for name in EXTRAS:
                with pg._connect(admin, autocommit=True) as conn:
                    conn.execute((ROOT / "supabase/migrations" / name).read_text(encoding="utf-8"))
            from tools.validate_supermega_database_url import audit_database
            legacy = audit_database(runtime, storage_audit_database_url=admin)
            require(legacy["ready"] is False and "schema_version_current" in legacy["failed_checks"],
                    "legacy_v13_boundary_changed")
            retained = exercise(admin, runtime, expected_head)
            before = snapshot(admin)
            pg._backup_database(postgres_bin=binary, admin_password=admin_secret,
                port=port, backup_file=backup, environment=environment)
        # First cluster is STOPPED before the second one starts.
        with cluster(binary, openssl, admin_secret, "restore") as (port, environment):
            admin = pg._connection_url("postgres", admin_secret, port, pg.RESTORE_DATABASE_NAME)
            runtime = pg._connection_url(pg.RUNTIME_ROLE, runtime_secret, port, pg.RESTORE_DATABASE_NAME)
            pg._create_database_and_roles(pg._connection_url("postgres", admin_secret, port, "postgres"), pg.RESTORE_DATABASE_NAME)
            pg._create_backend_group_for_restore(admin)
            pg._provision_runtime(admin, runtime_secret)
            pg._restore_database(postgres_bin=binary, admin_password=admin_secret,
                port=port, backup_file=backup, environment=environment)
            require(snapshot(admin) == before, "restored_records_mismatch")
            from supermega_runtime.trial_store import PostgresTrialStore, TrialPrincipal, TrialRateLimited
            store = PostgresTrialStore(runtime, reducer=lambda *_: None, write_enabled=True)
            who = TrialPrincipal(workspace_id=retained["workspace"], actor_id=retained["actor"],
                actor_kind="human", session_id=retained["session"], identity_provider="supabase")
            require(store.readiness(who).write_ready and store.readiness(who).premium_unlocked,
                    "restored_runtime_not_ready")
            try:
                store.create_self_serve_workspace(actor_id=who.actor_id, claim_code="SM-TEST-0007",
                    business_name="Synthetic company", session_id=who.session_id, identity_provider="supabase")
                raise pg.RehearsalFailure("restored_budget_bypassed")
            except TrialRateLimited:
                pass
    require(source_identity(expected_head) == source, "source_changed_during_proof")
    report = {"contract": CONTRACT, "ok": True, "source": source,
        "classification": "synthetic_disposable_local_only", "schemaVersion": 13,
        "migrationNames": list(MIGRATIONS), "checks": dict.fromkeys(CHECKS, True),
        "dataSnapshotDigest": before, "cleanupComplete": True,
        "legacyProductionValidator": {"ready": False, "failedChecks": legacy["failed_checks"]},
        "remainingGates": ["v13_production_validator_contract", "migration_manifest_reconciliation",
            "hosted_auth_and_rls", "provider_pooler_storage_backup_restore", "owner_release_acceptance"],
        "controls": {"releaseAuthorized": False, "hostedActivationProven": False,
            "providerWritesPerformed": False, "realAccountCreated": False, "realPaymentConfirmed": False}}
    report["reportDigest"] = digest(report)
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-head", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args(argv)
    # Reserve exact output first: no overwritten receipt, no work if already present.
    with args.output.open("x", encoding="utf-8") as output:
        try:
            result = run(args.expected_head)
        except Exception as exc:
            result = {"contract": CONTRACT, "ok": False,
                "error": str(exc) if isinstance(exc, pg.RehearsalFailure) else type(exc).__name__,
                "releaseAuthorized": False, "hostedActivationProven": False}
        output.write(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"ok": result["ok"], "contract": CONTRACT,
                      "error": result.get("error"), "reportDigest": result.get("reportDigest")}))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
