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
    "20260930010000_app_rls_initplan_optimization.sql": "eda938f781a7e854c9d83567600ad912bd07cadc27f4479b1bf7ee410d451a57",
    "20260929171000_ecommerce_decision_review_fk_index.sql": "6ad14b664f4b9ad560a7cbaf37c6d4dcf8c26d3709e5bb44d40ea2f4029785c3",
    "20260924231714_ecommerce_customer_decisions.sql": "c14f514daddca921f1c1ea2dbad3c7504d2142bc8b0bbbef0da48eb7104069c7",
    "20260924194557_ecommerce_customer_review_storage.sql": "4bb3eb40ec26854bda021d3c2e19ba34bb0657272933f6bfd5ee8f6da6974b46",
    "20260924190304_ecommerce_review_entitlement_proof.sql": "84fdda564d5deb7003fd9c151dd1a1b64c21209fd64fd109062b25d0d3842fef",
    "20260817090000_private_trial_backend_v12_billing_rail.sql": "19cf4077c26336d74d3f5ea5ba4d60c20a2525604f4c8aa1673fd2b3b243a033",
    "20260818090000_private_trial_backend_v13_billing_entitlement_read.sql": "784ba3a4fd29c61abebbc9b73eb37d0a68e40780c7d98d4b0b8953fee31b777f",
    "20260907024457_self_serve_durable_attempt_budget.sql": "94aa2c57d1d7e55ee844cb8c29b41dcad54093390d321c48f5caf9da67ef606f",
    "20260915184728_website_customer_review_storage.sql": "349ad34204b4d111a0ce344e9c8d79576be0c6df2eb50b84c3901f4cf98ae5be",
    "20260915191528_website_review_entitlement_proof.sql": "75755426b58dfe01b6efde4bd3480e2defdf5556c3e9d1352bc96c48587adf62",
    "20260918011500_website_customer_acceptance.sql": "2ffe0304564175d9682af8525873c348d1a3638c87671d16c682e5414a2347b1",
}
TABLES = frozenset({"ecommerce_customer_decisions", "ecommerce_customer_reviews", "billing_invoices", "billing_events", "billing_entitlements",
                    "self_serve_attempt_budgets", "website_customer_reviews", "website_customer_feedback", "website_customer_acceptances"})
