import { createHash } from 'node:crypto'

// Exact post-extension catalog pins. Queries cover the WHOLE private schema,
// including old objects: an extension cannot silently weaken an earlier gate.
// No OIDs, timestamps, data rows, connections, or provider operations are retained.
export const websiteReviewCatalogQueries = {
  relations: `select c.relname, c.relkind::text, pg_get_userbyid(c.relowner) as owner,
    c.relrowsecurity, c.relforcerowsecurity, c.relacl::text
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='app_private' and c.relkind in ('r','p','v','m','S','f') order by c.relname`,
  columns: `select c.relname, a.attname, format_type(a.atttypid,a.atttypmod) as type,
    a.attnotnull, a.attidentity, a.attgenerated, pg_get_expr(d.adbin,d.adrelid) as default_value
    from pg_attribute a join pg_class c on c.oid=a.attrelid
    join pg_namespace n on n.oid=c.relnamespace
    left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
    where n.nspname='app_private' and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped
    order by c.relname,a.attnum`,
  policies: `select tablename,policyname,permissive,roles,cmd,qual,with_check
    from pg_policies where schemaname='app_private' order by tablename,policyname`,
  functions: `select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
    pg_get_function_result(p.oid) as result, l.lanname, pg_get_userbyid(p.proowner) as owner,
    p.prosecdef,p.provolatile,p.proisstrict,p.proconfig,p.proacl::text,
    replace(p.prosrc, chr(13) || chr(10), chr(10)) as source
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    join pg_language l on l.oid=p.prolang where n.nspname='app_private'
    order by p.proname,arguments`,
  triggers: `select c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) as definition
    from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='app_private' and not t.tgisinternal order by c.relname,t.tgname`,
  constraints: `select c.relname,k.conname,k.convalidated,pg_get_constraintdef(k.oid) as definition
    from pg_constraint k join pg_class c on c.oid=k.conrelid
    join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private'
    order by c.relname,k.conname`,
  indexes: `select c.relname,i.relname as index_name,x.indisvalid,x.indisready,x.indislive,
    pg_get_indexdef(i.oid) as definition from pg_index x
    join pg_class c on c.oid=x.indrelid join pg_class i on i.oid=x.indexrelid
    join pg_namespace n on n.oid=c.relnamespace where n.nspname='app_private'
    order by c.relname,i.relname`,
}

const expected = {
  relations: 'cd7c608026e58d22c3ba0ebfa27b3d931731eac11d97beb8faf9f0059c225ab4',
  columns: 'd2f5a7fe54f3d0c5e1f9a11ddf748e5f94419ff0ab7a54fcc1dfaa42bda9181b',
  policies: '2e5108a45f0c350e6a25f5acb6b6b663bd3c7bdb83131c48ab0841164efde753',
  functions: 'd05d8014af2f212bc11a90219a8076dafb82cfc7296a1d908097f4818a533097',
  triggers: '02128e48e9e8e2a02e272b334f345ecd985a434fe48024aebe3c2e56e11473fc',
  constraints: 'f1be192e6d4c0eb0efb6af013a6fe0a66bcc9a4f1936b8f53246e4047ec73a8c',
  indexes: '0e1511fb7ef7462f232c47f568fffa1fa8fc36b2991a35c7a641ba7419c20bbc',
}

export async function websiteReviewCatalogDigests(database) {
  const digests = {}
  for (const [name, sql] of Object.entries(websiteReviewCatalogQueries)) {
    const { rows } = await database.query(sql)
    digests[name] = createHash('sha256').update(JSON.stringify(rows)).digest('hex')
  }
  return digests
}

export async function verifyWebsiteReviewMigrationCatalog(database, requireCheck) {
  const actual = await websiteReviewCatalogDigests(database)
  for (const [name, digest] of Object.entries(expected)) {
    requireCheck(`Website review complete private catalog: ${name}`, actual[name] === digest)
  }
  const { rows } = await database.query(`select
    app_private.website_review_can('website.review') is not true as capability_denied,
    app_private.website_review_recipient_ready('unassigned') is not true as recipient_denied,
    app_private.website_review_entitled() is not true as entitlement_denied`)
  requireCheck('Website review unbound identity fails closed',
    rows[0].capability_denied && rows[0].recipient_denied && rows[0].entitlement_denied)
}
