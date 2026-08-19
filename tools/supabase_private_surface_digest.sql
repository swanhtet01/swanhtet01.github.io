-- Canonical fingerprint of the private trial backend surface.
-- The identical text runs against PGlite (reviewed migrations) and against the
-- isolated Supabase branch, so a matching digest proves the deployed branch
-- carries exactly the reviewed schema and nothing else.
with raw_sections as (
  select 1 as ord, 'schema_version' as section,
    coalesce(
      (
        select schema_version::text
        from app_private.trial_schema_meta
        where component = 'private_trial_backend'
      ),
      'absent'
    ) as body

  union all
  select 2, 'relations',
    (
      select string_agg(
        concat_ws('|', relation.relname, relation.relkind::text,
          relation.relrowsecurity::text, relation.relforcerowsecurity::text),
        chr(10) order by relation.relname
      )
      from pg_class relation
      join pg_namespace schema_record on schema_record.oid = relation.relnamespace
      where schema_record.nspname = 'app_private'
        and relation.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
    )

  union all
  select 3, 'columns',
    (
      select string_agg(
        concat_ws('|', column_record.table_name, column_record.column_name,
          column_record.ordinal_position::text, column_record.udt_name,
          column_record.is_nullable, coalesce(column_record.column_default, '')),
        chr(10) order by column_record.table_name, column_record.ordinal_position
      )
      from information_schema.columns column_record
      where column_record.table_schema = 'app_private'
    )

  union all
  select 4, 'policies',
    (
      select string_agg(
        concat_ws('|', policy_record.policyname, policy_record.tablename,
          array_to_string(policy_record.roles::text[], ','), policy_record.cmd,
          policy_record.permissive, coalesce(policy_record.qual, ''),
          coalesce(policy_record.with_check, '')),
        chr(10) order by policy_record.policyname
      )
      from pg_policies policy_record
      where policy_record.schemaname = 'app_private'
    )

  union all
  select 5, 'functions',
    (
      select string_agg(
        concat_ws('|',
          procedure_record.proname,
          pg_get_function_identity_arguments(procedure_record.oid),
          pg_get_function_result(procedure_record.oid),
          procedure_record.prosecdef::text,
          procedure_record.provolatile::text,
          coalesce(array_to_string(procedure_record.proconfig, ','), ''),
          procedure_record.prosrc),
        chr(10) order by procedure_record.proname,
          pg_get_function_identity_arguments(procedure_record.oid)
      )
      from pg_proc procedure_record
      join pg_namespace schema_record on schema_record.oid = procedure_record.pronamespace
      where schema_record.nspname = 'app_private'
    )

  union all
  select 6, 'constraints',
    (
      select string_agg(
        concat_ws('|', relation.relname, constraint_record.conname,
          pg_get_constraintdef(constraint_record.oid)),
        chr(10) order by relation.relname, constraint_record.conname
      )
      from pg_constraint constraint_record
      join pg_class relation on relation.oid = constraint_record.conrelid
      join pg_namespace schema_record on schema_record.oid = relation.relnamespace
      where schema_record.nspname = 'app_private'
        -- PostgreSQL 18 catalogues NOT NULL here while 17 keeps it only in
        -- pg_attribute. Nullability is covered by the columns section instead,
        -- so excluding it keeps this digest comparable across both versions.
        and constraint_record.contype <> 'n'
    )

  union all
  select 7, 'triggers',
    (
      select string_agg(
        concat_ws('|', relation.relname, trigger_record.tgname,
          trigger_record.tgtype::text, procedure_record.proname),
        chr(10) order by relation.relname, trigger_record.tgname
      )
      from pg_trigger trigger_record
      join pg_class relation on relation.oid = trigger_record.tgrelid
      join pg_namespace schema_record on schema_record.oid = relation.relnamespace
      join pg_proc procedure_record on procedure_record.oid = trigger_record.tgfoid
      where schema_record.nspname = 'app_private'
        and not trigger_record.tgisinternal
    )

  union all
  select 8, 'indexes',
    (
      select string_agg(
        concat_ws('|', index_record.tablename, index_record.indexname,
          index_record.indexdef),
        chr(10) order by index_record.indexname
      )
      from pg_indexes index_record
      where index_record.schemaname = 'app_private'
    )

  union all
  select 9, 'grants',
    (
      select string_agg(line, chr(10) order by line)
      from (
        select concat_ws('|', 'schema', probe.rolname,
          has_schema_privilege(probe.rolname, 'app_private', 'USAGE')::text,
          has_schema_privilege(probe.rolname, 'app_private', 'CREATE')::text) as line
        from (values ('anon'), ('authenticated'), ('service_role'),
          ('supermega_trial_backend')) as probe(rolname)

        union all
        select concat_ws('|', 'table', probe.rolname, relation.relname,
          has_table_privilege(probe.rolname, relation.oid, 'SELECT')::text,
          has_table_privilege(probe.rolname, relation.oid, 'INSERT')::text,
          has_table_privilege(probe.rolname, relation.oid, 'UPDATE')::text,
          has_table_privilege(probe.rolname, relation.oid, 'DELETE')::text)
        from pg_class relation
        join pg_namespace schema_record on schema_record.oid = relation.relnamespace
        cross join (values ('anon'), ('authenticated'), ('service_role'),
          ('supermega_trial_backend')) as probe(rolname)
        where schema_record.nspname = 'app_private'
          and relation.relkind in ('r', 'p')

        union all
        select concat_ws('|', 'function', probe.rolname, procedure_record.proname,
          pg_get_function_identity_arguments(procedure_record.oid),
          has_function_privilege(probe.rolname, procedure_record.oid, 'EXECUTE')::text)
        from pg_proc procedure_record
        join pg_namespace schema_record on schema_record.oid = procedure_record.pronamespace
        cross join (values ('anon'), ('authenticated'), ('service_role'),
          ('supermega_trial_backend')) as probe(rolname)
        where schema_record.nspname = 'app_private'
      ) grant_lines
    )

  union all
  select 10, 'backend_role',
    (
      select concat_ws('|', role_record.rolname, role_record.rolcanlogin::text,
        role_record.rolinherit::text, role_record.rolsuper::text,
        role_record.rolcreatedb::text, role_record.rolcreaterole::text,
        role_record.rolreplication::text, role_record.rolbypassrls::text)
      from pg_roles role_record
      where role_record.rolname = 'supermega_trial_backend'
    )
),
section_digests as (
  select
    raw_sections.ord,
    raw_sections.section,
    encode(
      sha256(
        convert_to(
          btrim(
            regexp_replace(
              regexp_replace(
                lower(coalesce(raw_sections.body, '')),
                '::[[:space:]]*(pg_catalog\.)?(text|character[[:space:]]+varying|varchar|name|uuid|boolean|integer|bigint)\M',
                '',
                'g'
              ),
              '[[:space:]]+',
              ' ',
              'g'
            )
          ),
          'UTF8'
        )
      ),
      'hex'
    ) as digest
  from raw_sections
)
select json_build_object(
  'contract', 'supermega.supabase-private-surface-digest.v1',
  'sections', (
    select json_object_agg(section, digest order by ord)
    from section_digests
  ),
  'surface', (
    select encode(
      sha256(
        convert_to(
          string_agg(section || ':' || digest, chr(10) order by ord),
          'UTF8'
        )
      ),
      'hex'
    )
    from section_digests
  )
) as surface_digest;
