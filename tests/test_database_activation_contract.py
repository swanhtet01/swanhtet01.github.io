from __future__ import annotations

import ast
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import textwrap
import unittest


ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = ROOT / "tools" / "validate_supermega_database_url.py"
ACTIVATOR = ROOT / "tools" / "activate_supermega_database.ps1"
TRIAL_STORE = ROOT / "supermega_runtime" / "trial_store.py"
MIGRATION = (
    ROOT
    / "supabase"
    / "migrations"
    / "20260722005134_private_trial_backend_foundation.sql"
)

PRIVATE_SCHEMA = "app_private"
BACKEND_ROLE = "supermega_trial_backend"
EXPECTED_TABLES = (
    "trial_schema_meta",
    "workspace_memberships",
    "workspace_state",
    "workspace_events",
    "approval_requests",
)
RLS_TABLES = (
    "workspace_memberships",
    "workspace_state",
    "workspace_events",
    "approval_requests",
)
EXPECTED_POLICIES = (
    "workspace_memberships_self_read",
    "workspace_state_member_read",
    "workspace_state_capability_insert",
    "workspace_state_capability_update",
    "workspace_events_member_read",
    "workspace_events_capability_insert",
    "approval_requests_member_read",
    "approval_requests_capability_insert",
    "approval_requests_capability_update",
)
EXPECTED_TRIGGERS = (
    "workspace_events_immutable",
    "workspace_state_version_guard",
    "approval_requests_controlled_mutation",
)
EXPECTED_INDEXES = (
    "trial_schema_meta_pkey",
    "workspace_memberships_pkey",
    "workspace_state_pkey",
    "workspace_events_pkey",
    "workspace_events_workspace_id_command_id_key",
    "workspace_events_timeline_idx",
    "approval_requests_pkey",
    "approval_requests_workspace_id_command_id_key",
    "approval_requests_queue_idx",
)
EXPLICIT_INDEXES = (
    "workspace_events_timeline_idx",
    "approval_requests_queue_idx",
)
FORBIDDEN_ROLES = ("public", "anon", "authenticated", "service_role")


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _normalized_sql(path: Path = MIGRATION) -> str:
    return re.sub(r"\s+", " ", _read(path).lower()).strip()


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
        self.assertNotIn("security definer", sql)
        self.assertGreaterEqual(sql.count("security invoker"), 3)


