"""Exact optional acceptance storage boundary, alongside the base runtime guards.

Catalog checks read metadata only. Installing the schema or publishing a site is
never authorized by these checks; both remain separate release operations.
"""
from hashlib import sha256
import json


# Source-derived disposable PostgreSQL catalog. Never learned from a live target.
ACCEPTANCE_CATALOG_DIGEST = "e3af415adcdbd691bd6b2fcde2df5f58d4fe6f47bd1f7f7c2908a878dd47cf5f"


def acceptance_catalog_digest(cursor):
    """Read metadata only; bind shape, constraints, RLS, indexes and ACLs."""
    cursor.execute("""with target as (
        select c.* from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='app_private' and c.relname='ecommerce_customer_decisions'
    ), funcs as (
        select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='app_private' and p.proname in
          ('guard_ecommerce_decision')
    ) select jsonb_build_object(
        'tables', (select jsonb_agg(jsonb_build_array(relkind,relrowsecurity,relforcerowsecurity,
          relpersistence,relispartition,pg_get_userbyid(relowner))) from target),
        'columns', (select jsonb_agg(jsonb_build_array(a.attname,a.attnum,
          format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,
          pg_get_expr(d.adbin,d.adrelid,false)) order by a.attnum)
          from target t join pg_attribute a on a.attrelid=t.oid
          left join pg_attrdef d on d.adrelid=t.oid and d.adnum=a.attnum
          where a.attnum>0 and not a.attisdropped),
        'constraints', (select jsonb_agg(jsonb_build_array(c.conname,c.contype,c.convalidated,
          c.condeferrable,c.condeferred,pg_get_constraintdef(c.oid,false)) order by c.conname)
          from target t join pg_constraint c on c.conrelid=t.oid),
        'policies', (select jsonb_agg(jsonb_build_array(p.polname,p.polcmd,p.polpermissive,
          (select jsonb_agg(case when r=0 then 'PUBLIC' else pg_get_userbyid(r) end order by r)
            from unnest(p.polroles) r),pg_get_expr(p.polqual,p.polrelid,false),
          pg_get_expr(p.polwithcheck,p.polrelid,false)) order by p.polname)
          from target t join pg_policy p on p.polrelid=t.oid),
        'indexes', (select jsonb_agg(jsonb_build_array(i.relname,x.indisunique,x.indisprimary,
          x.indisvalid,x.indisready,pg_get_indexdef(x.indexrelid)) order by i.relname)
          from target t join pg_index x on x.indrelid=t.oid join pg_class i on i.oid=x.indexrelid),
        'table_acl', (select jsonb_agg(jsonb_build_array(
          case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
          a.privilege_type,a.is_grantable) order by pg_get_userbyid(a.grantee),a.privilege_type)
          from target t cross join lateral aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) a
          where a.grantee<>t.relowner),
        'column_acl', (select jsonb_agg(jsonb_build_array(c.attname,
          case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
          a.privilege_type,a.is_grantable) order by c.attnum,pg_get_userbyid(a.grantee),a.privilege_type)
          from target t join pg_attribute c on c.attrelid=t.oid
          cross join lateral aclexplode(c.attacl) a where c.attnum>0),
        'functions', (select jsonb_agg(jsonb_build_array(p.proname,
          pg_get_function_identity_arguments(p.oid),pg_get_function_result(p.oid),
          pg_get_userbyid(p.proowner),p.provolatile,p.proleakproof,p.proparallel)
          order by p.proname,p.oid) from funcs p),
        'function_acl', (select jsonb_agg(jsonb_build_array(p.proname,
          case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
          a.privilege_type,a.is_grantable) order by p.proname,pg_get_userbyid(a.grantee),a.privilege_type)
          from funcs p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
          where a.grantee<>p.proowner)
    ) as catalog,
        not exists(select 1 from target t join pg_rewrite r on r.ev_class=t.oid) as no_rewrite,
        not exists(select 1 from target t join pg_inherits i on i.inhrelid=t.oid or i.inhparent=t.oid) as no_inheritance""")
    row = cursor.fetchone()
    if ((isinstance(row, dict) and (row.get("no_rewrite") is not True or row.get("no_inheritance") is not True))
            or (not isinstance(row, dict) and (row[1] is not True or row[2] is not True))):
        return None
    catalog = row["catalog"] if isinstance(row, dict) else row[0]
    return sha256(json.dumps(catalog, sort_keys=True, separators=(",", ":"),
                             ensure_ascii=True).encode()).hexdigest()


def acceptance_storage_verified(cursor):
    return acceptance_catalog_digest(cursor) == ACCEPTANCE_CATALOG_DIGEST


ACCEPTANCE_TRIGGERS = {
    ("ecommerce_customer_decisions", "ecommerce_decision_guard"): (31, "guard_ecommerce_decision", "7561dc6ebdc90f3a4e7c59458bcd9a6b4cea5853c8da1f00e7271a32418a7330"),
}


def acceptance_triggers_verified(rows):
    """Require the exact decision guard, including execution/security configuration."""
    selected = [row for row in rows
                if (row.get("table_name"), row.get("trigger_name")) in ACCEPTANCE_TRIGGERS]
    if len(selected) != 1 or len({(r["table_name"], r["trigger_name"]) for r in selected}) != 1:
        return False
    for row in selected:
        mask, function, digest = ACCEPTANCE_TRIGGERS[(row["table_name"], row["trigger_name"])]
        if (row.get("event_mask") != mask or row.get("enabled") != "O"
                or any(row.get(key) is not True for key in (
                    "no_when_clause", "no_arguments", "no_column_filter", "no_constraint_link",
                    "not_deferrable", "not_initially_deferred", "no_transition_tables"))
                or row.get("function_schema") != "app_private"
                or row.get("function_name") != function
                or row.get("function_language") != "plpgsql"
                or row.get("security_definer") is not False
                or tuple(row.get("function_config") or ()) != ("search_path=pg_catalog, app_private",)
                or sha256(str(row.get("function_source") or "").replace("\r\n", "\n").encode()).hexdigest() != digest):
            return False
    return True
