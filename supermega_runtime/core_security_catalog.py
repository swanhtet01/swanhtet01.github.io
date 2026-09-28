"""Read-only, versioned core security catalog fingerprint.

Pins must come from disposable PostgreSQL running reviewed source migrations,
never from the deployment being checked. This module grants no database access.
"""
from hashlib import sha256
import json


CORE_SECURITY_DIGESTS = {
    10: "5cf6ab18484f2d4d52d357faab876bd1048904312eafd257ff97a4e4e729f322",
    11: "9e37eeb42c580724e93c0155e033a3814ebcba53404746ec2844fac60bd197ef",
    12: "0cf1bd35def7c0cfdf3843435c9b7e331dca2ef516fb96286e2c9506d1f8539a",
    13: "868e14c525efbe00e833594bb4018f26a84ac5913de263fc078184895f42af8f",
}


def core_security_catalog_digest(cursor):
    cursor.execute("""with targets as (
      select c.* from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='app_private' and c.relname in (
        'trial_schema_meta','workspace_memberships','workspace_state','workspace_events',
        'approval_requests','workspace_access_controls','billing_invoices',
        'billing_events','billing_entitlements')
    ), funcs as (
      select p.*, l.lanname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      join pg_language l on l.oid=p.prolang
      where n.nspname='app_private' and p.proname in (
        'supabase_session_is_active','actor_workspace_directory','workspace_is_active')
    ) select jsonb_build_object(
      'tables', (select jsonb_agg(jsonb_build_array(relname,relkind,relrowsecurity,
        relforcerowsecurity,relispartition,pg_get_userbyid(relowner)) order by relname) from targets),
      'policies', (select jsonb_agg(jsonb_build_array(t.relname,p.polname,p.polcmd,p.polpermissive,
        (select jsonb_agg(role_name order by role_name) from
          (select case when r=0 then 'PUBLIC' else pg_get_userbyid(r) end role_name
           from unnest(p.polroles) r) roles),
        pg_get_expr(p.polqual,p.polrelid,false),pg_get_expr(p.polwithcheck,p.polrelid,false))
        order by t.relname,p.polname) from targets t join pg_policy p on p.polrelid=t.oid),
      'table_acl', (select jsonb_agg(jsonb_build_array(t.relname,
        case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
        pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable)
        order by t.relname,pg_get_userbyid(a.grantee),pg_get_userbyid(a.grantor),a.privilege_type)
        from targets t cross join lateral aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) a),
      'column_acl', (select jsonb_agg(jsonb_build_array(t.relname,c.attname,
        case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
        pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable)
        order by t.relname,c.attnum,pg_get_userbyid(a.grantee),a.privilege_type)
        from targets t join pg_attribute c on c.attrelid=t.oid
        cross join lateral aclexplode(c.attacl) a where c.attnum>0),
      'functions', (select jsonb_agg(jsonb_build_array(proname,
        pg_get_function_identity_arguments(oid),pg_get_function_result(oid),
        pg_get_userbyid(proowner),lanname,prokind,prosecdef,provolatile,proisstrict,
        proleakproof,proparallel,proconfig,replace(prosrc,E'\\r\\n',E'\\n'),
        pg_get_expr(proargdefaults,0)) order by proname,pg_get_function_identity_arguments(oid)) from funcs),
      'function_acl', (select jsonb_agg(jsonb_build_array(p.proname,
        pg_get_function_identity_arguments(p.oid),
        case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
        pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable)
        order by p.proname,pg_get_function_identity_arguments(p.oid),pg_get_userbyid(a.grantee),
          pg_get_userbyid(a.grantor),a.privilege_type)
        from funcs p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a),
      'inheritance', (select count(*) from targets t join pg_inherits i
        on i.inhrelid=t.oid or i.inhparent=t.oid),
      'rewrites', (select count(*) from targets t join pg_rewrite r on r.ev_class=t.oid)
    ) as catalog""")
    row = cursor.fetchone()
    if row is None:
        return None
    catalog = row.get('catalog') if isinstance(row, dict) else row[0]
    if not isinstance(catalog, dict):
        return None
    return sha256(json.dumps(catalog, sort_keys=True, separators=(',', ':'),
                             ensure_ascii=True).encode()).hexdigest()


def core_security_catalog_verified(cursor, schema_version):
    expected = CORE_SECURITY_DIGESTS.get(schema_version)
    return expected is not None and core_security_catalog_digest(cursor) == expected
