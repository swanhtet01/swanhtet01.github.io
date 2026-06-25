// Connector: data — Google Sheets. Read/append cells via the Sheets REST API using a
// service-account JWT (fetch-based, zero-dependency — no googleapis SDK). Lets the kernel use a
// spreadsheet as a lightweight data sink (e.g. mirror leads/activity to a CEO-facing sheet).
//
// category 'data' · configured = a Google service-account credential env is present.
//
// Auth: shared in _google-auth.mjs (signs an RS256 JWT, exchanges it for an OAuth2 token, caches).
//
// Env:
//   GOOGLE_SERVICE_ACCOUNT_JSON    (required*) full service-account JSON (string or base64), OR
//   GOOGLE_APPLICATION_CREDENTIALS (required*) path to that JSON file
//   (* one of the two)
//   The service account must be granted access to the target spreadsheet (share the sheet with the
//   service account's client_email, or use a Workspace-domain sheet).
//
// Capabilities beyond the interface:
//   readRange(spreadsheetId, range)          -> { range, values }      (GET values)
//   appendRow(spreadsheetId, range, values)  -> { updates }            (append a row)

import { register } from './registry.mjs'
import { credsConfigured, readServiceAccount, getAccessToken } from './_google-auth.mjs'

const API = 'https://sheets.googleapis.com/v4/spreadsheets'
// Read/write values needs the full spreadsheets scope (readonly is insufficient for append).
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

const configured = credsConfigured

async function sheetsFetch(method, path, { query, body, subject } = {}) {
  const token = await getAccessToken(SCOPES, { subject })
  const qs = query ? `?${new URLSearchParams(query).toString()}` : ''
  const res = await fetch(`${API}${path}${qs}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(`sheets_${res.status}: ${json?.error?.message || ''}`.slice(0, 200))
    err.status = res.status
    throw err
  }
  return json
}

/**
 * readRange — read a rectangular range of values.
 * @param {string} spreadsheetId  the long id from the sheet URL
 * @param {string} range          A1 notation, e.g. 'Sheet1!A1:D50'
 * @param {object} [o]
 * @param {string} [o.subject]     impersonate this user (domain-wide delegation)
 * @returns {Promise<{ range:string, values:any[][] }>}
 */
export async function readRange(spreadsheetId, range, { subject } = {}) {
  if (!configured()) throw new Error('sheets_not_configured')
  if (!spreadsheetId || !range) throw new Error('sheets_missing_args')
  const json = await sheetsFetch('GET', `/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`, { subject })
  return { range: json.range || range, values: json.values || [] }
}

/**
 * appendRow — append one (or more) rows after the last row of a table.
 * @param {string} spreadsheetId
 * @param {string} range      anchor range whose table is appended to, e.g. 'Sheet1!A1'
 * @param {any[]|any[][]} values  a single row (array of cells) or multiple rows (array of rows)
 * @param {object} [o]
 * @param {string} [o.subject]
 * @returns {Promise<{ updates:object }>}
 */
export async function appendRow(spreadsheetId, range, values, { subject, raw = false } = {}) {
  if (!configured()) throw new Error('sheets_not_configured')
  if (!spreadsheetId || !range || !values) throw new Error('sheets_missing_args')
  // Normalize a flat row into the [[...]] shape Sheets expects.
  const rows = Array.isArray(values[0]) ? values : [values]
  // SECURITY: USER_ENTERED makes Sheets interpret values starting with = + - @ as formulas (CSV/
  // formula injection when mirroring untrusted data, e.g. a lead's name, to a human-facing sheet).
  // Callers writing externally-sourced data should pass { raw: true } to disable formula evaluation.
  const json = await sheetsFetch('POST', `/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append`, {
    query: { valueInputOption: raw ? 'RAW' : 'USER_ENTERED', insertDataOption: 'INSERT_ROWS' },
    body: { values: rows },
    subject,
  })
  return { updates: json.updates || null }
}

export const dataSheets = {
  key: 'data-sheets',
  name: 'Google Sheets',
  category: 'data',
  docs: 'kernel/connectors/data-sheets.mjs',
  configured,
  // Cheap probe: mint an access token for the Sheets scope. Proves the creds parse + Google accepts
  // the JWT, without touching any particular spreadsheet (we don't know an id at probe time).
  async health() {
    if (!configured()) return { ok: false, detail: 'missing GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_APPLICATION_CREDENTIALS' }
    const sa = readServiceAccount()
    if (!sa) return { ok: false, detail: 'google creds present but unparseable (need client_email + private_key)' }
    try {
      await getAccessToken(SCOPES)
      return { ok: true, detail: `auth ok (sa=${sa.client_email})` }
    } catch (e) {
      return { ok: false, detail: String(e.message || 'google_token_error').slice(0, 160) }
    }
  },
  readRange,
  appendRow,
}

register(dataSheets)
export default dataSheets
