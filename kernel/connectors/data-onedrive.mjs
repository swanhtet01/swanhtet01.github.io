// Connector: data — Microsoft OneDrive. Read the files and folders in a user's OneDrive via the
// Microsoft Graph API (zero-dependency, fetch-based). Lets Myanmar SMBs surface the spreadsheets,
// exports, and documents they already keep in OneDrive so the kernel can list them for downstream
// ingestion — without any manual upload.
//
// category 'data' · configured = ONEDRIVE_ACCESS_TOKEN present (non-empty).
//
// Quick setup:
//   1. Register/authorize an app against Microsoft Graph with the Files.Read (or Files.Read.All)
//      delegated scope and obtain an OAuth2 access token for the signed-in user.
//   2. Set that token as ONEDRIVE_ACCESS_TOKEN. All calls hit https://graph.microsoft.com/v1.0/me/drive.
//
// Env:
//   ONEDRIVE_ACCESS_TOKEN  (required)  Microsoft Graph OAuth2 bearer token for the target user.
//
// Auth: Bearer. Authorization: 'Bearer ' + ONEDRIVE_ACCESS_TOKEN.
//
// SSRF-safe: the host is a fixed hardcoded constant (https://graph.microsoft.com). No user-supplied
// value ever selects the host — only a path segment (encodeURIComponent'd) is appended.
//
// Capabilities:
//   listFiles({ path }) — GET /v1.0/me/drive/root/children (or root:/<path>:/children when path set).

import { register } from './registry.mjs'

// Fixed, hardcoded API host — never derived from any user value (SSRF-safe).
const HOST = 'https://graph.microsoft.com'

const accessToken = () => String(process.env.ONEDRIVE_ACCESS_TOKEN || '').trim()

const authHeader = () => `Bearer ${accessToken()}`

// configured — required env var present and non-empty.
const configured = () => accessToken().length > 0

/**
 * listFiles — list the immediate children (files + folders) of a OneDrive folder.
 *
 * GETs /v1.0/me/drive/root/children when no path is given, or
 * /v1.0/me/drive/root:/<path>:/children when a path is supplied (path segment encodeURIComponent'd).
 * Maps Graph's value[] into a compact {name,id,type,size} shape. type is 'folder' when the item
 * carries a `folder` facet, otherwise 'file'.
 *
 * @param {object} [payload]
 * @param {string} [payload.path]  folder path relative to the drive root (default '' = root).
 * @returns {Promise<{ ok:boolean, files?:Array<{name:string,id:string,type:string,size:number}>, reason?:string }>}
 */
export async function listFiles(_input = {}) {
  if (!configured()) return { ok: false, reason: 'data-onedrive_not_configured' }
  const { path = '' } = _input || {}
  const rel = String(path || '').trim().replace(/^\/+|\/+$/g, '')

  const url = rel
    ? `${HOST}/v1.0/me/drive/root:/${encodeURIComponent(rel)}:/children`
    : `${HOST}/v1.0/me/drive/root/children`

  try {
    const res = await fetch(url, {
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
      return { ok: false, status: res.status, reason: `data-onedrive_${res.status}` }
    }
    const value = Array.isArray(data?.value) ? data.value : []
    const files = value.map((it) => ({
      name: it?.name,
      id: it?.id,
      type: it?.folder ? 'folder' : 'file',
      size: it?.size,
    }))
    return { ok: true, files }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'data-onedrive_error').slice(0, 200) }
  }
}

export const dataOnedrive = {
  key: 'data-onedrive',
  name: 'Microsoft OneDrive',
  category: 'data',
  docs: 'kernel/connectors/data-onedrive.mjs',
  configured,
  /**
   * health — GET /v1.0/me/drive is Graph's cheap authenticated probe for the user's default drive.
   * Returns 200 with the drive resource (owner, driveType, quota) when the token is valid.
   *
   * @returns {Promise<{ ok:boolean, detail?:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing ONEDRIVE_ACCESS_TOKEN' }
    try {
      const res = await fetch(`${HOST}/v1.0/me/drive`, {
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
        return { ok: false, detail: `data-onedrive_${res.status}` }
      }
      const label = data?.owner?.user?.displayName || data?.driveType || 'drive ok'
      return { ok: true, detail: String(label).slice(0, 160) }
    } catch (e) {
      return { ok: false, detail: String(e?.message || 'data-onedrive_error').slice(0, 160) }
    }
  },
  listFiles,
}

register(dataOnedrive)
export default dataOnedrive
