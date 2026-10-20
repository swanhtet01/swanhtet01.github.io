// Generates a metadata-only parent migration-history repair for review.
// This script never connects to Supabase or executes SQL.
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const baselinePath = resolve(root, 'supabase/migrations/20260711081300_public_legacy_baseline.sql')
const source = await readFile(baselinePath)
// Git stores LF while Windows checkouts can have CRLF. Pin the repository text,
// then reproduce the exact CRLF statement recorded on the data-less preview.
const canonicalSource = source.toString('utf8').replace(/\r\n/g, '\n')
const sourceSha256 = createHash('sha256').update(canonicalSource).digest('hex')
const expectedSourceSha256 = '3de413eedcac9dfade90a25b0759e7b7708cf9e773128a881c30e00f2211dd7c'
if (sourceSha256 !== expectedSourceSha256) throw new Error('baseline_source_digest_changed')

// The data-less preview has one extra CRLF at the end of its recorded statement.
const statement = `${canonicalSource.replace(/\n/g, '\r\n')}\r\n`
const statementMd5 = createHash('md5').update(statement).digest('hex')
const expectedStatementMd5 = '25c31b57c571a503adff2522f1ffde75'
if (statementMd5 !== expectedStatementMd5) throw new Error('preview_statement_digest_changed')

const legacyTables = [...statement.matchAll(/^create table if not exists public\.([a-z_]+)\b/gim)]
  .map((match) => match[1]).sort()
if (legacyTables.length !== 27 || new Set(legacyTables).size !== 27) {
  throw new Error('legacy_table_inventory_changed')
}

const catalogQuery = `
WITH legacy(name) AS (VALUES ${legacyTables.map((table) => `('${table}')`).join(', ')}),
rels AS (
  SELECT c.oid, c.relname, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN legacy l ON l.name = c.relname
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
),
cols AS (
  SELECT concat_ws('|', t.relname, a.attname, format_type(a.atttypid, a.atttypmod),
    a.attnotnull, a.attidentity, coalesce(pg_get_expr(d.adbin, d.adrelid), '')) AS v
  FROM rels t JOIN pg_attribute a ON a.attrelid = t.oid
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attnum > 0 AND NOT a.attisdropped
),
cons AS (
  SELECT concat_ws('|', t.relname, con.conname, pg_get_constraintdef(con.oid)) AS v
  FROM rels t JOIN pg_constraint con ON con.conrelid = t.oid
),
idx AS (
  SELECT concat_ws('|', t.relname, ic.relname, pg_get_indexdef(i.indexrelid)) AS v
  FROM rels t JOIN pg_index i ON i.indrelid = t.oid
  JOIN pg_class ic ON ic.oid = i.indexrelid
),
rls AS (SELECT concat_ws('|', relname, relrowsecurity, relforcerowsecurity) AS v FROM rels),
pol AS (
  SELECT concat_ws('|', t.relname, p.polname, pg_get_expr(p.polqual, p.polrelid),
    pg_get_expr(p.polwithcheck, p.polrelid)) AS v
  FROM rels t JOIN pg_policy p ON p.polrelid = t.oid
)
SELECT (SELECT count(*) FROM rels) AS tables,
  (SELECT count(*) FROM cols) AS columns,
  (SELECT md5(string_agg(v, E'\\n' ORDER BY v)) FROM cols) AS columns_md5,
  (SELECT count(*) FROM cons) AS constraints,
  (SELECT md5(string_agg(v, E'\\n' ORDER BY v)) FROM cons) AS constraints_md5,
  (SELECT count(*) FROM idx) AS indexes,
  (SELECT md5(string_agg(v, E'\\n' ORDER BY v)) FROM idx) AS indexes_md5,
  (SELECT md5(string_agg(v, E'\\n' ORDER BY v)) FROM rls) AS rls_md5,
  (SELECT count(*) FROM pol) AS policies
`

// Base64 preserves the exact CRLF bytes even if Git or an editor changes the
// generated SQL file's line endings. The source file above remains the readable
// statement for review, bound by SHA-256 and the preview statement's MD5.
const base64 = Buffer.from(statement, 'utf8').toString('base64')
const chunks = base64.match(/.{1,120}/g) ?? []
const encodedStatement = chunks.map((chunk) => `'${chunk}'`).join('\n    || ')
const sql = `-- REVIEW ONLY. Target: production project zvtzwcimpvvtkowflhda.
-- This records the already-existing legacy schema as migration history. It does
-- not execute the baseline DDL, copy data, or change customer-facing tables.
-- Execute only after a fresh provider preflight and separate owner approval.
BEGIN;
DO $preflight$
DECLARE actual record;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'parent_baseline_repair_requires_postgres';
  END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> 18 THEN
    RAISE EXCEPTION 'parent_migration_count_changed';
  END IF;
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE version = '20260711081300') THEN
    RAISE EXCEPTION 'baseline_already_recorded';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE version = '20260711081400'
        AND name = 'enable_rls_public_tables_20260711'
        AND md5(statements[1]) = '5fa589aa53149fa0e57edfe4c7d6f67c') THEN
    RAISE EXCEPTION 'first_parent_migration_changed';
  END IF;
  ${catalogQuery.replace(/\n/g, '\n  ')} INTO actual;
  IF actual.tables <> 27 OR actual.columns <> 370
    OR actual.columns_md5 <> 'db722d8a3df8bbb5b52372e2294926d9'
    OR actual.constraints <> 53
    OR actual.constraints_md5 <> '37ab9b0fa3a7a4ef42eb01f88a983032'
    OR actual.indexes <> 114
    OR actual.indexes_md5 <> 'ce6af6aad3607e894d1ded452bf4a331'
    OR actual.rls_md5 <> '68d8cbcef1fcfcdbfb624f96ea98cd07'
    OR actual.policies <> 0 THEN
    RAISE EXCEPTION 'legacy_catalog_parity_changed';
  END IF;
END;
$preflight$;

INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260711081300', 'public_legacy_baseline',
  ARRAY[convert_from(decode(
    ${encodedStatement},
    'base64'), 'UTF8')]::text[]);

DO $verify$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE version = '20260711081300'
        AND name = 'public_legacy_baseline'
        AND array_length(statements, 1) = 1
        AND md5(statements[1]) = '${expectedStatementMd5}') THEN
    RAISE EXCEPTION 'baseline_ledger_readback_failed';
  END IF;
END;
$verify$;
COMMIT;
`

const outIndex = process.argv.indexOf('--out')
if (outIndex >= 0) {
  const output = process.argv[outIndex + 1]
  if (!output || outIndex + 2 !== process.argv.length) throw new Error('usage: --out <path>')
  await writeFile(resolve(output), sql, { flag: 'wx' })
}

console.log(JSON.stringify({
  contract: 'supermega.supabase.parent-baseline-ledger-repair.v1',
  mode: outIndex >= 0 ? 'generated_sql_not_executed' : 'verified_source_only',
  sourceSha256,
  statementMd5,
  tableCount: legacyTables.length,
  sqlSha256: createHash('sha256').update(sql).digest('hex'),
  sqlBytes: Buffer.byteLength(sql),
}, null, 2))
