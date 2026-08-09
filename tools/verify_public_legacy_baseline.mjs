// Verifies the public legacy baseline against the browser-quarantine packet.
//
// The baseline CREATEs the pre-existing public catalog; the quarantine packet carries its own
// hardcoded inventory of the same tables and sequences and raises
// "public browser quarantine table inventory changed" if reality does not match it. Nothing
// tied the two files together, so adding a table to one and not the other stayed invisible
// until the packet aborted on an isolated hosted target, mid-rehearsal, with a paid preview
// branch running.
//
// This is a static check on purpose. The baseline needs pgvector and a real Postgres to
// execute, which PGlite cannot provide, so verify_private_trial_migrations deliberately
// excludes it — leaving the file exercised by nothing at all. Comparing the two inventories
// catches the realistic drift without needing a database.
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const baselinePath = resolve(root, 'supabase', 'migrations', '20260711081300_public_legacy_baseline.sql')
const quarantinePath = resolve(root, 'supabase', 'rehearsal', '20260804_public_browser_quarantine.sql')

const failures = []
const fail = (reason) => failures.push(reason)
const sorted = (values) => [...values].sort()
const unquote = (value) => value.replace(/^"|"$/g, '')

const [baseline, quarantine] = await Promise.all([
  readFile(baselinePath, 'utf8'),
  readFile(quarantinePath, 'utf8'),
])

// --- what the baseline builds -------------------------------------------------------------
const baselineTables = sorted(
  [...baseline.matchAll(/create table if not exists public\.("?[a-z_]+"?)/gi)].map((match) => unquote(match[1])),
)
const baselineSequences = sorted(
  [...baseline.matchAll(/create sequence if not exists public\.("?[a-z_]+"?)/gi)].map((match) => unquote(match[1])),
)

// --- what the quarantine packet expects to find ---------------------------------------------
const listBetween = (source, startMarker) => {
  const start = source.indexOf(startMarker)
  if (start < 0) return null
  const end = source.indexOf(']::text[]', start)
  if (end < 0) return null
  return sorted([...source.slice(start, end).matchAll(/'([a-z_]+)'/g)].map((match) => match[1]))
}
const expectedTables = listBetween(quarantine, 'expected_tables constant')
const expectedSequences = listBetween(quarantine, 'expected_sequences constant')

if (!expectedTables) fail('quarantine_expected_tables_unreadable')
if (!expectedSequences) fail('quarantine_expected_sequences_unreadable')

if (expectedTables && JSON.stringify(baselineTables) !== JSON.stringify(expectedTables)) {
  const onlyBaseline = baselineTables.filter((name) => !expectedTables.includes(name))
  const onlyQuarantine = expectedTables.filter((name) => !baselineTables.includes(name))
  fail(`table_inventory_drift baseline_only=[${onlyBaseline}] quarantine_only=[${onlyQuarantine}]`)
}
if (expectedSequences && JSON.stringify(baselineSequences) !== JSON.stringify(expectedSequences)) {
  fail(`sequence_inventory_drift baseline=[${baselineSequences}] quarantine=[${expectedSequences}]`)
}

// The baseline is the only place RLS gets enabled on these tables — the migration that does it
// in production was never committed here. Without this the whole legacy catalog comes back
// readable on any rebuild, which is what the quarantine exists to prevent.
if (!/enable row level security/i.test(baseline)) fail('baseline_does_not_enable_rls')

// Reserved words must stay quoted or the file will not parse on a real server.
for (const reserved of ['limit', 'timestamp', 'where', 'when']) {
  const bare = new RegExp(`[(,]\\s*${reserved}\\s+[a-z]`, 'i')
  if (bare.test(baseline)) fail(`baseline_unquoted_reserved_word_${reserved}`)
}

// Sequence defaults only work if the sequence is created before the table that references it.
for (const sequence of baselineSequences) {
  const created = baseline.indexOf(`create sequence if not exists public.${sequence}`)
  const referenced = baseline.indexOf(`nextval('public.${sequence}'`)
  if (referenced >= 0 && created > referenced) fail(`sequence_created_after_use_${sequence}`)
}

const result = {
  ok: failures.length === 0,
  contract: 'supermega.public-legacy-baseline.v1',
  tables: baselineTables.length,
  sequences: baselineSequences.length,
  inventoryMatchesQuarantine: failures.length === 0,
  ...(failures.length ? { failures } : {}),
}
console.log(JSON.stringify(result, null, 2))
if (failures.length) process.exitCode = 1
