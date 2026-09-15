"""Exact v13 + durable-admission catalog extension, with no target-derived trust.

The existing validator owns connections and every legacy security check. This
module adds explicit expectations; it never writes to or selects user data.
Migration text is LF-normalized and pinned before extracting trigger bodies.
Catalog digests are fixed reviewable expectations, never learned at audit time.
"""
from hashlib import sha256
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PROFILE = "v13-self-serve"
CONTRACT = "supermega_private_trial_database_v13_self_serve_v1"
MIGRATION_PINS = {
    "20260817090000_private_trial_backend_v12_billing_rail.sql": "19cf4077c26336d74d3f5ea5ba4d60c20a2525604f4c8aa1673fd2b3b243a033",
    "20260818090000_private_trial_backend_v13_billing_entitlement_read.sql": "784ba3a4fd29c61abebbc9b73eb37d0a68e40780c7d98d4b0b8953fee31b777f",
    "20260907024457_self_serve_durable_attempt_budget.sql": "94aa2c57d1d7e55ee844cb8c29b41dcad54093390d321c48f5caf9da67ef606f",
    "20260915184728_website_customer_review_storage.sql": "349ad34204b4d111a0ce344e9c8d79576be0c6df2eb50b84c3901f4cf98ae5be",
    "20260915191528_website_review_entitlement_proof.sql": "75755426b58dfe01b6efde4bd3480e2defdf5556c3e9d1352bc96c48587adf62",
}
TABLES = frozenset({"billing_invoices", "billing_events", "billing_entitlements",
                    "self_serve_attempt_budgets", "website_customer_reviews", "website_customer_feedback"})
WEBSITE_FUNCTIONS = {
    "guard_website_feedback": ("", "trigger"),
    "guard_website_review": ("", "trigger"),
    "invalidate_website_reviews": ("", "trigger"),
    "website_review_can": ("capability text", "boolean"),
    "website_review_entitled": ("", "boolean"),
    "website_review_json": ("value jsonb", "text"),
    "website_review_recipient_ready": ("recipient text", "boolean"),
}
FUNCTIONS = {
    **WEBSITE_FUNCTIONS,
    "guard_billing_invoice": ("", "trigger"),
    "reject_billing_event_mutation": ("", "trigger"),
    "stamp_billing_event_insert": ("", "trigger"),
    "guard_billing_entitlement": ("", "trigger"),
    "reserve_self_serve_attempt": ("", "timestamp with time zone"),
    "mark_self_serve_claim_conflict": ("admitted_at timestamp with time zone", "boolean"),
}
WEBSITE_POLICIES = {
    "website_feedback_insert": ("website_customer_feedback", "INSERT", None, "c93ef7773593e0ed96f436fab247931dc3cf5ca1f59575833a4b879b068168b6"),
    "website_feedback_read": ("website_customer_feedback", "SELECT", "aa4e62ec5c29d1c54a81615cf224f208cc795c541a4f9102ac5bff7bf9c29b86", None),
    "website_reviews_insert": ("website_customer_reviews", "INSERT", None, "4622582ff8b62ad939ddfe03b99e3ebc33f7f5519e4342dafa8505d7a220cd01"),
    "website_reviews_read": ("website_customer_reviews", "SELECT", "273b7332dc1b7dcfa4627edb4edd572a8c398c835ec6265abd16a20c1b09b0bc", None),
    "website_reviews_update": ("website_customer_reviews", "UPDATE", "67b3bc6f31d708f4fbae90df69ca85692ce1ab11959fa4598169fb1811bcb8e6", "67b3bc6f31d708f4fbae90df69ca85692ce1ab11959fa4598169fb1811bcb8e6"),
}
POLICIES = frozenset({"billing_entitlements_self_read", "self_serve_attempt_budget_actor_only", *WEBSITE_POLICIES})
# Exact PostgreSQL 17 output from the pinned migrations, with all row keys retained.
# Source-derived, synthetic catalog evidence only. Unknown/extra/missing rows fail.
CATALOG_PINS = {
    "extension_columns_exact": "37b2db9b140dce4b90687f50be272e140e59d8ed83a790be36119dd5cf18d548",
    "extension_constraints_exact": "be489a166fa6dd0dec32f30a5392dd0226c41740c7e61833f2bef03f1bdd0085",
    "extension_functions_exact": "72ddc1cc66ebdd458ec39e7fe598ce052c139d8c76618b14176a8c6ca27a5d3d",
    "extension_policies_exact": "b560da092b3a523b2cc6edbc99bf4d5e76b916bd91a0f1924a4343ba5eb04ea2",
}
POLICY_PINS = {"billing_entitlements_self_read": "28369fc95fa5a46002daf06b67038c4c9c8695d9defe59a69014c7c40a44d5b5",
               "self_serve_attempt_budget_actor_only": "b5ae50fbc65c43344b8d3f3938f7b8a26414ae3bbb1781b6e35bf609c954f82c"}


