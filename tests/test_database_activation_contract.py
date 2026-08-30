from __future__ import annotations

import ast
from hashlib import sha256
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import textwrap
import types
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = ROOT / "tools" / "validate_supermega_database_url.py"
ACTIVATOR = ROOT / "tools" / "activate_supermega_database.ps1"
MANAGED_ACTIVATION = ROOT / "supermega_runtime" / "managed_activation.py"
SUPABASE_PREFLIGHT = ROOT / "tools" / "preflight_supermega_supabase.ps1"
ACTIVATION_RUNBOOK = ROOT / "docs" / "supermega-enterprise-activation.md"
PACKAGE_JSON = ROOT / "package.json"
POWERSHELL = shutil.which("powershell") if os.name == "nt" else None
SUPABASE_PREFLIGHT_QUERY_SHA256 = (
    "9157ca7802c7f422c616aba86465c22fabee57dcf032b21af8685069b8983a9e"
)
TRIAL_STORE = ROOT / "supermega_runtime" / "trial_store.py"
MIGRATION_PREFLIGHT = (
    ROOT
    / "supabase"
    / "migrations"
    / "20260722004500_private_trial_backend_role_preflight.sql"
)
MIGRATION_V1 = (
    ROOT
    / "supabase"
    / "migrations"
    / "20260722005134_private_trial_backend_foundation.sql"
)
MIGRATION_V2 = (
    ROOT
    / "supabase"
    / "migrations"
    / "20260722142801_private_trial_backend_v2.sql"
)
MIGRATION_V3 = (
    ROOT
    / "supabase"
    / "migrations"
    / "20260723094500_private_trial_backend_v3_website.sql"
)
MIGRATION_V4 = (
    ROOT
    / "supabase"
    / "migrations"
    / "20260723144500_private_trial_backend_v4_hardening.sql"
)
MIGRATION_V5 = (
    ROOT
    / "supabase"
    / "migrations"
    / "20260724204920_private_trial_backend_v5_read_capabilities.sql"
)
MIGRATION_V6 = (
    ROOT
    / "supabase"
    / "migrations"
    / "20260730113000_private_trial_backend_v6_managed_activation.sql"
)
MIGRATION_V7 = (
    ROOT
    / "supabase"
    / "migrations"
    / "20260730123000_private_trial_backend_v7_workspace_discovery.sql"
)
MIGRATION_V8 = (
    ROOT
    / "supabase"
    / "migrations"
    / "20260802161500_private_trial_backend_v8_rls_initplan.sql"
)
MIGRATION_V9 = (
    ROOT
    / "supabase"
    / "migrations"
    / "20260803063822_private_trial_backend_v9_metadata_rls.sql"
)
MIGRATION_V10 = (
    ROOT
    / "supabase"
    / "migrations"
    / "20260804102000_private_trial_backend_v10_supabase_session_revocation.sql"
)
MIGRATION_V11 = (
    ROOT
    / "supabase"
    / "migrations"
    / "20260816120000_private_trial_backend_v11_self_serve_grants.sql"
)
MIGRATIONS = (
    MIGRATION_PREFLIGHT,
    MIGRATION_V1,
    MIGRATION_V2,
    MIGRATION_V3,
    MIGRATION_V4,
    MIGRATION_V5,
    MIGRATION_V6,
    MIGRATION_V7,
    MIGRATION_V8,
    MIGRATION_V9,
    MIGRATION_V10,
    MIGRATION_V11,
)

PRIVATE_SCHEMA = "app_private"
BACKEND_ROLE = "supermega_trial_backend"
EXPECTED_TABLES = (
    "trial_schema_meta",
    "workspace_memberships",
    "workspace_state",
    "workspace_events",
    "approval_requests",
    "workspace_access_controls",
)
RLS_TABLES = (
    "workspace_memberships",
    "workspace_state",
    "workspace_events",
    "approval_requests",
    "workspace_access_controls",
)
EXPECTED_POLICIES = (
    "approval_requests_access_gate",
    "workspace_memberships_access_gate",
    "workspace_memberships_self_read",
    "workspace_state_access_gate",
    "workspace_state_member_read",
    "workspace_state_capability_insert",
    "workspace_state_capability_update",
    "workspace_events_member_read",
    "workspace_events_capability_insert",
    "workspace_events_access_gate",
    "approval_requests_member_read",
    "approval_requests_capability_insert",
    "approval_requests_capability_update",
    "workspace_access_controls_member_read",
    "workspace_access_controls_self_serve_insert",
    "workspace_memberships_self_serve_insert",
    "trial_schema_meta_backend_read",
)
EXPECTED_TRIGGERS = (
    "workspace_events_immutable",
    "workspace_events_server_timestamp",
    "workspace_state_version_guard",
    "approval_requests_controlled_mutation",
    "workspace_access_control_guard",
)
EVENT_SURFACE_CONSTRAINT = "workspace_events_approval_surface_v4_check"
EXPECTED_INDEXES = (
    "trial_schema_meta_pkey",
    "workspace_memberships_pkey",
    "workspace_memberships_actor_directory_idx",
    "workspace_state_pkey",
    "workspace_events_pkey",
    "workspace_events_workspace_id_command_id_key",
    "workspace_events_timeline_idx",
    "approval_requests_pkey",
    "approval_requests_workspace_id_command_id_key",
    "approval_requests_queue_idx",
    "workspace_access_controls_pkey",
    "workspace_access_controls_activation_id_key",
    "workspace_access_controls_authorization_id_key",
)
EXPLICIT_INDEXES = (
    "workspace_events_timeline_idx",
    "approval_requests_queue_idx",
    "workspace_memberships_actor_directory_idx",
)
FORBIDDEN_ROLES = ("public", "anon", "authenticated", "service_role")


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _load_validator():
    spec = importlib.util.spec_from_file_location(
        "supermega_database_validator_contract",
        VALIDATOR,
    )
    if spec is None or spec.loader is None:
        raise RuntimeError("validator_import_failed")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _normalized_sql(path: Path | None = None) -> str:
    source = _read(path) if path is not None else "\n".join(_read(item) for item in MIGRATIONS)
    return re.sub(r"\s+", " ", source.lower()).strip()


def _extract_json(text: str) -> dict[str, object]:
    stripped = text.strip()
    for line in reversed(stripped.splitlines()):
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start >= 0 and end > start:
        value = json.loads(stripped[start : end + 1])
        if isinstance(value, dict):
            return value
    raise AssertionError(f"validator did not emit a JSON object: {stripped[:300]!r}")


def _first_sql_token(statement: str) -> str:
    without_comments = re.sub(r"/\*.*?\*/", " ", statement, flags=re.DOTALL)
    without_comments = re.sub(r"--[^\r\n]*", " ", without_comments)
    match = re.search(r"[a-z]+", without_comments.lower())
    return match.group(0) if match else ""


class MigrationSecurityEvidenceTests(unittest.TestCase):
    def test_historical_migrations_are_unchanged_and_v8_through_v11_are_additive(self) -> None:
        preflight = _normalized_sql(MIGRATION_PREFLIGHT)
        v1 = _normalized_sql(MIGRATION_V1)
        v2 = _normalized_sql(MIGRATION_V2)
        v3 = _normalized_sql(MIGRATION_V3)
        v4 = _normalized_sql(MIGRATION_V4)
        v5 = _normalized_sql(MIGRATION_V5)
        v6 = _normalized_sql(MIGRATION_V6)
        v7 = _normalized_sql(MIGRATION_V7)
        v8 = _normalized_sql(MIGRATION_V8)
        v9 = _normalized_sql(MIGRATION_V9)
        v10 = _normalized_sql(MIGRATION_V10)
        v11 = _normalized_sql(MIGRATION_V11)
        self.assertIn("pre-existing supermega trial backend role attributes are unsafe", preflight)
        self.assertIn("membership.roleid = backend_record.oid", preflight)
        self.assertIn("dependency.refclassid = 'pg_authid'::regclass", preflight)
        self.assertIn("role_setting.setrole = backend_record.oid", preflight)
        self.assertIn("values ('private_trial_backend', 1)", v1)
        self.assertIn("surface in ('command', 'shop', 'plant', 'setup')", v1)
        self.assertNotIn("decision_contract_version", v1)
        self.assertNotIn("actor_kind", v1)
        self.assertIn("private trial backend v2 requires schema version 1", v2)
        self.assertIn("add column decision_contract_version integer", v2)
        self.assertIn("set schema_version = 2", v2)
        self.assertIn("private trial backend v3 requires schema version 2", v3)
        self.assertIn("surface in ('company', 'commerce', 'production', 'website', 'setup')", v3)
        self.assertIn("when 'website' then 'website.write'", v3)
        self.assertIn("set schema_version = 3", v3)
        self.assertIn("private trial backend v4 requires schema version 3", v4)
        self.assertIn(EVENT_SURFACE_CONSTRAINT, v4)
        self.assertIn("initial workspace state version must be one", v4)
        self.assertIn("new.created_at := transaction_timestamp()", v4)
        self.assertIn("new.requested_at := transaction_timestamp()", v4)
        self.assertIn("new.decided_at := transaction_timestamp()", v4)
        self.assertIn("set schema_version = 4", v4)
        self.assertIn("private trial backend v5 requires schema version 4", v5)
        self.assertIn("workspace_state.surface || '.read'", v5)
        self.assertIn("workspace_state.surface || '.write'", v5)
        self.assertIn("'approvals.read' = any(membership.capabilities)", v5)
        self.assertIn("approval_requests.requested_by = current_setting('app.actor_id', true)", v5)
        self.assertIn("set schema_version = 5", v5)
        self.assertIn("private trial backend v6 requires schema version 5", v6)
        self.assertIn("create table app_private.workspace_access_controls", v6)
        self.assertIn("workspace access can only transition from active to suspended", v6)
        self.assertIn("'legacy_migration_v1'", v6)
        self.assertIn("'suspended'", v6)
        self.assertIn("set schema_version = 6", v6)
        self.assertIn("private trial backend v7 requires schema version 6", v7)
        self.assertIn("create function app_private.actor_workspace_directory()", v7)
        self.assertIn("security definer", v7)
        self.assertIn("actor_id = current_setting('app.actor_id', true)", v7)
        self.assertIn("access_control.status = 'active'", v7)
        self.assertIn("revoke all on function app_private.actor_workspace_directory()", v7)
        self.assertIn("create index workspace_memberships_actor_directory_idx", v7)
        self.assertIn("set schema_version = 7", v7)
        self.assertIn("private trial backend v8 requires schema version 7", v8)
        self.assertEqual(v8.count("drop policy"), 10)
        self.assertIn("workspace_id = (select current_setting('app.workspace_id', true))", v8)
        self.assertNotIn("workspace_id = current_setting('app.workspace_id', true)", v8)
        self.assertIn("set schema_version = 8", v8)
        self.assertIn("private trial backend v9 requires schema version 8", v9)
        self.assertIn(
            "alter table app_private.trial_schema_meta enable row level security",
            v9,
        )
        self.assertNotIn(
            "alter table app_private.trial_schema_meta force row level security",
            v9,
        )
        self.assertIn("create policy trial_schema_meta_backend_read", v9)
        self.assertIn("to supermega_trial_backend", v9)
        self.assertIn("using (component = 'private_trial_backend')", v9)
        self.assertIn("set schema_version = 9", v9)
        self.assertIn("private trial backend v10 requires schema version 9", v10)
        self.assertIn("create function app_private.supabase_session_is_active", v10)
        self.assertIn("from auth.sessions as session_record", v10)
        self.assertIn("security definer", v10)
        self.assertIn("set search_path = ''", v10)
        self.assertIn(
            "revoke all on function app_private.supabase_session_is_active(uuid, uuid)",
            v10,
        )
        self.assertIn("to supermega_trial_backend", v10)
        self.assertIn("set schema_version = 10", v10)
        self.assertIn("private trial backend v11 requires schema version 10", v11)
        self.assertIn("create policy workspace_access_controls_self_serve_insert", v11)
        self.assertIn("create policy workspace_memberships_self_serve_insert", v11)
        self.assertIn("set schema_version = 11", v11)

    def test_private_schema_and_runtime_role_are_restricted(self) -> None:
        sql = _normalized_sql()
        self.assertIn("create schema if not exists app_private", sql)
        self.assertIn(
            "revoke all on schema app_private from public, anon, authenticated, service_role",
            sql,
        )
        role_block = re.search(
            r"create role supermega_trial_backend (?P<body>.*?);",
            sql,
        )
        self.assertIsNotNone(role_block, "dedicated backend role must be created")
        assert role_block is not None
        for attribute in (
            "nologin",
            "nosuperuser",
            "nocreatedb",
            "nocreaterole",
            "noreplication",
            "nobypassrls",
        ):
            self.assertIn(attribute, role_block.group("body"))

    def test_expected_schema_and_rls_evidence_is_declared(self) -> None:
        sql = _normalized_sql()
        for table in EXPECTED_TABLES:
            self.assertIn(f"create table app_private.{table}", sql)
        for table in RLS_TABLES:
            self.assertIn(
                f"alter table app_private.{table} enable row level security",
                sql,
            )
            self.assertIn(
                f"alter table app_private.{table} force row level security",
                sql,
            )
        self.assertIn(
            "alter table app_private.trial_schema_meta enable row level security",
            sql,
        )

    def test_forbidden_roles_are_revoked_and_backend_grants_are_bounded(self) -> None:
        sql = _normalized_sql()
        for object_kind in ("tables", "sequences", "functions"):
            self.assertIn(
                f"revoke all on all {object_kind} in schema app_private "
                "from public, anon, authenticated, service_role",
                sql,
            )
        self.assertIn(
            "grant usage on schema app_private to supermega_trial_backend",
            sql,
        )
        self.assertIn(
            "grant select, insert, update on app_private.workspace_state "
            "to supermega_trial_backend",
            sql,
        )
        self.assertIn(
            "grant select, insert on app_private.workspace_events "
            "to supermega_trial_backend",
            sql,
        )
        self.assertNotRegex(
            sql,
            r"grant\s+[^;]*\bdelete\b[^;]*\bto\s+supermega_trial_backend",
        )

    def test_policy_trigger_and_index_evidence_is_complete(self) -> None:
        sql = _normalized_sql()
        for policy in EXPECTED_POLICIES:
            self.assertIn(f"create policy {policy}", sql)
        for trigger in EXPECTED_TRIGGERS:
            self.assertIn(f"create trigger {trigger}", sql)
        for index in EXPLICIT_INDEXES:
            self.assertIn(f"create index {index}", sql)
        self.assertEqual(sql.count("security definer"), 2)
        self.assertIn(
            "create function app_private.actor_workspace_directory() returns table",
            sql,
        )
        self.assertIn(
            "security definer set search_path = pg_catalog, app_private",
            sql,
        )
        self.assertIn(
            "create function app_private.supabase_session_is_active",
            sql,
        )
        self.assertIn("security definer set search_path = ''", sql)
        self.assertGreaterEqual(sql.count("security invoker"), 3)

    def test_approval_decisions_require_a_trusted_human_actor_kind(self) -> None:
        sql = _normalized_sql(MIGRATION_V2)
        self.assertIn(
            "check (actor_kind in ('human', 'service', 'agent', 'legacy'))",
            sql,
        )
        self.assertIn("set requested_actor_kind = 'legacy'", sql)
        self.assertIn("decision_contract_version = 2", sql)
        self.assertIn("proposal_json ->> 'contract' = 'decision_packet.v1'", sql)
        self.assertIn("proposal_json #>> '{subject,version}' = '1'", sql)
        self.assertIn("jsonb_array_length(proposal_json -> 'claims') between 1 and 20", sql)
        self.assertIn("current_setting('app.actor_kind', true) = 'human'", sql)
        self.assertIn("membership.actor_kind = 'human'", sql)
        self.assertIn("event_type <> 'approval.decided' or actor_kind = 'human'", sql)
        self.assertIn("decision_note = btrim(decision_note)", sql)
        self.assertIn("char_length(decision_note) between 1 and 500", sql)
        self.assertIn("legacy approval must be reissued under decision contract v2", sql)

    def test_v4_binds_approval_events_to_surface_and_capability(self) -> None:
        sql = _normalized_sql(MIGRATION_V4)
        self.assertIn(
            "surface = 'approvals' and event_type in ('approval.requested', 'approval.decided')",
            sql,
        )
        self.assertIn(
            "surface <> 'approvals' and event_type not in ('approval.requested', 'approval.decided')",
            sql,
        )
        request_position = sql.index(
            "when workspace_events.event_type = 'approval.requested' then 'approvals.request'"
        )
        company_position = sql.index(
            "when workspace_events.surface = 'company' then 'company.write'"
        )
        self.assertLess(request_position, company_position)
        self.assertIn("and version = 1", sql)

    def test_v4_fails_on_unsafe_backend_role_state(self) -> None:
        sql = _normalized_sql(MIGRATION_V4)
        for required in (
            "backend_record.rolcanlogin",
            "backend_record.rolsuper",
            "backend_record.rolbypassrls",
            "membership.member = backend_record.oid",
            "membership.roleid = backend_record.oid",
            "dependency.refclassid = 'pg_authid'::regclass",
            "dependency.deptype = 'o'",
            "dependency.deptype = 'a'",
            "'relation', 'app_private.approval_requests', 0",
        ):
            self.assertIn(required, sql)


