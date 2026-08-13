#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { lstat, readFile, readdir, realpath } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve } from 'node:path'

const CONTRACT = 'supermega.supabase-current-compatibility.v2'
const root = resolve(import.meta.dirname, '..')
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.py', '.ps1', '.sql', '.json', '.yml', '.yaml'])
const SCAN_ROOTS = ['supabase', 'kernel', 'showroom/src', 'tools', '.github']
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_FILES = 5_000
const REMOVED_POSTGRES_17_EXTENSIONS = new Set(['timescaledb', 'plv8', 'pls', 'plcoffee', 'pgjwt'])
const SELF_PATH = resolve(import.meta.filename)
const PUBLIC_TABLE_ROLES = ['anon', 'authenticated', 'service_role']
const BROWSER_INHERITED_ROLES = ['public', 'anon', 'authenticated']
const ALLOWED_UNPINNED_TABLE_SCHEMAS = new Set(['public', 'app_private'])
const LEGACY_PUBLIC_BASELINE = 'supabase/migrations/20260711081300_public_legacy_baseline.sql'
const LEGACY_PUBLIC_BASELINE_DIGEST = '62fd51a8ab2a448f63893129f35d9a29bd5b99697bcd8ac095451aa5350f8c36'
const IMMUTABLE_MANAGED_MIGRATIONS = new Map([
  [LEGACY_PUBLIC_BASELINE, LEGACY_PUBLIC_BASELINE_DIGEST],
  ['supabase/migrations/20260722004500_private_trial_backend_role_preflight.sql', 'a1a5077b1834c291c54658d5ba2c7625bd9bf37da78b9a8ac919d10f16c4ddae'],
  ['supabase/migrations/20260722005134_private_trial_backend_foundation.sql', 'dd4e8c16c4405ba003f13688fa7313da9c89fb33c46f092ec7a6d856c35c76b9'],
  ['supabase/migrations/20260722142801_private_trial_backend_v2.sql', 'aac79f1696602705e4d3521f2978b86f00a53afd1aac907de91cb257469fed42'],
  ['supabase/migrations/20260723094500_private_trial_backend_v3_website.sql', '6db99a0eef5b200bef77808de0562bdb1a35c8c5752e7b4831c5f95e8c441343'],
  ['supabase/migrations/20260723144500_private_trial_backend_v4_hardening.sql', 'a475e5d88ba3c5c761e2c05f563bbda6707da1bce8b26e1abe47339028c1e435'],
  ['supabase/migrations/20260724204920_private_trial_backend_v5_read_capabilities.sql', '5d63e803dffb8580109629a245695519040f774007a5178af21960e14d356998'],
  ['supabase/migrations/20260730113000_private_trial_backend_v6_managed_activation.sql', 'cb796a132bfd49662deeac3d5a0a11a8961ed7743127f40994a27c359596955c'],
  ['supabase/migrations/20260730123000_private_trial_backend_v7_workspace_discovery.sql', '1012f1a744186eedf87b0c16f03c8a363a7668dfed576943e258bb8fd54bc201'],
  ['supabase/migrations/20260802161500_private_trial_backend_v8_rls_initplan.sql', '61e711bb62e9fee8f0f8724004d68ff715696d5183a52a9dca418db003c241c6'],
  ['supabase/migrations/20260803063822_private_trial_backend_v9_metadata_rls.sql', '11db3e7ebb9698b6572c1405120efd887bf4cc5d9d4a440681ed8156cc967c1d'],
  ['supabase/migrations/20260804102000_private_trial_backend_v10_supabase_session_revocation.sql', '0a112ee27bda7ca238f3992ffab841c414268e44aad6b68023c75915afa40cde'],
])
const IMMUTABLE_MANAGED_MIGRATION_DIGESTS = new Set(IMMUTABLE_MANAGED_MIGRATIONS.values())
const SQL_DOLLAR_TAG = /^\$(?:(?:[A-Za-z_]|[^\x00-\x7F])(?:[A-Za-z0-9_]|[^\x00-\x7F])*)?\$/u
const SOURCE_TOKEN_GAP = String.raw`(?:\s|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*(?:\r?\n|$))*`
const SOURCE_TRANSPARENT_ASSERTION = String.raw`${SOURCE_TOKEN_GAP}(?:!)?${SOURCE_TOKEN_GAP}(?:\))*${SOURCE_TOKEN_GAP}`
const SOURCE_OPTIONAL_CALL = String.raw`${SOURCE_TOKEN_GAP}(?:\?\.)?${SOURCE_TOKEN_GAP}\(`
const DEPRECATED_LOGS_DOT_CALL = new RegExp(String.raw`\blogs${SOURCE_TRANSPARENT_ASSERTION}(?:\?\.|\.)${SOURCE_TOKEN_GAP}all${SOURCE_TOKEN_GAP}(?:!)?${SOURCE_OPTIONAL_CALL}`, 'i')
const DEPRECATED_LOGS_BRACKET_CALL = new RegExp(String.raw`\blogs${SOURCE_TRANSPARENT_ASSERTION}(?:\?\.)?${SOURCE_TOKEN_GAP}\[${SOURCE_TOKEN_GAP}['"\x60]all['"\x60]${SOURCE_TOKEN_GAP}\]${SOURCE_TOKEN_GAP}(?:!)?${SOURCE_OPTIONAL_CALL}`, 'i')
const DEPRECATED_BRACKET_LOGS_DOT_CALL = new RegExp(String.raw`\[${SOURCE_TOKEN_GAP}['"\x60]logs['"\x60]${SOURCE_TOKEN_GAP}\]${SOURCE_TRANSPARENT_ASSERTION}(?:\?\.|\.)${SOURCE_TOKEN_GAP}all${SOURCE_TOKEN_GAP}(?:!)?${SOURCE_OPTIONAL_CALL}`, 'i')
const DEPRECATED_BRACKET_LOGS_BRACKET_CALL = new RegExp(String.raw`\[${SOURCE_TOKEN_GAP}['"\x60]logs['"\x60]${SOURCE_TOKEN_GAP}\]${SOURCE_TRANSPARENT_ASSERTION}(?:\?\.)?${SOURCE_TOKEN_GAP}\[${SOURCE_TOKEN_GAP}['"\x60]all['"\x60]${SOURCE_TOKEN_GAP}\]${SOURCE_TOKEN_GAP}(?:!)?${SOURCE_OPTIONAL_CALL}`, 'i')
const DEPRECATED_LOGS_BOUNDED_CALL = new RegExp(String.raw`(?:\blogs\b|['"\x60]logs['"\x60])[\s\S]{0,192}?(?:\ball\b|['"\x60]all['"\x60])${SOURCE_TOKEN_GAP}(?:!)?${SOURCE_OPTIONAL_CALL}`, 'i')

function normalizePath(value) {
  return value.replaceAll('\\', '/')
}

function normalizeTextNewlines(value) {
  return String(value).replace(/\r\n?/g, '\n')
}

function isSqlIdentifierContinuation(value) {
  return typeof value === 'string' && /^(?:[A-Za-z0-9_$]|[^\x00-\x7F])$/u.test(value)
}

function previousCodePoint(source, index) {
  if (index <= 0) return null
  let start = index - 1
  const trailing = source.charCodeAt(start)
  if (trailing >= 0xDC00 && trailing <= 0xDFFF && start > 0) {
    const leading = source.charCodeAt(start - 1)
    if (leading >= 0xD800 && leading <= 0xDBFF) start -= 1
  }
  return { value: source.slice(start, index), start }
}

function usesDeprecatedLogsEndpoint(text) {
  const source = String(text).replace(/\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})|\\x([0-9a-f]{2})/gi, (_, codePoint, fourDigit, twoDigit) => {
    const value = Number.parseInt(codePoint || fourDigit || twoDigit, 16)
    return value <= 0x10FFFF && !(value >= 0xD800 && value <= 0xDFFF) ? String.fromCodePoint(value) : ' '
  })
  return DEPRECATED_LOGS_DOT_CALL.test(source)
    || DEPRECATED_LOGS_BRACKET_CALL.test(source)
    || DEPRECATED_BRACKET_LOGS_DOT_CALL.test(source)
    || DEPRECATED_BRACKET_LOGS_BRACKET_CALL.test(source)
    || DEPRECATED_LOGS_BOUNDED_CALL.test(source)
}

async function sourceFiles(directory, output = []) {
  const directoryStat = await lstat(directory)
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    throw new Error(`supabase_compatibility_scan_root_invalid:${normalizePath(directory)}`)
  }
  const entries = await readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const absolute = resolve(directory, entry.name)
    if (entry.isSymbolicLink()) throw new Error(`supabase_compatibility_symlink_forbidden:${normalizePath(absolute)}`)
    if (entry.isDirectory()) await sourceFiles(absolute, output)
    else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name).toLowerCase()) && absolute !== SELF_PATH) {
      output.push(absolute)
      if (output.length > MAX_FILES) throw new Error('supabase_compatibility_file_limit_exceeded')
    }
  }
  return output
}

async function trackedSqlFiles() {
  const { spawnSync } = await import('node:child_process')
  const result = spawnSync('git', ['ls-files', '-z', '--', '*.sql'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
  })
  if (result.error || result.status !== 0 || result.signal !== null) throw new Error('supabase_compatibility_git_inventory_failed')
  return result.stdout.split('\0').filter(Boolean).map((path) => normalizePath(path)).sort()
}

