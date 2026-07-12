// Connector: data — Notion. Read from and write to Notion databases via the Notion REST API.
// Uses fetch — no SDK dependency.
//
// category 'data' · configured = NOTION_API_KEY present.
//
// Quick setup:
//   1. Go to https://www.notion.so/my-integrations → New integration.
//   2. Give it a name, select the workspace, set capabilities (Read/Write content).
//   3. Copy the "Internal Integration Secret" (starts with ntn_… or secret_…).
//   4. Set it as NOTION_API_KEY.
//   5. In each Notion database you want to query: open the database → … → Connections → add the integration.
//
// Env:
//   NOTION_API_KEY  (required)  internal integration token

import { register } from './registry.mjs'

const NOTION_VERSION = '2022-06-28'
const BASE = 'https://api.notion.com/v1'
const apiKey = () => String(process.env.NOTION_API_KEY || '').trim()
const configured = () => Boolean(apiKey())

function headers() {
  return {
    Authorization: `Bearer ${apiKey()}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
    'User-Agent': 'supermega-kernel/1.0',
  }
}

/**
 * queryDatabase — retrieve rows from a Notion database.
 *
 * @param {string}  databaseId   the 32-char Notion database ID (from the URL).
 * @param {object}  [filter]     a Notion filter object (see Notion API docs).
 * @param {Array}   [sorts]      array of sort objects.
 * @param {number}  [pageSize]   max rows to return (1–100, default 50).
 * @returns {Promise<{ ok:boolean, results?:Array, reason?:string }>}
 */
export async function queryDatabase(databaseId, filter, sorts, pageSize = 50) {
  if (!configured()) return { ok: false, reason: 'notion_not_configured' }
  if (!databaseId) return { ok: false, reason: 'notion_missing_database_id' }

  const body = { page_size: Math.min(Math.max(1, pageSize), 100) }
  if (filter) body.filter = filter
  if (sorts?.length) body.sorts = sorts

  try {
    const res = await fetch(`${BASE}/databases/${databaseId}/query`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, reason: `notion_${res.status}`, detail: data?.message }
    return { ok: true, results: data?.results || [], hasMore: data?.has_more || false, nextCursor: data?.next_cursor || null }
  } catch (e) {
    return { ok: false, reason: String(e.message || 'notion_error').slice(0, 200) }
  }
}

/**
 * createPage — add a new row/page to a Notion database.
 *
 * @param {string}  databaseId   the target database ID.
 * @param {object}  properties   Notion property values object (must match the database schema).
 * @param {Array}   [children]   optional array of block children (page body content).
 * @returns {Promise<{ ok:boolean, pageId?:string, reason?:string }>}
 */
export async function createPage(databaseId, properties, children) {
  if (!configured()) return { ok: false, reason: 'notion_not_configured' }
  if (!databaseId || !properties) return { ok: false, reason: 'notion_missing_params' }

  const body = { parent: { database_id: databaseId }, properties }
  if (children?.length) body.children = children

  try {
    const res = await fetch(`${BASE}/pages`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, reason: `notion_${res.status}`, detail: data?.message }
    return { ok: true, pageId: data?.id }
  } catch (e) {
    return { ok: false, reason: String(e.message || 'notion_error').slice(0, 200) }
  }
}

/**
 * updatePage — update properties on an existing Notion page.
 *
 * @param {string}  pageId       the Notion page ID to update.
 * @param {object}  properties   Notion property values to patch.
 * @returns {Promise<{ ok:boolean, reason?:string }>}
 */
export async function updatePage(pageId, properties) {
  if (!configured()) return { ok: false, reason: 'notion_not_configured' }
  if (!pageId || !properties) return { ok: false, reason: 'notion_missing_params' }

  try {
    const res = await fetch(`${BASE}/pages/${pageId}`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ properties }),
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, reason: `notion_${res.status}`, detail: data?.message }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: String(e.message || 'notion_error').slice(0, 200) }
  }
}

export const dataNotion = {
  key: 'data-notion',
  name: 'Notion',
  category: 'data',
  docs: 'kernel/connectors/data-notion.mjs',
  configured,
  async health() {
    if (!configured()) return { ok: false, configured: false, detail: 'missing NOTION_API_KEY' }
    try {
      const res = await fetch(`${BASE}/users/me`, {
        headers: headers(),
        signal: AbortSignal.timeout(8000),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, configured: true, detail: `users/me failed: ${data?.message || res.status}` }
      return { ok: true, configured: true, bot: data?.name || data?.id || '' }
    } catch (e) {
      return { ok: false, configured: true, detail: String(e.message || 'notion_error').slice(0, 160) }
    }
  },
  queryDatabase,
  createPage,
  updatePage,
}

register(dataNotion)
export default dataNotion
