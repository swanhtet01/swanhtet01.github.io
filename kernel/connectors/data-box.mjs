// Connector: data — Box. Read a Box folder's contents via the Box Content API (zero-dependency,
// fetch-based). Lets a Myanmar SMB that already keeps its documents in Box list what's inside a
// folder — files and subfolders — from the SuperMega kernel, so the console can surface Box-stored
// assets (invoices, receipts, product photos) without any manual export.
//
// category 'data' · configured = BOX_ACCESS_TOKEN present (non-empty).
//
// Quick setup:
//   1. In the Box Developer Console, create an app (or use an existing one) and obtain an OAuth 2.0
//      access token (or a Custom App / Server Authentication token with read scope).
//   2. Set it as BOX_ACCESS_TOKEN.
//   3. (Per call) pass a folderId to listFolder — the root folder is always id '0'.
//
// Env:
//   BOX_ACCESS_TOKEN  (required)  Box API OAuth 2.0 bearer access token.
//
// Auth: Bearer. Authorization: 'Bearer ' + BOX_ACCESS_TOKEN.
//
// SSRF-safe: the host is a FIXED hardcoded constant (https://api.box.com). No user-supplied value
// ever selects the host — folderId only fills a path segment and is URL-encoded.
//
// Capabilities:
//   listFolder({ folderId }) — GET /2.0/folders/<folderId>/items (list a folder's files + subfolders).

import { register } from './registry.mjs'

// Fixed, hardcoded host. Never derived from any user/env value → no SSRF surface.
const HOST = 'https://api.box.com'

const accessToken = () => String(process.env.BOX_ACCESS_TOKEN || '').trim()

const authHeader = () => `Bearer ${accessToken()}`

// configured — the bearer token env var is present (non-empty). No network call.
const configured = () => accessToken().length > 0

/**
 * listFolder — list the items (files + subfolders) inside a Box folder.
 *
 * GETs /2.0/folders/<folderId>/items and maps the returned entries[] to a compact
 * { name, id, type } shape. The Box root folder is always id '0' (the default).
 *
 * @param {object}  [payload]
 * @param {string}  [payload.folderId='0']  the Box folder id to list (root = '0').
 * @returns {Promise<{ ok:boolean, status?:number, items?:Array<{name:string,id:string,type:string}>, reason?:string }>}
 */
export async function listFolder(_input = {}) {
  if (!configured()) return { ok: false, reason: 'data-box_not_configured' }
  const { folderId = '0' } = _input || {}
  const id = String(folderId == null ? '0' : folderId).trim() || '0'

  try {
    const res = await fetch(`${HOST}/2.0/folders/${encodeURIComponent(id)}/items`, {
      method: 'GET',
      headers: {
        authorization: authHeader(),
        accept: 'application/json',
        'user-agent': 'supermega-kernel/1.0',
      },
      signal: AbortSignal.timeout(8000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      return { ok: false, status: res.status, reason: `data-box_${res.status}` }
    }
    const entries = Array.isArray(data?.entries) ? data.entries : []
    const items = entries.map((e) => ({ name: e?.name, id: e?.id, type: e?.type }))
    return { ok: true, status: res.status, items }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'data-box_error').slice(0, 200) }
  }
}

export const dataBox = {
  key: 'data-box',
  name: 'Box',
  category: 'data',
  docs: 'kernel/connectors/data-box.mjs',
  configured,
  /**
   * health — GET /2.0/users/me is Box's cheap authenticated liveness probe. It returns 200 with the
   * current user object when the token is valid, without touching any folder/file data.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing BOX_ACCESS_TOKEN' }
    try {
      const res = await fetch(`${HOST}/2.0/users/me`, {
        method: 'GET',
        headers: {
          authorization: authHeader(),
          accept: 'application/json',
          'user-agent': 'supermega-kernel/1.0',
        },
        signal: AbortSignal.timeout(8000),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        return { ok: false, detail: `data-box_${res.status}: ${(data?.message || data?.code || '')}`.slice(0, 160) }
      }
      return { ok: true, detail: String(data?.name || 'me ok').slice(0, 160) }
    } catch (e) {
      return { ok: false, detail: String(e?.message || 'data-box_error').slice(0, 160) }
    }
  },
  listFolder,
}

register(dataBox)
export default dataBox