def rows_digest(rows):
    # Preserve literals/casts/case; only platform line endings are canonicalized.
    def normalize(value):
        if isinstance(value, str):
            return value.replace("\r\n", "\n")
        if isinstance(value, dict):
            return {k: normalize(v) for k, v in value.items()}
        if isinstance(value, (list, tuple)):
            return [normalize(v) for v in value]
        return value
    encode = lambda value: json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    normalized = [normalize(row) for row in rows]
    return sha256(encode(sorted(normalized, key=encode)).encode()).hexdigest()


def observed_extension_digests(snapshot):
    return {
        "extension_columns_exact": rows_digest(snapshot.get("extension_columns", [])),
        "extension_constraints_exact": rows_digest(snapshot.get("extension_constraints", [])),
        "extension_functions_exact": rows_digest([r for r in snapshot.get("functions", [])
                                                   if r.get("function_name") in FUNCTIONS]),
        "extension_policies_exact": rows_digest([r for r in snapshot.get("policies", [])
                                                  if r.get("policy_name") in POLICIES]),
    }


def extension_checks(snapshot):
    observed = observed_extension_digests(snapshot)
    result = {name: observed[name] == expected for name, expected in CATALOG_PINS.items()}
    acl = snapshot.get("column_acl_entries")
    expected = [{"table_name": "self_serve_attempt_budgets", "column_name": name,
                 "grantee": "supermega_trial_backend", "privilege_type": "UPDATE", "is_grantable": False}
                for name in ("attempts", "claim_conflicts")]
    result["private_column_acl_exact"] = isinstance(acl, list) and rows_digest(acl) == rows_digest(expected)
    return result


def collect_extensions(cursor, execute_rows):
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
    # Scan ALL private columns, not only the new budget columns. A table-level
    # allowlist alone cannot detect a column grant to anon or another principal.
    acl = execute_rows(cursor, """
        select c.relname as table_name, a.attname as column_name,
               coalesce(r.rolname,'PUBLIC') as grantee, x.privilege_type, x.is_grantable
        from pg_attribute a join pg_class c on c.oid=a.attrelid
        join pg_namespace n on n.oid=c.relnamespace
        cross join lateral aclexplode(a.attacl) x
        left join pg_roles r on r.oid=x.grantee
        where n.nspname='app_private' and a.attnum>0 and not a.attisdropped
          and x.grantee<>c.relowner
        order by c.relname,a.attname,grantee,x.privilege_type
        """)
    return {"extension_columns": columns, "extension_constraints": constraints, "column_acl_entries": acl}


