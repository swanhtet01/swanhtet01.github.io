"""Exact inquiry catalog extension on top of the retained v13 contract.

Only fixed, reviewed expectations are used. Catalog collection is read-only and
the migration source is pinned before any expectation is returned.
"""

from hashlib import sha256
from pathlib import Path

if __package__:
    from .private_trial_v13_contract import (
        collect_extensions as collect_v13_extensions,
        extend_contract as extend_v13_contract,
        extension_checks as v13_extension_checks,
        observed_extension_digests as observed_v13_digests,
        rows_digest,
    )
else:
    from private_trial_v13_contract import (
        collect_extensions as collect_v13_extensions,
        extend_contract as extend_v13_contract,
        extension_checks as v13_extension_checks,
        observed_extension_digests as observed_v13_digests,
        rows_digest,
    )


ROOT = Path(__file__).resolve().parents[1]
PROFILE = "v13-inquiry"
CONTRACT = "supermega_private_trial_database_v13_inquiry_v1"
MIGRATION = "20261014011202_website_inquiry_delivery.sql"
MIGRATION_SHA256 = "a90c0cff5e5c817d66939bfb0f12382fbd6dc3666f661c07319f8af2c1a6ff6c"
TABLES = frozenset({"website_inquiry_channels", "website_inbox"})
ROLE = "supermega_trial_backend"

FUNCTIONS = {
    "receive_website_inquiry": (
        "p_channel uuid, p_request uuid, p_origin text, p_name text, "
        "p_contact text, p_message text, p_consent boolean, p_client_key text",
        "jsonb",
    ),
    "publish_website_inquiry_channel": (
        "p_channel uuid, p_version bigint, p_snapshot text, p_digest text, p_origin text",
        "jsonb",
    ),
    "unpublish_website_inquiry_channel": (
        "p_channel uuid, p_digest text", "jsonb",
    ),
    "read_website_inquiry_page": (
        "p_channel uuid, p_origin text", "jsonb",
    ),
}

POLICIES = {
    "website_inbox_read": (
        "website_inbox", "SELECT",
        "67b3bc6f31d708f4fbae90df69ca85692ce1ab11959fa4598169fb1811bcb8e6", None,
    ),
    "website_inquiry_channel_read": (
        "website_inquiry_channels", "SELECT",
        "67b3bc6f31d708f4fbae90df69ca85692ce1ab11959fa4598169fb1811bcb8e6", None,
    ),
    "website_inquiry_channel_create": (
        "website_inquiry_channels", "INSERT", None,
        "85a4834fb043b710825c80f56b44ce17b82956c06d5d7b87237204e12a86700b",
    ),
}

CATALOG_PINS = {
    "inquiry_columns_exact": "72b06d1624ca27534372d6a567084c861a44a3bf484c4101ad704c1184f4001c",
    "inquiry_constraints_exact": "b14504ba2b1b1efc71c7a561cec555ccc9eff1642e3e2b69961400e25c083cbc",
    "inquiry_functions_exact": "ee569c737437bdcc1b7f262513eb1c88da4dcca01cff27249d4161b4a393dd49",
    "inquiry_policies_exact": "63b897630ddfb7b349ccb21c8376fa8cc2874443e0d4ef503bf269505a313dc6",
}
CATALOG_COUNTS = {
    "inquiry_columns_exact": 25,
    "inquiry_constraints_exact": 18,
    "inquiry_functions_exact": 4,
    "inquiry_policies_exact": 3,
}


def _inquiry_catalog_rows(snapshot):
    return {
        "inquiry_columns_exact": snapshot.get("inquiry_columns", []),
        "inquiry_constraints_exact": snapshot.get("inquiry_constraints", []),
        "inquiry_functions_exact": [
            row for row in snapshot.get("functions", [])
            if row.get("function_name") in FUNCTIONS
        ],
        "inquiry_policies_exact": [
            row for row in snapshot.get("policies", [])
            if row.get("policy_name") in POLICIES
        ],
    }


def observed_extension_digests(snapshot):
    observed = observed_v13_digests(snapshot)
    observed.update({
        name: rows_digest(rows) for name, rows in _inquiry_catalog_rows(snapshot).items()
    })
    return observed


