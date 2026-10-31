"""Fail-closed source contract for private trial schema v14.

v14 extends the historical v13 catalog with server-authoritative Shop
correction lineage and consumption projections.  This module can validate the
reviewed migration without PostgreSQL.  Exact PostgreSQL catalog and policy
fingerprints deliberately remain empty until they are captured from an
authorized disposable PostgreSQL 17 run; :func:`extend_contract` refuses to
label a target v14 until those reviewed pins are supplied.
"""

from hashlib import sha256
from pathlib import Path
import re
from typing import Mapping

from tools import private_trial_v13_contract as v13


ROOT = Path(__file__).resolve().parents[1]
PROFILE = "v14-shop-correction"
CONTRACT = "supermega_private_trial_database_v14_shop_correction_v1"
SCHEMA_VERSION = 14
MIGRATION = "20261024090000_private_trial_backend_v14_shop_correction_consumption.sql"
MIGRATION_SHA256 = "a9c290ff1209467fc3d5b4d91a102394a55080c9f40930195b8cb36174c10db6"

TABLES = frozenset({"shop_correction_lineages", "shop_correction_consumptions"})
FUNCTIONS = {
    "guard_shop_correction_lineage": ("", "trigger"),
    "guard_shop_correction_consumption": ("", "trigger"),
}
POLICIES = {
    "shop_correction_lineages_owner_read": ("shop_correction_lineages", "SELECT"),
    "shop_correction_lineages_owner_insert": ("shop_correction_lineages", "INSERT"),
    "shop_correction_lineages_owner_update": ("shop_correction_lineages", "UPDATE"),
    "shop_correction_consumptions_owner_read": ("shop_correction_consumptions", "SELECT"),
    "shop_correction_consumptions_owner_insert": ("shop_correction_consumptions", "INSERT"),
}
TRIGGERS = {
    "shop_correction_lineage_guard": (
        "shop_correction_lineages",
        "guard_shop_correction_lineage",
        31,
    ),
    "shop_correction_consumption_guard": (
        "shop_correction_consumptions",
        "guard_shop_correction_consumption",
        31,
    ),
}
INDEX_CONTRACT = {
    "shop_correction_lineages_pkey": {
        "table": "shop_correction_lineages",
        "keys": ("workspace_id", "lineage_id"),
        "options": (0, 0),
        "unique": True,
        "primary": True,
        "constraint": "p",
    },
    "shop_correction_lineage_identity_epoch_key": {
        "table": "shop_correction_lineages",
        "keys": ("workspace_id", "lineage_id", "lineage_epoch"),
        "options": (0, 0, 0),
        "unique": True,
        "primary": False,
        "constraint": "u",
    },
    "shop_correction_lineage_epoch_key": {
        "table": "shop_correction_lineages",
        "keys": ("workspace_id", "lineage_epoch"),
        "options": (0, 0),
        "unique": True,
        "primary": False,
        "constraint": "u",
    },
    "shop_correction_lineage_activation_key": {
        "table": "shop_correction_lineages",
        "keys": ("workspace_id", "activation_request_id"),
        "options": (0, 0),
        "unique": True,
        "primary": False,
        "constraint": "u",
    },
    "shop_correction_one_active_lineage_idx": {
        "table": "shop_correction_lineages",
        "keys": ("workspace_id",),
        "options": (0,),
        "unique": True,
        "primary": False,
        "constraint": None,
        "predicate_expression": "(superseded_at IS NULL)",
    },
    "shop_correction_consumptions_pkey": {
        "table": "shop_correction_consumptions",
        "keys": ("workspace_id", "consumption_id"),
        "options": (0, 0),
        "unique": True,
        "primary": True,
        "constraint": "p",
    },
}
for name, keys in (
    ("shop_correction_consumption_request_key", ("workspace_id", "consumption_request_id")),
    ("shop_correction_consumption_receipt_key", ("workspace_id", "authorization_receipt_id")),
    ("shop_correction_consumption_command_key", ("workspace_id", "command_id")),
    (
        "shop_correction_consumption_ordinal_key",
        ("workspace_id", "lineage_id", "consumption_ordinal"),
    ),
    ("shop_correction_consumption_history_key", ("workspace_id", "history_digest")),
):
    INDEX_CONTRACT[name] = {
        "table": "shop_correction_consumptions",
        "keys": keys,
        "options": (0,) * len(keys),
        "unique": True,
        "primary": False,
        "constraint": "u",
    }

