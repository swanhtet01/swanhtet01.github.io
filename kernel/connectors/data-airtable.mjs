// Connector: data — Airtable.
// Read and write records in any Airtable base. Many SMBs in SE Asia use Airtable
// as their "database" for orders, contacts, inventory, and approvals. This connector
// lets SuperMega agents pull those records into workflows and push results back.
//
// category 'data' · configured = AIRTABLE_API_KEY + AIRTABLE_BASE_ID present.
//
// Env:
//   AIRTABLE_API_KEY   (required)  personal access token from airtable.com/create/tokens
//   AIRTABLE_BASE_ID   (required)  base ID from the URL: airtable.com/appXXXXXXXX/...
//
// Capabilities:
//   listRecords(table, opts)             -> { ok, records, offset }
//   getRecord(table, recordId)           -> { ok, record }
//   createRecord(table, fields)          -> { ok, record }
//   updateRecord(table, recordId, fields) -> { ok, record }
//   deleteRecord(table, recordId)        -> { ok, deleted }
//   health()                             -> { ok, detail }

import { register } from './registry.mjs'

const BASE = 'https://api.airtable.com/v0'
const apiKey = () => String(process.env.AIRTABLE_API_KEY || '').trim()
const baseId = () => String(process.env.AIRTABLE_BASE_ID || '').trim()
const configured = () => Boolean(apiKey() && baseId())

function headers() {
  return {
    Authorization: `Bearer ${apiKey()}`,
    'Content-Type': 'application/json',
  }
}

async function atFetch(path, options = {}) {
  try {
    const res = await fetch(`${BASE}/${baseId()}${path}`, {
      ...options,
      headers: { ...headers(), ...(options.headers || {}) },
      signal: AbortSignal.timeout(options.timeout || 10000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return { ok: false, reason: `airtable_${res.status}: ${data?.error?.message || ''}`.slice(0, 200) }
    }
    return { ok: true, data }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'airtable_error').slice(0, 200) }
  }
}

function encTable(table) {
  return encodeURIComponent(String(table || ''))
}

/**
 * listRecords — fetch records from a table with optional filtering.
 * @param {string} table            table name or ID
 * @param {object} [opts]
 * @param {string}  [opts.formula]  Airtable formula filter (e.g. "{Status}='Active'")
 * @param {string}  [opts.view]     view name to use
 * @param {number}  [opts.maxRecords]  max records to return (default 100)
 * @param {string}  [opts.offset]   pagination offset from previous call
 * @returns {Promise<{ ok:boolean, records:Array, offset:string|null }>}
 */
export async function listRecords(table, { formula, view, maxRecords = 100, offset } = {}) {
  if (!configured()) return { ok: false, reason: 'airtable_not_configured' }
  const params = new URLSearchParams()
  if (formula) params.set('filterByFormula', formula)
  if (view) params.set('view', view)
  if (maxRecords) params.set('maxRecords', String(maxRecords))
  if (offset) params.set('offset', offset)
  const qs = params.toString() ? `?${params}` : ''
  const r = await atFetch(`/${encTable(table)}${qs}`, { method: 'GET' })
  if (!r.ok) return r
  return { ok: true, records: r.data.records || [], offset: r.data.offset || null }
}

/**
 * getRecord — fetch a single record by ID.
 */
export async function getRecord(table, recordId) {
  if (!configured()) return { ok: false, reason: 'airtable_not_configured' }
  const r = await atFetch(`/${encTable(table)}/${encodeURIComponent(recordId)}`, { method: 'GET' })
  if (!r.ok) return r
  return { ok: true, record: r.data }
}

/**
 * createRecord — create a new record in the table.
 * @param {string} table
 * @param {object} fields  key-value pairs matching Airtable field names
 */
export async function createRecord(table, fields) {
  if (!configured()) return { ok: false, reason: 'airtable_not_configured' }
  const r = await atFetch(`/${encTable(table)}`, {
    method: 'POST',
    body: JSON.stringify({ fields }),
  })
  if (!r.ok) return r
  return { ok: true, record: r.data }
}

/**
 * updateRecord — update fields on an existing record (PATCH — only named fields change).
 */
export async function updateRecord(table, recordId, fields) {
  if (!configured()) return { ok: false, reason: 'airtable_not_configured' }
  const r = await atFetch(`/${encTable(table)}/${encodeURIComponent(recordId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  })
  if (!r.ok) return r
  return { ok: true, record: r.data }
}

/**
 * deleteRecord — delete a record by ID.
 */
export async function deleteRecord(table, recordId) {
  if (!configured()) return { ok: false, reason: 'airtable_not_configured' }
  const r = await atFetch(`/${encTable(table)}/${encodeURIComponent(recordId)}`, { method: 'DELETE' })
  if (!r.ok) return r
  return { ok: true, deleted: r.data?.deleted || false, id: recordId }
}

export const dataAirtable = {
  key: 'data-airtable',
  name: 'Airtable',
  category: 'data',
  docs: 'kernel/connectors/data-airtable.mjs',
  configured,
  async health() {
    if (!configured()) return { ok: false, detail: 'missing AIRTABLE_API_KEY or AIRTABLE_BASE_ID' }
    const r = await listRecords('', { maxRecords: 1 })
    // A 404 on an empty table name still proves auth works
    if (r.reason?.includes('airtable_404') || r.reason?.includes('airtable_422')) {
      return { ok: true, detail: 'auth ok (table probe returned expected 4xx)' }
    }
    return r.ok
      ? { ok: true, detail: `base=${baseId()}` }
      : { ok: false, detail: r.reason }
  },
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
}

register(dataAirtable)
export default dataAirtable
