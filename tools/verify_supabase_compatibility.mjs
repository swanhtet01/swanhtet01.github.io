#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises'
import { extname, resolve } from 'node:path'

const CONTRACT = 'supermega.supabase-current-compatibility.v2'
const root = resolve(import.meta.dirname, '..')
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.ps1', '.sql', '.json', '.yml', '.yaml'])
const SCAN_ROOTS = ['supabase', 'kernel', 'showroom/src', 'tools', '.github']
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_FILES = 5_000
const REMOVED_POSTGRES_17_EXTENSIONS = new Set(['timescaledb', 'plv8', 'pls', 'plcoffee', 'pgjwt'])
const DEPRECATED_LOGS_ENDPOINT = ['logs', 'all'].join('.')
const SELF_PATH = resolve(import.meta.filename)

function normalizePath(value) {
  return value.replaceAll('\\', '/')
}

async function sourceFiles(directory, output = []) {
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue
    const absolute = resolve(directory, entry.name)
    if (entry.isDirectory()) await sourceFiles(absolute, output)
    else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase()) && absolute !== SELF_PATH) {
      output.push(absolute)
      if (output.length > MAX_FILES) throw new Error('supabase_compatibility_file_limit_exceeded')
    }
  }
  return output
}

function sqlStatements(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function addPublicTableContractFindings(path, statements, findings) {
  const normalizedPath = normalizePath(path)
  const createdTables = new Set()
  for (const statement of statements) {
    const match = /\bcreate\s+table(?:\s+if\s+not\s+exists)?\s+"?public"?\s*\.\s*"?([a-z0-9_]+)"?/i.exec(statement)
    if (match) createdTables.add(match[1].toLowerCase())
  }

  for (const table of createdTables) {
    const tablePattern = `"?public"?\\s*\\.\\s*"?${escapeRegExp(table)}"?`
    const rlsPattern = new RegExp(`\\balter\\s+table(?:\\s+if\\s+exists)?\\s+${tablePattern}\\s+enable\\s+row\\s+level\\s+security\\b`, 'i')
    const revokePattern = new RegExp(`\\brevoke\\s+all(?:\\s+privileges)?\\s+on(?:\\s+table)?\\s+${tablePattern}\\s+from\\s+(.+)$`, 'i')
    const grantPattern = new RegExp(`\\bgrant\\s+(?:all(?:\\s+privileges)?|(?:select|insert|update|delete|truncate|references|trigger)(?:\\s*,\\s*(?:select|insert|update|delete|truncate|references|trigger))*)\\s+on(?:\\s+table)?\\s+${tablePattern}\\s+to\\s+service_role\\b`, 'i')

    if (!statements.some((statement) => rlsPattern.test(statement))) {
      findings.push({ path: normalizedPath, code: 'public_table_rls_missing', table })
    }

    const revokedClientRoles = new Set()
    for (const statement of statements) {
      const match = revokePattern.exec(statement)
      if (!match) continue
      for (const role of match[1].match(/\b(?:public|anon|authenticated)\b/gi) || []) revokedClientRoles.add(role.toLowerCase())
    }
    if (!['public', 'anon', 'authenticated'].every((role) => revokedClientRoles.has(role))) {
      findings.push({ path: normalizedPath, code: 'public_table_client_revoke_missing', table })
    }

    if (!statements.some((statement) => grantPattern.test(statement))) {
      findings.push({ path: normalizedPath, code: 'public_table_service_grant_missing', table })
    }
  }
}

export function compatibilityFindings(path, text) {
  const findings = []
  const normalizedPath = normalizePath(path)
  if (String(text).toLowerCase().includes(DEPRECATED_LOGS_ENDPOINT)) {
    findings.push({ path: normalizedPath, code: 'deprecated_management_logs_endpoint' })
  }
  if (extname(path).toLowerCase() !== '.sql') return findings

  const statements = sqlStatements(String(text))
  for (const statement of statements) {
    const match = /\b(?:create|alter)\s+extension(?:\s+if\s+not\s+exists)?\s+"?([a-z0-9_]+)"?/i.exec(statement)
    if (!match) continue
    const extension = match[1].toLowerCase()
    if (/\bversion\b/i.test(statement)) {
      findings.push({ path: normalizedPath, code: 'extension_version_pin_forbidden', extension })
    }
    if (REMOVED_POSTGRES_17_EXTENSIONS.has(extension)) {
      findings.push({ path: normalizedPath, code: 'postgres17_removed_extension', extension })
    }
  }
  addPublicTableContractFindings(path, statements, findings)
  return findings
}

async function scanRepository() {
  const files = []
  for (const relativeRoot of SCAN_ROOTS) await sourceFiles(resolve(root, relativeRoot), files)
  files.sort()
  const findings = []
  let managedSqlFiles = 0
  for (const path of files) {
    const bytes = await readFile(path)
    if (bytes.length > MAX_FILE_BYTES) throw new Error(`supabase_compatibility_file_too_large:${normalizePath(path).replace(`${normalizePath(root)}/`, '')}`)
    if (extname(path).toLowerCase() === '.sql') managedSqlFiles += 1
    findings.push(...compatibilityFindings(path, bytes.toString('utf8')))
  }
  return { files, findings, managedSqlFiles }
}

function runSelfTest() {
  const safe = compatibilityFindings('safe.sql', 'create extension if not exists "pgcrypto";')
  const safePublicTable = compatibilityFindings('safe-public.sql', `
    create table if not exists public.example_records (id text primary key);
    alter table public.example_records enable row level security;
    revoke all on table public.example_records from PUBLIC, anon, authenticated;
    grant select, insert on table public.example_records to service_role;
  `)
  const missingRls = compatibilityFindings('missing-rls.sql', `
    create table public.example_records (id text primary key);
    revoke all on public.example_records from public, anon, authenticated;
    grant select on public.example_records to service_role;
  `)
  const missingPublicRevoke = compatibilityFindings('missing-public-revoke.sql', `
    create table public.example_records (id text primary key);
    alter table public.example_records enable row level security;
    revoke all on public.example_records from anon, authenticated;
    grant select on public.example_records to service_role;
  `)
  const missingServiceGrant = compatibilityFindings('missing-service-grant.sql', `
    create table public.example_records (id text primary key);
    alter table public.example_records enable row level security;
    revoke all on public.example_records from public, anon, authenticated;
  `)
  const pinned = compatibilityFindings('pinned.sql', ['create extension pgcrypto ', 'version \'1.3\';'].join(''))
  const removed = compatibilityFindings('removed.sql', ['create extension ', 'plv8;'].join(''))
  const deprecated = compatibilityFindings('client.ts', `const endpoint = '${['logs', 'all'].join('.')}'`)
  const commentOnly = compatibilityFindings('comment.sql', '-- create extension plv8 version \'1\';\nselect 1;')
  const checks = {
    allow_default_extension_version: safe.length === 0,
    reject_extension_version_pin: pinned.some((item) => item.code === 'extension_version_pin_forbidden'),
    reject_removed_postgres17_extension: removed.some((item) => item.code === 'postgres17_removed_extension'),
    reject_deprecated_logs_endpoint: deprecated.some((item) => item.code === 'deprecated_management_logs_endpoint'),
    ignore_sql_comments: commentOnly.length === 0,
    allow_explicit_public_table_contract: safePublicTable.length === 0,
    reject_public_table_without_rls: missingRls.some((item) => item.code === 'public_table_rls_missing'),
    reject_public_table_without_public_revoke: missingPublicRevoke.some((item) => item.code === 'public_table_client_revoke_missing'),
    reject_public_table_without_service_grant: missingServiceGrant.some((item) => item.code === 'public_table_service_grant_missing'),
  }
  return { ok: Object.values(checks).every(Boolean), contract: CONTRACT, mode: 'offline_self_test', checks }
}

async function main() {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== '--self-test')) throw new Error('supabase_compatibility_argument_invalid')
  if (args.includes('--self-test')) return runSelfTest()
  const result = await scanRepository()
  return {
    ok: result.findings.length === 0,
    contract: CONTRACT,
    checkedFiles: result.files.length,
    managedSqlFiles: result.managedSqlFiles,
    findings: result.findings,
    currentSupabaseChanges: {
      dataApiExplicitGrantsEnforcedForAllProjects: '2026-10-30',
      managementLogsEndpointRemoval: '2026-09-23',
      extensionVersionClauseIgnoredFrom: '2026-08-05',
    },
    controls: {
      networkRequests: 0,
      databaseConnections: 0,
      providerMutations: 0,
      symlinksFollowed: false,
    },
  }
}

try {
  const result = await main()
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (!result.ok) process.exitCode = 1
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, contract: CONTRACT, error: error instanceof Error ? error.message : 'unknown_error' })}\n`)
  process.exitCode = 1
}