FOREIGN_KEY_CONTRACT = {
    "shop_correction_lineage_previous_fkey": {
        "table": "shop_correction_lineages",
        "keys": ("workspace_id", "previous_lineage_id", "previous_lineage_epoch"),
        "references_table": "shop_correction_lineages",
        "references_keys": ("workspace_id", "lineage_id", "lineage_epoch"),
    },
    "shop_correction_consumption_lineage_fkey": {
        "table": "shop_correction_consumptions",
        "keys": ("workspace_id", "lineage_id"),
        "references_table": "shop_correction_lineages",
        "references_keys": ("workspace_id", "lineage_id"),
    },
    "shop_correction_consumption_lineage_epoch_fkey": {
        "table": "shop_correction_consumptions",
        "keys": ("workspace_id", "lineage_id", "lineage_epoch"),
        "references_table": "shop_correction_lineages",
        "references_keys": ("workspace_id", "lineage_id", "lineage_epoch"),
    },
}

ROLE = "supermega_trial_backend"
NON_OWNER_ACL = frozenset(
    {
        ("table", "shop_correction_lineages", ROLE, privilege, False)
        for privilege in ("SELECT", "INSERT", "UPDATE")
    }
    | {
        ("table", "shop_correction_consumptions", ROLE, privilege, False)
        for privilege in ("SELECT", "INSERT")
    }
)
ACL_DEPENDENCIES = frozenset(
    {
        ("relation", "app_private.shop_correction_lineages", 0),
        ("relation", "app_private.shop_correction_consumptions", 0),
        ("function", "app_private.guard_shop_correction_lineage()", 0),
        ("function", "app_private.guard_shop_correction_consumption()", 0),
    }
)

# These must come from a reviewed PostgreSQL 17 catalog capture. They are not
# derived from the target being audited and must never be guessed from SQL.
CATALOG_PINS: Mapping[str, str] = {}
POLICY_FINGERPRINTS: Mapping[str, Mapping[str, str | None]] = {}


def migration_source() -> str:
    source = (ROOT / "supabase" / "migrations" / MIGRATION).read_text(
        encoding="utf-8"
    )
    if sha256(source.encode()).hexdigest() != MIGRATION_SHA256:
        raise ValueError("v14_contract_migration_source_mismatch")
    return source


def source_contract() -> dict[str, object]:
    """Return bounded facts only after validating the exact reviewed SQL."""

    source = migration_source()
    normalized = " ".join(source.lower().split())
    required = (
        "schema_version = 13",
        "set schema_version = 14",
        "create table app_private.shop_correction_lineages",
        "create table app_private.shop_correction_consumptions",
        "alter table app_private.shop_correction_lineages force row level security",
        "alter table app_private.shop_correction_consumptions force row level security",
        "create unique index shop_correction_one_active_lineage_idx",
        "shop correction consumptions are immutable",
        "transaction_timestamp()",
        "grant select, insert, update on app_private.shop_correction_lineages",
        "grant select, insert on app_private.shop_correction_consumptions",
        "constraint shop_correction_lineage_identity_epoch_key unique",
        "constraint shop_correction_lineage_epoch_key unique",
        "constraint shop_correction_lineage_activation_key unique",
        "constraint shop_correction_lineage_previous_fkey foreign key",
        "constraint shop_correction_consumption_request_key unique",
        "constraint shop_correction_consumption_receipt_key unique",
        "constraint shop_correction_consumption_command_key unique",
        "constraint shop_correction_consumption_ordinal_key unique",
        "constraint shop_correction_consumption_history_key unique",
        "constraint shop_correction_consumption_lineage_fkey foreign key",
        "constraint shop_correction_consumption_lineage_epoch_fkey foreign key",
    )
    if any(value not in normalized for value in required):
        raise ValueError("v14_contract_migration_shape_mismatch")
    if "for all to supermega_trial_backend" in normalized or "for delete" in normalized:
        raise ValueError("v14_contract_delete_policy_forbidden")
    for name, (table, command) in POLICIES.items():
        pattern = (
            rf"create policy {re.escape(name)} on app_private\.{re.escape(table)} "
            rf"for {command.lower()} to supermega_trial_backend"
        )
        if re.search(pattern, normalized) is None:
            raise ValueError("v14_contract_policy_source_missing")
    function_sources: dict[str, str] = {}
    for function in FUNCTIONS:
        bodies = re.findall(
            rf"create function app_private\.{re.escape(function)}\(\).*?"
            rf"as \$function\$(.*?)\$function\$;",
            source,
            re.S | re.I,
        )
        if len(bodies) != 1:
            raise ValueError("v14_contract_trigger_source_missing")
        function_sources[function] = bodies[0]
    return {
        "profile": PROFILE,
        "contract": CONTRACT,
        "schema_version": SCHEMA_VERSION,
        "migration": MIGRATION,
        "migration_sha256": MIGRATION_SHA256,
        "tables": TABLES,
        "functions": FUNCTIONS,
        "policies": POLICIES,
        "triggers": TRIGGERS,
        "function_sources": function_sources,
        "indexes": INDEX_CONTRACT,
        "foreign_keys": FOREIGN_KEY_CONTRACT,
        "non_owner_acl": NON_OWNER_ACL,
        "acl_dependencies": ACL_DEPENDENCIES,
    }


