#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises'
import { extname, resolve } from 'node:path'

const CONTRACT = 'supermega.supabase-current-compatibility.v1'
const root = resolve(import.meta.dirname, '..')
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.ps1', '.sql', '.json', '.yml', '.yaml'])
const SCAN_ROOTS = ['supabase', 'kernel', 'showroom/src', 'tools', '.github']
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_FILES = 5_000
const REMOVED_POSTGRES_17_EXTENSIONS = new Set(['timescaledb', 'plv8', 'pls', 'plcoffee', 'pgjwt'])
const DEPRECATED_LOGS_ENDPOINT = ['logs', 'all'].join('.')
const PUBLIC_TABLE_AUTO_EXPOSURE_CHANGE = '2026-10-30'
const DROP_INDEX_REVIEW_REQUIREMENT = 'separate_reviewed_migration_with_query_evidence'
const SQL_IDENTIFIER_PATTERN = String.raw`(?:"(?:[^"]|"")*"|[a-z_][a-z0-9_$]*)`
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

function normalizeSqlIdentifier(value) {
  const identifier = String(value || '').trim()
  if (identifier.startsWith('"') && identifier.endsWith('"')) {
    return identifier.slice(1, -1).replaceAll('""', '"').toLowerCase()
  }
  return identifier.toLowerCase()
}

function publicTableCreateRegex() {
  return new RegExp(String.raw`\bcreate\s+(?:unlogged\s+|temporary\s+|temp\s+)?table\s+(?:if\s+not\s+exists\s+)?public\.(${SQL_IDENTIFIER_PATTERN})\b`, 'ig')
}

function publicTablePrivilegePostureRegex() {
  return new RegExp(String.raw`\b(?:grant|revoke)\b[\s\S]*?\bon\s+(?:table\s+)?(?:only\s+)?public\.(${SQL_IDENTIFIER_PATTERN})\b[\s\S]*?\b(?:to|from)\s+(?:public|anon|authenticated|service_role)\b`, 'ig')
}

