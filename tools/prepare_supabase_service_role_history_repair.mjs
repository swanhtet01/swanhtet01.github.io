// Generates a reviewed metadata-only parent ledger repair. Never connects to Supabase.
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const sourcePath = resolve(root, 'supabase/recovery/20260812141300_public_service_role_replay_grants.sql')
const source = (await readFile(sourcePath, 'utf8')).replace(/\r\n/g, '\n')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')
const md5 = (value) => createHash('md5').update(value).digest('hex')
const expectedSha256 = '41a76b8f0b8c7930def0f1af964a8a2381b7492af26337289a4508dda2f784af'
const expectedMd5 = 'bb4cc2f6fdfcea26f2d4f6ebc98912fb'
if (sha256(source) !== expectedSha256 || md5(source) !== expectedMd5) {
  throw new Error('service_role_grant_statement_changed')
}

const tableGrant = source.match(/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE\n([\s\S]*?)\nTO service_role;/)
const sequenceGrant = source.match(/GRANT USAGE, SELECT ON SEQUENCE\n([\s\S]*?)\nTO service_role;/)
if (!tableGrant || !sequenceGrant) throw new Error('grant_inventory_missing')
const names = (block) => [...block.matchAll(/public\.([a-z_]+)/g)].map((match) => match[1])
const tables = names(tableGrant[1]).sort()
const sequences = names(sequenceGrant[1]).sort()
if (tables.length !== 27 || new Set(tables).size !== 27 ||
    sequences.length !== 2 || new Set(sequences).size !== 2) {
  throw new Error('grant_inventory_changed')
}
const sqlArray = (items) => `ARRAY[${items.map((item) => `'${item}'`).join(', ')}]::text[]`
const encoded = Buffer.from(source, 'utf8').toString('base64').match(/.{1,120}/g)
  .map((chunk) => `'${chunk}'`).join('\n    || ')

const sql = `-- REVIEW ONLY. Target: production parent zvtzwcimpvvtkowflhda.
-- Insert one historical replay prerequisite before 20260812141352 quarantine.
-- Grant DDL is stored in migration history; it is NOT executed on production.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
LOCK TABLE supabase_migrations.schema_migrations IN SHARE ROW EXCLUSIVE MODE;
DO $preflight$
DECLARE
  actual_tables text[];
  actual_sequences text[];
  missing_grants integer;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'service_role_history_repair_requires_postgres';
  END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 19 THEN
    RAISE EXCEPTION 'parent_migration_count_changed';
  END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE version = '20260812141300') THEN
    RAISE EXCEPTION 'service_role_grant_history_already_recorded';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE version = '20260711081300' AND name = 'public_legacy_baseline'
        AND md5(statements[1]) = '25c31b57c571a503adff2522f1ffde75') THEN
    RAISE EXCEPTION 'parent_baseline_history_changed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE version = '20260812141352' AND name = 'public_browser_quarantine'
        AND md5(statements[1]) = '7af3b2aaa2aa13dbc90b51b1cfc12521') THEN
    RAISE EXCEPTION 'quarantine_history_changed';
  END IF;
  SELECT coalesce(array_agg(c.relname ORDER BY c.relname), ARRAY[]::text[])
    INTO actual_tables
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');
  SELECT coalesce(array_agg(c.relname ORDER BY c.relname), ARRAY[]::text[])
    INTO actual_sequences
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'S';
  IF actual_tables <> ${sqlArray(tables)} OR actual_sequences <> ${sqlArray(sequences)} THEN
    RAISE EXCEPTION 'production_legacy_catalog_changed';
  END IF;
  SELECT count(*) INTO missing_grants FROM (
    SELECT 1 FROM unnest(${sqlArray(tables)}) t(name)
      CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p(privilege)
     WHERE NOT has_table_privilege('service_role', format('public.%I', t.name), p.privilege)
    UNION ALL
    SELECT 1 FROM unnest(${sqlArray(sequences)}) s(name)
      CROSS JOIN unnest(ARRAY['USAGE', 'SELECT']) p(privilege)
     WHERE NOT has_sequence_privilege('service_role', format('public.%I', s.name), p.privilege)
  ) missing;
  IF missing_grants <> 0 THEN
    RAISE EXCEPTION 'production_service_role_grants_changed';
  END IF;
END;
$preflight$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260812141300', 'public_service_role_replay_grants',
  ARRAY[convert_from(decode(
    ${encoded},
    'base64'), 'UTF8')]::text[]);

DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE version = '20260812141300'
        AND name = 'public_service_role_replay_grants'
        AND array_length(statements, 1) = 1
        AND md5(statements[1]) = '${expectedMd5}') THEN
    RAISE EXCEPTION 'service_role_history_readback_failed';
  END IF;
END;
$verify$;
COMMIT;
`

const outIndex = process.argv.indexOf('--out')
if (outIndex >= 0) {
  const output = process.argv[outIndex + 1]
  if (!output || outIndex + 2 !== process.argv.length) throw new Error('usage: --out <path>')
  await writeFile(output, sql, { flag: 'wx' })
} else if (process.argv.length > 2) {
  throw new Error('usage: [--out <path>]')
}
process.stdout.write(JSON.stringify({
  target: 'zvtzwcimpvvtkowflhda',
  version: '20260812141300',
  sourceSha256: expectedSha256,
  statementMd5: expectedMd5,
  sqlBytes: Buffer.byteLength(sql),
  sqlSha256: sha256(sql),
  wroteFile: outIndex >= 0,
}) + '\n')