def extend_contract(base):
    sql = {}
    for name, expected in MIGRATION_PINS.items():
        value = (ROOT / "supabase/migrations" / name).read_text(encoding="utf-8")
        if sha256(value.encode()).hexdigest() != expected:
            raise ValueError("v13_contract_migration_source_mismatch")
        sql[name] = value
    billing = sql[next(iter(MIGRATION_PINS))]
    base.update(CONTRACT=CONTRACT, SCHEMA_VERSION=13)
    base["EXPECTED_TABLES"] |= TABLES
    base["TENANT_TABLES"] |= TABLES
    base["EXPECTED_FUNCTIONS"].update(FUNCTIONS)
    for name, table, function, kind in (
        ("billing_invoice_guard", "billing_invoices", "guard_billing_invoice", 31),
        ("billing_events_immutable", "billing_events", "reject_billing_event_mutation", 27),
        ("billing_events_server_timestamp", "billing_events", "stamp_billing_event_insert", 7),
        ("billing_entitlement_guard", "billing_entitlements", "guard_billing_entitlement", 31),
    ):
        bodies = re.findall(r"create function app_private\." + function
                            + r"\(\).*?as \$function\$(.*?)\$function\$;", billing, re.S)
        if len(bodies) != 1:
            raise ValueError("v13_contract_trigger_source_missing")
        base["EXPECTED_TRIGGERS"][name] = {"table": table, "function": function,
                                          "trigger_type": kind, "function_source": bodies[0]}
    for name, table, keys, options, unique, primary, constraint in (
        ("billing_invoices_pkey", "billing_invoices", ("workspace_id", "invoice_id"), (0,0), True, True, "p"),
        ("billing_events_pkey", "billing_events", ("event_id",), (0,), True, True, "p"),
        ("billing_events_workspace_id_command_id_key", "billing_events", ("workspace_id", "command_id"), (0,0), True, False, "u"),
        ("billing_events_timeline_idx", "billing_events", ("workspace_id", "created_at"), (0,3), False, False, None),
        ("billing_entitlements_pkey", "billing_entitlements", ("workspace_id",), (0,), True, True, "p"),
        ("self_serve_attempt_budgets_pkey", "self_serve_attempt_budgets", ("actor_id",), (0,), True, True, "p"),
    ):
        base["EXPECTED_INDEX_CONTRACT"][name] = dict(table=table, keys=keys, options=options,
                                                   unique=unique, primary=primary, constraint=constraint)
    base["EXPECTED_INDEXES"] = frozenset(base["EXPECTED_INDEX_CONTRACT"])
    for name, table, command in (
        ("billing_entitlements_self_read", "billing_entitlements", "SELECT"),
        ("self_serve_attempt_budget_actor_only", "self_serve_attempt_budgets", "ALL"),
    ):
        base["EXPECTED_POLICIES"][name] = dict(table=table, command=command, permissive="PERMISSIVE")
        base["EXPECTED_POLICY_FINGERPRINTS"][name] = {"qual": POLICY_PINS[name],
            "check": POLICY_PINS[name] if command == "ALL" else None}
    role = "supermega_trial_backend"
    base["EXPECTED_NON_OWNER_ACL"] |= frozenset({
        ("table", "billing_entitlements", role, "SELECT", False),
        ("table", "self_serve_attempt_budgets", role, "SELECT", False),
        ("table", "self_serve_attempt_budgets", role, "INSERT", False),
        ("function", "reserve_self_serve_attempt", role, "EXECUTE", False),
        ("function", "mark_self_serve_claim_conflict", role, "EXECUTE", False),
    })
    base["EXPECTED_BACKEND_ACL_DEPENDENCIES"] |= frozenset({
        ("relation", "app_private.billing_entitlements", 0),
        ("relation", "app_private.self_serve_attempt_budgets", 0),
        ("relation", "app_private.self_serve_attempt_budgets", 2),
        ("relation", "app_private.self_serve_attempt_budgets", 3),
        ("function", "app_private.reserve_self_serve_attempt()", 0),
        ("function", "app_private.mark_self_serve_claim_conflict(admitted_at timestamp with time zone)", 0),
    })
    website = sql["20260915184728_website_customer_review_storage.sql"]
    for name, table, function, kind in (
        ("website_review_guard", "website_customer_reviews", "guard_website_review", 31),
        ("website_feedback_guard", "website_customer_feedback", "guard_website_feedback", 31),
        ("website_reviews_invalidate", "workspace_state", "invalidate_website_reviews", 25),
    ):
        bodies = re.findall(r"create function app_private\." + function
                            + r"\(\).*?as \$\$(.*?)\$\$;", website, re.S)
        if len(bodies) != 1:
            raise ValueError("v13_contract_website_trigger_source_missing")
        base["EXPECTED_TRIGGERS"][name] = dict(table=table, function=function,
                                              trigger_type=kind, function_source=bodies[0])
    for name, table, keys, unique, primary, constraint in (
        ("website_customer_feedback_pkey", "website_customer_feedback", ("workspace_id", "actor_id", "command_id"), True, True, "p"),
        ("website_customer_feedback_review_idx", "website_customer_feedback", ("workspace_id", "review_id", "created_at"), False, False, None),
        ("website_customer_reviews_active_idx", "website_customer_reviews", ("workspace_id",), False, False, None),
        ("website_customer_reviews_pkey", "website_customer_reviews", ("review_id",), True, True, "p"),
        ("website_customer_reviews_recipient_idx", "website_customer_reviews", ("workspace_id", "recipient_actor_id", "review_id"), False, False, None),
        ("website_customer_reviews_workspace_id_review_id_key", "website_customer_reviews", ("workspace_id", "review_id"), True, False, "u"),
    ):
        base["EXPECTED_INDEX_CONTRACT"][name] = dict(table=table, keys=keys, options=(0,) * len(keys),
                                                   unique=unique, primary=primary, constraint=constraint)
    base["EXPECTED_INDEX_CONTRACT"]["website_customer_reviews_active_idx"]["predicate_expression"] = "(status = 'active'::text)"
    base["EXPECTED_INDEXES"] = frozenset(base["EXPECTED_INDEX_CONTRACT"])
    for name, (table, command, qual, check) in WEBSITE_POLICIES.items():
        base["EXPECTED_POLICIES"][name] = dict(table=table, command=command, permissive="PERMISSIVE")
        base["EXPECTED_POLICY_FINGERPRINTS"][name] = {"qual": qual, "check": check}
    base["EXPECTED_NON_OWNER_ACL"] |= frozenset(
        [("function", name, role, "EXECUTE", False) for name in WEBSITE_FUNCTIONS]
        + [("table", table, role, privilege, False)
           for table, privileges in (("website_customer_reviews", ("SELECT", "INSERT", "UPDATE")),
                                     ("website_customer_feedback", ("SELECT", "INSERT")))
           for privilege in privileges])
    base["EXPECTED_BACKEND_ACL_DEPENDENCIES"] |= frozenset(
        [("function", f"app_private.{name}({signature[0]})", 0) for name, signature in WEBSITE_FUNCTIONS.items()]
        + [("relation", f"app_private.{table}", 0)
           for table in ("website_customer_reviews", "website_customer_feedback")])
    base.update(collect_extensions=collect_extensions, extension_checks=extension_checks)
    return base