class ActivationWrapperContractTests(unittest.TestCase):
    def test_activation_wrapper_requires_the_read_only_validator(self) -> None:
        self.assertTrue(
            VALIDATOR.is_file(),
            "production gap: tools/validate_supermega_database_url.py is missing",
        )

    def test_validation_precedes_every_vercel_mutation(self) -> None:
        source = _read(ACTIVATOR)
        validator_position = source.index("tools/validate_supermega_database_url.py")
        exit_guard_position = source.index("if ($LASTEXITCODE -ne 0)", validator_position)
        validate_only_position = source.index("if ($ValidateOnly)", exit_guard_position)
        vercel_position = source.index("vercel env ", validate_only_position)
        self.assertLess(validator_position, exit_guard_position)
        self.assertLess(exit_guard_position, validate_only_position)
        self.assertLess(validate_only_position, vercel_position)
        self.assertIn("--env-key SUPERMEGA_DATABASE_URL", source)
        self.assertIn("--ensure-schema", source)
        self.assertIn("--require-ready", source)
        self.assertIn("Vercel was not changed", source)

    def test_wrapper_does_not_forward_or_print_the_database_url(self) -> None:
        source = _read(ACTIVATOR)
        validator_line = next(
            line
            for line in source.splitlines()
            if "tools/validate_supermega_database_url.py" in line
        )
        self.assertNotIn("$resolved", validator_line.lower())
        for line in source.splitlines():
            if "write-output" in line.lower():
                self.assertNotIn("$resolved", line.lower())
        self.assertIn("$env:SUPERMEGA_DATABASE_URL = $resolved", source)
        self.assertIn("finally", source.lower())
        self.assertIn("Remove-Item Env:SUPERMEGA_DATABASE_URL", source)

    def test_runtime_readiness_queries_are_non_mutating(self) -> None:
        tree = ast.parse(_read(TRIAL_STORE), filename=str(TRIAL_STORE))
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
                ]
                RLS_TABLES = [
                    "workspace_memberships",
                    "workspace_state",
                    "workspace_events",
                    "approval_requests",
                ]
                POLICIES = [
                    "workspace_memberships_self_read",
                    "workspace_state_member_read",
                    "workspace_state_capability_insert",
                    "workspace_state_capability_update",
                    "workspace_events_member_read",
                    "workspace_events_capability_insert",
                    "approval_requests_member_read",
                    "approval_requests_capability_insert",
                    "approval_requests_capability_update",
                ]
                TRIGGERS = [
                    "workspace_events_immutable",
                    "workspace_state_version_guard",
                    "approval_requests_controlled_mutation",
                ]
                INDEXES = [
                    "trial_schema_meta_pkey",
                    "workspace_memberships_pkey",
                    "workspace_state_pkey",
                    "workspace_events_pkey",
                    "workspace_events_workspace_id_command_id_key",
                    "workspace_events_timeline_idx",
                    "approval_requests_pkey",
                    "approval_requests_workspace_id_command_id_key",
                    "approval_requests_queue_idx",
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
                        role_member=True,
                        is_backend_role_member=True,
                        rolsuper=scenario == "unsafe_role",
                        rolbypassrls=scenario == "unsafe_role",
                        schema_name="app_private",
                        schema_exists=scenario != "missing_schema",
                        schema_ready=scenario != "missing_schema",
                        component="private_trial_backend",
                        schema_version=0 if scenario == "wrong_version" else 1,
                        tables=tables,
                        table_names=tables,
                        table_count=len(tables),
                        rls_tables=list(RLS_TABLES),
                        rls_count=3 if scenario == "missing_rls" else 4,
                        force_rls_count=3 if scenario == "missing_rls" else 4,
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
                                no_elevated_membership=not unsafe_role,
                            )
                        ]
                    if "schema_exists" in q and "schema_owned_by_connection" in q:
                        return [
                            _snapshot(
                                schema_exists=scenario != "missing_schema",
                                schema_owned_by_connection=False,
                            )
                        ]
                    if "from pg_class c" in q and "relrowsecurity" in q:
                        rows = []
                        for table in _snapshot()["tables"]:
                            tenant_table = table in RLS_TABLES
                            secure = tenant_table and not (
                                scenario == "missing_rls" and table == "workspace_state"
                            )
                            rows.append(
                                _snapshot(
                                    table_name=table,
                                    rls_enabled=secure,
                                    rls_forced=secure,
                                    owned_by_connection=False,
                                )
                            )
                        return rows
                    if "trial_schema_meta" in q:
                        if scenario == "missing_schema":
                            return []
                        return [
                            _snapshot(
                                schema_version=0 if scenario == "wrong_version" else 1,
                            )
                        ]
                    if "pg_policies" in q:
                        contracts = {
                            "workspace_memberships_self_read": (
                                "workspace_memberships",
                                "SELECT",
                                ("app.workspace_id", "app.actor_id", "active"),
                                (),
                            ),
                            "workspace_state_member_read": (
                                "workspace_state",
                                "SELECT",
                                ("app.workspace_id", "app.actor_id", "workspace_memberships", "active"),
                                (),
                            ),
                            "workspace_state_capability_insert": (
                                "workspace_state",
                                "INSERT",
                                (),
                                (
                                    "app.workspace_id",
                                    "app.actor_id",
                                    "workspace_memberships",
                                    "command.write",
                                    "shop.write",
                                    "plant.write",
                                    "setup.write",
                                ),
                            ),
                            "workspace_state_capability_update": (
                                "workspace_state",
                                "UPDATE",
                                ("app.workspace_id", "app.actor_id", "workspace_memberships"),
                                (
                                    "app.workspace_id",
                                    "app.actor_id",
                                    "workspace_memberships",
                                    "command.write",
                                    "shop.write",
                                    "plant.write",
                                    "setup.write",
                                ),
                            ),
                            "workspace_events_member_read": (
                                "workspace_events",
                                "SELECT",
                                ("app.workspace_id", "app.actor_id", "workspace_memberships", "active"),
                                (),
                            ),
                            "workspace_events_capability_insert": (
                                "workspace_events",
                                "INSERT",
                                (),
                                (
                                    "app.workspace_id",
                                    "app.actor_id",
                                    "workspace_memberships",
                                    "command.write",
                                    "shop.write",
                                    "plant.write",
                                    "setup.write",
                                    "approvals.request",
                                    "approvals.decide",
                                ),
                            ),
                            "approval_requests_member_read": (
                                "approval_requests",
                                "SELECT",
                                ("app.workspace_id", "app.actor_id", "workspace_memberships", "active"),
                                (),
                            ),
                            "approval_requests_capability_insert": (
                                "approval_requests",
                                "INSERT",
                                (),
                                ("app.workspace_id", "app.actor_id", "workspace_memberships", "approvals.request"),
                            ),
                            "approval_requests_capability_update": (
                                "approval_requests",
                                "UPDATE",
                                ("app.workspace_id", "app.actor_id", "workspace_memberships", "approvals.decide"),
                                ("app.workspace_id", "app.actor_id", "workspace_memberships", "approvals.decide"),
                            ),
                        }
                        return [
                            _snapshot(
                                table_name=contracts[name][0],
                                policy_name=name,
                                permissive="PERMISSIVE",
                                roles=["supermega_trial_backend"],
                                command=contracts[name][1],
                                qual=" ".join(contracts[name][2]) if contracts[name][2] else None,
                                with_check=" ".join(contracts[name][3]) if contracts[name][3] else None,
                            )
                            for name in _snapshot()["policies"]
                        ]
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
                            "approval_requests_controlled_mutation": (
                                "approval_requests",
                                "guard_approval_mutation",
                            ),
                        }
                        return [
                            _snapshot(
                                table_name=contracts[name][0],
                                trigger_name=name,
                                function_name=contracts[name][1],
                                enabled="O",
                                definition=f"CREATE TRIGGER {name} BEFORE UPDATE ON app_private.{contracts[name][0]}",
                            )
                            for name in _snapshot()["triggers"]
                        ]
                    if "pg_indexes" in q or "pg_index" in q:
                        return [
                            _snapshot(
                                table_name="workspace_state",
                                index_name=name,
                                definition=f"CREATE INDEX {name} ON app_private.workspace_state (workspace_id)",
                            )
                            for name in _snapshot()["indexes"]
                        ]
                    if "acl_rows" in q or "aclexplode" in q:
                        if scenario == "forbidden_grant":
                            return [
                                _snapshot(
                                    object_kind="table",
                                    object_name="workspace_state",
                                    grantee="anon",
                                    privilege_type="SELECT",
                                )
                            ]
                        return []
                    if "select browser.rolname as role_name" in q:
                        return [
                            _snapshot(role_name=name, inherits_backend=False)
                            for name in ("anon", "authenticated", "service_role")
                        ]
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
            "relrowsecurity",
            "relforcerowsecurity",
            "pg_policies",
            "pg_trigger",
            "pg_indexes",
            *EXPECTED_TABLES,
            *EXPECTED_POLICIES,
            *EXPECTED_TRIGGERS,
            *EXPECTED_INDEXES,
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
        checks = payload.get("checks")
        self.assertIsInstance(checks, dict)
        assert isinstance(checks, dict)
        expected_checks = {
            "read_only_encrypted_connection",
            "dedicated_runtime_role",
            "backend_group_role_safe",
            "private_schema_present",
            "schema_version_current",
            "expected_private_tables_only",
            "tenant_tables_force_rls",
            "runtime_role_owns_no_private_objects",
            "policy_contract_exact",
            "immutable_and_version_triggers_exact",
            "required_policy_indexes_present",
            "browser_and_public_acl_empty",
            "browser_roles_not_backend_members",
        }
        self.assertTrue(expected_checks.issubset(checks))
        self.assertTrue(all(checks[name] is True for name in expected_checks), checks)

        evidence = payload.get("evidence")
        self.assertIsInstance(evidence, dict)
        assert isinstance(evidence, dict)
        self.assertEqual(
            evidence.get("schema"),
            {
                "name": PRIVATE_SCHEMA,
                "component": "private_trial_backend",
                "version": 1,
            },
        )
        self.assertEqual(
            evidence.get("role"),
            {
                "backend_group": BACKEND_ROLE,
                "dedicated_login_verified": True,
            },
        )
        self.assertEqual(evidence.get("tables"), sorted(EXPECTED_TABLES))
        self.assertEqual(
            evidence.get("rls"),
            {
                "forced_tables": sorted(RLS_TABLES),
                "required_tables": sorted(RLS_TABLES),
            },
        )
        self.assertEqual(
            evidence.get("grant"),
            {
                "forbidden_roles": ["PUBLIC", "anon", "authenticated", "service_role"],
                "disallowed_acl_entries": 0,
            },
        )
        self.assertEqual(evidence.get("policies"), sorted(EXPECTED_POLICIES))
        self.assertEqual(evidence.get("triggers"), sorted(EXPECTED_TRIGGERS))
        self.assertEqual(evidence.get("indexes"), sorted(EXPECTED_INDEXES))

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
            "unsafe_role",
            "missing_schema",
            "wrong_version",
            "missing_table",
            "missing_rls",
            "forbidden_grant",
            "missing_policy",
            "missing_trigger",
            "missing_index",
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

    def test_connection_errors_are_redacted_and_fail_closed(self) -> None:
        result, _ = self._run(scenario="connect_error")
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertCredentialsAreSanitized(result)
        payload = _extract_json(result.stdout + result.stderr)
        self.assertFalse(payload.get("ready") is True or payload.get("status") == "ready")


if __name__ == "__main__":
    unittest.main()