function scanSql(text) {
  const source = String(text)
  const statements = []
  const dollarBodies = []
  const stringBodies = []
  let statement = ''
  let index = 0
  let blockCommentDepth = 0

  const appendSpace = () => {
    if (!statement.endsWith(' ')) statement += ' '
  }
  const finishStatement = () => {
    const trimmed = statement.trim()
    if (trimmed) statements.push(trimmed)
    statement = ''
  }

  while (index < source.length) {
    if (blockCommentDepth > 0) {
      if (source.startsWith('/*', index)) {
        blockCommentDepth += 1
        index += 2
      } else if (source.startsWith('*/', index)) {
        blockCommentDepth -= 1
        index += 2
      } else {
        index += 1
      }
      appendSpace()
      continue
    }
    if (source.startsWith('--', index)) {
      while (index < source.length && !['\r', '\n'].includes(source[index])) index += 1
      appendSpace()
      continue
    }
    if (source.startsWith('/*', index)) {
      blockCommentDepth = 1
      index += 2
      appendSpace()
      continue
    }
    if (source[index] === "'") {
      let body = ''
      let terminated = false
      const prefix = previousCodePoint(source, index)
      const beforePrefix = prefix ? previousCodePoint(source, prefix.start) : null
      const escapeString = /^[eE]$/.test(prefix?.value || '') && !isSqlIdentifierContinuation(beforePrefix?.value)
      index += 1
      while (index < source.length) {
        if (escapeString && source[index] === '\\') {
          if (index + 1 < source.length) body += source[index + 1]
          index += 2
        } else if (source[index] === "'" && source[index + 1] === "'") {
          body += "'"
          index += 2
        } else if (source[index] === "'") {
          index += 1
          terminated = true
          break
        } else {
          body += source[index]
          index += 1
        }
      }
      if (!terminated) throw new Error('supabase_compatibility_sql_string_unterminated')
      statement += ` __sql_string_${stringBodies.length}__ `
      stringBodies.push(body)
      continue
    }
    if (source[index] === '"') {
      let terminated = false
      statement += source[index]
      index += 1
      while (index < source.length) {
        statement += source[index]
        if (source[index] === '"' && source[index + 1] === '"') {
          statement += source[index + 1]
          index += 2
        } else if (source[index] === '"') {
          index += 1
          terminated = true
          break
        } else {
          index += 1
        }
      }
      if (!terminated) throw new Error('supabase_compatibility_sql_identifier_unterminated')
      continue
    }
    if (source[index] === '$' && !isSqlIdentifierContinuation(previousCodePoint(source, index)?.value)) {
      const tag = SQL_DOLLAR_TAG.exec(source.slice(index))?.[0]
      if (tag) {
        const bodyStart = index + tag.length
        const bodyEnd = source.indexOf(tag, bodyStart)
        if (bodyEnd === -1) throw new Error('supabase_compatibility_sql_dollar_quote_unterminated')
        statement += ` __sql_dollar_${dollarBodies.length}__ `
        dollarBodies.push(source.slice(bodyStart, bodyEnd))
        index = bodyEnd + tag.length
        continue
      }
    }
    if (source[index] === ';') {
      finishStatement()
      index += 1
      continue
    }
    statement += source[index]
    index += 1
  }
  if (blockCommentDepth > 0) throw new Error('supabase_compatibility_sql_comment_unterminated')
  finishStatement()
  return { statements, dollarBodies, stringBodies }
}

function sqlStatements(text) {
  return scanSql(text).statements
}

const SQL_IDENTIFIER = '(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)'

function normalizeSqlIdentifier(value) {
  if (value.startsWith('"')) return value.slice(1, -1).replaceAll('""', '"')
  return value.toLowerCase()
}

function parseRelation(value) {
  const match = new RegExp(`^\\s*(${SQL_IDENTIFIER})(?:\\s*\\.\\s*(${SQL_IDENTIFIER}))?`).exec(value)
  if (!match) return null
  const suffix = value.slice(match[0].length)
  if (suffix && !/^[\s(,]/.test(suffix)) return null
  return {
    schema: match[2] ? normalizeSqlIdentifier(match[1]) : null,
    table: normalizeSqlIdentifier(match[2] || match[1]),
    length: match[0].length,
  }
}

function tablesCreated(text) {
  const tables = []
  for (const statement of sqlStatements(text)) {
    const match = /^\s*create\s+(?:(?:global|local)\s+)?(temporary|temp)?\s*(?:unlogged\s+)?(foreign\s+)?table(?:\s+if\s+not\s+exists)?\s+([\s\S]+)$/i.exec(statement)
    if (!match || match[1]) continue
    const relation = parseRelation(match[3])
    if (relation && match[2]) relation.foreign = true
    tables.push(relation || { schema: null, table: null, unparseable: true })
  }
  return tables.filter((table, index) => table.unparseable
    || tables.findIndex((candidate) => candidate.schema === table.schema && candidate.table === table.table) === index)
}

function hasTopLevelSelectInto(text) {
  return sqlStatements(text).some((statement) => {
    const keywordText = statement.replace(/"(?:[^"]|"")*"/g, ' ')
    return /\bselect\b[\s\S]*\binto\b/i.test(keywordText)
  })
}

function hasImportForeignSchema(text) {
  return sqlStatements(text).some((statement) => /^\s*import\s+foreign\s+schema\b/i.test(statement))
}

function hasTableSchemaTransfer(text) {
  return sqlStatements(text).some((statement) => /^\s*alter\s+(?:foreign\s+)?table\b[\s\S]*\bset\s+schema\b/i.test(statement))
}

function hasTableLifecycleReset(text) {
  return sqlStatements(text).some((statement) => /^\s*drop\s+(?:foreign\s+)?table\b/i.test(statement)
    || /^\s*alter\s+(?:foreign\s+)?table\b[\s\S]*\brename\s+to\b/i.test(statement))
}

function hasRlsDisable(text) {
  return sqlStatements(text).some((statement) => /^\s*alter\s+table\b[\s\S]*\bdisable\s+row\s+level\s+security\b/i.test(statement))
}

function hasTransactionControlReversal(text) {
  return sqlStatements(text).some((statement) => /^\s*(?:rollback|abort|savepoint|release\s+savepoint|prepare\s+transaction|commit\s+prepared)\b/i.test(statement))
}

function hasViewDdl(text) {
  return sqlStatements(text).some((statement) => /^\s*(?:create|alter|drop)\s+(?:or\s+replace\s+)?(?:(?:temporary|temp|materialized|recursive)\s+)*view\b/i.test(statement))
}

function hasSchemaDdl(text) {
  return sqlStatements(text).some((statement) => /^\s*(?:create|alter|drop)\s+schema\b/i.test(statement))
}

function normalizedTrailingRoles(statement) {
  const match = /\bto\s+([\s\S]+)$/i.exec(statement)
  if (!match) return { roles: [], fullyParsed: false }
  const entries = match[1]
    .replace(/\s+(?:with\s+(?:admin|grant|set|inherit)\s+option|granted\s+by\s+[\s\S]+)\s*$/i, '')
    .split(',')
    .map((role) => role.replace(/^\s*group\s+/i, '').trim())
  const roles = entries.map((role) => new RegExp(`^${SQL_IDENTIFIER}$`).test(role) ? normalizeSqlIdentifier(role) : null)
  return { roles: roles.filter(Boolean), fullyParsed: roles.every(Boolean) }
}

function hasBrowserPrivilegeExpansion(text) {
  return sqlStatements(text).some((statement) => {
    if (/\bgrant\b/i.test(statement)) {
      const { roles, fullyParsed } = normalizedTrailingRoles(statement)
      if (!fullyParsed) return true
      if (roles.some((role) => BROWSER_INHERITED_ROLES.includes(role))) return true
    }
    const roleMutation = /^\s*(?:create|alter)\s+(?:role|user)\s+(?:if\s+exists\s+)?([\s\S]+)$/i.exec(statement)
    if (roleMutation) {
      const role = parseRelation(roleMutation[1])
      if (role?.schema === null && ['anon', 'authenticated'].includes(role.table)) return true
    }
    if (/^\s*(?:alter\s+[\s\S]+\s+owner|reassign\s+owned\s+by[\s\S]+)\s+to\b/i.test(statement)) {
      const { roles, fullyParsed } = normalizedTrailingRoles(statement)
      if (!fullyParsed) return true
      if (roles.some((role) => BROWSER_INHERITED_ROLES.includes(role))) return true
    }
    return false
  })
}

function hasRoleDdl(text) {
  return sqlStatements(text).some((statement) => /^\s*(?:create|alter|drop)\s+(?:role|user|group)\b/i.test(statement)
    || /^\s*reassign\s+owned\b/i.test(statement))
}

function hasRoutineDdl(text) {
  return sqlStatements(text).some((statement) => /^\s*do\b/i.test(statement)
    || /^\s*(?:create|alter|drop)\s+(?:or\s+replace\s+)?(?:function|procedure|routine)\b/i.test(statement))
}

function hasOwnedObjectCleanup(text) {
  return sqlStatements(text).some((statement) => /^\s*drop\s+owned\s+by\b/i.test(statement))
}

function matchingOuterParenthesisEnd(value) {
  if (!value.startsWith('(')) return -1
  let depth = 0
  let quotedIdentifier = false
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '"') {
      if (quotedIdentifier && value[index + 1] === '"') {
        index += 1
        continue
      }
      quotedIdentifier = !quotedIdentifier
      continue
    }
    if (quotedIdentifier) continue
    if (value[index] === '(') depth += 1
    else if (value[index] === ')') {
      depth -= 1
      if (depth === 0) return index
      if (depth < 0) return -1
    }
  }
  return -1
}

function hasTopLevelLikeTableElement(value) {
  const elements = []
  let element = ''
  let depth = 0
  let quotedIdentifier = false
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]
    if (character === '"') {
      element += character
      if (quotedIdentifier && value[index + 1] === '"') {
        element += value[index + 1]
        index += 1
        continue
      }
      quotedIdentifier = !quotedIdentifier
      continue
    }
    if (!quotedIdentifier) {
      if (character === '(') depth += 1
      else if (character === ')') depth -= 1
      else if (character === ',' && depth === 0) {
        elements.push(element)
        element = ''
        continue
      }
    }
    element += character
  }
  elements.push(element)
  return elements.some((entry) => /^\s*like\b/i.test(entry))
}

function isBasicCreateTableStatement(statement) {
  const match = /^\s*create\s+table\s+([\s\S]+)$/i.exec(statement)
  if (!match) return false
  const relation = parseRelation(match[1])
  if (!relation || !ALLOWED_UNPINNED_TABLE_SCHEMAS.has(relation.schema)) return false
  const remainder = match[1].slice(relation.length).trimStart()
  const closingParenthesis = matchingOuterParenthesisEnd(remainder)
  if (closingParenthesis === -1 || remainder.slice(closingParenthesis + 1).trim() !== '') return false
  return !hasTopLevelLikeTableElement(remainder.slice(1, closingParenthesis))
}

function isExactRlsEnableStatement(statement) {
  const match = /^\s*alter\s+table(?:\s+if\s+exists)?(?:\s+only)?\s+([\s\S]+)$/i.exec(statement)
  if (!match) return false
  const relation = parseRelation(match[1])
  if (!relation || !ALLOWED_UNPINNED_TABLE_SCHEMAS.has(relation.schema)) return false
  return /^\s+enable\s+row\s+level\s+security\s*$/i.test(match[1].slice(relation.length))
}

function isExactTablePrivilegeStatement(statement) {
  const match = /^\s*(grant|revoke)\b([\s\S]*?)\bon\s+(?:table\s+)?([\s\S]+?)\s+(to|from)\s+([\s\S]+)$/i.exec(statement)
  if (!match) return false
  const operation = match[1].toLowerCase()
  const direction = match[4].toLowerCase()
  if ((operation === 'grant' && direction !== 'to') || (operation === 'revoke' && direction !== 'from')) return false
  if (operation === 'revoke' && /^\s*grant\s+option\s+for\b/i.test(match[2])) return false

  const targets = match[3].split(',').map((target) => target.replace(/^\s*only\s+/i, '').trim())
  if (targets.length === 0 || !targets.every((target) => {
    const relation = parseRelation(target)
    return relation && ALLOWED_UNPINNED_TABLE_SCHEMAS.has(relation.schema) && target.slice(relation.length).trim() === ''
  })) return false

  const grantees = match[5].split(',').map((role) => role.trim())
  return grantees.length > 0 && grantees.every((role) => new RegExp(`^${SQL_IDENTIFIER}$`).test(role)
    && PUBLIC_TABLE_ROLES.includes(normalizeSqlIdentifier(role)))
}