class ActivationWrapperContractTests(unittest.TestCase):
    def test_production_activation_binds_tls_checkout_and_live_release_provenance(self) -> None:
        source = _read(MANAGED_ACTIVATION)
        for expected in (
            'configured_sslmode != "verify-full"',
            'connection_parameters.get("sslrootcert"',
            'Administrative TLS CA does not match the owner-reviewed activation plan.',
            '["git", "fetch", "--quiet", "origin", "main"]',
            'refs/remotes/origin/main',
            'https://app.supermega.dev/__release.json',
            'payload.get("service") != "supermega-app"',
            'payload.get("commit") != release_commit',
            'if production and args.command in {"authorize", "apply"}:',
            '"localProjectionTrusted": False',
            '"verification": "requery_required"',
        ):
            self.assertIn(expected, source)

    def test_activation_wrapper_requires_the_read_only_validator(self) -> None:
        self.assertTrue(
            VALIDATOR.is_file(),
            "production gap: tools/validate_supermega_database_url.py is missing",
        )

    def test_validation_precedes_every_vercel_mutation(self) -> None:
        source = _read(ACTIVATOR)
        validator_position = source.index("& uv run python $ValidatorPath")
        exit_guard_position = source.index("if ($LASTEXITCODE -ne 0)", validator_position)
        workspace_preflight_position = source.index("$ActivationModule validate", exit_guard_position)
        validate_only_position = source.index("if ($ValidateOnly)", workspace_preflight_position)
        isolated_vercel_check_position = source.index("$EnvironmentValueVerifier isolated_demo", validate_only_position)
        authorization_position = source.index("$ActivationModule authorize", isolated_vercel_check_position)
        vercel_stage_position = source.index("Add-ManagedEnvironmentValue -Key 'SUPERMEGA_DATABASE_URL'", authorization_position)
        workspace_apply_position = source.index("$ActivationModule apply", vercel_stage_position)
        self.assertLess(validator_position, exit_guard_position)
        self.assertLess(exit_guard_position, workspace_preflight_position)
        self.assertLess(workspace_preflight_position, validate_only_position)
        self.assertLess(validate_only_position, isolated_vercel_check_position)
        self.assertLess(isolated_vercel_check_position, authorization_position)
        self.assertLess(authorization_position, vercel_stage_position)
        self.assertLess(vercel_stage_position, workspace_apply_position)
        self.assertIn("'--env-key', 'SUPERMEGA_DATABASE_URL'", source)
        self.assertIn(
            "'--storage-audit-env-key', 'SUPERMEGA_STORAGE_AUDIT_DATABASE_URL'",
            source,
        )
        self.assertIn("'--activation-target'", source)
        self.assertIn(
            "'--expected-project-ref-env-key', 'SUPERMEGA_ACTIVATION_PROJECT_REF'",
            source,
        )
        self.assertIn("'--ensure-schema'", source)
        self.assertIn("'--require-ready'", source)
        self.assertIn("& uv run python $ValidatorPath @validatorArguments", source)
        self.assertIn("Supabase and Vercel were not changed", source)

    def test_wrapper_does_not_forward_or_print_the_database_url(self) -> None:
        source = _read(ACTIVATOR)
        validator_line = next(
            line
            for line in source.splitlines()
            if "& uv run python $ValidatorPath" in line
        )
        self.assertNotIn("$resolved", validator_line.lower())
        self.assertNotIn("$resolvedstorageaudit", validator_line.lower())
        for line in source.splitlines():
            if "write-output" in line.lower():
                self.assertNotIn("$resolved", line.lower())
        self.assertIn("$env:SUPERMEGA_DATABASE_URL = $resolved", source)
        self.assertIn(
            "$env:SUPERMEGA_STORAGE_AUDIT_DATABASE_URL = $resolvedStorageAudit",
            source,
        )
        self.assertIn("finally", source.lower())
        self.assertIn("Remove-Item Env:SUPERMEGA_DATABASE_URL", source)
        self.assertIn(
            "Remove-Item Env:SUPERMEGA_STORAGE_AUDIT_DATABASE_URL",
            source,
        )
        self.assertIn("$resolvedPublishableKey = $null", source)
        self.assertNotIn("Write-Output $resolvedPublishableKey", source)

    def test_wrapper_binds_target_and_gates_every_external_mutation(self) -> None:
        source = _read(ACTIVATOR)
        parameter_block = source.split(")", 1)[0]
        self.assertIn("[string]$StorageAuditDatabaseUrlFile", parameter_block)
        self.assertIn("[string]$ExpectedProjectRef", parameter_block)
        self.assertIn("[string]$ApprovalId", parameter_block)
        self.assertIn("[string]$AdminDatabaseUrlFile", parameter_block)
        self.assertIn("[string]$SupabasePublishableKeyFile", parameter_block)
        self.assertIn("[string]$OwnerAccessTokenFile", parameter_block)
        self.assertIn("[string]$ActivationPlanFile", parameter_block)
        self.assertIn("[string]$ActivationReceiptFile", parameter_block)
        self.assertIn("[switch]$ProductionHandoff", parameter_block)
        self.assertIn("status --porcelain -- package.json", source)
        self.assertIn("productionSupabaseProjectRef", source)
        self.assertIn("if (-not $ValidateOnly)", source)
        self.assertIn("if (-not $ProductionHandoff)", source)
        self.assertIn("if ($ApprovalId -notmatch $ApprovalIdPattern)", source)
        self.assertIn(
            "if ($ExpectedProjectRef -ne $TrustedProductionProjectRef)",
            source,
        )
        self.assertIn(
            "elseif ($ExpectedProjectRef -eq $TrustedProductionProjectRef)",
            source,
        )
        self.assertIn("supermega.managed_workspace_activation_plan.v1", source)
        self.assertIn("--confirm-owner-approval $ApprovalId", source)
        self.assertIn("--production-handoff", source)
        self.assertIn("$ActivationModule suspend", source)
        self.assertIn("Activation compensation after a downstream release gate failure.", source)
        self.assertIn("$activationPlan.rollback.authorizationId", source)
        self.assertIn("$activationApplyResult.externalMutationPerformed", source)
        self.assertIn("activation command failed; reconcile PostgreSQL", source)
        self.assertIn("[string]$recoveryInspect.status -eq 'active_replay'", source)
        self.assertIn("database_state_confirmed_safe", source)
        self.assertIn("Managed activation never overwrites", source)
        self.assertIn("Remove-StagedEnvironmentValues", source)
        self.assertIn("workspace_access_gate", source)
        self.assertIn("vercel@56.1.0", source)
        self.assertIn("prj_1GAMPH8qlSAXno5BhO1wkYx1jkGG", source)
        self.assertIn("team_wI4l7ZgSxcEztQPSlCCYVeJ5", source)
        self.assertIn("$env:VERCEL_PROJECT_ID = $AppVercelProjectId", source)
        self.assertIn("$env:VERCEL_ORG_ID = $VercelOrgId", source)
        self.assertIn("--cwd", source)
        self.assertNotIn("--project", source)

    def test_browser_auth_and_write_enablement_are_complete_and_ordered(self) -> None:
        source = _read(ACTIVATOR)
        database_position = source.index("Add-ManagedEnvironmentValue -Key 'SUPERMEGA_DATABASE_URL'")
        browser_url_position = source.index("Add-ManagedEnvironmentValue -Key 'VITE_SUPABASE_URL'")
        browser_key_position = source.index("Add-ManagedEnvironmentValue -Key 'VITE_SUPABASE_PUBLISHABLE_KEY'")
        writes_position = source.index("Add-ManagedEnvironmentValue -Key 'SUPERMEGA_TRIAL_WRITES_ENABLED'")
        self.assertLess(database_position, browser_url_position)
        self.assertLess(browser_url_position, browser_key_position)
        self.assertLess(browser_key_position, writes_position)
        self.assertIn("^sb_publishable_", source)
        self.assertIn("writes_enabled_last", source)
        self.assertIn("$EnvironmentValueVerifier staged", source)
        self.assertIn("$EnvironmentValueVerifier managed_trial", source)

    def test_runtime_readiness_queries_are_non_mutating(self) -> None:
        source = _read(TRIAL_STORE)
        tree = ast.parse(source, filename=str(TRIAL_STORE))
        self.assertIn('"autocommit": False', source)
        self.assertGreaterEqual(source.count("with connection.transaction():"), 2)
        self.assertIn("set_config('app.workspace_id', %s, true)", source)
        self.assertIn("set_config('app.actor_id', %s, true)", source)
        self.assertIn("set_config('app.actor_kind', %s, true)", source)
        readiness_helpers = {
            "readiness",
            "_assert_schema",
            "_assert_audit",
            "_load_membership",
            "_set_context",
        }
        statements: list[str] = []
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in readiness_helpers:
                statements.extend(
                    value.value
                    for value in ast.walk(node)
                    if isinstance(value, ast.Constant)
                    and isinstance(value.value, str)
                    and re.search(r"\b(select|insert|update|delete|alter|create|drop)\b", value.value, re.I)
                )
        self.assertTrue(statements, "expected database readiness probes were not found")
        for statement in statements:
            self.assertIn(
                _first_sql_token(statement),
                {"select", "with"},
                f"readiness helper contains non-read SQL: {statement!r}",
            )


