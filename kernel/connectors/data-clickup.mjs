// Connector: data — ClickUp. Read tasks out of ClickUp via its REST API (zero-dependency, native
// fetch). ClickUp is a common work/project tracker; this connector lets the SuperMega kernel pull
// the tasks a team already manages — so an agent can surface open work, tie tasks to DeskPOS
// operations, and keep an operating picture without anyone re-entering the list by hand.
//
// category 'data' · configured = CLICKUP_API_TOKEN present.
// The API host is a hardcoded https constant (ClickUp) — no user value ever chooses the host.
//
// Quick setup:
//   1. In ClickUp: Settings → Apps → "Generate" a personal API token (pk_…).
//   2. Set it as CLICKUP_API_TOKEN. The host is fixed (api.clickup.com).
//   3. (Per call) pass the ClickUp list id to listTasks — open a List and copy the id from its URL.
//
// Env:
//   CLICKUP_API_TOKEN  (required)  ClickUp personal API token (pk_…).
//
// Auth: raw token in the Authorization header — NO "Bearer " prefix. ClickUp expects
//   Authorization: <CLICKUP_API_TOKEN>  (the token value alone).
//
// Base: https://api.clickup.com/api/v2 (fixed host — never chosen from a user value).
//
// Capabilities:
//   listTasks({ listId }) — GET /list/{listId}/task (tasks in a ClickUp list).

import { register } from './registry.mjs'

// Fixed API base — hardcoded https constant, so no user value ever chooses the host.
const API_BASE = 'https://api.clickup.com/api/v2'

const apiToken = () => String(process.env.CLICKUP_API_TOKEN || '').trim()

// ClickUp uses the raw token as the Authorization header value — no "Bearer " prefix.
const authHeader = () => apiToken()

// configured — this is a FIXED-host service, so configured() only checks that the required env var
// is present. No user value ever selects the host.
const configured = () => Boolean(apiToken())

/**
 * listTasks — read the tasks in a ClickUp list.
 *
 * GETs /list/{listId}/task. ClickUp returns { tasks:[...] }; any non-2xx is surfaced via reason
 * (never thrown). The listId is required and URL-encoded before it goes into the path.
 *
 * @param {object} [payload]
 * @param {string} [payload.listId]  the ClickUp list id to read tasks from (required).
 * @returns {Promise<{ ok:boolean, status?:number, tasks?:any[], reason?:string }>}
 */
export async function listTasks(_input = {}) {
  if (!configured()) return { ok: false, reason: 'data-clickup_not_configured' }
  const { listId } = _input || {}
  const id = String(listId || '').trim()
  if (!id) return { ok: false, reason: 'data-clickup_missing_listId' }
  try {
    const res = await fetch(`${API_BASE}/list/${encodeURIComponent(id)}/task`, {
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
      const reason = data?.err || data?.error || data?.message || `http_${res.status}`
      return { ok: false, status: res.status, reason: `data-clickup_${String(reason)}`.slice(0, 200) }
    }
    const tasks = data?.tasks || []
    return { ok: true, status: res.status, tasks: Array.isArray(tasks) ? tasks : [] }
  } catch (e) {
    return { ok: false, reason: String(e?.message || 'data-clickup_error').slice(0, 200) }
  }
}

export const dataClickup = {
  key: 'data-clickup',
  name: 'ClickUp',
  category: 'data',
  docs: 'kernel/connectors/data-clickup.mjs',
  configured,
  /**
   * health — GET /team is ClickUp's cheapest authenticated read: it returns the workspaces (teams)
   * the token can see, confirming the token is valid without touching any task data.
   *
   * @returns {Promise<{ ok:boolean, detail:string }>}
   */
  async health() {
    if (!configured()) return { ok: false, detail: 'missing CLICKUP_API_TOKEN' }
    try {
      const res = await fetch(`${API_BASE}/team`, {
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
        return { ok: false, detail: `data-clickup_${res.status}: ${(data?.err || data?.error || data?.message || '')}`.slice(0, 160) }
      }
      const count = Array.isArray(data?.teams) ? data.teams.length : 0
      return { ok: true, detail: `${count} workspace(s)`.slice(0, 160) }
    } catch (e) {
      return { ok: false, detail: String(e?.message || 'data-clickup_error').slice(0, 160) }
    }
  },
  listTasks,
}

register(dataClickup)
export default dataClickup
