"""Source-pinned publishing catalog; checks metadata without reading customer data."""

from hashlib import sha256
import json

from .trial_store import TrialNotReadyError

# Derived only from the canonical migrations on disposable PostgreSQL 17.
PUBLISHING_CATALOG_DIGEST = "b0db9fedc42f9b29154080b69994509f4669438a7a0bb69724f4aeb870366516"


def publishing_catalog_digest(cursor):
    cursor.execute("""with target as (
        select c.* from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='app_private' and c.relname in ('website_inquiry_channels','website_inbox','website_inquiry_actions')
    ), funcs as (
        select p.* from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='app_private' and p.proname in
          ('receive_website_inquiry','publish_website_inquiry_channel',
           'unpublish_website_inquiry_channel','read_website_inquiry_page','read_website_published_media','change_website_inquiry')
    ) select jsonb_build_object(
      'tables', (select jsonb_agg(jsonb_build_array(relname,relkind,relrowsecurity,
        relforcerowsecurity,relpersistence,relispartition,pg_get_userbyid(relowner)) order by relname) from target),
      'columns', (select jsonb_agg(jsonb_build_array(t.relname,a.attname,a.attnum,
        format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,
        pg_get_expr(d.adbin,d.adrelid,false)) order by t.relname,a.attnum)
        from target t join pg_attribute a on a.attrelid=t.oid
        left join pg_attrdef d on d.adrelid=t.oid and d.adnum=a.attnum
        where a.attnum>0 and not a.attisdropped),
      'constraints', (select jsonb_agg(jsonb_build_array(t.relname,c.conname,c.contype,c.convalidated,
        c.condeferrable,c.condeferred,pg_get_constraintdef(c.oid,false)) order by t.relname,c.conname)
        from target t join pg_constraint c on c.conrelid=t.oid),
      'policies', (select jsonb_agg(jsonb_build_array(t.relname,p.polname,p.polcmd,p.polpermissive,
        (select jsonb_agg(case when r=0 then 'PUBLIC' else pg_get_userbyid(r) end
          order by case when r=0 then 'PUBLIC' else pg_get_userbyid(r) end) from unnest(p.polroles) r),
        pg_get_expr(p.polqual,p.polrelid,false),pg_get_expr(p.polwithcheck,p.polrelid,false))
        order by t.relname,p.polname) from target t join pg_policy p on p.polrelid=t.oid),
      'indexes', (select jsonb_agg(jsonb_build_array(t.relname,i.relname,x.indisunique,x.indisprimary,
        x.indisvalid,x.indisready,pg_get_indexdef(x.indexrelid)) order by t.relname,i.relname)
        from target t join pg_index x on x.indrelid=t.oid join pg_class i on i.oid=x.indexrelid),
      'triggers', (select jsonb_agg(jsonb_build_array(t.relname,g.tgname,g.tgenabled,
        pg_get_triggerdef(g.oid,false)) order by t.relname,g.tgname)
        from target t join pg_trigger g on g.tgrelid=t.oid where not g.tgisinternal),
      'table_acl', (select jsonb_agg(jsonb_build_array(t.relname,
        case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
        a.privilege_type,a.is_grantable) order by t.relname,pg_get_userbyid(a.grantee),a.privilege_type)
        from target t cross join lateral aclexplode(coalesce(t.relacl,acldefault('r',t.relowner))) a
        where a.grantee<>t.relowner),
      'column_acl', (select jsonb_agg(jsonb_build_array(t.relname,c.attname,
        case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
        a.privilege_type,a.is_grantable) order by t.relname,c.attnum,pg_get_userbyid(a.grantee),a.privilege_type)
        from target t join pg_attribute c on c.attrelid=t.oid
        cross join lateral aclexplode(c.attacl) a where c.attnum>0),
      'functions', (select jsonb_agg(jsonb_build_array(p.proname,
        pg_get_function_identity_arguments(p.oid),pg_get_userbyid(p.proowner),p.prosecdef,
        p.provolatile,p.proleakproof,p.proparallel,p.proconfig,pg_get_functiondef(p.oid))
        order by p.proname,pg_get_function_identity_arguments(p.oid)) from funcs p),
      'function_acl', (select jsonb_agg(jsonb_build_array(p.proname,
        pg_get_function_identity_arguments(p.oid),
        case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
        a.privilege_type,a.is_grantable)
        order by p.proname,pg_get_function_identity_arguments(p.oid),pg_get_userbyid(a.grantee),a.privilege_type)
        from funcs p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        where a.grantee<>p.proowner)
    ) as catalog,
      not exists(select 1 from target t join pg_rewrite r on r.ev_class=t.oid) as no_rewrite,
      not exists(select 1 from target t join pg_inherits i on i.inhrelid=t.oid or i.inhparent=t.oid) as no_inheritance""")
    row = cursor.fetchone()
    catalog, no_rewrite, no_inheritance = (
        (row['catalog'], row['no_rewrite'], row['no_inheritance']) if isinstance(row, dict) else row)
    if no_rewrite is not True or no_inheritance is not True:
        return None
    # PostgreSQL preserves function line endings from the migration source.
    catalog = json.dumps(catalog, sort_keys=True, separators=(',', ':'), ensure_ascii=True)
    return sha256(catalog.replace('\\r\\n', '\\n').encode()).hexdigest()


def require_publishing_schema(cursor):
    if publishing_catalog_digest(cursor) != PUBLISHING_CATALOG_DIGEST:
        raise TrialNotReadyError(('website_publishing_schema_unverified',))
