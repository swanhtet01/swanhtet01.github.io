// Connector: data — Dropbox. Push exports, receipts, and reports into a Dropbox folder the business
// owner already controls, via the Dropbox HTTP API (zero-dependency, fetch-based). Lets a Myanmar SMB
// take a POS day-end export or a generated payslip/receipt and land it straight into their own Dropbox
// — so backups and deliverables live in a place the owner can see, share, and keep, without any manual
// upload step or a Dropbox SDK on the server.
//
// category 'data' · configured = DROPBOX_ACCESS_TOKEN present. Dropbox uses FIXED hosts
// (api.dropboxapi.com), so no user value is ever allowed to choose the host — the base URL is a
// hardcoded https constant and configured() just checks the token is present.
//
// Quick setup:
//   1. In Dropbox: https://www.dropbox.com/developers/apps → "Create app".
//   2. Choose "Scoped access", pick "App folder" (or "Full Dropbox"), name the app.
//   3. Under Permissions, enable the scopes you need (e.g. files.metadata.read, files.content.read,
//      account_info.read) and Submit.
//   4. Under Settings → "OAuth 2" → "Generated access token", click Generate. Copy the token.
//   5. Set it as DROPBOX_ACCESS_TOKEN. (Generated tokens are short-lived for some app configs; use a
//      long-lived token or refresh flow if you need persistence — this connector just consumes the
//      access token it's given.)
//
// Env:
//   DROPBOX_ACCESS_TOKEN  (required)  Dropbox OAuth 2 access token (Bearer).
//
// Auth: Bearer. Authorization: 'Bearer ' + DROPBOX_ACCESS_TOKEN.
//
// Capabilities:
//   listFolder({ path }) — POST /2/files/list_folder (list entries in a folder; path '' = root).

import { register } from './registry.mjs'

const token = () => String(process.env.DROPBOX_ACCESS_TOKEN || '').trim()

// Dropbox API host is FIXED — hardcoded https constant. No user/derived value ever chooses the host,
// so there is no SSRF surface here; configured() only needs to check the token is present.
const API_BASE = 'https://api.dropboxapi.com'

const authHeader = () => `Bearer ${token()}`

// configured — token present. Host is a fixed https constant (never user-derived), so a token check
// is sufficient. We still keep the check strict: an empty/whitespace token yields false.
const configured = () => token().length > 0

/**
 * listFolder — list the entries (files and subfolders) in a Dropbox folder.
 *
 * POSTs to /2/files/list_folder with { path }. Dropbox requires the EMPTY STRING for the root folder
 * (not '/'), so path defaults to '' which lists the app folder / Dropbox root. Returns 200 with an
 * `entries` array on success; each entry's '.tag' is 'file' | 'folder' | 'deleted'.
 *
 * @param {object}  [payload]
 * @param {string}  [payload.path]  the folder path to list ('' = root; e.g. '/exports'). Defaults to ''.
 * @returns {Promise<{ ok:boolean, status?:number, entries?:Array<{name:string,path:string,type:string}>, reason?:string }>}
 */
export async function listFolder(payload = {}) {
  const { path = '' } = payload || {}
  if (!configured()) return { ok: false, reason: 'dropbox_not_configured' }
  // Root is the empty string in Dropbox; any other value is passed through as-is.
  const folder = String(path == null ? '' : path)

  const body = { path: folder }

  try {
    const res = await fetch(`${API_BASE}/2/files/list_folder`, {
      method: 'POST',
      headers: {
        authorization: authHeader(),
        'content-type': 'application/json',
        'user-agent': 'supermega-kernel/1.0',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const reason = data?.error_summary || data?.error?.['.tag'] || data?.error || `http_${res.status}`
      return { ok: false, status: res.status, reason: `dropbox_${String(reason)}`.slice(0, 200) }
    }
    const entries = (data?.entries || []).map((e) => ({
      name: e.name,
      path: e.path_lower,
      type: e['.tag'],
    }))
    return { ok: true, status: res.status, entries }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'dropbox_error').slice(0, 200) }
  }
}

export const dataDropbox = {
  key: 'data-dropbox',
  name: 'Dropbox',
  category: 'data',
  docs: 'kernel/connectors/data-dropbox.mjs',
  configured,
  /**
   * health — POST /2/users/get_current_account is Dropbox's cheap authenticated liveness probe. It
   * returns 200 with the account profile when the token is valid, without touching any file data.
   * NOTE: this endpoint takes a JSON `null` body (not an object) per the Dropbox API.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing DROPBOX_ACCESS_TOKEN' }
    try {
      const res = await fetch(`${API_BASE}/2/users/get_current_account`, {
        method: 'POST',
        headers: {
          authorization: authHeader(),
          'content-type': 'application/json',
          'user-agent': 'supermega-kernel/1.0',
        },
        body: 'null',
        signal: AbortSignal.timeout(8000),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return { ok: false, detail: `dropbox_${res.status}: ${(data?.error_summary || '')}`.slice(0, 160) }
      }
      const label = data?.name?.display_name || 'account ok'
      return { ok: true, detail: String(label).slice(0, 160) }
    } catch (e) {
      return { ok: false, detail: String(e?.message || 'dropbox_error').slice(0, 160) }
    }
  },
  listFolder,
}

register(dataDropbox)
export default dataDropbox