class SupabaseRehearsalPreflightContractTests(unittest.TestCase):
    TARGET_REF = "abcdefghijklmnopqrst"
    PRODUCTION_REF = "zyxwvutsrqponmlkjihg"
    SECRET = "Supabase-rehearsal-secret"

    @classmethod
    def setUpClass(cls) -> None:
        cls.validator = _load_validator()
        cls._temporary_directory = tempfile.TemporaryDirectory()
        cls.ca_file = Path(cls._temporary_directory.name) / "supabase-ca.crt"
        cls.ca_file.write_text(
            "-----BEGIN CERTIFICATE-----\nTEST-CA\n-----END CERTIFICATE-----\n",
            encoding="ascii",
        )

    @classmethod
    def tearDownClass(cls) -> None:
        cls._temporary_directory.cleanup()

    def _direct_url(self, project_ref: str | None = None) -> str:
        target = project_ref or self.TARGET_REF
        return (
            f"postgresql://postgres:{self.SECRET}@db.{target}.supabase.co:"
            "5432/postgres?sslmode=verify-full"
        )

    def _pooler_url(self, *, port: int = 5432) -> str:
        return (
            f"postgresql://postgres.{self.TARGET_REF}:{self.SECRET}"
            f"@aws-0-ap-southeast-1.pooler.supabase.com:{port}"
            "/postgres?sslmode=verify-full"
        )

    def _runtime_pooler_url(
        self,
        *,
        project_ref: str | None = None,
        port: int = 6543,
    ) -> str:
        target = project_ref or self.TARGET_REF
        return (
            f"postgresql://supermega_trial_login.{target}:{self.SECRET}"
            f"@aws-0-ap-southeast-1.pooler.supabase.com:{port}"
            "/postgres?sslmode=require"
        )

    def test_activation_target_binds_direct_and_runtime_pooler_urls(self) -> None:
        self.assertEqual(
            self.validator.validate_supabase_activation_target(
                self._direct_url(),
                expected_project_ref=self.TARGET_REF,
            ),
            "direct",
        )
        self.assertEqual(
            self.validator.validate_supabase_activation_target(
                self._runtime_pooler_url(),
                expected_project_ref=self.TARGET_REF,
            ),
            "transaction_pooler",
        )
        self.assertEqual(
            self.validator.validate_supabase_activation_target(
                self._runtime_pooler_url(port=5432),
                expected_project_ref=self.TARGET_REF,
            ),
            "session_pooler",
        )

    def test_activation_target_rejects_cross_project_and_routing_overrides(self) -> None:
        cases = (
            (
                "activation_target_ref_mismatch",
                self._runtime_pooler_url(project_ref="11111111111111111111"),
            ),
            (
                "activation_target_not_supabase",
                (
                    f"postgresql://supermega_trial_login:{self.SECRET}"
                    "@database.example.invalid:5432/postgres?sslmode=require"
                ),
            ),
            (
                "activation_connection_parameter_not_allowed",
                self._runtime_pooler_url()
                + f"&host=db.{self.PRODUCTION_REF}.supabase.co",
            ),
            (
                "activation_pooler_project_binding_missing",
                self._runtime_pooler_url().replace(
                    f"supermega_trial_login.{self.TARGET_REF}",
                    "supermega_trial_login",
                ),
            ),
        )
        for expected_code, database_url in cases:
            with self.subTest(expected_code=expected_code):
                with self.assertRaises(
                    self.validator.AuditConfigurationError
                ) as caught:
                    self.validator.validate_supabase_activation_target(
                        database_url,
                        expected_project_ref=self.TARGET_REF,
                    )
                self.assertEqual(caught.exception.code, expected_code)

    def test_cross_project_storage_evidence_fails_before_any_connection(self) -> None:
        connections_opened = 0

        def unexpected_connection(_database_url):
            nonlocal connections_opened
            connections_opened += 1
            raise AssertionError("project binding must fail before connecting")

        with self.assertRaises(self.validator.AuditConfigurationError) as caught:
            self.validator.audit_supabase_activation_target(
                self._runtime_pooler_url(),
                storage_audit_database_url=self._runtime_pooler_url(
                    project_ref="11111111111111111111"
                ),
                expected_project_ref=self.TARGET_REF,
                connect_factory=unexpected_connection,
                storage_connect_factory=unexpected_connection,
            )
        self.assertEqual(caught.exception.code, "activation_target_ref_mismatch")
        self.assertEqual(connections_opened, 0)

    def _assert_configuration_error(
        self,
        expected_code: str,
        database_url: str,
        *,
        expected_ref: str | None = None,
        production_ref: str | None = None,
    ) -> None:
        with self.assertRaises(self.validator.AuditConfigurationError) as caught:
            self.validator.validate_supabase_rehearsal_target(
                database_url,
                expected_project_ref=expected_ref or self.TARGET_REF,
                production_project_ref=production_ref or self.PRODUCTION_REF,
            )
        self.assertEqual(caught.exception.code, expected_code)

    def test_direct_and_shared_session_pooler_admin_connections_are_accepted(self) -> None:
        self.assertEqual(
            self.validator.validate_supabase_rehearsal_target(
                self._direct_url(),
                expected_project_ref=self.TARGET_REF,
                production_project_ref=self.PRODUCTION_REF,
            ),
            "direct",
        )
        self.assertEqual(
            self.validator.validate_supabase_rehearsal_target(
                self._pooler_url(),
                expected_project_ref=self.TARGET_REF,
                production_project_ref=self.PRODUCTION_REF,
            ),
            "session_pooler",
        )

    def test_project_binding_and_migration_connection_fail_closed(self) -> None:
        self._assert_configuration_error(
            "rehearsal_target_is_production",
            self._direct_url(),
            production_ref=self.TARGET_REF,
        )
        self._assert_configuration_error(
            "rehearsal_target_is_production",
            self._direct_url(self.PRODUCTION_REF),
        )
        self._assert_configuration_error(
            "rehearsal_target_ref_mismatch",
            self._direct_url("11111111111111111111"),
        )
        self._assert_configuration_error(
            "rehearsal_target_not_supabase",
            (
                f"postgresql://postgres:{self.SECRET}@database.example.invalid:"
                "5432/postgres?sslmode=verify-full"
            ),
        )
        self._assert_configuration_error(
            "rehearsal_transaction_pooler_not_for_migrations",
            self._pooler_url(port=6543),
        )
        self._assert_configuration_error(
            "rehearsal_connection_parameter_not_allowed",
            self._direct_url()
            + f"&host=db.{self.PRODUCTION_REF}.supabase.co",
        )
        self._assert_configuration_error(
            "rehearsal_verify_full_required",
            self._direct_url().replace("verify-full", "require"),
        )

    def test_database_probe_is_read_only_sanitized_and_always_closed(self) -> None:
        statements: list[str] = []
        snapshot = {
            "server_version_num": 170010,
            "transaction_read_only": True,
            "tls_active": True,
            "session_role_stable": True,
            "can_create_role": True,
            "can_create_schema": True,
            "postgres_database": True,
            "private_schema_absent": True,
            "backend_role_absent": True,
        }

        class Cursor:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def execute(self, statement, _params=()):
                statements.append(str(statement))

            def fetchone(self):
                return snapshot

        class Connection:
            def __init__(self):
                self.rolled_back = False
                self.closed = False

            def cursor(self):
                return Cursor()

            def rollback(self):
                self.rolled_back = True

            def close(self):
                self.closed = True

        connection = Connection()
        report = self.validator.audit_supabase_rehearsal_target(
            self._direct_url(),
            expected_project_ref=self.TARGET_REF,
            production_project_ref=self.PRODUCTION_REF,
            ssl_root_cert_path=str(self.ca_file),
            connect_factory=lambda _database_url, _ssl_root_cert: connection,
        )

        self.assertTrue(report["ready"], report)
        self.assertEqual(report["connection_mode"], "direct")
        self.assertEqual(report["mutation_statements_executed"], 0)
        self.assertFalse(report["production_mutated"])
        self.assertFalse(report["supabase_mutated"])
        self.assertFalse(report["vercel_mutated"])
        self.assertTrue(connection.rolled_back)
        self.assertTrue(connection.closed)
        self.assertEqual(len(statements), 2)
        self.assertEqual(
            re.sub(r"\s+", " ", statements[0]).strip().lower(),
            "set transaction read only",
        )
        self.assertEqual(_first_sql_token(statements[1]), "with")
        normalized_catalog_probe = re.sub(
            r"\s+",
            " ",
            statements[1],
        ).strip()
        self.assertEqual(
            sha256(normalized_catalog_probe.encode("utf-8")).hexdigest(),
            SUPABASE_PREFLIGHT_QUERY_SHA256,
        )
        catalog_probe_without_literals = re.sub(
            r"'(?:''|[^'])*'",
            "''",
            statements[1],
        )
        self.assertNotRegex(
            catalog_probe_without_literals,
            re.compile(
                r"\b(insert|update|delete|merge|call|do|create|alter|drop|"
                r"truncate|grant|revoke|copy)\b",
                re.IGNORECASE,
            ),
        )
        serialized = json.dumps(report, sort_keys=True)
        self.assertNotIn(self.SECRET, serialized)
        self.assertEqual(report["target_project_ref"], self.TARGET_REF)
        self.assertEqual(report["tls_mode"], "verify-full")
        self.assertNotIn(self.PRODUCTION_REF, serialized)

    def test_connection_options_preserve_and_enforce_verify_full(self) -> None:
        calls: list[tuple[tuple[object, ...], dict[str, object]]] = []
        fake_psycopg = types.ModuleType("psycopg")
        fake_rows = types.ModuleType("psycopg.rows")
        fake_rows.dict_row = object()

        def connect(*args, **kwargs):
            calls.append((args, kwargs))
            return object()

        fake_psycopg.connect = connect
        with mock.patch.dict(
            sys.modules,
            {"psycopg": fake_psycopg, "psycopg.rows": fake_rows},
        ):
            self.validator._open_supabase_rehearsal_connection(
                self._direct_url(),
                str(self.ca_file),
            )
            self.validator._open_connection(self._direct_url())

        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[0][1]["sslmode"], "verify-full")
        self.assertEqual(calls[0][1]["sslrootcert"], str(self.ca_file))
        self.assertEqual(calls[1][1]["sslmode"], "verify-full")
        self.assertNotIn("sslrootcert", calls[1][1])

    def test_wrapper_and_operator_contract_do_not_apply_or_publish_anything(self) -> None:
        source = _read(SUPABASE_PREFLIGHT)
        source_lower = source.lower()
        parameter_block = source.split(")", 1)[0]
        self.assertNotIn("mandatory = $true", source_lower)
        self.assertNotIn("$ProductionProjectRef", parameter_block)
        self.assertIn("--rehearsal-preflight", source)
        self.assertIn("--env-key SUPERMEGA_REHEARSAL_ADMIN_DATABASE_URL", source)
        self.assertIn(
            "--expected-project-ref-env-key SUPERMEGA_REHEARSAL_PROJECT_REF",
            source,
        )
        self.assertIn(
            "--production-project-ref-env-key SUPERMEGA_PRODUCTION_PROJECT_REF",
            source,
        )
        self.assertIn(
            "--ssl-root-cert-env-key SUPERMEGA_SUPABASE_CA_FILE",
            source,
        )
        self.assertIn(
            "$env:SUPERMEGA_REHEARSAL_ADMIN_DATABASE_URL = $resolved",
            source,
        )
        self.assertIn("& python $ValidatorPath", source)
        self.assertIn(
            "$env:SUPERMEGA_PRODUCTION_PROJECT_REF = $TrustedProductionProjectRef",
            source,
        )
        self.assertIn(
            "$env:SUPERMEGA_SUPABASE_CA_FILE = $resolvedCertificate",
            source,
        )
        self.assertIn("status --porcelain -- package.json", source)
        self.assertIn("productionSupabaseProjectRef", source)
        self.assertNotIn("vercel env", source_lower)
        self.assertNotIn("psql", source_lower)
        self.assertNotIn(".sql", source_lower)
        self.assertNotIn("activate_supermega_database", source_lower)
        validator_invocation = next(
            line
            for line in source.splitlines()
            if "& python $ValidatorPath" in line
        )
        self.assertNotIn("$resolved", validator_invocation.lower())
        for line in source.splitlines():
            if "write-output" in line.lower():
                self.assertNotIn("$resolved", line.lower())

        package = json.loads(_read(PACKAGE_JSON))
        trusted_production_ref = package["supermega"][
            "productionSupabaseProjectRef"
        ]
        self.assertTrue(
            trusted_production_ref == ""
            or re.fullmatch(r"[a-z0-9]{20}", trusted_production_ref),
            trusted_production_ref,
        )
        self.assertEqual(
            package["scripts"]["database:supabase:preflight"],
            (
                "powershell -ExecutionPolicy Bypass -File "
                "tools/preflight_supermega_supabase.ps1"
            ),
        )
        runbook = _read(ACTIVATION_RUNBOOK)
        self.assertIn("npm run database:supabase:preflight --", runbook)
        self.assertIn("-ExpectedProjectRef <NON_PRODUCTION_PROJECT_REF>", runbook)
        self.assertIn(
            "-SslRootCertFile .tmp\\supermega-rehearsal-ca.crt",
            runbook,
        )
        self.assertNotIn("-ProductionProjectRef", runbook)
        self.assertIn("sslmode=verify-full", runbook)
        self.assertIn("transaction-mode pooler on port `6543`", runbook)

    @unittest.skipUnless(
        POWERSHELL is not None,
        "Windows PowerShell is required for the wrapper execution contract",
    )
    def test_wrapper_failure_restores_environment_and_redacts_secret(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            fixture_root = Path(temporary_directory)
            fixture_tools = fixture_root / "tools"
            fixture_tools.mkdir()
            fixture_wrapper = fixture_tools / SUPABASE_PREFLIGHT.name
            shutil.copy2(SUPABASE_PREFLIGHT, fixture_wrapper)
            shutil.copy2(VALIDATOR, fixture_tools / VALIDATOR.name)
            (fixture_root / "package.json").write_text(
                json.dumps(
                    {
                        "supermega": {
                            "productionSupabaseProjectRef": self.PRODUCTION_REF,
                        }
                    }
                ),
                encoding="utf-8",
            )
            database_url_file = fixture_root / "rehearsal-url.txt"
            database_url_file.write_text(
                (
                    f"postgresql://postgres:{self.SECRET}"
                    "@database.example.invalid:5432/postgres"
                    "?sslmode=verify-full"
                ),
                encoding="utf-8",
            )
            fixture_ca = fixture_root / "supabase-ca.crt"
            shutil.copy2(self.ca_file, fixture_ca)

            subprocess.run(
                ["git", "init", "--quiet"],
                cwd=fixture_root,
                check=True,
                capture_output=True,
                text=True,
            )
            subprocess.run(
                ["git", "add", "package.json"],
                cwd=fixture_root,
                check=True,
                capture_output=True,
                text=True,
            )
            subprocess.run(
                [
                    "git",
                    "-c",
                    "user.name=SuperMega Contract",
                    "-c",
                    "user.email=contract@supermega.invalid",
                    "commit",
                    "--quiet",
                    "-m",
                    "fixture",
                ],
                cwd=fixture_root,
                check=True,
                capture_output=True,
                text=True,
            )

            def powershell_literal(value: Path) -> str:
                return str(value).replace("'", "''")

            harness = textwrap.dedent(
                f"""
                $env:SUPERMEGA_REHEARSAL_ADMIN_DATABASE_URL = 'before-url'
                $env:SUPERMEGA_REHEARSAL_PROJECT_REF = 'before-expected'
                $env:SUPERMEGA_PRODUCTION_PROJECT_REF = 'before-production'
                $env:SUPERMEGA_SUPABASE_CA_FILE = 'before-certificate'
                $caught = ''
                try {{
                  . '{powershell_literal(fixture_wrapper)}' `
                    -DatabaseUrlFile '{powershell_literal(database_url_file)}' `
                    -ExpectedProjectRef '{self.TARGET_REF}' `
                    -SslRootCertFile '{powershell_literal(fixture_ca)}'
                }}
                catch {{
                  $caught = [string]$_.Exception.Message
                }}
                @{{
                  caught = $caught
                  url = $env:SUPERMEGA_REHEARSAL_ADMIN_DATABASE_URL
                  expected = $env:SUPERMEGA_REHEARSAL_PROJECT_REF
                  production = $env:SUPERMEGA_PRODUCTION_PROJECT_REF
                  certificate = $env:SUPERMEGA_SUPABASE_CA_FILE
                }} | ConvertTo-Json -Compress
                """
            )
            result = subprocess.run(
                [
                    str(POWERSHELL),
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-Command",
                    harness,
                ],
                cwd=fixture_root,
                capture_output=True,
                text=True,
                timeout=30,
            )

        output = result.stdout + result.stderr
        self.assertEqual(result.returncode, 0, output)
        self.assertNotIn(self.SECRET, output)
        state = _extract_json(output)
        self.assertIn("preflight failed", str(state["caught"]).lower())
        self.assertEqual(state["url"], "before-url")
        self.assertEqual(state["expected"], "before-expected")
        self.assertEqual(state["production"], "before-production")
        self.assertEqual(state["certificate"], "before-certificate")


@unittest.skipUnless(
    VALIDATOR.is_file(),
    "production gap: read-only database activation validator is missing",
)
class ValidatorBehaviorContractTests(unittest.TestCase):
    SECRET = "S3cr3t-activation-value"
    DATABASE_URL = (
        "postgresql://trial_runtime:"
        + SECRET
        + "@db.example.invalid:5432/supermega?sslmode=require"
    )

    @classmethod
    def setUpClass(cls) -> None:
        cls._temporary_directory = tempfile.TemporaryDirectory()
        cls.fake_root = Path(cls._temporary_directory.name)
        package = cls.fake_root / "psycopg"
        package.mkdir()
        (package / "rows.py").write_text("dict_row = object()\n", encoding="utf-8")
        (package / "__init__.py").write_text(
            textwrap.dedent(
                r'''
                import json
                import os
                from pathlib import Path
                import re

                TABLES = [
                    "trial_schema_meta",
                    "workspace_memberships",
                    "workspace_state",
                    "workspace_events",
                    "approval_requests",
                    "workspace_access_controls",
                ]
                RLS_TABLES = [
                    "workspace_memberships",
                    "workspace_state",
                    "workspace_events",
                    "approval_requests",
                    "workspace_access_controls",
                ]
                POLICIES = [
                    "approval_requests_access_gate",
                    "workspace_memberships_access_gate",
                    "workspace_memberships_self_read",
                    "workspace_state_access_gate",
                    "workspace_state_member_read",
                    "workspace_state_capability_insert",
                    "workspace_state_capability_update",
                    "workspace_events_member_read",
                    "workspace_events_capability_insert",
                    "workspace_events_access_gate",
                    "approval_requests_member_read",
                    "approval_requests_capability_insert",
                    "approval_requests_capability_update",
                    "workspace_access_controls_member_read",
                    "workspace_access_controls_self_serve_insert",
                    "workspace_memberships_self_serve_insert",
                    "trial_schema_meta_backend_read",
                ]
                TRIGGERS = [
                    "workspace_events_immutable",
                    "workspace_events_server_timestamp",
                    "workspace_state_version_guard",
                    "approval_requests_controlled_mutation",
                    "workspace_access_control_guard",
                ]
                TRIGGER_TYPES = {
                    "workspace_events_immutable": 27,
                    "workspace_events_server_timestamp": 7,
                    "workspace_state_version_guard": 23,
                    "approval_requests_controlled_mutation": 31,
                    "workspace_access_control_guard": 31,
                }
                FUNCTION_SOURCES = {
                    "reject_workspace_event_mutation": (
                        "begin raise exception using errcode = '55000', "
                        "message = 'workspace events are immutable'; end"
                    ),
                    "guard_workspace_state_update": (
                        "begin if tg_op = 'INSERT' then if new.version <> 1 then "
                        "raise exception using errcode = '55000', "
                        "message = 'initial workspace state version must be one'; "
                        "end if; else if new.workspace_id is distinct from old.workspace_id "
                        "or new.surface is distinct from old.surface then "
                        "raise exception using errcode = '55000', "
                        "message = 'workspace state identity is immutable'; end if; "
                        "if new.version <> old.version + 1 then "
                        "raise exception using errcode = '40001', "
                        "message = 'workspace state version must increment by one'; "
                        "end if; end if; new.updated_at := transaction_timestamp(); "
                        "return new; end"
                    ),
                    "stamp_workspace_event_insert": (
                        "begin new.created_at := transaction_timestamp(); "
                        "return new; end"
                    ),
                    "guard_approval_mutation": (
                        "begin if tg_op = 'INSERT' then "
                        "new.requested_at := transaction_timestamp(); return new; "
                        "end if; if tg_op = 'DELETE' then raise exception using "
                        "errcode = '55000', message = 'approval records cannot be deleted'; "
                        "end if; if new.approval_id is distinct from old.approval_id "
                        "or new.workspace_id is distinct from old.workspace_id "
                        "or new.command_id is distinct from old.command_id "
                        "or new.command_fingerprint is distinct from old.command_fingerprint "
                        "or new.title is distinct from old.title "
                        "or new.proposal_json is distinct from old.proposal_json "
                        "or new.evidence_refs_json is distinct from old.evidence_refs_json "
                        "or new.requested_by is distinct from old.requested_by "
                        "or new.requested_actor_kind is distinct from old.requested_actor_kind "
                        "or new.requested_at is distinct from old.requested_at "
                        "or new.decision_contract_version is distinct from old.decision_contract_version "
                        "then raise exception using errcode = '55000', "
                        "message = 'approval proposal and evidence are immutable'; end if; "
                        "if old.decision_contract_version <> 2 then raise exception using "
                        "errcode = '55000', message = 'legacy approval must be reissued under decision contract v2'; "
                        "end if; if old.status <> 'pending' or new.status not in ('approved', 'declined') "
                        "then raise exception using errcode = '55000', "
                        "message = 'approval transition must be pending to approved or declined'; end if; "
                        "if new.version <> old.version + 1 or new.decided_by is null "
                        "or new.decided_by <> btrim(new.decided_by) or new.decided_by = '' "
                        "or new.decided_actor_kind <> 'human' "
                        "or new.decision_note <> btrim(new.decision_note) "
                        "or char_length(new.decision_note) not between 1 and 500 then "
                        "raise exception using errcode = '55000', "
                        "message = 'approval decision requires a named human and nonblank note'; "
                        "end if; new.decided_at := transaction_timestamp(); return new; end"
                    ),
                    "guard_workspace_access_control": (
                        "begin if tg_op = 'INSERT' then "
                        "new.activated_at := transaction_timestamp(); "
                        "new.updated_at := transaction_timestamp(); "
                        "if new.status = 'suspended' then new.suspended_at := transaction_timestamp(); "
                        "end if; return new; end if; if tg_op = 'DELETE' then "
                        "raise exception using errcode = '55000', message = 'workspace access controls cannot be deleted'; "
                        "end if; if new.workspace_id is distinct from old.workspace_id "
                        "or new.activation_id is distinct from old.activation_id "
                        "or new.authorization_id is distinct from old.authorization_id "
                        "or new.authorization_contract is distinct from old.authorization_contract "
                        "or new.plan_digest is distinct from old.plan_digest "
                        "or new.owner_actor_id is distinct from old.owner_actor_id "
                        "or new.project_ref is distinct from old.project_ref "
                        "or new.release_commit is distinct from old.release_commit "
                        "or new.activated_at is distinct from old.activated_at then "
                        "raise exception using errcode = '55000', message = 'workspace activation identity is immutable'; "
                        "end if; if old.status <> 'active' or new.status <> 'suspended' then "
                        "raise exception using errcode = '55000', message = 'workspace access can only transition from active to suspended'; "
                        "end if; new.suspended_at := transaction_timestamp(); "
                        "new.updated_at := transaction_timestamp(); return new; end"
                    ),
                    "actor_workspace_directory": (
                        "select membership.workspace_id, membership.capabilities, "
                        "nullif(btrim(coalesce(setup_state.state_json ->> 'workspace', '')), '') "
                        "from app_private.workspace_memberships membership "
                        "join app_private.workspace_access_controls access_control "
                        "on access_control.workspace_id = membership.workspace_id "
                        "and access_control.status = 'active' "
                        "left join app_private.workspace_state setup_state "
                        "on setup_state.workspace_id = membership.workspace_id "
                        "and setup_state.surface = 'setup' "
                        "where current_setting('app.actor_kind', true) in ('human', 'service', 'agent') "
                        "and membership.actor_id = current_setting('app.actor_id', true) "
                        "and membership.actor_kind = current_setting('app.actor_kind', true) "
                        "and membership.status = 'active' order by membership.workspace_id"
                    ),
                }
                INDEXES = [
                    "trial_schema_meta_pkey",
                    "workspace_memberships_pkey",
                    "workspace_memberships_actor_directory_idx",
                    "workspace_state_pkey",
                    "workspace_events_pkey",
                    "workspace_events_workspace_id_command_id_key",
                    "workspace_events_timeline_idx",
                    "approval_requests_pkey",
                    "approval_requests_workspace_id_command_id_key",
                    "approval_requests_queue_idx",
                    "workspace_access_controls_pkey",
                    "workspace_access_controls_activation_id_key",
                    "workspace_access_controls_authorization_id_key",
                ]
                POLICY_CONTRACTS = json.loads(r"""
                {
                  "approval_requests_capability_insert": {
                    "table": "approval_requests",
                    "command": "INSERT",
                    "qual": null,
                    "with_check": "((workspace_id = current_setting('app.workspace_id', true)) and (status = 'pending') and (decision_contract_version = 2) and (requested_by = current_setting('app.actor_id', true)) and (current_setting('app.actor_kind', true) = any (array['human', 'service', 'agent'])) and (requested_actor_kind = current_setting('app.actor_kind', true)) and (exists ( select 1 from app_private.workspace_memberships membership where ((membership.workspace_id = approval_requests.workspace_id) and (membership.actor_id = current_setting('app.actor_id', true)) and (membership.actor_kind = current_setting('app.actor_kind', true)) and (membership.status = 'active') and ('approvals.request' = any (membership.capabilities))))))"
                  },
                  "approval_requests_capability_update": {
                    "table": "approval_requests",
                    "command": "UPDATE",
                    "qual": "((workspace_id = current_setting('app.workspace_id', true)) and (status = 'pending') and (decision_contract_version = 2) and (current_setting('app.actor_kind', true) = 'human') and (exists ( select 1 from app_private.workspace_memberships membership where ((membership.workspace_id = approval_requests.workspace_id) and (membership.actor_id = current_setting('app.actor_id', true)) and (membership.actor_kind = 'human') and (membership.status = 'active') and ('approvals.decide' = any (membership.capabilities))))))",
                    "with_check": "((workspace_id = current_setting('app.workspace_id', true)) and (status = any (array['approved', 'declined'])) and (decision_contract_version = 2) and (decided_by = current_setting('app.actor_id', true)) and (decided_actor_kind = 'human') and (current_setting('app.actor_kind', true) = 'human') and (decision_note = btrim(decision_note)) and ((char_length(decision_note) >= 1) and (char_length(decision_note) <= 500)) and (exists ( select 1 from app_private.workspace_memberships membership where ((membership.workspace_id = approval_requests.workspace_id) and (membership.actor_id = current_setting('app.actor_id', true)) and (membership.actor_kind = 'human') and (membership.status = 'active') and ('approvals.decide' = any (membership.capabilities))))))"
                  },
                  "approval_requests_member_read": {
                    "table": "approval_requests",
                    "command": "SELECT",
                    "qual": "((workspace_id = current_setting('app.workspace_id', true)) and (current_setting('app.actor_kind', true) = any (array['human', 'service', 'agent'])) and (exists ( select 1 from app_private.workspace_memberships membership where ((membership.workspace_id = approval_requests.workspace_id) and (membership.actor_id = current_setting('app.actor_id', true)) and (membership.actor_kind = current_setting('app.actor_kind', true)) and (membership.status = 'active') and (('approvals.read' = any (membership.capabilities)) or ('approvals.decide' = any (membership.capabilities)) or (('approvals.request' = any (membership.capabilities)) and (approval_requests.requested_by = current_setting('app.actor_id', true))))))))",
                    "with_check": null
                  },
                  "workspace_access_controls_member_read": {
                    "table": "workspace_access_controls",
                    "command": "SELECT",
                    "qual": "((workspace_id = current_setting('app.workspace_id', true)) and (exists ( select 1 from app_private.workspace_memberships membership where ((membership.workspace_id = workspace_access_controls.workspace_id) and (membership.actor_id = current_setting('app.actor_id', true)) and (membership.actor_kind = current_setting('app.actor_kind', true)) and (membership.status = 'active')))))",
                    "with_check": null
                  },
                  "workspace_events_capability_insert": {
                    "table": "workspace_events",
                    "command": "INSERT",
                    "qual": null,
                    "with_check": "((workspace_id = current_setting('app.workspace_id', true)) and (actor_id = current_setting('app.actor_id', true)) and (current_setting('app.actor_kind', true) = any (array['human', 'service', 'agent'])) and (actor_kind = current_setting('app.actor_kind', true)) and ((event_type <> 'approval.decided') or (actor_kind = 'human')) and (exists ( select 1 from app_private.workspace_memberships membership where ((membership.workspace_id = workspace_events.workspace_id) and (membership.actor_id = current_setting('app.actor_id', true)) and (membership.actor_kind = current_setting('app.actor_kind', true)) and (membership.status = 'active') and ( case when (workspace_events.event_type = 'approval.requested') then 'approvals.request' when (workspace_events.event_type = 'approval.decided') then 'approvals.decide' when (workspace_events.surface = 'company') then 'company.write' when (workspace_events.surface = 'commerce') then 'commerce.write' when (workspace_events.surface = 'production') then 'production.write' when (workspace_events.surface = 'website') then 'website.write' when (workspace_events.surface = 'setup') then 'setup.write' else null end = any (membership.capabilities))))))"
                  },
                  "workspace_events_member_read": {
                    "table": "workspace_events",
                    "command": "SELECT",
                    "qual": "((workspace_id = current_setting('app.workspace_id', true)) and (current_setting('app.actor_kind', true) = any (array['human', 'service', 'agent'])) and (exists ( select 1 from app_private.workspace_memberships membership where ((membership.workspace_id = workspace_events.workspace_id) and (membership.actor_id = current_setting('app.actor_id', true)) and (membership.actor_kind = current_setting('app.actor_kind', true)) and (membership.status = 'active') and (((workspace_events.surface = 'approvals') and (('approvals.read' = any (membership.capabilities)) or ('approvals.decide' = any (membership.capabilities)) or (('approvals.request' = any (membership.capabilities)) and (workspace_events.actor_id = current_setting('app.actor_id', true))))) or ((workspace_events.surface <> 'approvals') and (((workspace_events.surface || '.read') = any (membership.capabilities)) or ((workspace_events.surface || '.write') = any (membership.capabilities)))))))))",
                    "with_check": null
                  },
                  "workspace_memberships_self_read": {
                    "table": "workspace_memberships",
                    "command": "SELECT",
                    "qual": "((workspace_id = current_setting('app.workspace_id', true)) and (actor_id = current_setting('app.actor_id', true)) and (current_setting('app.actor_kind', true) = any (array['human', 'service', 'agent'])) and (actor_kind = current_setting('app.actor_kind', true)) and (status = 'active'))",
                    "with_check": null
                  },
                  "workspace_state_capability_insert": {
                    "table": "workspace_state",
                    "command": "INSERT",
                    "qual": null,
                    "with_check": "((workspace_id = current_setting('app.workspace_id', true)) and (updated_by = current_setting('app.actor_id', true)) and (version = 1) and (current_setting('app.actor_kind', true) = any (array['human', 'service', 'agent'])) and (exists ( select 1 from app_private.workspace_memberships membership where ((membership.workspace_id = workspace_state.workspace_id) and (membership.actor_id = current_setting('app.actor_id', true)) and (membership.actor_kind = current_setting('app.actor_kind', true)) and (membership.status = 'active') and ( case workspace_state.surface when 'company' then 'company.write' when 'commerce' then 'commerce.write' when 'production' then 'production.write' when 'website' then 'website.write' when 'setup' then 'setup.write' else null end = any (membership.capabilities))))))"
                  },
                  "workspace_state_capability_update": {
                    "table": "workspace_state",
                    "command": "UPDATE",
                    "qual": "((workspace_id = current_setting('app.workspace_id', true)) and (current_setting('app.actor_kind', true) = any (array['human', 'service', 'agent'])) and (exists ( select 1 from app_private.workspace_memberships membership where ((membership.workspace_id = workspace_state.workspace_id) and (membership.actor_id = current_setting('app.actor_id', true)) and (membership.actor_kind = current_setting('app.actor_kind', true)) and (membership.status = 'active') and ( case workspace_state.surface when 'company' then 'company.write' when 'commerce' then 'commerce.write' when 'production' then 'production.write' when 'website' then 'website.write' when 'setup' then 'setup.write' else null end = any (membership.capabilities))))))",
                    "with_check": "((workspace_id = current_setting('app.workspace_id', true)) and (updated_by = current_setting('app.actor_id', true)) and (current_setting('app.actor_kind', true) = any (array['human', 'service', 'agent'])) and (exists ( select 1 from app_private.workspace_memberships membership where ((membership.workspace_id = workspace_state.workspace_id) and (membership.actor_id = current_setting('app.actor_id', true)) and (membership.actor_kind = current_setting('app.actor_kind', true)) and (membership.status = 'active') and ( case workspace_state.surface when 'company' then 'company.write' when 'commerce' then 'commerce.write' when 'production' then 'production.write' when 'website' then 'website.write' when 'setup' then 'setup.write' else null end = any (membership.capabilities))))))"
                  },
                  "workspace_state_member_read": {
                    "table": "workspace_state",
                    "command": "SELECT",
                    "qual": "((workspace_id = current_setting('app.workspace_id', true)) and (current_setting('app.actor_kind', true) = any (array['human', 'service', 'agent'])) and (exists ( select 1 from app_private.workspace_memberships membership where ((membership.workspace_id = workspace_state.workspace_id) and (membership.actor_id = current_setting('app.actor_id', true)) and (membership.actor_kind = current_setting('app.actor_kind', true)) and (membership.status = 'active') and (((workspace_state.surface || '.read') = any (membership.capabilities)) or ((workspace_state.surface || '.write') = any (membership.capabilities)))))))",
                    "with_check": null
                  }
                }
                """)
                POLICY_CONTRACTS["workspace_access_controls_member_read"]["qual"] = (
                    "((workspace_id = current_setting('app.workspace_id', true)) "
                    "and (status = 'active'))"
                )
                def _initplan_expression(expression):
                    if expression is None:
                        return None
                    return re.sub(
                        r"current_setting\(([^)]+)\)",
                        r"( select current_setting(\1) as current_setting)",
                        expression,
                    )
                for contract in POLICY_CONTRACTS.values():
                    contract["qual"] = _initplan_expression(contract["qual"])
                    contract["with_check"] = _initplan_expression(contract["with_check"])
                POLICY_CONTRACTS.update({
                    "approval_requests_access_gate": {
                        "table": "approval_requests",
                        "command": "ALL",
                        "permissive": "RESTRICTIVE",
                        "qual": "app_private.workspace_is_active(workspace_id)",
                        "with_check": "app_private.workspace_is_active(workspace_id)",
                    },
                    "workspace_memberships_access_gate": {
                        "table": "workspace_memberships",
                        "command": "ALL",
                        "permissive": "RESTRICTIVE",
                        "qual": "app_private.workspace_is_active(workspace_id)",
                        "with_check": "app_private.workspace_is_active(workspace_id)",
                    },
                    "workspace_state_access_gate": {
                        "table": "workspace_state",
                        "command": "ALL",
                        "permissive": "RESTRICTIVE",
                        "qual": "app_private.workspace_is_active(workspace_id)",
                        "with_check": "app_private.workspace_is_active(workspace_id)",
                    },
                    "workspace_events_access_gate": {
                        "table": "workspace_events",
                        "command": "ALL",
                        "permissive": "RESTRICTIVE",
                        "qual": "app_private.workspace_is_active(workspace_id)",
                        "with_check": "app_private.workspace_is_active(workspace_id)",
                    },
                    "trial_schema_meta_backend_read": {
                        "table": "trial_schema_meta",
                        "command": "SELECT",
                        "permissive": "PERMISSIVE",
                        "qual": "(component = 'private_trial_backend'::text)",
                        "with_check": None,
                    },
                    "workspace_access_controls_self_serve_insert": {
                        "table": "workspace_access_controls",
                        "command": "INSERT",
                        "permissive": "PERMISSIVE",
                        "qual": None,
                        "with_check": "((workspace_id = ( SELECT current_setting('app.workspace_id'::text, true) AS current_setting)) AND (owner_actor_id = ( SELECT current_setting('app.actor_id'::text, true) AS current_setting)) AND (( SELECT current_setting('app.actor_kind'::text, true) AS current_setting) = 'human'::text) AND (authorization_contract = 'self_serve_claim_v1'::text) AND (status = 'active'::text))",
                    },
                    "workspace_memberships_self_serve_insert": {
                        "table": "workspace_memberships",
                        "command": "INSERT",
                        "permissive": "PERMISSIVE",
                        "qual": None,
                        "with_check": "((workspace_id = ( SELECT current_setting('app.workspace_id'::text, true) AS current_setting)) AND (actor_id = ( SELECT current_setting('app.actor_id'::text, true) AS current_setting)) AND (actor_kind = 'human'::text) AND (status = 'active'::text) AND (EXISTS ( SELECT 1 FROM app_private.workspace_access_controls ac WHERE ((ac.workspace_id = workspace_memberships.workspace_id) AND (ac.owner_actor_id = workspace_memberships.actor_id) AND (ac.status = 'active'::text) AND (ac.authorization_contract = 'self_serve_claim_v1'::text)))))",
                    },
                })
                for contract in POLICY_CONTRACTS.values():
                    contract.setdefault("permissive", "PERMISSIVE")
                INDEX_CONTRACTS = {
                    "trial_schema_meta_pkey": (
                        "trial_schema_meta", ["component"], [0], True, True, "p"
                    ),
                    "workspace_memberships_pkey": (
                        "workspace_memberships",
                        ["workspace_id", "actor_id"],
                        [0, 0],
                        True,
                        True,
                        "p",
                    ),
                    "workspace_memberships_actor_directory_idx": (
                        "workspace_memberships",
                        ["actor_id", "actor_kind", "status", "workspace_id"],
                        [0, 0, 0, 0],
                        False,
                        False,
                        None,
                    ),
                    "workspace_state_pkey": (
                        "workspace_state", ["workspace_id", "surface"], [0, 0], True, True, "p"
                    ),
                    "workspace_events_pkey": (
                        "workspace_events", ["event_id"], [0], True, True, "p"
                    ),
                    "workspace_events_workspace_id_command_id_key": (
                        "workspace_events",
                        ["workspace_id", "command_id"],
                        [0, 0],
                        True,
                        False,
                        "u",
                    ),
                    "workspace_events_timeline_idx": (
                        "workspace_events",
                        ["workspace_id", "created_at"],
                        [0, 3],
                        False,
                        False,
                        None,
                    ),
                    "approval_requests_pkey": (
                        "approval_requests", ["approval_id"], [0], True, True, "p"
                    ),
                    "approval_requests_workspace_id_command_id_key": (
                        "approval_requests",
                        ["workspace_id", "command_id"],
                        [0, 0],
                        True,
                        False,
                        "u",
                    ),
                    "approval_requests_queue_idx": (
                        "approval_requests",
                        ["workspace_id", "status", "requested_at"],
                        [0, 0, 3],
                        False,
                        False,
                        None,
                    ),
                    "workspace_access_controls_pkey": (
                        "workspace_access_controls", ["workspace_id"], [0], True, True, "p"
                    ),
                    "workspace_access_controls_activation_id_key": (
                        "workspace_access_controls", ["activation_id"], [0], True, False, "u"
                    ),
                    "workspace_access_controls_authorization_id_key": (
                        "workspace_access_controls", ["authorization_id"], [0], True, False, "u"
                    ),
                }
                ACL_ENTRIES = [
                    ("schema", "app_private", "supermega_trial_backend", "USAGE"),
                    ("table", "trial_schema_meta", "supermega_trial_backend", "SELECT"),
                    ("table", "workspace_memberships", "supermega_trial_backend", "SELECT"),
                    ("table", "workspace_memberships", "supermega_trial_backend", "INSERT"),
                    ("table", "workspace_state", "supermega_trial_backend", "SELECT"),
                    ("table", "workspace_state", "supermega_trial_backend", "INSERT"),
                    ("table", "workspace_state", "supermega_trial_backend", "UPDATE"),
                    ("table", "workspace_events", "supermega_trial_backend", "SELECT"),
                    ("table", "workspace_events", "supermega_trial_backend", "INSERT"),
                    ("table", "approval_requests", "supermega_trial_backend", "SELECT"),
                    ("table", "approval_requests", "supermega_trial_backend", "INSERT"),
                    ("table", "approval_requests", "supermega_trial_backend", "UPDATE"),
                    ("table", "workspace_access_controls", "supermega_trial_backend", "SELECT"),
                    ("table", "workspace_access_controls", "supermega_trial_backend", "INSERT"),
                    ("function", "workspace_is_active", "supermega_trial_backend", "EXECUTE"),
                    ("function", "actor_workspace_directory", "supermega_trial_backend", "EXECUTE"),
                    ("function", "supabase_session_is_active", "supermega_trial_backend", "EXECUTE"),
                ]

                class Row(dict):
                    def __getitem__(self, key):
                        if isinstance(key, int):
                            return list(self.values())[key]
                        return super().__getitem__(key)

                def _scenario():
                    return os.environ.get("SUPERMEGA_FAKE_DB_SCENARIO", "ready")

                def _snapshot(**overrides):
                    scenario = _scenario()
                    tables = list(TABLES)
                    policies = list(POLICIES)
                    triggers = list(TRIGGERS)
                    indexes = list(INDEXES)
                    if scenario == "missing_table":
                        tables.remove("approval_requests")
                    if scenario == "missing_policy":
                        policies.remove("approval_requests_capability_update")
                    if scenario == "missing_trigger":
                        triggers.remove("workspace_events_immutable")
                    if scenario == "missing_index":
                        indexes.remove("workspace_events_timeline_idx")
                    value = Row(
                        database_ready=True,
                        current_user="supermega_trial_login",
                        runtime_role="supermega_trial_login",
                        backend_role="supermega_trial_backend",
                        server_version_num=160000 if scenario == "wrong_postgres_major" else 170010,
                        role_member=True,
                        is_backend_role_member=True,
                        rolsuper=scenario == "unsafe_role",
                        rolbypassrls=scenario == "unsafe_role",
                        schema_name="app_private",
                        schema_exists=scenario != "missing_schema",
                        schema_ready=scenario != "missing_schema",
                        component="private_trial_backend",
                        schema_version=0 if scenario == "wrong_version" else 11,
                        tables=tables,
                        table_names=tables,
                        table_count=len(tables),
                        rls_tables=list(RLS_TABLES),
                        rls_count=4 if scenario == "missing_rls" else 5,
                        force_rls_count=4 if scenario == "missing_rls" else 5,
                        forbidden_grant_count=1 if scenario == "forbidden_grant" else 0,
                        forbidden_grants=[] if scenario != "forbidden_grant" else ["anon:SELECT"],
                        policies=policies,
                        policy_names=policies,
                        policy_count=len(policies),
                        triggers=triggers,
                        trigger_names=triggers,
                        trigger_count=len(triggers),
                        indexes=indexes,
                        index_names=indexes,
                        index_count=len(indexes),
                    )
                    value.update(overrides)
                    return value

                def _record(value):
                    log_path = os.environ.get("SUPERMEGA_FAKE_DB_LOG")
                    if log_path:
                        with Path(log_path).open("a", encoding="utf-8") as handle:
                            handle.write(value.replace("\n", " ") + "\n")

                def _first_token(query):
                    query = re.sub(r"/\*.*?\*/", " ", query, flags=re.S)
                    query = re.sub(r"--[^\r\n]*", " ", query)
                    match = re.search(r"[a-z]+", query.lower())
                    return match.group(0) if match else ""

                def _rows_for(query):
                    q = " ".join(str(query).lower().split())
                    scenario = _scenario()
                    unsafe_role = scenario == "unsafe_role"
                    if "server_version_num" in q:
                        return [
                            _snapshot(
                                server_version_num=(
                                    160000 if scenario == "wrong_postgres_major" else 170010
                                )
                            )
                        ]
                    if "storage_audit_transaction_read_only" in q:
                        return [
                            _snapshot(
                                storage_audit_transaction_read_only=(
                                    scenario != "storage_audit_not_read_only"
                                ),
                                storage_audit_tls_active=(
                                    scenario != "storage_audit_tls_missing"
                                ),
                            )
                        ]
                    if "transaction_read_only" in q and "dedicated_login" in q:
                        return [
                            _snapshot(
                                transaction_read_only=True,
                                tls_active=True,
                                session_role_stable=True,
                                dedicated_login=True,
                                can_login=True,
                                no_superuser=not unsafe_role,
                                no_bypassrls=not unsafe_role,
                                no_create_role=True,
                                no_create_db=True,
                                no_replication=True,
                                no_direct_acl_or_ownership=scenario not in {
                                    "runtime_direct_grant",
                                    "runtime_object_owner",
                                },
                                no_runtime_role_members=scenario != "runtime_has_member",
                                inherits_backend=True,
                                no_elevated_membership=not unsafe_role,
                            )
                        ]
                    if "role_exists" in q and "no_login" in q:
                        return [
                            _snapshot(
                                role_exists=True,
                                no_login=True,
                                no_superuser=not unsafe_role,
                                no_bypassrls=not unsafe_role,
                                no_create_role=True,
                                no_create_db=True,
                                no_replication=True,
                                no_parent_membership=scenario != "backend_parent_membership",
                                no_elevated_membership=not unsafe_role,
                                no_object_ownership=scenario != "backend_object_owner",
                            )
                        ]
                    if "dependency.deptype = 'a'" in q and "as object_kind" in q:
                        dependencies = [
                            ("schema", "app_private", 0),
                            ("relation", "app_private.trial_schema_meta", 0),
                            ("relation", "app_private.workspace_memberships", 0),
                            ("relation", "app_private.workspace_state", 0),
                            ("relation", "app_private.workspace_events", 0),
                            ("relation", "app_private.approval_requests", 0),
                            ("relation", "app_private.workspace_access_controls", 0),
                            (
                                "function",
                                "app_private.workspace_is_active(target_workspace_id text)",
                                0,
                            ),
                            ("function", "app_private.actor_workspace_directory()", 0),
                            (
                                "function",
                                "app_private.supabase_session_is_active(target_user_id uuid, target_session_id uuid)",
                                0,
                            ),
                        ]
                        if scenario == "backend_outside_grant":
                            dependencies.append(("relation", "public.sensitive_data", 0))
                        if scenario == "backend_column_grant":
                            dependencies.append(("relation", "app_private.workspace_state", 2))
                        return [
                            _snapshot(
                                object_kind=object_kind,
                                object_name=object_name,
                                objsubid=objsubid,
                            )
                            for object_kind, object_name, objsubid in dependencies
                        ]
                    if "schema_exists" in q and "schema_owned_by_connection" in q:
                        return [
                            _snapshot(
                                schema_exists=scenario != "missing_schema",
                                owner_name="runtime_login",
                            )
                        ]
                    if "schema_exists" in q and "owner_name" in q:
                        return [
                            _snapshot(
                                schema_exists=scenario != "missing_schema",
                                owner_name="runtime_login" if scenario == "wrong_owner" else "postgres",
                            )
                        ]
                    if "from pg_class c" in q and "relrowsecurity" in q:
                        rows = []
                        for table in _snapshot()["tables"]:
                            tenant_table = table in RLS_TABLES
                            metadata_table = table == "trial_schema_meta"
                            secure = (
                                metadata_table
                                and scenario != "metadata_rls_disabled"
                            ) or (
                                tenant_table
                                and not (
                                    scenario == "missing_rls"
                                    and table == "workspace_state"
                                )
                            )
                            rows.append(
                                _snapshot(
                                    table_name=table,
                                    relation_kind="r",
                                    rls_enabled=secure,
                                    rls_forced=(
                                        secure
                                        and (
                                            tenant_table
                                            or scenario == "metadata_rls_forced"
                                        )
                                    ),
                                    owner_name="runtime_login" if scenario == "wrong_owner" else "postgres",
                                )
                            )
                        return rows
                    if "trial_schema_meta" in q:
                        if scenario == "missing_schema":
                            return []
                        return [
                            _snapshot(
                                schema_version=0 if scenario == "wrong_version" else 11,
                            )
                        ]
                    if "buckets_table_exists" in q and "objects_table_exists" in q:
                        catalog_present = scenario != "missing_storage_catalog"
                        return [
                            _snapshot(
                                buckets_table_exists=catalog_present,
                                objects_table_exists=catalog_present,
                                buckets_rls_enabled=(
                                    catalog_present and scenario != "storage_buckets_rls_disabled"
                                ),
                                objects_rls_enabled=(
                                    catalog_present and scenario != "storage_objects_rls_disabled"
                                ),
                                bucket_inventory_readable=(
                                    catalog_present and scenario != "storage_bucket_inventory_denied"
                                ),
                            )
                        ]
                    if "from storage.buckets" in q:
                        return [
                            _snapshot(
                                bucket_count=(
                                    1 if scenario != "storage_invalid_bucket_inventory" else 0
                                ),
                                public_bucket_count=(
                                    1
                                    if scenario in {
                                        "public_storage_bucket",
                                        "storage_invalid_bucket_inventory",
                                    }
                                    else 0
                                ),
                            )
                        ]
                    if "from pg_policies" in q and "schemaname = 'storage'" in q:
                        policy_by_scenario = {
                            "storage_public_policy": ("PUBLIC", "true"),
                            "storage_anon_policy": ("anon", "true"),
                            "storage_authenticated_true_policy": ("authenticated", "true"),
                            "storage_cross_tenant_policy": (
                                "authenticated",
                                "bucket_id = 'private-client-files'",
                            ),
                            "storage_unallowlisted_tenant_policy": (
                                "authenticated",
                                "bucket_id = 'private-client-files' and "
                                "(storage.foldername(name))[1] = "
                                "(select auth.jwt()->'app_metadata'->>'workspace_id')",
                            ),
                        }
                        policy = policy_by_scenario.get(scenario)
                        if policy is None:
                            return []
                        role, qual = policy
                        return [
                            _snapshot(
                                table_name="objects",
                                policy_name=f"fixture_{scenario}",
                                permissive="PERMISSIVE",
                                roles=[role],
                                command="SELECT",
                                qual=qual,
                                with_check=None,
                            )
                        ]
                    if "pg_policies" in q:
                        rows = []
                        for name in _snapshot()["policies"]:
                            contract = POLICY_CONTRACTS[name]
                            qual = contract["qual"]
                            with_check = contract["with_check"]
                            if scenario == "inverted_policy" and name == "workspace_memberships_self_read":
                                qual = qual.replace(" = ", " <> ")
                            if scenario == "swapped_policy_identity" and name == "workspace_memberships_self_read":
                                qual = (
                                    qual
                                    .replace("'app.workspace_id'", "'app.__swap__'", 1)
                                    .replace("'app.actor_id'", "'app.workspace_id'", 1)
                                    .replace("'app.__swap__'", "'app.actor_id'", 1)
                                )
                            if scenario == "dead_case_policy" and name == "workspace_memberships_self_read":
                                qual = f"case when false then true else ({qual}) end"
                            if scenario == "weakened_policy" and name == "workspace_memberships_self_read":
                                qual = qual.replace("status = 'active'", "status <> 'revoked'")
                            rows.append(_snapshot(
                                table_name=contract["table"],
                                policy_name=name,
                                permissive=contract["permissive"],
                                roles=["supermega_trial_backend"],
                                command=contract["command"],
                                qual=qual,
                                with_check=with_check,
                            ))
                        if scenario == "duplicate_policy_name":
                            rows.insert(
                                0,
                                _snapshot(
                                    table_name="approval_requests",
                                    policy_name="workspace_memberships_self_read",
                                    permissive="PERMISSIVE",
                                    roles=["supermega_trial_backend"],
                                    command="SELECT",
                                    qual="true",
                                    with_check=None,
                                ),
                            )
                        if scenario == "extra_private_view":
                            rows.append(
                                _snapshot(
                                    table_name="workspace_state_leak",
                                    relation_kind="v",
                                    rls_enabled=False,
                                    rls_forced=False,
                                    owner_name="postgres",
                                )
                            )
                        return rows
                    if "pg_get_constraintdef" in q and "constraint_record.conname" in q:
                        rows = [
                            _snapshot(
                                table_name="approval_requests",
                                constraint_name="approval_requests_decision_packet_v2_check",
                                constraint_type="c",
                                validated=True,
                                definition=(
                                    "CHECK (decision_contract_version = 1 OR "
                                    "(proposal_json ->> 'contract'::text) = "
                                    "'decision_packet.v1'::text AND "
                                    "jsonb_typeof(proposal_json -> 'subject'::text) = "
                                    "'object'::text AND "
                                    "(proposal_json #>> '{subject,version}'::text[]) = '1'::text AND "
                                    "jsonb_typeof(proposal_json -> 'claims'::text) = 'array'::text AND "
                                    "jsonb_array_length(proposal_json -> 'claims'::text) >= 1 AND "
                                    "jsonb_array_length(proposal_json -> 'claims'::text) <= 20 AND "
                                    "jsonb_array_length(evidence_refs_json) >= 1 AND "
                                    "jsonb_array_length(evidence_refs_json) <= 20)"
                                ),
                            ),
                            _snapshot(
                                table_name="approval_requests",
                                constraint_name="approval_requests_terminal_decision_v2_check",
                                constraint_type="c",
                                validated=True,
                                definition=(
                                    "CHECK (decision_contract_version = 1 OR "
                                    "status = 'pending'::text AND version = 0 AND "
                                    "decided_by IS NULL AND decided_actor_kind IS NULL AND "
                                    "decided_at IS NULL AND decision_note = ''::text OR "
                                    "(status = ANY (ARRAY['approved'::text, 'declined'::text])) AND "
                                    "version = 1 AND decided_by IS NOT NULL AND "
                                    "decided_by = btrim(decided_by) AND decided_by <> ''::text AND "
                                    "decided_actor_kind = 'human'::text AND decided_at IS NOT NULL AND "
                                    "decision_note = btrim(decision_note) AND "
                                    "char_length(decision_note) >= 1 AND "
                                    "char_length(decision_note) <= 500)"
                                    if scenario != "weakened_decision_constraint"
                                    else "CHECK (decision_contract_version = 1 OR version >= 0)"
                                ),
                            ),
                            _snapshot(
                                table_name="workspace_events",
                                constraint_name="workspace_events_approval_surface_v4_check",
                                constraint_type="c",
                                validated=scenario != "unvalidated_hardening_constraint",
                                definition=(
                                    "CHECK (surface = 'approvals'::text AND "
                                    "(event_type = ANY (ARRAY['approval.requested'::text, "
                                    "'approval.decided'::text])) OR "
                                    "surface <> 'approvals'::text AND "
                                    "(event_type <> ALL (ARRAY['approval.requested'::text, "
                                    "'approval.decided'::text])))"
                                    if scenario != "weakened_hardening_constraint"
                                    else
                                    "CHECK (surface = 'approvals'::text OR "
                                    "event_type <> 'approval.decided'::text)"
                                ),
                            )
                        ]
                        if scenario == "missing_hardening_constraint":
                            rows.pop()
                        return rows
                    if "pg_trigger" in q or "information_schema.triggers" in q:
                        contracts = {
                            "workspace_events_immutable": (
                                "workspace_events",
                                "reject_workspace_event_mutation",
                            ),
                            "workspace_state_version_guard": (
                                "workspace_state",
                                "guard_workspace_state_update",
                            ),
                            "workspace_events_server_timestamp": (
                                "workspace_events",
                                "stamp_workspace_event_insert",
                            ),
                            "approval_requests_controlled_mutation": (
                                "approval_requests",
                                "guard_approval_mutation",
                            ),
                            "workspace_access_control_guard": (
                                "workspace_access_controls",
                                "guard_workspace_access_control",
                            ),
                        }
                        rows = []
                        for name in _snapshot()["triggers"]:
                            function_name = contracts[name][1]
                            trigger_type = TRIGGER_TYPES[name]
                            function_source = FUNCTION_SOURCES[function_name]
                            if scenario == "wrong_trigger_event" and name == "workspace_events_immutable":
                                trigger_type = 7
                            if scenario == "mutated_trigger_function" and name == "workspace_events_immutable":
                                function_source = "begin return old; end"
                            rows.append(_snapshot(
                                table_name=contracts[name][0],
                                trigger_name=name,
                                function_name=function_name,
                                enabled="O",
                                trigger_type=trigger_type,
                                definition=f"CREATE TRIGGER {name} BEFORE UPDATE ON app_private.{contracts[name][0]}",
                                no_when_clause=not (
                                    scenario == "trigger_when_false"
                                    and name == "approval_requests_controlled_mutation"
                                ),
                                no_arguments=not (
                                    scenario == "trigger_arguments"
                                    and name == "approval_requests_controlled_mutation"
                                ),
                                no_column_filter=True,
                                no_constraint_link=True,
                                not_deferrable=True,
                                not_initially_deferred=True,
                                no_transition_tables=True,
                                function_source=function_source,
                                owner_name="runtime_login" if scenario == "wrong_owner" else "postgres",
                                security_definer=scenario == "security_definer_trigger",
                                function_config=["search_path=pg_catalog, app_private"],
                                function_language="plpgsql",
                            ))
                        return rows
                    if "from pg_proc function_record" in q:
                        names = [
                            "reject_workspace_event_mutation",
                            "guard_workspace_state_update",
                            "stamp_workspace_event_insert",
                            "guard_approval_mutation",
                            "guard_workspace_access_control",
                            "workspace_is_active",
                            "actor_workspace_directory",
                            "supabase_session_is_active",
                        ]
                        if scenario == "extra_function":
                            names.append("unexpected_private_function")
                        rows = []
                        for name in names:
                            access_function = name == "workspace_is_active"
                            directory_function = name == "actor_workspace_directory"
                            session_function = name == "supabase_session_is_active"
                            rows.append(_snapshot(
                                function_name=name,
                                owner_name="runtime_login" if scenario == "wrong_owner" else "postgres",
                                function_kind="f",
                                identity_arguments=(
                                    "target_workspace_id text"
                                    if access_function
                                    else "target_user_id uuid, target_session_id uuid"
                                    if session_function
                                    else ""
                                ),
                                result_type="boolean" if access_function or session_function else "trigger",
                                function_source=(
                                    "select exists ( select 1 from "
                                    "app_private.workspace_access_controls access_control "
                                    "where access_control.workspace_id = target_workspace_id "
                                    "and access_control.status = 'active' )"
                                    if access_function
                                    else "select exists ( select 1 from auth.sessions as session_record "
                                    "where session_record.user_id = target_user_id "
                                    "and session_record.id = target_session_id )"
                                    if session_function
                                    else FUNCTION_SOURCES.get(name, "")
                                ),
                                security_definer=directory_function or session_function,
                                volatility="s" if session_function else "v",
                                function_config=(
                                    ['search_path=""']
                                    if session_function
                                    else ["search_path=pg_catalog, app_private"]
                                ),
                                function_language=(
                                    "sql"
                                    if access_function or directory_function or session_function
                                    else "plpgsql"
                                ),
                            ))
                            if directory_function:
                                rows[-1]["result_type"] = "TABLE(workspace_id text, capabilities text[], display_name text)"
                        return rows
                    if "pg_indexes" in q or "pg_index" in q:
                        rows = []
                        for name in _snapshot()["indexes"]:
                            (
                                table_name,
                                keys,
                                key_options,
                                unique,
                                primary,
                                constraint_type,
                            ) = INDEX_CONTRACTS[name]
                            if scenario == "wrong_index_table" and name == "workspace_events_timeline_idx":
                                table_name = "workspace_state"
                            if scenario == "wrong_index_keys" and name == "workspace_events_timeline_idx":
                                keys = ["workspace_id"]
                            if scenario == "wrong_index_order" and name == "workspace_events_timeline_idx":
                                key_options = [0, 0]
                            if scenario == "nonunique_index" and name == "workspace_events_pkey":
                                unique = False
                            rows.append(_snapshot(
                                table_name=table_name,
                                index_name=name,
                                access_method="btree",
                                is_unique=unique,
                                is_primary=primary,
                                is_valid=not (
                                    scenario == "invalid_index"
                                    and name == "workspace_events_timeline_idx"
                                ),
                                is_ready=not (
                                    scenario == "not_ready_index"
                                    and name == "workspace_events_timeline_idx"
                                ),
                                is_live=True,
                                is_immediate=True,
                                not_exclusion=True,
                                no_included_columns=not (
                                    scenario == "included_index_column"
                                    and name == "workspace_events_timeline_idx"
                                ),
                                nulls_distinct=True,
                                no_predicate=not (
                                    scenario == "predicate_index"
                                    and name == "workspace_events_timeline_idx"
                                ),
                                no_expressions=True,
                                key_columns=keys,
                                key_options=key_options,
                                constraint_type=constraint_type,
                            ))
                        return rows
                    if "pg_default_acl" in q:
                        if scenario in {"default_acl", "global_default_acl"}:
                            return [
                                _snapshot(
                                    owner_name="postgres",
                                    schema_name=(
                                        "GLOBAL"
                                        if scenario == "global_default_acl"
                                        else "app_private"
                                    ),
                                    object_type="r",
                                    grantee="authenticated",
                                    privilege_type="SELECT",
                                    is_grantable=False,
                                )
                            ]
                        return []
                    if "acl_rows" in q or "aclexplode" in q:
                        entries = list(ACL_ENTRIES)
                        if scenario == "forbidden_grant":
                            entries.append(("table", "workspace_state", "anon", "SELECT"))
                        if scenario == "backend_truncate":
                            entries.append((
                                "table",
                                "workspace_state",
                                "supermega_trial_backend",
                                "TRUNCATE",
                            ))
                        if scenario == "custom_grantee":
                            entries.append(("table", "workspace_events", "shadow_role", "SELECT"))
                        return [
                            _snapshot(
                                object_kind=object_kind,
                                object_name=object_name,
                                grantee=grantee,
                                privilege_type=privilege_type,
                                is_grantable=(
                                    scenario == "grant_option"
                                    and object_kind == "table"
                                    and object_name == "workspace_state"
                                    and privilege_type == "UPDATE"
                                ),
                            )
                            for object_kind, object_name, grantee, privilege_type in entries
                        ]
                    if "select browser.rolname as role_name" in q:
                        return [
                            _snapshot(role_name=name, inherits_backend=False)
                            for name in ("anon", "authenticated", "service_role")
                        ]
                    if "as parent_role" in q and "membership.inherit_option" in q:
                        rows = [
                            _snapshot(
                                parent_role="supermega_trial_backend",
                                admin_option=False,
                                inherit_option=True,
                                set_option=scenario == "settable_membership",
                            )
                        ]
                        if scenario == "runtime_extra_parent":
                            rows.append(
                                _snapshot(
                                    parent_role="shadow_role",
                                    admin_option=False,
                                    inherit_option=True,
                                    set_option=False,
                                )
                            )
                        return rows
                    if "as is_current_runtime" in q and "membership.inherit_option" in q:
                        rows = [
                            _snapshot(
                                is_current_runtime=True,
                                admin_option=False,
                                inherit_option=True,
                                set_option=scenario == "settable_membership",
                            )
                        ]
                        if scenario == "backend_extra_member":
                            rows.append(
                                _snapshot(
                                    is_current_runtime=False,
                                    admin_option=False,
                                    inherit_option=True,
                                    set_option=False,
                                )
                            )
                        return rows
                    if "from pg_db_role_setting setting" in q:
                        if scenario == "runtime_role_setting":
                            return [
                                _snapshot(
                                    role_name="supermega_trial_login",
                                    setting_count=1,
                                )
                            ]
                        if scenario == "backend_role_setting":
                            return [
                                _snapshot(
                                    role_name="supermega_trial_backend",
                                    setting_count=1,
                                )
                            ]
                        return []
                    return [_snapshot()]

                class Cursor:
                    def __init__(self):
                        self.rows = []
                        self.description = []

                    def __enter__(self):
                        return self

                    def __exit__(self, exc_type, exc, traceback):
                        return False

                    def execute(self, query, params=None):
                        statement = str(query)
                        token = _first_token(statement)
                        _record("SQL " + statement)
                        if token not in {"select", "with", "show", "begin", "set", "rollback"}:
                            raise RuntimeError("mutation attempted by activation validator")
                        self.rows = _rows_for(statement)
                        return self

                    def fetchone(self):
                        return self.rows[0] if self.rows else None

                    def fetchall(self):
                        return list(self.rows)

                    def __iter__(self):
                        return iter(self.rows)

                class Connection:
                    def __init__(self):
                        self.read_only = False
                        self.autocommit = False

                    def __enter__(self):
                        return self

                    def __exit__(self, exc_type, exc, traceback):
                        return False

                    def cursor(self, *args, **kwargs):
                        return Cursor()

                    def execute(self, query, params=None):
                        return Cursor().execute(query, params)

                    def rollback(self):
                        _record("ROLLBACK")

                    def commit(self):
                        _record("COMMIT")
                        raise RuntimeError("activation validator attempted to commit")

                    def close(self):
                        return None

                def connect(dsn=None, *args, **kwargs):
                    _record("CONNECT")
                    if _scenario() == "connect_error":
                        raise RuntimeError("connection failed for " + str(dsn))
                    return Connection()
                '''
            ).lstrip(),
            encoding="utf-8",
        )

    @classmethod
    def tearDownClass(cls) -> None:
        cls._temporary_directory.cleanup()

    def _run(
        self,
        *,
        scenario: str = "ready",
        database_url: str | None = DATABASE_URL,
        storage_audit_database_url: str | None = DATABASE_URL,
    ) -> tuple[subprocess.CompletedProcess[str], Path]:
        log_path = self.fake_root / f"queries-{scenario}.log"
        log_path.unlink(missing_ok=True)
        environment = {
            key: value
            for key, value in os.environ.items()
            if "DATABASE_URL" not in key.upper()
        }
        environment.update(
            {
                "PATH": "",
                "PYTHONDONTWRITEBYTECODE": "1",
                "PYTHONNOUSERSITE": "1",
                "PYTHONPATH": str(self.fake_root),
                "SUPERMEGA_FAKE_DB_LOG": str(log_path),
                "SUPERMEGA_FAKE_DB_SCENARIO": scenario,
            }
        )
        if database_url is not None:
            environment["SUPERMEGA_TEST_DATABASE_URL"] = database_url
        if storage_audit_database_url is not None:
            environment["SUPERMEGA_STORAGE_AUDIT_DATABASE_URL"] = storage_audit_database_url
        result = subprocess.run(
            [
                sys.executable,
                str(VALIDATOR),
                "--env-key",
                "SUPERMEGA_TEST_DATABASE_URL",
                "--ensure-schema",
                "--require-ready",
            ],
            cwd=ROOT,
            env=environment,
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        return result, log_path

    def assertCredentialsAreSanitized(self, result: subprocess.CompletedProcess[str]) -> None:
        combined = result.stdout + result.stderr
        self.assertNotIn(self.SECRET, combined)
        self.assertNotIn(self.DATABASE_URL, combined)
        self.assertNotIn("trial_runtime:" + self.SECRET, combined)

    def test_source_declares_complete_security_evidence_and_read_only_mode(self) -> None:
        source = _read(VALIDATOR)
        lowered = source.lower()
        for expected in (
            PRIVATE_SCHEMA,
            BACKEND_ROLE,
            "rolsuper",
            "rolbypassrls",
            "pg_shdepend",
            "pg_db_role_setting",
            "server_version_num",
            "relrowsecurity",
            "relforcerowsecurity",
            "pg_policies",
            "storage.buckets",
            "storage.objects",
            "supermega_storage_audit_database_url",
            "supermega-storage-readiness-audit",
            "bucket_inventory_readable",
            "storage_policy_surface_empty_until_allowlisted",
            "pg_trigger",
            "pg_index",
            *EXPECTED_TABLES,
            *EXPECTED_POLICIES,
            *EXPECTED_TRIGGERS,
            *EXPECTED_INDEXES,
            EVENT_SURFACE_CONSTRAINT,
            *FORBIDDEN_ROLES,
        ):
            self.assertIn(expected, lowered)
        self.assertTrue(
            any(
                marker in lowered
                for marker in (
                    "default_transaction_read_only",
                    "set transaction read only",
                    ".read_only",
                )
            ),
            "validator must force a read-only database session",
        )
        tree = ast.parse(source, filename=str(VALIDATOR))
        imported_modules = {
            alias.name
            for node in ast.walk(tree)
            if isinstance(node, ast.Import)
            for alias in node.names
        }
        imported_modules.update(
            f"{node.module}.{alias.name}"
            for node in ast.walk(tree)
            if isinstance(node, ast.ImportFrom) and node.module
            for alias in node.names
        )
        forbidden_modules = ("subprocess", "socket", "requests", "urllib.request")
        forbidden_imports = sorted(
            module
            for module in imported_modules
            if any(module == forbidden or module.startswith(forbidden + ".") for forbidden in forbidden_modules)
        )
        self.assertEqual(
            forbidden_imports,
            [],
            "validator must not import a command or alternate-network escape hatch",
        )
        dotted_calls: set[str] = set()
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            parts: list[str] = []
            value = node.func
            while isinstance(value, ast.Attribute):
                parts.append(value.attr)
                value = value.value
            if isinstance(value, ast.Name):
                parts.append(value.id)
                dotted_calls.add(".".join(reversed(parts)))
        self.assertFalse(
            any(
                call in {"os.system", "os.popen"}
                or any(call == forbidden or call.startswith(forbidden + ".") for forbidden in forbidden_modules)
                for call in dotted_calls
            ),
            "validator must not invoke a command or alternate-network escape hatch",
        )

    def test_ready_fixture_emits_complete_sanitized_evidence_without_mutation(self) -> None:
        result, log_path = self._run()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertCredentialsAreSanitized(result)
        payload = _extract_json(result.stdout + result.stderr)
        serialized = json.dumps(payload, sort_keys=True).lower()
        self.assertTrue(payload.get("ok") is True or payload.get("status") == "ready")
        self.assertEqual(payload.get("contract"), "supermega_private_trial_database_v11")
        checks = payload.get("checks")
        self.assertIsInstance(checks, dict)
        assert isinstance(checks, dict)
        expected_checks = {
            "postgres_major_supported",
            "read_only_encrypted_connection",
            "dedicated_runtime_role",
            "backend_group_role_safe",
            "backend_acl_scope_exact",
            "private_schema_present",
            "schema_version_current",
            "expected_private_tables_only",
            "metadata_table_rls",
            "tenant_tables_force_rls",
            "trusted_private_object_ownership",
            "runtime_role_membership_exact",
            "backend_membership_exact",
            "runtime_and_backend_role_settings_empty",
            "policy_contract_exact",
            "security_constraints_exact",
            "immutable_and_version_triggers_exact",
            "private_indexes_exact",
            "private_acl_exact",
            "private_default_acl_empty",
            "browser_roles_not_backend_members",
            "storage_audit_connection_read_only_encrypted",
            "storage_catalog_present",
            "storage_tables_rls_enabled",
            "storage_bucket_inventory_readable",
            "storage_public_buckets_absent",
            "storage_policy_surface_empty_until_allowlisted",
        }
        self.assertTrue(expected_checks.issubset(checks))
        self.assertTrue(all(checks[name] is True for name in expected_checks), checks)

        evidence = payload.get("evidence")
        self.assertIsInstance(evidence, dict)
        assert isinstance(evidence, dict)
        self.assertEqual(
            evidence.get("engine"),
            {
                "postgres_major": 17,
                "installed_extensions": [],
                "unsupported_extensions": [],
            },
        )
        self.assertEqual(
            evidence.get("schema"),
            {
                "name": PRIVATE_SCHEMA,
                "component": "private_trial_backend",
                "version": 11,
            },
        )
        self.assertEqual(
            evidence.get("role"),
            {
                "backend_group": BACKEND_ROLE,
                "dedicated_login_verified": True,
                "settings_entries": 0,
            },
        )
        self.assertEqual(evidence.get("tables"), sorted(EXPECTED_TABLES))
        self.assertEqual(
            evidence.get("rls"),
            {
                "metadata_table": {
                    "enabled": True,
                    "forced": False,
                },
                "forced_tables": sorted(RLS_TABLES),
                "required_tables": sorted(RLS_TABLES),
            },
        )
        self.assertEqual(
            evidence.get("grant"),
            {
                "runtime_acl_entries": 17,
                "expected_runtime_acl_entries": 17,
                "default_acl_entries": 0,
            },
        )
        self.assertEqual(evidence.get("policies"), sorted(EXPECTED_POLICIES))
        self.assertEqual(
            evidence.get("hardening_constraints"),
            [
                "approval_requests_decision_packet_v2_check",
                "approval_requests_terminal_decision_v2_check",
                EVENT_SURFACE_CONSTRAINT,
            ],
        )
        self.assertEqual(evidence.get("triggers"), sorted(EXPECTED_TRIGGERS))
        self.assertEqual(evidence.get("indexes"), sorted(EXPECTED_INDEXES))
        self.assertEqual(
            evidence.get("storage"),
            {
                "baseline": "private_server_side_only",
                "tables": ["buckets", "objects"],
                "audit_connection_read_only_encrypted": True,
                "bucket_inventory_readable": True,
                "bucket_count": 1,
                "public_bucket_count": 0,
                "policy_count": 0,
            },
        )

        statements = log_path.read_text(encoding="utf-8").splitlines()
        self.assertTrue(any(line == "CONNECT" for line in statements))
        self.assertNotIn("COMMIT", statements)
        for line in statements:
            if not line.startswith("SQL "):
                continue
            self.assertIn(
                _first_sql_token(line[4:]),
                {"select", "with", "show", "begin", "set", "rollback"},
                f"validator attempted a mutating statement: {line}",
            )

        detailed_evidence = json.dumps(evidence, sort_keys=True).lower()
        expected_evidence_names = (
            PRIVATE_SCHEMA,
            BACKEND_ROLE,
            *EXPECTED_TABLES,
            *EXPECTED_POLICIES,
            *EXPECTED_TRIGGERS,
            *EXPECTED_INDEXES,
            EVENT_SURFACE_CONSTRAINT,
        )
        missing_names = [name for name in expected_evidence_names if name not in detailed_evidence]
        self.assertEqual(
            missing_names,
            [],
            "sanitized evidence must name every expected schema, role, table, policy, trigger, and index",
        )
        for sensitive_fragment in (self.SECRET, "trial_runtime", "db.example.invalid"):
            self.assertNotIn(sensitive_fragment.lower(), serialized)

    def test_every_missing_security_evidence_fails_closed(self) -> None:
        scenarios = (
            "wrong_postgres_major",
            "unsafe_role",
            "backend_parent_membership",
            "backend_object_owner",
            "backend_outside_grant",
            "backend_column_grant",
            "runtime_direct_grant",
            "runtime_object_owner",
            "runtime_has_member",
            "wrong_owner",
            "extra_function",
            "runtime_extra_parent",
            "backend_extra_member",
            "settable_membership",
            "runtime_role_setting",
            "backend_role_setting",
            "missing_schema",
            "wrong_version",
            "missing_table",
            "extra_private_view",
            "missing_rls",
            "metadata_rls_disabled",
            "metadata_rls_forced",
            "missing_storage_catalog",
            "storage_audit_not_read_only",
            "storage_audit_tls_missing",
            "storage_buckets_rls_disabled",
            "storage_objects_rls_disabled",
            "storage_bucket_inventory_denied",
            "storage_invalid_bucket_inventory",
            "public_storage_bucket",
            "storage_public_policy",
            "storage_anon_policy",
            "storage_authenticated_true_policy",
            "storage_cross_tenant_policy",
            "storage_unallowlisted_tenant_policy",
            "forbidden_grant",
            "backend_truncate",
            "custom_grantee",
            "grant_option",
            "default_acl",
            "global_default_acl",
            "missing_policy",
            "duplicate_policy_name",
            "inverted_policy",
            "swapped_policy_identity",
            "dead_case_policy",
            "weakened_policy",
            "missing_hardening_constraint",
            "unvalidated_hardening_constraint",
            "weakened_hardening_constraint",
            "weakened_decision_constraint",
            "missing_trigger",
            "wrong_trigger_event",
            "mutated_trigger_function",
            "trigger_when_false",
            "trigger_arguments",
            "security_definer_trigger",
            "missing_index",
            "wrong_index_table",
            "wrong_index_keys",
            "wrong_index_order",
            "nonunique_index",
            "invalid_index",
            "not_ready_index",
            "predicate_index",
            "included_index_column",
        )
        for scenario in scenarios:
            with self.subTest(scenario=scenario):
                result, _ = self._run(scenario=scenario)
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertCredentialsAreSanitized(result)
                payload = _extract_json(result.stdout + result.stderr)
                self.assertFalse(
                    payload.get("ready") is True or payload.get("status") == "ready",
                    payload,
                )

    def test_missing_or_invalid_url_fails_before_connecting(self) -> None:
        for label, database_url in (
            ("missing", None),
            ("invalid", "https://trial_runtime:S3cr3t-activation-value@example.invalid/db"),
        ):
            with self.subTest(case=label):
                result, log_path = self._run(database_url=database_url)
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertCredentialsAreSanitized(result)
                if log_path.exists():
                    self.assertNotIn("CONNECT", log_path.read_text(encoding="utf-8"))

    def test_missing_or_invalid_storage_audit_url_fails_before_connecting(self) -> None:
        for label, storage_audit_database_url in (
            ("missing", None),
            (
                "invalid",
                "https://trial_runtime:S3cr3t-activation-value@example.invalid/db",
            ),
        ):
            with self.subTest(case=label):
                result, log_path = self._run(
                    storage_audit_database_url=storage_audit_database_url
                )
                self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertCredentialsAreSanitized(result)
                if log_path.exists():
                    self.assertNotIn("CONNECT", log_path.read_text(encoding="utf-8"))

    def test_connection_errors_are_redacted_and_fail_closed(self) -> None:
        result, _ = self._run(scenario="connect_error")
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertCredentialsAreSanitized(result)
        payload = _extract_json(result.stdout + result.stderr)
        self.assertFalse(payload.get("ready") is True or payload.get("status") == "ready")


if __name__ == "__main__":
    unittest.main()
