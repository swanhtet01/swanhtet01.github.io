// Connector: data — OneDrive. List files in the user's OneDrive via the Microsoft Graph API
// (zero-dependency, native fetch). Many Myanmar/SEA SMBs keep their real operating documents —
// price lists, supplier invoices, stock sheets, payroll — in OneDrive. This connector lets the
// SuperMega kernel enumerate those files so an agent can find and ingest the business's own data
// (the "upload your data → AI that knows your business" moat) without a manual export.
//
// category 'data' · configured = ONEDRIVE_ACCESS_TOKEN present.
// The API host is a hardcoded https constant (Microsoft Graph) — no user value ever chooses the host.
//
// Quick setup:
//   1. Register an app in the Azure portal (Azure Active Directory → App registrations).
//   2. Grant delegated Microsoft Graph permissions Files.Read (or Files.ReadWrite) + offline_access.
//   3. Complete the OAuth 2.0 flow to obtain an access token (short-lived — refresh out-of-band and
//      keep ONEDRIVE_ACCESS_TOKEN current).
//   4. Set ONEDRIVE_ACCESS_TOKEN to that bearer token. The host is fixed (graph.microsoft.com).
//
// Env:
//   ONEDRIVE_ACCESS_TOKEN  (required)  Microsoft Graph OAuth 2.0 bearer access token.
//
// Auth: HTTP Bearer. Authorization: 'Bearer ' + ONEDRIVE_ACCESS_TOKEN.
//
// Base: https://graph.microsoft.com/v1.0 (fixed host — never chosen from a user value).
//
// Capabilities:
//   listFiles({ path }) — GET /me/drive/root/children (root) or /me/drive/root:/{path}:/children.

import { register } from './registry.mjs'

// Fixed Microsoft Graph base — HARDCODED https constant. No env/user value contributes to the host,
// so listFiles()/health() can never be steered at an arbitrary host (no SSRF surface).
const API_BASE = 'https://graph.microsoft.com/v1.0'

const token = () => String(process.env.ONEDRIVE_ACCESS_TOKEN || '').trim()

const authHeader = () => 'Bearer ' + token()

// configured — this is a FIXED-host service (Microsoft Graph), so the base URL is the hardcoded
// API_BASE constant and configured() only checks that the required env var is present. No user
// value ever selects the host, so there's nothing host-shaped to validate here.
const configured = () => Boolean(token())

/**
 * listFiles — list the children (files + folders) of a OneDrive folder.
 *
 * With no path, lists the drive root (/me/drive/root/children). With a path, lists that folder's
 * children (/me/drive/root:/{path}:/children). The path segment is URL-encoded (keeping '/') so a
 * nested folder like "Invoices/2026" is addressed correctly. Any non-2xx or transport failure is
 * surfaced via reason (never thrown).
 *
 * @param {object} [payload]
 * @param {string} [payload.path]  folder path relative to the drive root (default '' = root).
 * @returns {Promise<{ ok:boolean, status?:number, files?:any[], reason?:string }>}
 */
export async function listFiles(_input = {}) {
  const { path = '' } = _input || {}
  if (!configured()) return { ok: false, reason: 'data-onedrive_not_configured' }
  const rel = String(path || '').trim().replace(/^\/+|\/+$/g, '')

  // Root vs. a sub-path. Encode each segment but keep the '/' separators intact.
  const url = rel
    ? `${API_BASE}/me/drive/root:/${rel.split('/').map(encodeURIComponent).join('/')}:/children`
    : `${API_BASE}/me/drive/root/children`

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
      const reason = data?.error?.message || data?.error || data?.message || `http_${res.status}`
      return { ok: false, status: res.status, reason: `data-onedrive_${String(reason)}`.slice(0, 200) }
    }
    const files = data?.value || []
    return { ok: true, status: res.status, files: Array.isArray(files) ? files : [] }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'data-onedrive_error').slice(0, 200) }
  }
}

export const dataOnedrive = {
  key: 'data-onedrive',
  name: 'OneDrive',
  category: 'data',
  docs: 'kernel/connectors/data-onedrive.mjs',
  configured,
  /**
   * health — GET /me/drive is Graph's cheapest authenticated read of the signed-in user's default
   * drive: it returns the drive's own metadata (name + driveType) and confirms the token is valid
   * without listing any files.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing ONEDRIVE_ACCESS_TOKEN' }
    try {
      const res = await fetch(`${API_BASE}/me/drive`, {
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
        const reason = data?.error?.message || data?.error || data?.message || ''
        return { ok: false, detail: `data-onedrive_${res.status}: ${String(reason)}`.slice(0, 160) }
      }
      const label = data?.driveType ? `${data.name || 'drive'} (${data.driveType})` : (data?.name || 'drive ok')
      return { ok: true, detail: String(label).slice(0, 160) }
    } catch (e) {
      return { ok: false, detail: String(e?.message || 'data-onedrive_error').slice(0, 160) }
    }
  },
  listFiles,
}

register(dataOnedrive)
export default dataOnedrive
