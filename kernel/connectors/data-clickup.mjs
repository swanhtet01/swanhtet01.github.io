// ClickUp connector. Read access is available to operator briefs; task creation is exported only
// for the separate owner-approved action executor and is never registered as an agent tool.

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

async function writeRequest(path, body) {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        authorization: accessToken(),
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'supermega-kernel/1.0',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        retryable: response.status === 408 || response.status === 409 || response.status === 425 || response.status === 429 || response.status >= 500,
        reason: `data-clickup_write_http_${response.status}_${safeCode(data?.ECODE || data?.err)}`,
      }
    }
    return { ok: true, status: response.status, data }
  } catch {
    return { ok: false, retryable: true, uncertain: true, reason: 'data-clickup_write_transport_error' }
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

export async function findTaskByMarker(input = {}) {
  if (!configured()) return { ok: false, reason: 'data-clickup_not_configured' }
  const listId = safeString(read(input, 'listId'))
  const marker = safeString(read(input, 'marker'))
  if (!/^\d{1,32}$/.test(listId)) return { ok: false, reason: 'data-clickup_invalid_listId' }
  if (!/^supermega-action:[a-f0-9-]{36}$/.test(marker)) return { ok: false, reason: 'data-clickup_invalid_marker' }
  const maxPagesRaw = Number.parseInt(safeString(read(input, 'maxPages')), 10)
  const maxPages = Number.isFinite(maxPagesRaw) ? Math.max(1, Math.min(5, maxPagesRaw)) : 5
  for (let page = 0; page < maxPages; page += 1) {
    const result = await listTasks({ listId, page, includeClosed: true, subtasks: true })
    if (!result.ok) return result
    const found = result.tasks.find((task) => [
      task?.name,
      task?.description,
      task?.text_content,
      task?.markdown_description,
      task?.markdown_content,
    ].some((value) => safeString(value).includes(marker)))
    if (found) {
      return {
        ok: true,
        found: true,
        task: { id: safeString(found.id), name: safeString(found.name), url: safeString(found.url) },
        pagesRead: page + 1,
      }
    }
    if (result.tasks.length < 100) return { ok: true, found: false, task: null, pagesRead: page + 1 }
  }
  return { ok: true, found: false, task: null, pagesRead: maxPages, truncated: true }
}

export async function createTask(input = {}) {
  if (!configured()) return { ok: false, reason: 'data-clickup_not_configured' }
  const listId = safeString(read(input, 'listId'))
  const name = safeString(read(input, 'name')).slice(0, 200)
  const markdown = safeString(read(input, 'markdownContent')).slice(0, 4000)
  const marker = safeString(read(input, 'marker'))
  const priorityRaw = Number.parseInt(safeString(read(input, 'priority')), 10)
  const priority = Number.isFinite(priorityRaw) && priorityRaw >= 1 && priorityRaw <= 4 ? priorityRaw : null
  const dueDateRaw = Number.parseInt(safeString(read(input, 'dueDate')), 10)
  const dueDate = Number.isFinite(dueDateRaw) && dueDateRaw > 0 ? dueDateRaw : null
  if (!/^\d{1,32}$/.test(listId)) return { ok: false, reason: 'data-clickup_invalid_listId' }
  if (!name) return { ok: false, reason: 'data-clickup_task_name_required' }
  if (!/^supermega-action:[a-f0-9-]{36}$/.test(marker)) return { ok: false, reason: 'data-clickup_invalid_marker' }
  const body = {
    name,
    markdown_content: `${markdown}${markdown ? '\n\n' : ''}[SuperMega execution: ${marker}]`,
    notify_all: false,
    check_required_custom_fields: true,
  }
  if (priority) body.priority = priority
  if (dueDate) { body.due_date = dueDate; body.due_date_time = true }
  const result = await writeRequest(`/list/${listId}/task`, body)
  if (!result.ok) return result
  const task = result.data && typeof result.data === 'object' ? result.data : {}
  const id = safeString(task.id)
  if (!id) return { ok: false, retryable: true, uncertain: true, reason: 'data-clickup_write_missing_task_id' }
  return { ok: true, status: result.status, task: { id, name: safeString(task.name) || name, url: safeString(task.url) } }
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
  findTaskByMarker,
  createTask,
}

register(dataClickup)
export default dataClickup