def _reviewed_catalog_pins() -> tuple[Mapping[str, str], Mapping[str, Mapping[str, str | None]]]:
    required_catalog = {
        "extension_columns_exact",
        "extension_constraints_exact",
        "extension_functions_exact",
        "extension_policies_exact",
    }
    if set(CATALOG_PINS) != required_catalog or any(
        re.fullmatch(r"[0-9a-f]{64}", value) is None
        for value in CATALOG_PINS.values()
    ):
        raise ValueError("v14_contract_catalog_pins_not_recorded")
    if set(POLICY_FINGERPRINTS) != set(POLICIES):
        raise ValueError("v14_contract_policy_pins_not_recorded")
    for name, (_, command) in POLICIES.items():
        value = POLICY_FINGERPRINTS[name]
        expected_fields = {"qual", "check"}
        if set(value) != expected_fields:
            raise ValueError("v14_contract_policy_pins_not_recorded")
        if command == "INSERT":
            valid = value["qual"] is None and isinstance(value["check"], str)
        elif command == "SELECT":
            valid = isinstance(value["qual"], str) and value["check"] is None
        else:
            valid = isinstance(value["qual"], str) and isinstance(value["check"], str)
        digests = [item for item in value.values() if item is not None]
        if not valid or any(re.fullmatch(r"[0-9a-f]{64}", item) is None for item in digests):
            raise ValueError("v14_contract_policy_pins_not_recorded")
    return CATALOG_PINS, POLICY_FINGERPRINTS


def observed_extension_digests(snapshot: Mapping[str, object]) -> dict[str, str]:
    """Digest only the v14 extension rows; v13 remains independently pinned."""

    return {
        "extension_columns_exact": v13.rows_digest(
            [
                row
                for row in snapshot.get("extension_columns", [])
                if row.get("table_name") in TABLES
            ]
        ),
        "extension_constraints_exact": v13.rows_digest(
            [
                row
                for row in snapshot.get("extension_constraints", [])
                if row.get("table_name") in TABLES
            ]
        ),
        "extension_functions_exact": v13.rows_digest(
            [
                row
                for row in snapshot.get("functions", [])
                if row.get("function_name") in FUNCTIONS
            ]
        ),
        "extension_policies_exact": v13.rows_digest(
            [
                row
                for row in snapshot.get("policies", [])
                if row.get("policy_name") in POLICIES
            ]
        ),
    }


