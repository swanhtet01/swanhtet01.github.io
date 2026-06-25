// SUPERMEGA AI Operator — the safe tool-belt. Curated, READ-ONLY capabilities the operator agent can
// call to gather real data toward a goal. By design this exposes NO money/send/write capability — the
// draft→approve→act gate stays on those. Each tool: { description, input_schema, available, run }.
import connectors from './connectors/index.mjs'
import infraHttp from './connectors/infra-http.mjs'
import gmail from './connectors/data-gmail.mjs'
import store from './store.mjs'

export const TOOLS = {
  platform_status: {
    description: 'Get SuperMega platform health: connector counts by category, configured count, registration faults, store mode. No args.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    available: () => true,
    run: async () => {
      const list = connectors.list()
      const byCategory = {}
      for (const c of list) byCategory[c.category] = (byCategory[c.category] || 0) + 1
      return { total: list.length, configured: list.filter((c) => c.configured).length, byCategory }
    },
  },
  web_get: {
    description: 'Fetch a PUBLIC https URL and return its (truncated) body. Read-only; private/loopback/cloud-metadata addresses are blocked. Use for public data (FX rates, public APIs, public pages).',
    input_schema: { type: 'object', properties: { url: { type: 'string', description: 'full https:// URL' } }, required: ['url'], additionalProperties: false },
    available: () => true,
    run: async ({ url }) => {
      const r = await infraHttp.get(String(url || ''))
      const body = typeof r.body === 'string' ? r.body.slice(0, 2000) : r.body
      return { status: r.status || 0, ok: Boolean(r.ok), body, reason: r.reason }
    },
  },
  leads_overview: {
    description: 'Overview of inbound leads from the SuperMega CRM: total count, breakdown by stage, and the most recent few (name, company, stage, score). Read-only.',
    input_schema: { type: 'object', properties: { limit: { type: 'number', description: 'how many recent leads to include (default 5, max 20)' } }, additionalProperties: false },
    available: () => true,
    run: async ({ limit = 5 } = {}) => {
      const leads = await store.listLeads(200)
      const byStage = {}
      for (const l of leads) byStage[l.stage || 'new'] = (byStage[l.stage || 'new'] || 0) + 1
      const n = Math.max(1, Math.min(20, Number(limit) || 5))
      const recent = leads.slice(0, n).map((l) => ({ name: l.name, company: l.company, stage: l.stage, score: l.score }))
      return { total: leads.length, byStage, recent }
    },
  },
  pipeline_overview: {
    description: 'Overview of the sales pipeline: project counts by status, number of saved deals, and recent activity log. Read-only.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    available: () => true,
    run: async () => {
      const [projects, deals, activity] = await Promise.all([store.listProjects(), store.listDeals(), store.listActivity(8)])
      const byStatus = {}
      for (const p of projects) byStatus[p.status || '?'] = (byStatus[p.status || '?'] || 0) + 1
      return { projects: projects.length, byStatus, deals: deals.length, recentActivity: (activity || []).map((a) => ({ kind: a.kind, summary: a.summary })) }
    },
  },
  gmail_count: {
    description: 'Count emails in the connected mailbox matching a Gmail search query (e.g. "from:client@x.com newer_than:7d" or "subject:invoice"). Returns an approximate count. Read-only; never reads message bodies.',
    input_schema: { type: 'object', properties: { query: { type: 'string', description: 'a Gmail search expression' } }, required: ['query'], additionalProperties: false },
    available: () => { try { return gmail.configured() } catch { return false } },
    run: async ({ query }) => {
      const r = await gmail.search(String(query || ''), { maxResults: 1 })
      return { query: String(query || ''), approxCount: r.resultSizeEstimate || 0 }
    },
  },
}

// The catalog the agent is shown — only tools whose dependencies are configured.
export function availableTools() {
  return Object.entries(TOOLS)
    .filter(([, t]) => { try { return t.available() } catch { return false } })
    .map(([name, t]) => ({ name, description: t.description, input_schema: t.input_schema }))
}

// Execute one tool by name. Validates the name against the allow-list and never throws.
export async function runTool(name, args) {
  const t = TOOLS[name]
  if (!t) return { ok: false, error: 'unknown_tool' }
  if (!t.available()) return { ok: false, error: 'tool_not_available' }
  try { return { ok: true, data: await t.run(args || {}) } }
  catch (e) { return { ok: false, error: String((e && e.message) || 'tool_error').slice(0, 200) } }
}

export default { TOOLS, availableTools, runTool }