function transactionBoundaryKind(statement) {
  if (/^\s*begin\s*$/i.test(statement)) return 'begin'
  if (/^\s*(?:commit|end)\s*$/i.test(statement)) return 'commit'
  return null
}

function unpinnedMigrationStatementsOutsideAllowlist(text) {
  return sqlStatements(text)
    .map((statement, index) => ({ statement, index }))
    .filter(({ statement }) => !transactionBoundaryKind(statement)
      && !isBasicCreateTableStatement(statement)
      && !isExactRlsEnableStatement(statement)
      && !isExactTablePrivilegeStatement(statement))
    .map(({ index }) => index)
}

function unpinnedMigrationTransactionEnvelope(text) {
  const statements = sqlStatements(text)
  const boundaries = statements
    .map((statement, index) => {
      const kind = transactionBoundaryKind(statement)
      return kind ? { index, kind } : null
    })
    .filter(Boolean)
  const valid = boundaries.length === 2
    && boundaries[0].kind === 'begin'
    && boundaries[0].index === 0
    && boundaries[1].kind === 'commit'
    && boundaries[1].index === statements.length - 1
  return { boundaries, valid }
}

function hasStringLexingModeChange(text) {
  return sqlStatements(text).some((statement) => {
    if (/standard_conforming_strings/i.test(statement)) return true
    if (/\b(?:pg_catalog\s*\.\s*)?set_config\s*\(/i.test(statement)) return true
    return false
  })
}

function explicitTableRoleDeclarations(text, table) {
  const roles = new Set()
  for (const statement of sqlStatements(text)) {
    const match = /^\s*(grant|revoke)\b([\s\S]*?)\bon\s+(?:(table)\s+)?([\s\S]+?)\s+(to|from)\s+([\s\S]+)$/i.exec(statement)
    if (!match) continue
    if (match[1].toLowerCase() === 'revoke' && /^\s*grant\s+option\s+for\b/i.test(match[2])) continue
    const operation = match[1].toLowerCase()
    const privilegeClause = match[2].trim().toLowerCase().replace(/\s+/g, ' ')
    const objectTypePrefix = /^\s*(function|procedure|sequence|schema|database|tablespace|type|language|large\s+object|foreign\s+data\s+wrapper|foreign\s+server)\b/i.exec(match[4])
    if (objectTypePrefix) continue
    const targets = match[4].split(',').map((target) => parseRelation(target.replace(/^\s*only\s+/i, ''))).filter(Boolean)
    if (!targets.some((target) => target.schema === 'public' && target.table === table)) continue
    const grantees = match[6]
      .replace(/\s+(?:with\s+grant\s+option|granted\s+by\s+[\s\S]+|cascade|restrict)\s*$/i, '')
      .split(',')
      .map((role) => role.replace(/^\s*group\s+/i, '').trim())
      .map((role) => new RegExp(`^${SQL_IDENTIFIER}$`).test(role) ? normalizeSqlIdentifier(role) : null)
      .filter(Boolean)
    for (const role of PUBLIC_TABLE_ROLES) {
      if (!grantees.includes(role)) continue
      if (['anon', 'authenticated'].includes(role)) {
        if (operation === 'revoke' && /^(?:all|all privileges)$/.test(privilegeClause)) roles.add(role)
      } else {
        roles.add(role)
      }
    }
  }
  return roles
}

function hasExplicitRls(text, table) {
  return sqlStatements(text).some((statement) => {
    const match = /^\s*alter\s+table(?:\s+if\s+exists)?(?:\s+only)?\s+([\s\S]+)$/i.exec(statement)
    if (!match) return false
    const relation = parseRelation(match[1])
    if (!relation || relation.schema !== 'public' || relation.table !== table) return false
    return /^\s+enable\s+row\s+level\s+security\s*$/i.test(match[1].slice(relation.length))
  })
}

function unsupportedProceduralTableDdl(text) {
  const scan = scanSql(text)
  for (const statement of scan.statements) {
    if (!/^\s*(?:do\b|create\s+(?:or\s+replace\s+)?(?:function|procedure)\b)/i.test(statement)) continue
    return true
  }
  return false
}

function repositoryRelativePath(path) {
  const absolute = isAbsolute(path) ? resolve(path) : resolve(root, path)
  const candidate = normalizePath(relative(root, absolute))
  if (candidate === '' || candidate === '..' || candidate.startsWith('../') || isAbsolute(candidate)) return null
  return candidate
}

export function compatibilityFindings(path, text) {
  const findings = []
  const normalizedPath = normalizePath(path)
  if (usesDeprecatedLogsEndpoint(text)) {
    findings.push({ path: normalizedPath, code: 'deprecated_management_logs_endpoint' })
  }
  if (extname(path).toLowerCase() !== '.sql') return findings

  const sourceText = String(text)
  const relativePath = repositoryRelativePath(path)
  const comparableRelativePath = process.platform === 'win32' ? relativePath?.toLowerCase() : relativePath
  const comparableBaselinePath = process.platform === 'win32' ? LEGACY_PUBLIC_BASELINE.toLowerCase() : LEGACY_PUBLIC_BASELINE
  const managedMigration = comparableRelativePath?.startsWith('supabase/migrations/') === true
  const sourceDigest = createHash('sha256').update(normalizeTextNewlines(sourceText)).digest('hex')
  const expectedManagedDigest = comparableRelativePath ? IMMUTABLE_MANAGED_MIGRATIONS.get(comparableRelativePath) : null
  const immutableManagedMigration = expectedManagedDigest === sourceDigest
  if (expectedManagedDigest && !immutableManagedMigration) {
    findings.push({ path: normalizedPath, code: 'immutable_managed_migration_digest_mismatch' })
  }
  if (comparableRelativePath === comparableBaselinePath && sourceDigest !== LEGACY_PUBLIC_BASELINE_DIGEST) {
    findings.push({ path: normalizedPath, code: 'legacy_public_baseline_digest_mismatch' })
  }
  if (IMMUTABLE_MANAGED_MIGRATION_DIGESTS.has(sourceDigest) && !immutableManagedMigration) {
    findings.push({ path: normalizedPath, code: 'immutable_managed_migration_duplicate_path_forbidden' })
  }
  if (managedMigration && !immutableManagedMigration) {
    const outsideAllowlist = unpinnedMigrationStatementsOutsideAllowlist(sourceText)
    if (outsideAllowlist.length > 0) {
      findings.push({
        path: normalizedPath,
        code: 'unpinned_migration_statement_not_allowlisted',
        statementIndexes: outsideAllowlist,
      })
    }
    const createdTables = tablesCreated(sourceText)
    const transactionEnvelope = unpinnedMigrationTransactionEnvelope(sourceText)
    const createsPublicTable = createdTables.some((relation) => relation.schema === 'public')
    if (transactionEnvelope.boundaries.length > 0 && !transactionEnvelope.valid) {
      findings.push({ path: normalizedPath, code: 'unpinned_migration_transaction_envelope_invalid' })
    }
    if (createsPublicTable && !transactionEnvelope.valid) {
      findings.push({ path: normalizedPath, code: 'public_table_atomic_transaction_required' })
    }
    if (hasTopLevelSelectInto(sourceText)) {
      findings.push({ path: normalizedPath, code: 'select_into_table_creation_forbidden' })
    }
    if (hasImportForeignSchema(sourceText)) {
      findings.push({ path: normalizedPath, code: 'import_foreign_schema_table_creation_forbidden' })
    }
    if (hasTableSchemaTransfer(sourceText)) {
      findings.push({ path: normalizedPath, code: 'table_schema_transfer_forbidden' })
    }
    if (hasTableLifecycleReset(sourceText)) {
      findings.push({ path: normalizedPath, code: 'table_lifecycle_reset_forbidden' })
    }
    if (hasRlsDisable(sourceText)) {
      findings.push({ path: normalizedPath, code: 'rls_disable_forbidden' })
    }
    if (hasTransactionControlReversal(sourceText)) {
      findings.push({ path: normalizedPath, code: 'transaction_control_reversal_forbidden' })
    }
    if (hasViewDdl(sourceText)) {
      findings.push({ path: normalizedPath, code: 'view_ddl_requires_reviewed_digest_pin' })
    }
    if (hasSchemaDdl(sourceText)) {
      findings.push({ path: normalizedPath, code: 'schema_ddl_requires_reviewed_digest_pin' })
    }
    if (hasBrowserPrivilegeExpansion(sourceText)) {
      findings.push({ path: normalizedPath, code: 'browser_inherited_privilege_expansion_forbidden' })
    }
    if (hasRoleDdl(sourceText)) {
      findings.push({ path: normalizedPath, code: 'role_ddl_requires_reviewed_digest_pin' })
    }
    if (hasRoutineDdl(sourceText)) {
      findings.push({ path: normalizedPath, code: 'routine_ddl_requires_reviewed_digest_pin' })
    }
    if (hasOwnedObjectCleanup(sourceText)) {
      findings.push({ path: normalizedPath, code: 'owned_object_cleanup_requires_reviewed_digest_pin' })
    }
    if (hasStringLexingModeChange(sourceText)) {
      findings.push({ path: normalizedPath, code: 'sql_string_lexing_mode_change_forbidden' })
    }
    if (unsupportedProceduralTableDdl(sourceText)) {
      findings.push({ path: normalizedPath, code: 'procedural_table_ddl_not_statically_verifiable' })
    }
    for (const relation of createdTables) {
      if (relation.unparseable) {
        findings.push({ path: normalizedPath, code: 'table_target_not_statically_verifiable' })
        continue
      }
      if (relation.schema === null) {
        findings.push({ path: normalizedPath, code: 'table_schema_qualification_required', table: relation.table })
        continue
      }
      if (relation.foreign) {
        findings.push({ path: normalizedPath, code: 'foreign_table_creation_forbidden', table: relation.table })
        continue
      }
      if (relation.schema !== 'public') continue
      const table = relation.table
      if (!hasExplicitRls(sourceText, table)) {
        findings.push({ path: normalizedPath, code: 'public_table_rls_declaration_missing', table })
      }
      const declaredRoles = explicitTableRoleDeclarations(sourceText, table)
      const missingRoles = PUBLIC_TABLE_ROLES.filter((role) => !declaredRoles.has(role))
      if (missingRoles.length > 0) {
        findings.push({ path: normalizedPath, code: 'public_table_role_access_declaration_missing', table, missingRoles })
      }
    }
  }

  for (const statement of sqlStatements(sourceText)) {
    const extensionStatement = /^\s*(create|alter|drop)\s+extension\b([\s\S]*)$/i.exec(statement)
    if (!extensionStatement) continue
    if (extensionStatement[1].toLowerCase() === 'drop') {
      findings.push({ path: normalizedPath, code: 'extension_removal_requires_reviewed_digest_pin' })
      continue
    }
    const remainder = extensionStatement[2].replace(/^\s+if\s+not\s+exists\b/i, '')
    const extensionTarget = new RegExp(`^\\s*(${SQL_IDENTIFIER})(?=\\s|$)`).exec(remainder)?.[1]
    if (!extensionTarget) {
      findings.push({ path: normalizedPath, code: 'extension_target_not_statically_verifiable' })
      continue
    }
    const extension = normalizeSqlIdentifier(extensionTarget)
    if (/\bversion\b/i.test(statement) || /\bupdate\s+to\b/i.test(statement)) {
      findings.push({ path: normalizedPath, code: 'extension_version_pin_forbidden', extension })
    }
    if (REMOVED_POSTGRES_17_EXTENSIONS.has(extension)) {
      findings.push({ path: normalizedPath, code: 'postgres17_removed_extension', extension })
    }
  }
  return findings
}

async function scanRepository() {
  const canonicalRoot = await realpath(root)
  const files = []
  for (const relativeRoot of SCAN_ROOTS) {
    const scanRoot = resolve(root, relativeRoot)
    const canonicalScanRoot = await realpath(scanRoot)
    const containment = normalizePath(relative(canonicalRoot, canonicalScanRoot))
    if (containment === '..' || containment.startsWith('../') || isAbsolute(containment)) {
      throw new Error(`supabase_compatibility_scan_root_outside_repository:${relativeRoot}`)
    }
    await sourceFiles(scanRoot, files)
  }
  files.sort()
  const findings = []
  let managedSqlFiles = 0
  const observedManagedMigrations = new Set()
  for (const path of files) {
    const beforeRead = await lstat(path)
    if (beforeRead.isSymbolicLink() || !beforeRead.isFile()) {
      throw new Error(`supabase_compatibility_file_invalid:${normalizePath(path).replace(`${normalizePath(root)}/`, '')}`)
    }
    if (beforeRead.size > MAX_FILE_BYTES) throw new Error(`supabase_compatibility_file_too_large:${normalizePath(path).replace(`${normalizePath(root)}/`, '')}`)
    const bytes = await readFile(path)
    const afterRead = await lstat(path)
    if (afterRead.isSymbolicLink() || !afterRead.isFile()
      || afterRead.size !== beforeRead.size
      || afterRead.mtimeMs !== beforeRead.mtimeMs
      || bytes.length !== beforeRead.size) {
      throw new Error(`supabase_compatibility_file_changed_during_read:${normalizePath(path).replace(`${normalizePath(root)}/`, '')}`)
    }
    const relativePath = repositoryRelativePath(path)
    const comparableRelativePath = process.platform === 'win32' ? relativePath?.toLowerCase() : relativePath
    if (comparableRelativePath?.startsWith('supabase/migrations/')) {
      managedSqlFiles += 1
      observedManagedMigrations.add(comparableRelativePath)
    }
    findings.push(...compatibilityFindings(path, bytes.toString('utf8')))
  }
  for (const expectedPath of IMMUTABLE_MANAGED_MIGRATIONS.keys()) {
    if (!observedManagedMigrations.has(expectedPath)) {
      findings.push({ path: expectedPath, code: 'immutable_managed_migration_missing' })
    }
  }
  const trackedSql = await trackedSqlFiles()
  const scannedSql = new Set(files
    .filter((path) => extname(path).toLowerCase() === '.sql')
    .map((path) => repositoryRelativePath(path)))
  for (const path of trackedSql) {
    if (!scannedSql.has(path)) findings.push({ path, code: 'tracked_sql_outside_bounded_scan_roots' })
  }
  return { files, findings, managedSqlFiles }
}

async function runSelfTest() {
  const safe = compatibilityFindings('safe.sql', 'create extension if not exists "pgcrypto";')
  const pinned = compatibilityFindings('pinned.sql', ['create extension pgcrypto ', 'version \'1.3\';'].join(''))
  const removed = compatibilityFindings('removed.sql', ['create extension ', 'plv8;'].join(''))
  const deprecated = compatibilityFindings('client.ts', 'client.logs.all()')
  const deprecatedOptionalDot = compatibilityFindings('client.ts', 'client.logs?.all()')
  const deprecatedBracket = compatibilityFindings('client.ts', "client.logs['all']()")
  const deprecatedDoubleBracket = compatibilityFindings('client.ts', "client['logs']['all']()")
  const deprecatedSpaced = compatibilityFindings('client.ts', 'client.logs . all()')
  const deprecatedCommentedDot = compatibilityFindings('client.ts', 'client.logs /* comment */ . all()')
  const deprecatedCommentedOptionalDot = compatibilityFindings('client.ts', 'client.logs /* comment */ ?. all()')
  const deprecatedCommentedBracket = compatibilityFindings('client.ts', "client.logs /* comment */ ['all']()")
  const deprecatedCommentedDoubleBracket = compatibilityFindings('client.ts', "client['logs'] /* comment */ ['all']()")
  const deprecatedLineComment = compatibilityFindings('client.ts', 'client.logs // comment\n . all()')
  const deprecatedEscapedIdentifier = compatibilityFindings('client.ts', String.raw`client.l\u006fgs.\u0061ll()`)
  const deprecatedEscapedBracket = compatibilityFindings('client.ts', String.raw`client['l\x6fgs']['\u0061ll']()`)
  const deprecatedTemplateBracket = compatibilityFindings('client.ts', 'client[`logs`][`all`]()')
  const deprecatedGrouped = compatibilityFindings('client.ts', '(client.logs).all()')
  const deprecatedOptionalCall = compatibilityFindings('client.ts', 'client.logs.all?.()')
  const deprecatedNonNullAssertion = compatibilityFindings('client.ts', 'client.logs!.all()')
  const deprecatedGroupedBracket = compatibilityFindings('client.ts', "(client['logs'])['all']?.()")
  const deprecatedTypeAsserted = compatibilityFindings('client.ts', '(client.logs as ManagementLogs).all()')
  const deprecatedSatisfiesGrouped = compatibilityFindings('client.ts', '(client.logs satisfies ManagementLogs).all()')
  const deprecatedAliased = compatibilityFindings('client.ts', 'const legacy = client.logs; legacy.all()')
  const safeLogsText = compatibilityFindings('client.ts', "const label = 'logs.all'; const logs = { all: [] }")
  const commentOnly = compatibilityFindings('comment.sql', '-- create extension plv8 version \'1\';\nselect 1;')
  const safePublicTable = compatibilityFindings('supabase/migrations/20260813000000_safe.sql', `
    begin;
    create table public.safe_items (id bigint primary key);
    alter table public.safe_items enable row level security;
    revoke all on table public.safe_items from anon, authenticated;
    grant select on table public.safe_items to service_role;
    commit;
  `)
  const missingRoleDeclarations = compatibilityFindings('supabase/migrations/20260813000001_unsafe.sql', `
    create table public.unsafe_items (id bigint primary key);
    alter table public.unsafe_items enable row level security;
  `)
  const missingRls = compatibilityFindings('supabase/migrations/20260813000002_unsafe.sql', `
    create table public.unprotected_items (id bigint primary key);
    revoke all on table public.unprotected_items from anon, authenticated, service_role;
  `)
  const commentOnlyControls = compatibilityFindings('supabase/migrations/20260813000003_unsafe.sql', `
    create table public.comment_items (id bigint primary key);
    -- alter table public.comment_items enable row level security;
    -- revoke all on table public.comment_items from anon, authenticated, service_role;
  `)
  const unqualifiedTable = compatibilityFindings('supabase/migrations/20260813000004_unsafe.sql', `
    set search_path = public;
    create table unqualified_items (id bigint primary key);
  `)
  const spacedRelation = compatibilityFindings('supabase/migrations/20260813000005_unsafe.sql', `
    create table public . spaced_items (id bigint primary key);
  `)
  const stringSpoof = compatibilityFindings('supabase/migrations/20260813000006_unsafe.sql', `
    create table public.string_items (id bigint primary key);
    select 'alter table public.string_items enable row level security';
    grant select on table public.string_items to ordinary_role;
    select 'anon authenticated service_role';
  `)
  const dollarBodySpoof = compatibilityFindings('supabase/migrations/20260813000007_unsafe.sql', `
    create table public.dollar_items (id bigint primary key);
    do $probe$ begin perform 'alter table public.dollar_items enable row level security'; end $probe$;
    revoke all on sequence public.dollar_items from anon, authenticated, service_role;
  `)
  const wrongObjectGrant = compatibilityFindings('supabase/migrations/20260813000008_unsafe.sql', `
    create table public.object_items (id bigint primary key);
    alter table public.object_items enable row level security;
    grant execute on function public.object_items() to anon, authenticated, service_role;
  `)
  const columnRoleSpoof = compatibilityFindings('supabase/migrations/20260813000009_unsafe.sql', `
    create table public.column_items (anon text, authenticated text, service_role text);
    alter table public.column_items enable row level security;
    grant select (anon, authenticated, service_role) on table public.column_items to ordinary_role;
  `)
  const commentMarkerStrings = compatibilityFindings('supabase/migrations/20260813000010_unsafe.sql', `
    select '--'; create table public.line_marker_items (id bigint);
    select '/*'; create table public.block_marker_items (id bigint); select '*/';
  `)
  const proceduralDdl = compatibilityFindings('supabase/migrations/20260813000011_unsafe.sql', `
    do $body$ begin create table public.procedural_items (id bigint); end $body$;
  `)
  const unparseableTarget = compatibilityFindings('supabase/migrations/20260813000012_unsafe.sql', `
    create table U&"public".unicode_items (id bigint);
  `)
  const standardStringProceduralDdl = compatibilityFindings('supabase/migrations/20260813000013_unsafe.sql', `
    do 'begin execute ''create table public.standard_string_items(id bigint)''; end';
  `)
  const escapeStringProceduralDdl = compatibilityFindings('supabase/migrations/20260813000014_unsafe.sql', `
    do E'begin execute \\'create table public.escape_string_items(id bigint)\\'; end';
  `)
  const qualifiedSelectInto = compatibilityFindings('supabase/migrations/20260813000015_unsafe.sql', `
    select 1::bigint as id into public.exposed_select_into;
  `)
  const unqualifiedSelectInto = compatibilityFindings('supabase/migrations/20260813000016_unsafe.sql', `
    set search_path = public;
    select 1::bigint as id into exposed_select_into;
  `)
  const standardStringBackslashCreate = compatibilityFindings('supabase/migrations/20260813000017_unsafe.sql', `
    select '\\'; create table public.standard_backslash_items (id bigint); -- '
  `)
  const standardStringBackslashSelectInto = compatibilityFindings('supabase/migrations/20260813000018_unsafe.sql', `
    select '\\'; select 1 as id into public.standard_backslash_select_into; -- '
  `)
  const dollarIdentifierCreate = compatibilityFindings('supabase/migrations/20260813000019_unsafe.sql', `
    select 1 as foo$tag$bar; create table public.dollar_identifier_items (id bigint); select 1 as foo$tag$bar;
  `)
  const dollarIdentifierSelectInto = compatibilityFindings('supabase/migrations/20260813000020_unsafe.sql', `
    select 1 as foo$tag$bar; select 1 as id into public.dollar_identifier_select_into; select 1 as foo$tag$bar;
  `)
  const parenthesizedSelectInto = compatibilityFindings('supabase/migrations/20260813000021_unsafe.sql', `
    (select 1 as id into public.parenthesized_select_into);
  `)
  const foreignTable = compatibilityFindings('supabase/migrations/20260813000022_unsafe.sql', `
    create foreign table public.foreign_items (id bigint) server external_source;
  `)
  const importForeignSchema = compatibilityFindings('supabase/migrations/20260813000023_unsafe.sql', `
    import foreign schema external_source from server upstream into public;
  `)
  const qualifiedSchemaTransfer = compatibilityFindings('supabase/migrations/20260813000024_unsafe.sql', `
    alter table app_private.hidden_move set schema public;
  `)
  const unqualifiedSchemaTransfer = compatibilityFindings('supabase/migrations/20260813000025_unsafe.sql', `
    set search_path = app_private;
    alter table hidden_move set schema public;
  `)
  const quotedSchemaTransfer = compatibilityFindings('supabase/migrations/20260813000026_unsafe.sql', `
    alter table app_private.hidden_move set schema "public";
  `)
  const createThenTransfer = compatibilityFindings('supabase/migrations/20260813000027_unsafe.sql', `
    create table app_private.hidden_move (id bigint);
    alter table app_private.hidden_move set schema public;
  `)
  const foreignSchemaTransfer = compatibilityFindings('supabase/migrations/20260813000028_unsafe.sql', `
    alter foreign table app_private.hidden_foreign_move set schema public;
  `)
  const stringLexingModeChange = compatibilityFindings('supabase/migrations/20260813000029_unsafe.sql', `
    set standard_conforming_strings = off;
    select '\\\''; create table public.hidden_by_string_mode (id bigint); -- ';
  `)
  const stringLexingSetConfig = compatibilityFindings('supabase/migrations/20260813000030_unsafe.sql', `
    select pg_catalog.set_config('standard_conforming_strings', 'off', false);
  `)
  const unparseableSchemaTransfer = compatibilityFindings('supabase/migrations/20260813000031_unsafe.sql', `
    alter table U&"app_private".hidden_move set schema U&"public";
  `)
  const privateSchemaTransfer = compatibilityFindings('supabase/migrations/20260813000032_unsafe.sql', `
    alter table staging.hidden_move set schema app_private;
  `)
  const proceduralSelectInto = compatibilityFindings('supabase/migrations/20260813000033_unsafe.sql', `
    create function app_private.create_items() returns void language sql as $$
      select 1::bigint as id into public.procedural_select_into;
    $$;
    select app_private.create_items();
  `)
  const proceduralForeignTable = compatibilityFindings('supabase/migrations/20260813000034_unsafe.sql', `
    create function app_private.create_foreign_items() returns void language sql as $$
      create foreign table public.procedural_foreign_items (id bigint) server external_source;
    $$;
    select app_private.create_foreign_items();
  `)
  const proceduralImportForeignSchema = compatibilityFindings('supabase/migrations/20260813000035_unsafe.sql', `
    do $$ begin import foreign schema external_source from server upstream into public; end $$;
  `)
  const proceduralSchemaTransfer = compatibilityFindings('supabase/migrations/20260813000036_unsafe.sql', `
    create function app_private.move_items() returns void language sql as $$
      alter table app_private.items set schema public;
      select null::void;
    $$;
    select app_private.move_items();
  `)
  const disabledRlsAfterControls = compatibilityFindings('supabase/migrations/20260813000037_unsafe.sql', `
    create table public.disabled_later (id bigint primary key);
    alter table public.disabled_later enable row level security;
    revoke all on table public.disabled_later from anon, authenticated, service_role;
    alter table public.disabled_later disable row level security;
  `)
  const droppedAndRecreatedTable = compatibilityFindings('supabase/migrations/20260813000038_unsafe.sql', `
    create table public.recreated_items (id bigint primary key);
    alter table public.recreated_items enable row level security;
    revoke all on table public.recreated_items from anon, authenticated, service_role;
    drop table public.recreated_items;
    create table public.recreated_items (id bigint primary key);
  `)
  const rolledBackControls = compatibilityFindings('supabase/migrations/20260813000039_unsafe.sql', `
    create table public.rolled_back_controls (id bigint primary key);
    begin;
    alter table public.rolled_back_controls enable row level security;
    revoke all on table public.rolled_back_controls from anon, authenticated, service_role;
    rollback;
  `)
  const savepointControls = compatibilityFindings('supabase/migrations/20260813000040_unsafe.sql', `
    create table public.savepoint_controls (id bigint primary key);
    savepoint before_controls;
    alter table public.savepoint_controls enable row level security;
    revoke all on table public.savepoint_controls from anon, authenticated, service_role;
    rollback to savepoint before_controls;
  `)
  const safePrivateFunction = compatibilityFindings('supabase/migrations/20260813000041_safe.sql', `
    create function app_private.safe_boolean() returns boolean language sql as $$ select true $$;
  `)
  const safeCommittedPublicTable = compatibilityFindings('supabase/migrations/20260813000042_safe.sql', `
    begin;
    create table public.committed_items (id bigint primary key);
    alter table public.committed_items enable row level security;
    revoke all on table public.committed_items from anon, authenticated, service_role;
    commit;
  `)
  const renamedAndRecreatedTable = compatibilityFindings('supabase/migrations/20260813000043_unsafe.sql', `
    create table public.renamed_items (id bigint primary key);
    alter table public.renamed_items enable row level security;
    revoke all on table public.renamed_items from anon, authenticated, service_role;
    alter table public.renamed_items rename to old_renamed_items;
    create table public.renamed_items (id bigint primary key);
  `)
  const proceduralTableRename = compatibilityFindings('supabase/migrations/20260813000044_unsafe.sql', `
    do $$ begin alter table public.renamed_items rename to hidden_items; end $$;
  `)
  const explicitNonPlpgsqlDoSelectInto = compatibilityFindings('supabase/migrations/20260813000045_unsafe.sql', `
    do language sql $$ select 1::bigint as id into public.non_plpgsql_do_items $$;
  `)
  const plpgsqlVariableSelectInto = compatibilityFindings('supabase/migrations/20260813000046_safe.sql', `
    create function app_private.read_value() returns bigint language "plpgsql" as $$
    declare current_value bigint;
    begin
      select 1 into current_value;
      return current_value;
    end
    $$;
  `)
  const unicodeDollarIdentifierCreate = compatibilityFindings('supabase/migrations/20260813000047_unsafe.sql', `
    select 1 as α$tag$bar; create table public.unicode_dollar_items (id bigint); select 1 as α$tag$bar;
  `)
  const concatenatedStringModeChange = compatibilityFindings('supabase/migrations/20260813000048_unsafe.sql', `
    select set_config('standard_' || 'conforming_strings', 'off', false);
  `)
  const computedStringModeChange = compatibilityFindings('supabase/migrations/20260813000049_unsafe.sql', `
    select set_config(concat('standard_', 'conforming_strings'), 'off', false);
  `)
  const revokeGrantOptionOnly = compatibilityFindings('supabase/migrations/20260813000050_unsafe.sql', `
    create table public.grant_option_only (id bigint primary key);
    alter table public.grant_option_only enable row level security;
    revoke grant option for select on table public.grant_option_only from anon, authenticated, service_role;
  `)
  const unicodeDollarQuoteSpoof = compatibilityFindings('supabase/migrations/20260813000051_unsafe.sql', `
    create table public.unicode_quote_items (id bigint primary key);
    select $α$;
      alter table public.unicode_quote_items enable row level security;
      revoke all on table public.unicode_quote_items from anon, authenticated, service_role;
    $α$;
  `)
  const astralDollarIdentifierCreate = compatibilityFindings('supabase/migrations/20260813000052_unsafe.sql', `
    select 1 as 𐐀$tag$bar; create table public.astral_dollar_items (id bigint); select 1 as 𐐀$tag$bar;
  `)
  const proceduralStringModeChange = compatibilityFindings('supabase/migrations/20260813000053_unsafe.sql', `
    do $$ begin perform set_config('standard_' || 'conforming_strings', 'off', false); end $$;
  `)
  const extensionUpdatePin = compatibilityFindings('supabase/migrations/20260813000054_unsafe.sql', `
    alter extension pgcrypto update to '1.3';
  `)
  const emojiDollarIdentifierCreate = compatibilityFindings('supabase/migrations/20260813000055_unsafe.sql', `
    select 1 as 😀$tag$bar; create table public.emoji_dollar_items (id bigint); select 1 as 😀$tag$bar;
  `)
  const emojiDollarQuoteSpoof = compatibilityFindings('supabase/migrations/20260813000056_unsafe.sql', `
    create table public.emoji_quote_items (id bigint primary key);
    select $😀$;
      alter table public.emoji_quote_items enable row level security;
      revoke all on table public.emoji_quote_items from anon, authenticated, service_role;
    $😀$;
  `)
  const proceduralRemovedExtension = compatibilityFindings('supabase/migrations/20260813000057_unsafe.sql', `
    do $$ begin create extension plv8; end $$;
  `)
  const proceduralPinnedExtension = compatibilityFindings('supabase/migrations/20260813000058_unsafe.sql', `
    create function app_private.install_extension() returns void language sql as $$
      create extension pgcrypto version '1.3';
    $$;
  `)
  const proceduralExtensionUpdatePin = compatibilityFindings('supabase/migrations/20260813000059_unsafe.sql', `
    create procedure app_private.update_extension() language sql as $$
      alter extension pgcrypto update to '1.3';
    $$;
  `)
  const unknownLanguageFunction = compatibilityFindings('supabase/migrations/20260813000060_unsafe.sql', `
    create function app_private.hidden_table_creator() returns void language plpython3u as $$
      getattr(plpy, 'execute')('create table public.hidden_items(id bigint)')
    $$;
    select app_private.hidden_table_creator();
  `)
  const missingLanguageFunction = compatibilityFindings('supabase/migrations/20260813000061_unsafe.sql', `
    create function app_private.ambiguous_body() returns void as $$ select null::void $$;
  `)
  const unknownLanguageDo = compatibilityFindings('supabase/migrations/20260813000062_unsafe.sql', `
    do language plpython3u $$ getattr(plpy, 'execute')('create table public.hidden_items(id bigint)') $$;
  `)
  const proceduralHelperCall = compatibilityFindings('supabase/migrations/20260813000063_unsafe.sql', `
    create function app_private.indirect_creator() returns void language sql as $$
      select app_private.existing_table_creator();
    $$;
  `)
  const proceduralPerformCall = compatibilityFindings('supabase/migrations/20260813000064_unsafe.sql', `
    do $$ begin perform app_private.existing_table_creator(); end $$;
  `)
  const baselineText = await readFile(resolve(root, LEGACY_PUBLIC_BASELINE), 'utf8')
  const canonicalBaseline = compatibilityFindings(LEGACY_PUBLIC_BASELINE, baselineText)
  const absoluteCanonicalBaseline = compatibilityFindings(resolve(root, LEGACY_PUBLIC_BASELINE), baselineText)
  const canonicalBaselineWithLf = compatibilityFindings(LEGACY_PUBLIC_BASELINE, normalizeTextNewlines(baselineText))
  const canonicalBaselineWithCrlf = compatibilityFindings(LEGACY_PUBLIC_BASELINE, normalizeTextNewlines(baselineText).replaceAll('\n', '\r\n'))
  const changedBaseline = compatibilityFindings(LEGACY_PUBLIC_BASELINE, `${baselineText}\n-- changed`)
  const changedCompliantBaseline = compatibilityFindings(LEGACY_PUBLIC_BASELINE, `
    create table public.changed_baseline (id bigint primary key);
    alter table public.changed_baseline enable row level security;
    revoke all on table public.changed_baseline from anon, authenticated, service_role;
  `)
  const duplicateBaseline = compatibilityFindings(`kernel/shadow/${LEGACY_PUBLIC_BASELINE}`, baselineText)
  const privateMigrationPath = 'supabase/migrations/20260804102000_private_trial_backend_v10_supabase_session_revocation.sql'
  const privateMigrationText = await readFile(resolve(root, privateMigrationPath), 'utf8')
  const canonicalPrivateMigration = compatibilityFindings(privateMigrationPath, privateMigrationText)
  const canonicalPrivateMigrationWithCrlf = compatibilityFindings(privateMigrationPath, normalizeTextNewlines(privateMigrationText).replaceAll('\n', '\r\n'))
  const changedPrivateMigration = compatibilityFindings(privateMigrationPath, `${privateMigrationText}\n-- changed`)
  const duplicatePrivateMigration = compatibilityFindings('supabase/migrations/20260813000065_duplicate.sql', privateMigrationText)
  const publicView = compatibilityFindings('supabase/migrations/20260813000066_unsafe.sql', `
    create view public.exposed_items as select 1::bigint as id;
  `)
  const privateView = compatibilityFindings('supabase/migrations/20260813000067_unsafe.sql', `
    create view app_private.review_required as select 1::bigint as id;
  `)
  const existingPublicTableGrant = compatibilityFindings('supabase/migrations/20260813000068_unsafe.sql', `
    grant select on table public.assets to anon;
  `)
  const publicRoleGrant = compatibilityFindings('supabase/migrations/20260813000069_unsafe.sql', `
    grant select on all tables in schema public to public;
  `)
  const defaultBrowserGrant = compatibilityFindings('supabase/migrations/20260813000070_unsafe.sql', `
    alter default privileges in schema public grant select on tables to authenticated;
  `)
  const browserRoleMutation = compatibilityFindings('supabase/migrations/20260813000071_unsafe.sql', `
    alter role anon bypassrls;
  `)
  const browserTableOwnership = compatibilityFindings('supabase/migrations/20260813000072_unsafe.sql', `
    alter table public.assets owner to authenticated;
  `)
  const serviceRoleGrant = compatibilityFindings('supabase/migrations/20260813000073_safe.sql', `
    grant select on table app_private.workspace_state to service_role;
  `)
  const unrelatedRoleDdl = compatibilityFindings('supabase/migrations/20260813000074_unsafe.sql', `
    create role future_backend nologin;
  `)
  const unicodeEscapedBrowserGrant = compatibilityFindings('supabase/migrations/20260813000075_unsafe.sql', String.raw`
    grant select on table public.assets to U&"\0061non";
  `)
  const unparseableRemovedExtension = compatibilityFindings('supabase/migrations/20260813000076_unsafe.sql', String.raw`
    create extension U&"plv\0038";
  `)
  const extensionRemoval = compatibilityFindings('supabase/migrations/20260813000077_unsafe.sql', `
    drop extension if exists pgcrypto;
  `)
  const legacyGroupBrowserExpansion = compatibilityFindings('supabase/migrations/20260813000078_unsafe.sql', `
    alter group privileged_role add user anon;
  `)
  const recursiveView = compatibilityFindings('supabase/migrations/20260813000079_unsafe.sql', `
    create recursive view private_schema.numbers(n) as values (1);
  `)
  const schemaNestedView = compatibilityFindings('supabase/migrations/20260813000080_unsafe.sql', `
    create schema private_schema create view numbers as select 1::bigint as n;
  `)
  const partialBrowserRevoke = compatibilityFindings('supabase/migrations/20260813000081_unsafe.sql', `
    create table public.partial_revoke_items (id bigint primary key);
    alter table public.partial_revoke_items enable row level security;
    revoke update on table public.partial_revoke_items from anon, authenticated;
    grant select on table public.partial_revoke_items to service_role;
  `)
  const allPrivilegesBrowserRevoke = compatibilityFindings('supabase/migrations/20260813000082_safe.sql', `
    begin;
    create table public.all_revoke_items (id bigint primary key);
    alter table public.all_revoke_items enable row level security;
    revoke all privileges on table public.all_revoke_items from anon, authenticated;
    grant select on table public.all_revoke_items to service_role;
    commit;
  `)
  const browserGrantNotDeclaration = compatibilityFindings('supabase/migrations/20260813000083_unsafe.sql', `
    create table public.browser_grant_items (id bigint primary key);
    alter table public.browser_grant_items enable row level security;
    grant select on table public.browser_grant_items to anon, authenticated, service_role;
  `)
  const alteredFunctionSecurityDefiner = compatibilityFindings('supabase/migrations/20260813000084_unsafe.sql', `
    alter function public.existing_helper() security definer;
  `)
  const alteredProcedureSecurityDefiner = compatibilityFindings('supabase/migrations/20260813000085_unsafe.sql', `
    alter procedure public.existing_helper() security definer;
  `)
  const alteredRoutineSecurityDefiner = compatibilityFindings('supabase/migrations/20260813000086_unsafe.sql', `
    alter routine public.existing_helper() security definer;
  `)
  const droppedFunction = compatibilityFindings('supabase/migrations/20260813000087_unsafe.sql', `
    drop function public.existing_helper();
  `)
  const droppedOwnedObjects = compatibilityFindings('supabase/migrations/20260813000088_unsafe.sql', `
    drop owned by postgres cascade;
  `)
  const temporaryView = compatibilityFindings('supabase/migrations/20260813000089_unsafe.sql', `
    create temporary view temporary_items as select 1::bigint as id;
  `)
  const partitionAttachment = compatibilityFindings('supabase/migrations/20260813000090_unsafe.sql', `
    alter table app_private.items attach partition app_private.items_2026 for values from (1) to (2);
  `)
  const policyDdl = compatibilityFindings('supabase/migrations/20260813000091_unsafe.sql', `
    create policy browser_read on public.items for select to authenticated using (true);
  `)
  const indexDdl = compatibilityFindings('supabase/migrations/20260813000092_unsafe.sql', `
    create index items_name_idx on app_private.items (name);
  `)
  const inheritedTable = compatibilityFindings('supabase/migrations/20260813000093_unsafe.sql', `
    create table app_private.child_items (id bigint) inherits (app_private.items);
  `)
  const safeBasicPrivateTable = compatibilityFindings('supabase/migrations/20260813000094_safe.sql', `
    create table app_private.future_items (id bigint primary key);
  `)
  const publicTableWithoutTransaction = compatibilityFindings('supabase/migrations/20260813000095_unsafe.sql', `
    create table public.non_atomic_items (id bigint primary key);
    alter table public.non_atomic_items enable row level security;
    revoke all on table public.non_atomic_items from anon, authenticated, service_role;
  `)
  const controlsAfterCommit = compatibilityFindings('supabase/migrations/20260813000096_unsafe.sql', `
    begin;
    create table public.early_commit_items (id bigint primary key);
    commit;
    alter table public.early_commit_items enable row level security;
    revoke all on table public.early_commit_items from anon, authenticated, service_role;
  `)
  const partitionedTable = compatibilityFindings('supabase/migrations/20260813000097_unsafe.sql', `
    begin;
    create table public.partitioned_items (id bigint primary key) partition by range (id);
    alter table public.partitioned_items enable row level security;
    revoke all on table public.partitioned_items from anon, authenticated, service_role;
    commit;
  `)
  const createTableAsSelect = compatibilityFindings('supabase/migrations/20260813000098_unsafe.sql', `
    begin;
    create table public.copied_items (id) as select app_private.side_effecting_function();
    alter table public.copied_items enable row level security;
    revoke all on table public.copied_items from anon, authenticated, service_role;
    commit;
  `)
  const createTableLike = compatibilityFindings('supabase/migrations/20260813000099_unsafe.sql', `
    begin;
    create table public.like_items (like app_private.template_items including all);
    alter table public.like_items enable row level security;
    revoke all on table public.like_items from anon, authenticated, service_role;
    commit;
  `)
  const createTableIfNotExists = compatibilityFindings('supabase/migrations/20260813000100_unsafe.sql', `
    begin;
    create table if not exists public.ambiguous_items (id bigint primary key);
    alter table public.ambiguous_items enable row level security;
    revoke all on table public.ambiguous_items from anon, authenticated, service_role;
    commit;
  `)
  const createUnloggedTable = compatibilityFindings('supabase/migrations/20260813000101_unsafe.sql', `
    create unlogged table app_private.unlogged_items (id bigint primary key);
  `)
  const createManagedSchemaTable = compatibilityFindings('supabase/migrations/20260813000102_unsafe.sql', `
    create table auth.shadow_users (id bigint primary key);
  `)
  const arbitraryRoleGrant = compatibilityFindings('supabase/migrations/20260813000103_unsafe.sql', `
    grant select on table app_private.future_items to future_backend;
  `)
  const commitAndChain = compatibilityFindings('supabase/migrations/20260813000104_unsafe.sql', `
    begin;
    create table public.chained_items (id bigint primary key);
    alter table public.chained_items enable row level security;
    revoke all on table public.chained_items from anon, authenticated, service_role;
    commit and chain;
  `)
  const serviceRoleGrantOption = compatibilityFindings('supabase/migrations/20260813000105_unsafe.sql', `
    grant select on table app_private.future_items to service_role with grant option;
  `)
  const checks = {
    allow_default_extension_version: safe.length === 0,
    reject_extension_version_pin: pinned.some((item) => item.code === 'extension_version_pin_forbidden'),
    reject_removed_postgres17_extension: removed.some((item) => item.code === 'postgres17_removed_extension'),
    reject_deprecated_logs_endpoint: deprecated.some((item) => item.code === 'deprecated_management_logs_endpoint'),
    reject_optional_dot_deprecated_logs_endpoint: deprecatedOptionalDot.some((item) => item.code === 'deprecated_management_logs_endpoint'),
    reject_bracket_deprecated_logs_endpoint: deprecatedBracket.some((item) => item.code === 'deprecated_management_logs_endpoint'),
    reject_double_bracket_deprecated_logs_endpoint: deprecatedDoubleBracket.some((item) => item.code === 'deprecated_management_logs_endpoint'),
    reject_spaced_deprecated_logs_endpoint: deprecatedSpaced.some((item) => item.code === 'deprecated_management_logs_endpoint'),
    reject_commented_dot_deprecated_logs_endpoint: deprecatedCommentedDot.some((item) => item.code === 'deprecated_management_logs_endpoint'),
    reject_commented_optional_dot_deprecated_logs_endpoint: deprecatedCommentedOptionalDot.some((item) => item.code === 'deprecated_management_logs_endpoint'),
    reject_commented_bracket_deprecated_logs_endpoint: deprecatedCommentedBracket.some((item) => item.code === 'deprecated_management_logs_endpoint'),
    reject_commented_double_bracket_deprecated_logs_endpoint: deprecatedCommentedDoubleBracket.some((item) => item.code === 'deprecated_management_logs_endpoint'),
    reject_line_commented_deprecated_logs_endpoint: deprecatedLineComment.some((item) => item.code === 'deprecated_management_logs_endpoint'),
    reject_unicode_escaped_deprecated_logs_identifier: deprecatedEscapedIdentifier.some((item) => item.code === 'deprecated_management_logs_endpoint'),
    reject_unicode_escaped_deprecated_logs_bracket: deprecatedEscapedBracket.some((item) => item.code === 'deprecated_management_logs_endpoint'),
    reject_template_bracket_deprecated_logs_endpoint: deprecatedTemplateBracket.some((item) => item.code === 'deprecated_management_logs_endpoint'),
    reject_grouped_deprecated_logs_endpoint: deprecatedGrouped.some((item) => item.code === 'deprecated_management_logs_endpoint'),
    reject_optional_call_deprecated_logs_endpoint: deprecatedOptionalCall.some((item) => item.code === 'deprecated_management_logs_endpoint'),
    reject_non_null_asserted_deprecated_logs_endpoint: deprecatedNonNullAssertion.some((item) => item.code === 'deprecated_management_logs_endpoint'),
    reject_grouped_bracket_deprecated_logs_endpoint: deprecatedGroupedBracket.some((item) => item.code === 'deprecated_management_logs_endpoint'),
    reject_type_asserted_deprecated_logs_endpoint: deprecatedTypeAsserted.some((item) => item.code === 'deprecated_management_logs_endpoint'),
    reject_satisfies_grouped_deprecated_logs_endpoint: deprecatedSatisfiesGrouped.some((item) => item.code === 'deprecated_management_logs_endpoint'),
    reject_aliased_deprecated_logs_endpoint: deprecatedAliased.some((item) => item.code === 'deprecated_management_logs_endpoint'),
    allow_non_call_logs_all_text: safeLogsText.length === 0,
    ignore_sql_comments: commentOnly.length === 0,
    allow_public_table_with_explicit_rls_and_roles: safePublicTable.length === 0,
    reject_public_table_without_role_declarations: missingRoleDeclarations.some((item) => item.code === 'public_table_role_access_declaration_missing'),
    reject_public_table_without_rls: missingRls.some((item) => item.code === 'public_table_rls_declaration_missing'),
    reject_comment_only_public_table_controls: commentOnlyControls.some((item) => item.code === 'public_table_rls_declaration_missing')
      && commentOnlyControls.some((item) => item.code === 'public_table_role_access_declaration_missing'),
    reject_unqualified_table_even_with_public_search_path: unqualifiedTable.some((item) => item.code === 'table_schema_qualification_required'),
    recognize_whitespace_around_schema_separator: spacedRelation.some((item) => item.code === 'public_table_rls_declaration_missing'),
    reject_string_literal_control_spoof: stringSpoof.some((item) => item.code === 'public_table_rls_declaration_missing')
      && stringSpoof.some((item) => item.code === 'public_table_role_access_declaration_missing'),
    reject_dollar_body_and_wrong_object_spoof: dollarBodySpoof.some((item) => item.code === 'public_table_rls_declaration_missing')
      && dollarBodySpoof.some((item) => item.code === 'public_table_role_access_declaration_missing'),
    reject_function_grant_spoof: wrongObjectGrant.some((item) => item.code === 'public_table_role_access_declaration_missing'),
    reject_column_name_role_spoof: columnRoleSpoof.some((item) => item.code === 'public_table_role_access_declaration_missing'),
    preserve_sql_after_comment_markers_in_strings: commentMarkerStrings.filter((item) => item.code === 'public_table_rls_declaration_missing').length === 2,
    reject_procedural_table_ddl: proceduralDdl.some((item) => item.code === 'procedural_table_ddl_not_statically_verifiable'),
    reject_unparseable_table_target: unparseableTarget.some((item) => item.code === 'table_target_not_statically_verifiable'),
    reject_standard_string_procedural_ddl: standardStringProceduralDdl.some((item) => item.code === 'procedural_table_ddl_not_statically_verifiable'),
    reject_escape_string_procedural_ddl: escapeStringProceduralDdl.some((item) => item.code === 'procedural_table_ddl_not_statically_verifiable'),
    reject_qualified_select_into_table_creation: qualifiedSelectInto.some((item) => item.code === 'select_into_table_creation_forbidden'),
    reject_unqualified_select_into_table_creation: unqualifiedSelectInto.some((item) => item.code === 'select_into_table_creation_forbidden'),
    preserve_create_after_standard_string_backslash: standardStringBackslashCreate.some((item) => item.code === 'public_table_rls_declaration_missing'),
    preserve_select_into_after_standard_string_backslash: standardStringBackslashSelectInto.some((item) => item.code === 'select_into_table_creation_forbidden'),
    preserve_create_after_dollar_identifier_text: dollarIdentifierCreate.some((item) => item.code === 'public_table_rls_declaration_missing'),
    preserve_select_into_after_dollar_identifier_text: dollarIdentifierSelectInto.some((item) => item.code === 'select_into_table_creation_forbidden'),
    reject_parenthesized_select_into_table_creation: parenthesizedSelectInto.some((item) => item.code === 'select_into_table_creation_forbidden'),
    reject_foreign_table_creation: foreignTable.some((item) => item.code === 'foreign_table_creation_forbidden'),
    reject_import_foreign_schema_table_creation: importForeignSchema.some((item) => item.code === 'import_foreign_schema_table_creation_forbidden'),
    reject_qualified_public_schema_transfer: qualifiedSchemaTransfer.some((item) => item.code === 'table_schema_transfer_forbidden'),
    reject_unqualified_public_schema_transfer: unqualifiedSchemaTransfer.some((item) => item.code === 'table_schema_transfer_forbidden'),
    reject_quoted_public_schema_transfer: quotedSchemaTransfer.some((item) => item.code === 'table_schema_transfer_forbidden'),
    reject_create_then_public_schema_transfer: createThenTransfer.some((item) => item.code === 'table_schema_transfer_forbidden'),
    reject_foreign_public_schema_transfer: foreignSchemaTransfer.some((item) => item.code === 'table_schema_transfer_forbidden'),
    reject_string_lexing_mode_change: stringLexingModeChange.some((item) => item.code === 'sql_string_lexing_mode_change_forbidden'),
    reject_string_lexing_set_config: stringLexingSetConfig.some((item) => item.code === 'sql_string_lexing_mode_change_forbidden'),
    reject_unparseable_schema_transfer: unparseableSchemaTransfer.some((item) => item.code === 'table_schema_transfer_forbidden'),
    reject_all_schema_transfers_until_statically_reviewed: privateSchemaTransfer.some((item) => item.code === 'table_schema_transfer_forbidden'),
    reject_procedural_select_into: proceduralSelectInto.some((item) => item.code === 'procedural_table_ddl_not_statically_verifiable'),
    reject_procedural_foreign_table: proceduralForeignTable.some((item) => item.code === 'procedural_table_ddl_not_statically_verifiable'),
    reject_procedural_import_foreign_schema: proceduralImportForeignSchema.some((item) => item.code === 'procedural_table_ddl_not_statically_verifiable'),
    reject_procedural_schema_transfer: proceduralSchemaTransfer.some((item) => item.code === 'procedural_table_ddl_not_statically_verifiable'),
    reject_rls_disabled_after_controls: disabledRlsAfterControls.some((item) => item.code === 'rls_disable_forbidden'),
    reject_drop_and_recreate_after_controls: droppedAndRecreatedTable.some((item) => item.code === 'table_lifecycle_reset_forbidden'),
    reject_rolled_back_controls: rolledBackControls.some((item) => item.code === 'transaction_control_reversal_forbidden'),
    reject_savepoint_control_reversal: savepointControls.some((item) => item.code === 'transaction_control_reversal_forbidden'),
    reject_unreviewed_safe_private_function: safePrivateFunction.some((item) => item.code === 'procedural_table_ddl_not_statically_verifiable'),
    allow_safe_committed_public_table: safeCommittedPublicTable.length === 0,
    reject_table_rename_and_recreate_after_controls: renamedAndRecreatedTable.some((item) => item.code === 'table_lifecycle_reset_forbidden'),
    reject_procedural_table_rename: proceduralTableRename.some((item) => item.code === 'procedural_table_ddl_not_statically_verifiable'),
    reject_explicit_non_plpgsql_do_select_into: explicitNonPlpgsqlDoSelectInto.some((item) => item.code === 'procedural_table_ddl_not_statically_verifiable'),
    reject_unreviewed_plpgsql_variable_select_into: plpgsqlVariableSelectInto.some((item) => item.code === 'procedural_table_ddl_not_statically_verifiable'),
    preserve_create_after_unicode_dollar_identifier_text: unicodeDollarIdentifierCreate.some((item) => item.code === 'public_table_rls_declaration_missing'),
    reject_concatenated_string_lexing_set_config: concatenatedStringModeChange.some((item) => item.code === 'sql_string_lexing_mode_change_forbidden'),
    reject_computed_string_lexing_set_config: computedStringModeChange.some((item) => item.code === 'sql_string_lexing_mode_change_forbidden'),
    reject_revoke_grant_option_as_role_declaration: revokeGrantOptionOnly.some((item) => item.code === 'public_table_role_access_declaration_missing'),
    reject_unicode_dollar_quote_control_spoof: unicodeDollarQuoteSpoof.some((item) => item.code === 'public_table_rls_declaration_missing')
      && unicodeDollarQuoteSpoof.some((item) => item.code === 'public_table_role_access_declaration_missing'),
    preserve_create_after_astral_dollar_identifier_text: astralDollarIdentifierCreate.some((item) => item.code === 'public_table_rls_declaration_missing'),
    reject_procedural_string_lexing_mode_change: proceduralStringModeChange.some((item) => item.code === 'procedural_table_ddl_not_statically_verifiable'),
    reject_extension_update_version_pin: extensionUpdatePin.some((item) => item.code === 'extension_version_pin_forbidden'),
    preserve_create_after_emoji_dollar_identifier_text: emojiDollarIdentifierCreate.some((item) => item.code === 'public_table_rls_declaration_missing'),
    reject_emoji_dollar_quote_control_spoof: emojiDollarQuoteSpoof.some((item) => item.code === 'public_table_rls_declaration_missing')
      && emojiDollarQuoteSpoof.some((item) => item.code === 'public_table_role_access_declaration_missing'),
    reject_procedural_removed_extension: proceduralRemovedExtension.some((item) => item.code === 'procedural_table_ddl_not_statically_verifiable'),
    reject_procedural_extension_version_pin: proceduralPinnedExtension.some((item) => item.code === 'procedural_table_ddl_not_statically_verifiable'),
    reject_procedural_extension_update_pin: proceduralExtensionUpdatePin.some((item) => item.code === 'procedural_table_ddl_not_statically_verifiable'),
    reject_unknown_procedural_language: unknownLanguageFunction.some((item) => item.code === 'procedural_table_ddl_not_statically_verifiable'),
    reject_missing_function_language: missingLanguageFunction.some((item) => item.code === 'procedural_table_ddl_not_statically_verifiable'),
    reject_unknown_do_language: unknownLanguageDo.some((item) => item.code === 'procedural_table_ddl_not_statically_verifiable'),
    reject_procedural_qualified_helper_call: proceduralHelperCall.some((item) => item.code === 'procedural_table_ddl_not_statically_verifiable'),
    reject_procedural_perform_call: proceduralPerformCall.some((item) => item.code === 'procedural_table_ddl_not_statically_verifiable'),
    allow_only_digest_pinned_canonical_baseline: canonicalBaseline.length === 0,
    allow_absolute_digest_pinned_canonical_baseline: absoluteCanonicalBaseline.length === 0,
    allow_canonical_baseline_across_git_line_endings: canonicalBaselineWithLf.length === 0 && canonicalBaselineWithCrlf.length === 0,
    reject_changed_canonical_baseline: changedBaseline.some((item) => item.code === 'legacy_public_baseline_digest_mismatch'),
    reject_changed_compliant_canonical_baseline: changedCompliantBaseline.some((item) => item.code === 'legacy_public_baseline_digest_mismatch'),
    reject_digest_matched_baseline_at_lookalike_path: duplicateBaseline.some((item) => item.code === 'immutable_managed_migration_duplicate_path_forbidden'),
    allow_digest_pinned_private_migration: canonicalPrivateMigration.length === 0,
    allow_digest_pinned_private_migration_across_git_line_endings: canonicalPrivateMigrationWithCrlf.length === 0,
    reject_changed_immutable_private_migration: changedPrivateMigration.some((item) => item.code === 'immutable_managed_migration_digest_mismatch'),
    reject_digest_matched_private_migration_at_new_path: duplicatePrivateMigration.some((item) => item.code === 'immutable_managed_migration_duplicate_path_forbidden'),
    reject_public_view_ddl_without_digest_pin: publicView.some((item) => item.code === 'view_ddl_requires_reviewed_digest_pin'),
    reject_private_view_ddl_without_digest_pin: privateView.some((item) => item.code === 'view_ddl_requires_reviewed_digest_pin'),
    reject_existing_public_table_browser_grant: existingPublicTableGrant.some((item) => item.code === 'browser_inherited_privilege_expansion_forbidden'),
    reject_public_inherited_table_grant: publicRoleGrant.some((item) => item.code === 'browser_inherited_privilege_expansion_forbidden'),
    reject_default_browser_grant: defaultBrowserGrant.some((item) => item.code === 'browser_inherited_privilege_expansion_forbidden'),
    reject_browser_role_mutation: browserRoleMutation.some((item) => item.code === 'browser_inherited_privilege_expansion_forbidden'),
    reject_browser_table_ownership: browserTableOwnership.some((item) => item.code === 'browser_inherited_privilege_expansion_forbidden'),
    allow_service_role_grant_without_browser_expansion: serviceRoleGrant.length === 0,
    reject_unreviewed_role_ddl: unrelatedRoleDdl.some((item) => item.code === 'role_ddl_requires_reviewed_digest_pin'),
    reject_unparseable_unicode_browser_grantee: unicodeEscapedBrowserGrant.some((item) => item.code === 'browser_inherited_privilege_expansion_forbidden')
      || unicodeEscapedBrowserGrant.some((item) => item.code === 'role_ddl_requires_reviewed_digest_pin'),
    reject_unparseable_extension_target: unparseableRemovedExtension.some((item) => item.code === 'extension_target_not_statically_verifiable'),
    reject_extension_removal_without_digest_pin: extensionRemoval.some((item) => item.code === 'extension_removal_requires_reviewed_digest_pin'),
    reject_legacy_group_browser_expansion: legacyGroupBrowserExpansion.some((item) => item.code === 'role_ddl_requires_reviewed_digest_pin'),
    reject_recursive_view_without_digest_pin: recursiveView.some((item) => item.code === 'view_ddl_requires_reviewed_digest_pin'),
    reject_schema_with_nested_view_without_digest_pin: schemaNestedView.some((item) => item.code === 'schema_ddl_requires_reviewed_digest_pin'),
    reject_partial_browser_revoke_as_complete_declaration: partialBrowserRevoke.some((item) => item.code === 'public_table_role_access_declaration_missing'),
    allow_all_privileges_browser_revoke: allPrivilegesBrowserRevoke.length === 0,
    reject_browser_grant_as_denial_declaration: browserGrantNotDeclaration.some((item) => item.code === 'public_table_role_access_declaration_missing')
      && browserGrantNotDeclaration.some((item) => item.code === 'browser_inherited_privilege_expansion_forbidden'),
    reject_alter_function_without_digest_pin: alteredFunctionSecurityDefiner.some((item) => item.code === 'routine_ddl_requires_reviewed_digest_pin'),
    reject_alter_procedure_without_digest_pin: alteredProcedureSecurityDefiner.some((item) => item.code === 'routine_ddl_requires_reviewed_digest_pin'),
    reject_alter_routine_without_digest_pin: alteredRoutineSecurityDefiner.some((item) => item.code === 'routine_ddl_requires_reviewed_digest_pin'),
    reject_drop_function_without_digest_pin: droppedFunction.some((item) => item.code === 'routine_ddl_requires_reviewed_digest_pin'),
    reject_drop_owned_without_digest_pin: droppedOwnedObjects.some((item) => item.code === 'owned_object_cleanup_requires_reviewed_digest_pin'),
    reject_temporary_view_without_digest_pin: temporaryView.some((item) => item.code === 'view_ddl_requires_reviewed_digest_pin'),
    reject_partition_attachment_outside_unpinned_allowlist: partitionAttachment.some((item) => item.code === 'unpinned_migration_statement_not_allowlisted'),
    reject_policy_ddl_outside_unpinned_allowlist: policyDdl.some((item) => item.code === 'unpinned_migration_statement_not_allowlisted'),
    reject_index_ddl_outside_unpinned_allowlist: indexDdl.some((item) => item.code === 'unpinned_migration_statement_not_allowlisted'),
    reject_inherited_table_outside_unpinned_allowlist: inheritedTable.some((item) => item.code === 'unpinned_migration_statement_not_allowlisted'),
    allow_basic_private_table_in_unpinned_envelope: safeBasicPrivateTable.length === 0,
    reject_public_table_without_atomic_transaction: publicTableWithoutTransaction.some((item) => item.code === 'public_table_atomic_transaction_required'),
    reject_controls_after_internal_commit: controlsAfterCommit.some((item) => item.code === 'unpinned_migration_transaction_envelope_invalid')
      && controlsAfterCommit.some((item) => item.code === 'public_table_atomic_transaction_required'),
    reject_partitioned_table_outside_unpinned_allowlist: partitionedTable.some((item) => item.code === 'unpinned_migration_statement_not_allowlisted'),
    reject_create_table_as_select_outside_unpinned_allowlist: createTableAsSelect.some((item) => item.code === 'unpinned_migration_statement_not_allowlisted'),
    reject_create_table_like_outside_unpinned_allowlist: createTableLike.some((item) => item.code === 'unpinned_migration_statement_not_allowlisted'),
    reject_create_table_if_not_exists_outside_unpinned_allowlist: createTableIfNotExists.some((item) => item.code === 'unpinned_migration_statement_not_allowlisted'),
    reject_unlogged_table_outside_unpinned_allowlist: createUnloggedTable.some((item) => item.code === 'unpinned_migration_statement_not_allowlisted'),
    reject_managed_schema_table_outside_unpinned_allowlist: createManagedSchemaTable.some((item) => item.code === 'unpinned_migration_statement_not_allowlisted'),
    reject_arbitrary_role_grant_outside_unpinned_allowlist: arbitraryRoleGrant.some((item) => item.code === 'unpinned_migration_statement_not_allowlisted'),
    reject_commit_and_chain_outside_atomic_envelope: commitAndChain.some((item) => item.code === 'unpinned_migration_statement_not_allowlisted')
      && commitAndChain.some((item) => item.code === 'unpinned_migration_transaction_envelope_invalid')
      && commitAndChain.some((item) => item.code === 'public_table_atomic_transaction_required'),
    reject_grant_option_outside_unpinned_allowlist: serviceRoleGrantOption.some((item) => item.code === 'unpinned_migration_statement_not_allowlisted'),
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
      publicTableAutomaticGrantChange: '2026-10-30',
    },
    publicTableMigrationPolicy: {
      explicitRlsRequired: true,
      explicitRoleDeclarationsRequired: PUBLIC_TABLE_ROLES,
      immutableMigrationDigests: IMMUTABLE_MANAGED_MIGRATIONS.size,
      newProceduralMigrationsRequireReviewedDigestPin: true,
      browserInheritedPrivilegeExpansionForbidden: true,
      viewAndRoleDdlRequireReviewedDigestPin: true,
      publicTableAtomicTransactionRequired: true,
      newUnpinnedMigrationStatementAllowlist: [
        'transaction-boundary',
        'basic-create-table-in-public-or-app-private',
        'enable-row-level-security',
        'schema-qualified-table-grant-or-revoke-for-known-runtime-role',
      ],
    },
    controls: {
      networkRequests: 0,
      databaseConnections: 0,
      providerMutations: 0,
      subprocesses: 1,
      subprocessAllowlist: ['git ls-files -z -- *.sql'],
      symlinksFollowed: false,
      symlinksRejected: true,
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