def collect_extensions(cursor, execute_rows):
    """Collect v13 rows plus the v14 table catalog without reading user data."""

    snapshot = v13.collect_extensions(cursor, execute_rows)
    columns = execute_rows(
        cursor,
        """
        select c.relname as table_name, a.attname as column_name,
               a.attnum as position, format_type(a.atttypid,a.atttypmod) as data_type,
               a.attnotnull as not_null, a.attidentity::text as identity_kind,
               a.attgenerated::text as generated_kind,
               cn.nspname as collation_schema, co.collname as collation_name,
               co.collisdeterministic as collation_deterministic,
               pg_get_expr(d.adbin,d.adrelid) as default_expression
        from pg_attribute a join pg_class c on c.oid=a.attrelid
        join pg_namespace n on n.oid=c.relnamespace
        left join pg_collation co on co.oid=a.attcollation
        left join pg_namespace cn on cn.oid=co.collnamespace
        left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
        where n.nspname='app_private' and c.relname=any(%s)
          and a.attnum>0 and not a.attisdropped
        order by c.relname,a.attnum
        """,
        (sorted(TABLES),),
    )
    constraints = execute_rows(
        cursor,
        """
        select c.relname as table_name, p.conname as constraint_name,
               p.contype::text as constraint_type, p.convalidated as validated,
               p.condeferrable as deferrable, p.condeferred as initially_deferred,
               p.connoinherit as no_inherit, pg_get_constraintdef(p.oid,true) as definition
        from pg_constraint p join pg_class c on c.oid=p.conrelid
        join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='app_private' and c.relname=any(%s)
        order by c.relname,p.conname
        """,
        (sorted(TABLES),),
    )
    snapshot["extension_columns"] = [*snapshot["extension_columns"], *columns]
    snapshot["extension_constraints"] = [
        *snapshot["extension_constraints"],
        *constraints,
    ]
    return snapshot


def extension_checks(snapshot: Mapping[str, object]) -> dict[str, bool]:
    """Retain every v13 check and require exact reviewed v14 catalog pins."""

    v13_snapshot = dict(snapshot)
    v13_snapshot["extension_columns"] = [
        row
        for row in snapshot.get("extension_columns", [])
        if row.get("table_name") in v13.TABLES
    ]
    v13_snapshot["extension_constraints"] = [
        row
        for row in snapshot.get("extension_constraints", [])
        if row.get("table_name") in v13.TABLES
    ]
    result = v13.extension_checks(v13_snapshot)
    observed = observed_extension_digests(snapshot)
    result.update(
        {
            f"v14_{name}": observed[name] == expected
            for name, expected in CATALOG_PINS.items()
        }
    )
    return result


def extend_contract(base: dict[str, object]) -> dict[str, object]:
    """Extend a v13 contract only when reviewed PG17 pins are present."""

    facts = source_contract()
    catalog_pins, policy_pins = _reviewed_catalog_pins()
    v13.extend_contract(base)
    base.update(CONTRACT=CONTRACT, SCHEMA_VERSION=SCHEMA_VERSION)
    base["EXPECTED_TABLES"] |= TABLES
    base["TENANT_TABLES"] |= TABLES
    base["EXPECTED_FUNCTIONS"].update(FUNCTIONS)
    for trigger, (table, function, mask) in TRIGGERS.items():
        base["EXPECTED_TRIGGERS"][trigger] = {
            "table": table,
            "function": function,
            "trigger_type": mask,
            "function_source": facts["function_sources"][function],
        }
    base["EXPECTED_INDEX_CONTRACT"].update(INDEX_CONTRACT)
    base["EXPECTED_INDEXES"] = frozenset(base["EXPECTED_INDEX_CONTRACT"])
    for name, (table, command) in POLICIES.items():
        base["EXPECTED_POLICIES"][name] = {
            "table": table,
            "command": command,
            "permissive": "PERMISSIVE",
        }
        base["EXPECTED_POLICY_FINGERPRINTS"][name] = dict(policy_pins[name])
    base["EXPECTED_NON_OWNER_ACL"] |= NON_OWNER_ACL
    base["EXPECTED_BACKEND_ACL_DEPENDENCIES"] |= ACL_DEPENDENCIES
    base["V14_CATALOG_PINS"] = dict(catalog_pins)
    base.update(
        collect_extensions=collect_extensions,
        extension_checks=extension_checks,
    )
    return base