export function compatibilityFindings(path, text) {
  const findings = []
  const normalizedPath = normalizePath(path)
  if (String(text).toLowerCase().includes(DEPRECATED_LOGS_ENDPOINT)) {
    findings.push({ path: normalizedPath, code: 'deprecated_management_logs_endpoint' })
  }
  if (extname(path).toLowerCase() !== '.sql') return findings

  for (const statement of sqlStatements(String(text))) {
    if (/\bdrop\s+index\b/i.test(statement)) {
      findings.push({
        path: normalizedPath,
        code: 'drop_index_requires_reviewed_query_evidence',
        requiredEvidence: DROP_INDEX_REVIEW_REQUIREMENT,
      })
    }
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
  return findings
}

export function publicTableExposureFindings(sqlSources) {
  const createdTables = []
  const tablesWithExplicitPosture = new Set()

  for (const source of sqlSources) {
    const normalizedPath = normalizePath(source.path)
    for (const statement of sqlStatements(String(source.text))) {
      const createRegex = publicTableCreateRegex()
      for (let match = createRegex.exec(statement); match; match = createRegex.exec(statement)) {
        createdTables.push({
          path: normalizedPath,
          table: normalizeSqlIdentifier(match[1]),
        })
      }

      const postureRegex = publicTablePrivilegePostureRegex()
      for (let match = postureRegex.exec(statement); match; match = postureRegex.exec(statement)) {
        tablesWithExplicitPosture.add(normalizeSqlIdentifier(match[1]))
      }
    }
  }

  return createdTables
    .filter((table) => !tablesWithExplicitPosture.has(table.table))
    .map((table) => ({
      path: table.path,
      code: 'public_table_exposure_posture_missing',
      table: table.table,
      requiredPosture: 'explicit_table_grant_or_revoke_for_public_anon_authenticated_or_service_role',
      effectiveChangeDate: PUBLIC_TABLE_AUTO_EXPOSURE_CHANGE,
    }))
}

async function scanRepository() {
  const files = []
  for (const relativeRoot of SCAN_ROOTS) await sourceFiles(resolve(root, relativeRoot), files)
  files.sort()
  const findings = []
  const sqlSources = []
  let managedSqlFiles = 0
  for (const path of files) {
    const bytes = await readFile(path)
    if (bytes.length > MAX_FILE_BYTES) throw new Error(`supabase_compatibility_file_too_large:${normalizePath(path).replace(`${normalizePath(root)}/`, '')}`)
    const text = bytes.toString('utf8')
    if (extname(path).toLowerCase() === '.sql') {
      managedSqlFiles += 1
      sqlSources.push({ path, text })
    }
    findings.push(...compatibilityFindings(path, text))
  }
  findings.push(...publicTableExposureFindings(sqlSources))
  return { files, findings, managedSqlFiles }
}

function runSelfTest() {
  const safe = compatibilityFindings('safe.sql', 'create extension if not exists "pgcrypto";')
  const pinned = compatibilityFindings('pinned.sql', ['create extension pgcrypto ', 'version \'1.3\';'].join(''))
  const removed = compatibilityFindings('removed.sql', ['create extension ', 'plv8;'].join(''))
  const deprecated = compatibilityFindings('client.ts', `const endpoint = '${['logs', 'all'].join('.')}'`)
  const dropIndex = compatibilityFindings('advisor-output.sql', 'drop index if exists public.idx_shop_orders_created_at;')
  const commentOnly = compatibilityFindings('comment.sql', '-- create extension plv8 version \'1\';\n-- drop index public.idx_comment_only;\nselect 1;')
  const publicMissing = publicTableExposureFindings([
    { path: '202610_public_missing.sql', text: 'create table public.unreviewed_browser_surface (id uuid primary key);' },
  ])
  const publicRevoked = publicTableExposureFindings([
    {
      path: '202610_public_revoked.sql',
      text: 'create table if not exists public.quarantined_surface (id uuid primary key);\nrevoke all privileges on table public.quarantined_surface from public, anon, authenticated;',
    },
  ])
  const publicGranted = publicTableExposureFindings([
    {
      path: '202610_public_granted.sql',
      text: 'create table public.reviewed_surface (id uuid primary key);\ngrant select on public.reviewed_surface to anon;',
    },
  ])
  const publicCrossFile = publicTableExposureFindings([
    { path: '202610_create.sql', text: 'create table public.cross_file_surface (id uuid primary key);' },
    { path: '202610_quarantine.sql', text: 'revoke all privileges on table public.cross_file_surface from public, anon, authenticated;' },
  ])
  const privateTable = publicTableExposureFindings([
    { path: '202610_private.sql', text: 'create table app_private.internal_surface (id uuid primary key);' },
  ])
  const checks = {
    allow_default_extension_version: safe.length === 0,
    reject_extension_version_pin: pinned.some((item) => item.code === 'extension_version_pin_forbidden'),
    reject_removed_postgres17_extension: removed.some((item) => item.code === 'postgres17_removed_extension'),
    reject_deprecated_logs_endpoint: deprecated.some((item) => item.code === 'deprecated_management_logs_endpoint'),
    reject_drop_index_without_reviewed_query_evidence: dropIndex.some((item) => item.code === 'drop_index_requires_reviewed_query_evidence' && item.requiredEvidence === DROP_INDEX_REVIEW_REQUIREMENT),
    ignore_sql_comments: commentOnly.length === 0,
    reject_public_table_without_explicit_posture: publicMissing.some((item) => item.code === 'public_table_exposure_posture_missing'),
    allow_public_table_with_explicit_revoke: publicRevoked.length === 0,
    allow_public_table_with_explicit_grant: publicGranted.length === 0,
    allow_cross_file_public_table_quarantine: publicCrossFile.length === 0,
    ignore_private_schema_table: privateTable.length === 0,
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
      managementLogsEndpointRemoval: '2026-09-23',
      extensionVersionClauseIgnoredFrom: '2026-08-05',
      publicTableAutoExposureChange: PUBLIC_TABLE_AUTO_EXPOSURE_CHANGE,
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