def extension_checks(snapshot):
    checks = v13_extension_checks(snapshot)
    rows = _inquiry_catalog_rows(snapshot)
    checks.update({
        name: len(rows[name]) == CATALOG_COUNTS[name]
        and rows_digest(rows[name]) == expected
        for name, expected in CATALOG_PINS.items()
    })
    return checks


def collect_extensions(cursor, execute_rows):
    evidence = collect_v13_extensions(cursor, execute_rows)
    columns = execute_rows(cursor, """
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
        """, (sorted(TABLES),))
    constraints = execute_rows(cursor, """
        select c.relname as table_name, p.conname as constraint_name,
               p.contype::text as constraint_type, p.convalidated as validated,
               p.condeferrable as deferrable, p.condeferred as initially_deferred,
               p.connoinherit as no_inherit, pg_get_constraintdef(p.oid,true) as definition
        from pg_constraint p join pg_class c on c.oid=p.conrelid
        join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='app_private' and c.relname=any(%s)
        order by c.relname,p.conname
        """, (sorted(TABLES),))
    evidence.update(inquiry_columns=columns, inquiry_constraints=constraints)
    return evidence


def extend_contract(base):
    migration = (ROOT / "supabase/migrations" / MIGRATION).read_text(encoding="utf-8")
    if sha256(migration.encode("utf-8")).hexdigest() != MIGRATION_SHA256:
        raise ValueError("inquiry_contract_migration_source_mismatch")

    base = extend_v13_contract(base)
    base.update(CONTRACT=CONTRACT, SCHEMA_VERSION=13)
    base["EXPECTED_TABLES"] |= TABLES
    base["TENANT_TABLES"] |= TABLES
    base["EXPECTED_FUNCTIONS"].update(FUNCTIONS)

    for name, table, keys, options, unique, primary, constraint in (
        ("website_inquiry_channels_pkey", "website_inquiry_channels", ("channel_id",), (0,), True, True, "p"),
        ("website_inquiry_channels_workspace_id_channel_id_key", "website_inquiry_channels", ("workspace_id", "channel_id"), (0, 0), True, False, "u"),
        ("website_inquiry_channels_workspace_idx", "website_inquiry_channels", ("workspace_id", "created_at", "channel_id"), (0, 0, 0), False, False, None),
        ("website_inbox_pkey", "website_inbox", ("channel_id", "request_id"), (0, 0), True, True, "p"),
        ("website_inbox_workspace_received_idx", "website_inbox", ("workspace_id", "received_at", "channel_id", "request_id"), (0, 3, 0, 0), False, False, None),
        ("website_inbox_channel_received_idx", "website_inbox", ("channel_id", "received_at"), (0, 0), False, False, None),
        ("website_inbox_client_received_idx", "website_inbox", ("workspace_id", "client_key", "received_at"), (0, 0, 0), False, False, None),
    ):
        base["EXPECTED_INDEX_CONTRACT"][name] = dict(
            table=table, keys=keys, options=options, unique=unique,
            primary=primary, constraint=constraint,
        )
    base["EXPECTED_INDEXES"] = frozenset(base["EXPECTED_INDEX_CONTRACT"])

    for name, (table, command, qual, check) in POLICIES.items():
        base["EXPECTED_POLICIES"][name] = dict(
            table=table, command=command, permissive="PERMISSIVE",
        )
        base["EXPECTED_POLICY_FINGERPRINTS"][name] = {"qual": qual, "check": check}

    base["EXPECTED_NON_OWNER_ACL"] |= frozenset(
        [("table", "website_inquiry_channels", ROLE, privilege, False)
         for privilege in ("SELECT", "INSERT")]
        + [("table", "website_inbox", ROLE, "SELECT", False)]
        + [("function", name, ROLE, "EXECUTE", False) for name in FUNCTIONS]
    )
    base["EXPECTED_BACKEND_ACL_DEPENDENCIES"] |= frozenset(
        [("relation", f"app_private.{table}", 0) for table in TABLES]
        + [("function", f"app_private.{name}({signature[0]})", 0)
           for name, signature in FUNCTIONS.items()]
    )
    base.update(collect_extensions=collect_extensions, extension_checks=extension_checks)
    return base
