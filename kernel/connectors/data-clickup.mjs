// ClickUp connector. Read-only task access for operator briefs and work queues.
// Supports a personal API token or an OAuth access token in the required Authorization header.

import { register } from './registry.mjs'

const API_BASE = 'https://api.clickup.com/api/v2'

const accessToken = () => String(
  process.env.CLICKUP_ACCESS_TOKEN || process.env.CLICKUP_API_TOKEN || ''
).trim()
const configured = () => Boolean(accessToken())

function safeString(value) {
  try { return String(value ?? '').trim() } catch { return '' }
}

function safeCode(value, fallback = 'error') {
  const code = safeString(value).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)
  return code || fallback
}

function read(input, key) {
  try {
    return input && typeof input === 'object' && !Array.isArray(input) ? input[key] : undefined
  } catch {
    return undefined
  }
}

async function request(path, query = new URLSearchParams()) {
  try {
    const suffix = query.size ? `?${query}` : ''
    const response = await fetch(`${API_BASE}${path}${suffix}`, {
      method: 'GET',
      headers: {
        authorization: accessToken(),
        accept: 'application/json',
        'user-agent': 'supermega-kernel/1.0',
      },
      signal: AbortSignal.timeout(8_000),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        reason: `data-clickup_http_${response.status}_${safeCode(data?.ECODE || data?.err)}`,
      }
    }
    return { ok: true, status: response.status, data }
  } catch {
    return { ok: false, reason: 'data-clickup_transport_error' }
  }
}

export async function listTasks(input = {}) {
  if (!configured()) return { ok: false, reason: 'data-clickup_not_configured' }

  const listId = safeString(read(input, 'listId'))
  if (!/^\d{1,32}$/.test(listId)) return { ok: false, reason: 'data-clickup_invalid_listId' }
  const pageRaw = Number.parseInt(safeString(read(input, 'page')), 10)
  const page = Number.isFinite(pageRaw) ? Math.max(0, Math.min(10_000, pageRaw)) : 0
  const query = new URLSearchParams({ page: String(page) })
  if (read(input, 'includeClosed') === true) query.set('include_closed', 'true')
  if (read(input, 'subtasks') === true) query.set('subtasks', 'true')

  const result = await request(`/list/${listId}/task`, query)
  if (!result.ok) return result
  const tasks = Array.isArray(result.data?.tasks) ? result.data.tasks : []
  return { ok: true, status: result.status, tasks, page }
}

export const dataClickup = {
  key: 'data-clickup',
  name: 'ClickUp Tasks',
  category: 'data',
  docs: 'kernel/connectors/data-clickup.mjs',
  configured,
  async health() {
    if (!configured()) return { ok: false, detail: 'missing CLICKUP_ACCESS_TOKEN or CLICKUP_API_TOKEN' }
    const result = await request('/team')
    if (!result.ok) return { ok: false, detail: result.reason }
    const count = Array.isArray(result.data?.teams) ? result.data.teams.length : 0
    return { ok: true, detail: `${count} workspace(s) available` }
  },
  listTasks,
}

register(dataClickup)
export default dataClickup
