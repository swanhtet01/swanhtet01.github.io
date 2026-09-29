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

const beforeStorage = {
  relations: '3c44055e324575be93a05084d9ee02fc71a43cc00c482ef55f3b52c1228bb7a8',
  columns: '25369a7f720e9d382f9fcd52c62f93017183b2f2b77e6add1f17d202292077de',
  policies: '2294cceeeda5f32dd1f7befae23778bdca57210e98477d0ed45c53e2771bb7fe',
  functions: '4dcf4b8951331ec6daf23e49b347ac813218b117742290bfec4e08f8cd9f6b70',
  triggers: '84436c5251aeaffca50ec335499803ded93f84cb49f023dac890a64f80cee742',
  constraints: 'aa3867fd2063efbe6009f9a696399806576ebb5d093046792fa93f6063747102',
  indexes: 'a78adb1cdfc7a5a8904166eff3df39d71689e141df2a69af06d9d7eb5930e051',
}

const expected = {
  relations: 'eda32b4d361d290bbe8ed74b32a9f7f05848d42597b3e62df6a4d86ba9d35d55',
  columns: 'cf99eee45bafb9dca0b9f7fc8335b64faf3fc7d4b29a4719d02ffa5ebc1e5e9b',
  policies: 'f60cc4acb0268540175e08fc3fb288d7e15a56c8def1d7c99aea2515d7bd5328',
  functions: 'fabdb1987b7348fb24dc91bdb19c463a305552fda7a97d48660c2eb867c99d54',
  triggers: '8f423ef55794c3a5b8062011d8696064aff095f3f2c0093992f10c804bf8a707',
  constraints: 'e94c55ae5cc8565ddf5a3e44b098adfda6ac7461a8f42e423b9a5b318ab72b95',
  indexes: '91f5189cbce74557634e5865b89c53eaed35c79ac896f4bff02be34737244d7a',
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
  const storageFunctions = ['ecommerce_review_text_length','ecommerce_review_projection','ecommerce_review_preview_digest','ecommerce_review_operator_entitled','ecommerce_review_recipient_ready','guard_ecommerce_review','invalidate_ecommerce_reviews','guard_ecommerce_decision']
  for (const [name, sql] of Object.entries(websiteReviewCatalogQueries)) {
    const { rows } = await database.query(sql)
    const previous = rows.filter(row => !['ecommerce_customer_reviews', 'ecommerce_customer_decisions'].includes(row.relname)
      && !['ecommerce_customer_reviews', 'ecommerce_customer_decisions'].includes(row.tablename)
      && row.tgname !== 'ecommerce_reviews_invalidate'
      && !storageFunctions.includes(row.proname))
    requireCheck(`Catalog storage preserves previous ${name}`,
      createHash('sha256').update(JSON.stringify(previous)).digest('hex') === beforeStorage[name])
  }
  const { rows } = await database.query(`select
    app_private.website_review_can('website.review') is not true as capability_denied,
    app_private.website_review_recipient_ready('unassigned') is not true as recipient_denied,
    app_private.website_review_entitled() is not true as entitlement_denied,
    app_private.ecommerce_review_entitled() is not true as catalog_entitlement_denied`)
  requireCheck('Website review unbound identity fails closed',
    rows[0].capability_denied && rows[0].recipient_denied && rows[0].entitlement_denied && rows[0].catalog_entitlement_denied)
}


export async function verifyCatalogEntitlementMutations(database, requireCheck) {
  const { rows } = await database.query(websiteReviewCatalogQueries.functions)
  const previous = rows.filter(row => !['ecommerce_review_entitled','ecommerce_review_text_length','ecommerce_review_projection','ecommerce_review_preview_digest','ecommerce_review_operator_entitled','ecommerce_review_recipient_ready','guard_ecommerce_review','invalidate_ecommerce_reviews','guard_ecommerce_decision'].includes(row.proname))
  requireCheck('Ecommerce proof leaves every prior private function unchanged',
    createHash('sha256').update(JSON.stringify(previous)).digest('hex') === '43363d70f1d95f0f5eae86a5787c835f13424bdd4268e17e11308685224b5b37')
  for (const [name, sql] of [
    ['public execute', 'grant execute on function app_private.ecommerce_review_entitled() to public'],
    ['changed source', 'create or replace function app_private.ecommerce_review_entitled() returns boolean language sql stable security definer set search_path=pg_catalog,app_private as $$ select true $$'],
    ['renamed proof', 'alter function app_private.ecommerce_review_entitled() rename to unexpected_review_proof'],
  ]) {
    await database.exec('begin')
    try {
      await database.exec(sql)
      const actual = await websiteReviewCatalogDigests(database)
      requireCheck(`Ecommerce proof catalog rejects ${name}`, actual.functions !== expected.functions)
    } finally {
      await database.exec('rollback')
    }
  }
  requireCheck('Ecommerce proof mutation checks restore the catalog',
    (await websiteReviewCatalogDigests(database)).functions === expected.functions)
}

export async function verifyCatalogStorageMutations(database, requireCheck) {
  for (const [category, sql] of [
    ['relations', 'alter table app_private.ecommerce_customer_decisions disable row level security'],
    ['policies', 'drop policy ecommerce_decisions_insert on app_private.ecommerce_customer_decisions'],
    ['triggers', 'alter table app_private.ecommerce_customer_decisions disable trigger ecommerce_decision_guard'],
    ['relations', 'grant select on app_private.ecommerce_customer_decisions to authenticated'],
    ['functions', 'alter function app_private.guard_ecommerce_decision() security definer'],
    ['relations', 'alter table app_private.ecommerce_customer_reviews disable row level security'],
    ['policies', 'drop policy ecommerce_reviews_read on app_private.ecommerce_customer_reviews'],
    ['triggers', 'alter table app_private.workspace_state disable trigger ecommerce_reviews_invalidate'],
    ['relations', 'grant select on app_private.ecommerce_customer_reviews to authenticated'],
  ]) {
    await database.exec('begin')
    try {
      await database.exec(sql)
      requireCheck(`Catalog storage rejects ${sql}`, (await websiteReviewCatalogDigests(database))[category] !== expected[category])
    } finally { await database.exec('rollback') }
  }
}