WEBSITE_FUNCTIONS = {
    "guard_ecommerce_decision": ("", "trigger"),
    "ecommerce_review_text_length": ("value text", "bigint"),
    "ecommerce_review_projection": ("source jsonb", "jsonb"),
    "ecommerce_review_preview_digest": ("source jsonb", "text"),
    "ecommerce_review_operator_entitled": ("", "boolean"),
    "ecommerce_review_recipient_ready": ("recipient text", "boolean"),
    "guard_ecommerce_review": ("", "trigger"),
    "invalidate_ecommerce_reviews": ("", "trigger"),
    "guard_website_acceptance": ("", "trigger"),
    "guard_website_feedback_after_acceptance": ("", "trigger"),
    "guard_website_feedback": ("", "trigger"),
    "guard_website_review": ("", "trigger"),
    "invalidate_website_reviews": ("", "trigger"),
    "website_review_can": ("capability text", "boolean"),
    "website_review_entitled": ("", "boolean"),
    "ecommerce_review_entitled": ("", "boolean"),
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
    "ecommerce_decisions_read": ("ecommerce_customer_decisions", "SELECT", "fa6ebfe157157ad6d5daf331058d4b8092da94f072e2758641d1c596776c9bdb", None),
    "ecommerce_decisions_insert": ("ecommerce_customer_decisions", "INSERT", None, "d452ac0c7fcc944fc931f4ae2b2a3533ff9bb63882af8dee7ef7b43b2419bc8c"),
    "ecommerce_reviews_read": ("ecommerce_customer_reviews", "SELECT", "e8b03e62dc2319a3798b075015f4b7e6ee20d6e78bd545941de0554befcd4423", None),
    "ecommerce_reviews_insert": ("ecommerce_customer_reviews", "INSERT", None, "69563c4f1a99d258069ea8c0b08eac159118a3fe08b7ee2db359371d9952b9ec"),
    "ecommerce_reviews_update": ("ecommerce_customer_reviews", "UPDATE", "700d57520ce0b8336ada1a3b837bd4be69553838cb049e5d1cbbdfbd667de73b", "700d57520ce0b8336ada1a3b837bd4be69553838cb049e5d1cbbdfbd667de73b"),

    "website_acceptance_insert": ("website_customer_acceptances", "INSERT", None, "79cb68951d10ae096a680ea000a705b731c9e4a970128bdadb030e420836463e"),
    "website_acceptance_read": ("website_customer_acceptances", "SELECT", "e4cb734ea8424c0a3356a192628741a295e8dd10f6752ce16a099de0a0c1cede", None),
    "website_feedback_insert": ("website_customer_feedback", "INSERT", None, "79cb68951d10ae096a680ea000a705b731c9e4a970128bdadb030e420836463e"),
    "website_feedback_read": ("website_customer_feedback", "SELECT", "e4cb734ea8424c0a3356a192628741a295e8dd10f6752ce16a099de0a0c1cede", None),
    "website_reviews_insert": ("website_customer_reviews", "INSERT", None, "f0694d12d71e62b3a88e9ca9894daf5b8099f24018a877e8e916bc5722be8afa"),
    "website_reviews_read": ("website_customer_reviews", "SELECT", "6f4197083f7916fef03be3eeb7c23a2fed65a91ca37a9f4abda0bdb91f656301", None),
    "website_reviews_update": ("website_customer_reviews", "UPDATE", "76646976533558b9556dd9cc703330b0fd4d4229ae0d0334e1d6d37a9d065743", "76646976533558b9556dd9cc703330b0fd4d4229ae0d0334e1d6d37a9d065743"),
}
POLICIES = frozenset({"billing_entitlements_self_read", "self_serve_attempt_budget_actor_only", *WEBSITE_POLICIES})
# Exact PostgreSQL 17 output from the pinned migrations, with all row keys retained.
# Source-derived, synthetic catalog evidence only. Unknown/extra/missing rows fail.
CATALOG_PINS = {
    "extension_columns_exact": "263730f2611d82cffec18b53d2c15a692d3613830e0707f434c5df2d9024d05c",
    "extension_constraints_exact": "6480dfb4c310398fefb446aaa59187990a976bde623d25364a8ea25d7577e3b1",
    "extension_functions_exact": "97562ea0ea0fa18f9cdac35e309b92b588d17909e9967df7005e66ee92bd4619",
    "extension_policies_exact": "cdfa8c8e52aeb1f00dca92a4bfc532c8de01c767afa49462f668ac005a391341",
}
POLICY_PINS = {"billing_entitlements_self_read": "28369fc95fa5a46002daf06b67038c4c9c8695d9defe59a69014c7c40a44d5b5",
               "self_serve_attempt_budget_actor_only": "75f43c59c93c94637dad16ee262f552380b037c4d94c987c1ddeffc446d7875a"}


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
    billing = sql["20260817090000_private_trial_backend_v12_billing_rail.sql"]
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
    for trigger, function, table, mask in (
        ('ecommerce_review_guard','guard_ecommerce_review','ecommerce_customer_reviews',31),
        ('ecommerce_reviews_invalidate','invalidate_ecommerce_reviews','workspace_state',25),
    ):
        body = re.findall(r'create function app_private\.'+function+r'\(\).*?as \$\$(.*?)\$\$;', sql['20260924194557_ecommerce_customer_review_storage.sql'], re.S)
        if len(body)!=1: raise ValueError('catalog_review_trigger_source_missing')
        base['EXPECTED_TRIGGERS'][trigger]=dict(table=table,function=function,trigger_type=mask,function_source=body[0])
    body = re.findall(r'create function app_private.guard_ecommerce_decision\(\).*?as \$\$(.*?)\$\$;', sql['20260924231714_ecommerce_customer_decisions.sql'], re.S)
    if len(body) != 1: raise ValueError('catalog_decision_trigger_source_missing')
    base['EXPECTED_TRIGGERS']['ecommerce_decision_guard'] = dict(table='ecommerce_customer_decisions', function='guard_ecommerce_decision', trigger_type=31, function_source=body[0])
    for index, keys, unique, primary, constraint in (
        ('ecommerce_customer_decisions_pkey', ('workspace_id', 'actor_id', 'command_id'), True, True, 'p'),
        ('ecommerce_decisions_review_idx', ('workspace_id', 'review_id'), False, False, None),
        ('ecommerce_decisions_acceptance_idx', ('workspace_id', 'review_id'), True, False, None),
        ('ecommerce_decisions_review_fk_idx', ('review_id',), False, False, None),
    ):
        base['EXPECTED_INDEX_CONTRACT'][index] = dict(table='ecommerce_customer_decisions', keys=keys, options=(0,)*len(keys), unique=unique, primary=primary, constraint=constraint)
    base['EXPECTED_INDEX_CONTRACT']['ecommerce_decisions_acceptance_idx']['predicate_expression'] = "(kind = 'acceptance'::text)"
    website = sql["20260915184728_website_customer_review_storage.sql"]
    for name, table, function, kind in (
        ("website_review_guard", "website_customer_reviews", "guard_website_review", 31),
        ("website_feedback_guard", "website_customer_feedback", "guard_website_feedback", 31),
        ("website_reviews_invalidate", "workspace_state", "invalidate_website_reviews", 25),
        ("website_acceptance_guard", "website_customer_acceptances", "guard_website_acceptance", 31),
        ("website_feedback_acceptance_guard", "website_customer_feedback", "guard_website_feedback_after_acceptance", 7),
    ):
        trigger_sql = sql["20260918011500_website_customer_acceptance.sql"] if function in (
            "guard_website_acceptance", "guard_website_feedback_after_acceptance") else website
        bodies = re.findall(r"create function app_private\." + function
                            + r"\(\).*?as \$\$(.*?)\$\$;", trigger_sql, re.S)
        if len(bodies) != 1:
            raise ValueError("v13_contract_website_trigger_source_missing")
        base["EXPECTED_TRIGGERS"][name] = dict(table=table, function=function,
                                              trigger_type=kind, function_source=bodies[0])
    for name, table, keys, unique, primary, constraint in (
        ("ecommerce_customer_reviews_pkey", "ecommerce_customer_reviews", ("review_id",), True, True, "p"),
        ("ecommerce_reviews_recipient_idx", "ecommerce_customer_reviews", ("workspace_id", "recipient_actor_id", "review_id"), False, False, None),
        ("ecommerce_reviews_active_idx", "ecommerce_customer_reviews", ("workspace_id",), False, False, None),
        ("website_customer_acceptances_pkey", "website_customer_acceptances", ("workspace_id", "actor_id", "command_id"), True, True, "p"),
        ("website_customer_acceptances_workspace_id_review_id_key", "website_customer_acceptances", ("workspace_id", "review_id"), True, False, "u"),
        ("website_customer_feedback_pkey", "website_customer_feedback", ("workspace_id", "actor_id", "command_id"), True, True, "p"),
        ("website_customer_feedback_review_idx", "website_customer_feedback", ("workspace_id", "review_id", "created_at"), False, False, None),
        ("website_customer_reviews_active_idx", "website_customer_reviews", ("workspace_id",), False, False, None),
        ("website_customer_reviews_pkey", "website_customer_reviews", ("review_id",), True, True, "p"),
        ("website_customer_reviews_recipient_idx", "website_customer_reviews", ("workspace_id", "recipient_actor_id", "review_id"), False, False, None),
        ("website_customer_reviews_workspace_id_review_id_key", "website_customer_reviews", ("workspace_id", "review_id"), True, False, "u"),
    ):
        base["EXPECTED_INDEX_CONTRACT"][name] = dict(table=table, keys=keys, options=(0,) * len(keys),
                                                   unique=unique, primary=primary, constraint=constraint)
    base["EXPECTED_INDEX_CONTRACT"]["ecommerce_reviews_active_idx"]["predicate_expression"] = "(status = 'active'::text)"
    base["EXPECTED_INDEX_CONTRACT"]["website_customer_reviews_active_idx"]["predicate_expression"] = "(status = 'active'::text)"
    base["EXPECTED_INDEXES"] = frozenset(base["EXPECTED_INDEX_CONTRACT"])
    for name, (table, command, qual, check) in WEBSITE_POLICIES.items():
        base["EXPECTED_POLICIES"][name] = dict(table=table, command=command, permissive="PERMISSIVE")
        base["EXPECTED_POLICY_FINGERPRINTS"][name] = {"qual": qual, "check": check}
    base["EXPECTED_NON_OWNER_ACL"] |= frozenset(
        [("function", name, role, "EXECUTE", False) for name in WEBSITE_FUNCTIONS]
        + [("table", table, role, privilege, False)
           for table, privileges in (("ecommerce_customer_decisions", ("SELECT", "INSERT")), ("ecommerce_customer_reviews", ("SELECT", "INSERT", "UPDATE")), ("website_customer_reviews", ("SELECT", "INSERT", "UPDATE")),
                                     ("website_customer_feedback", ("SELECT", "INSERT")),
                                     ("website_customer_acceptances", ("SELECT", "INSERT")))
           for privilege in privileges])
    base["EXPECTED_BACKEND_ACL_DEPENDENCIES"] |= frozenset(
        [("function", f"app_private.{name}({signature[0]})", 0) for name, signature in WEBSITE_FUNCTIONS.items()]
        + [("relation", f"app_private.{table}", 0)
           for table in ("ecommerce_customer_decisions", "ecommerce_customer_reviews", "website_customer_reviews", "website_customer_feedback", "website_customer_acceptances")])
    base.update(collect_extensions=collect_extensions, extension_checks=extension_checks)
    return base
