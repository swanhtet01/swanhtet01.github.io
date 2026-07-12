// SUPERMEGA AI Operator — the safe tool-belt. Curated, READ-ONLY capabilities the operator agent can
// call to gather real data toward a goal. By design this exposes NO money/send/write capability — the
// draft→approve→act gate stays on those. Each tool: { description, input_schema, available, run }.
import connectors from './connectors/index.mjs'
import infraHttp from './connectors/infra-http.mjs'
import gmail from './connectors/data-gmail.mjs'
import store from './store.mjs'
import cbm from './connectors/data-cbm-rate.mjs'
import sheets from './connectors/data-sheets.mjs'
import paypal from './connectors/payment-paypal.mjs'
import pipedrive from './connectors/crm-pipedrive.mjs'
import clickup from './connectors/data-clickup.mjs'

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
  fx_rate: {
    description: 'Latest Central Bank of Myanmar reference exchange rates (MMK per USD, EUR, SGD, and others). Read-only; no args.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
    available: () => true,
    run: async () => { const r = await cbm.getRates(); return r.ok ? { rates: r.rates, source: r.source, timestamp: r.timestamp } : { ok: false, reason: r.reason } },
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
  sheets_read: {
    description: 'Read a range of cells from a Google Sheet the service account can access (the sheet must be shared with it). Args: spreadsheet_id (from the sheet URL) + range (A1 notation, e.g. "Sheet1!A1:F50"). Returns the rows. Read-only — never writes.',
    input_schema: { type: 'object', properties: { spreadsheet_id: { type: 'string' }, range: { type: 'string', description: 'A1 notation, e.g. Sheet1!A1:F50' } }, required: ['spreadsheet_id', 'range'], additionalProperties: false },
    available: () => { try { return sheets.configured() } catch { return false } },
    run: async ({ spreadsheet_id, range }) => {
      const r = await sheets.readRange(String(spreadsheet_id || ''), String(range || ''))
      const values = (r.values || []).slice(0, 50).map((row) => (Array.isArray(row) ? row.slice(0, 20) : row))
      return { range: r.range, rows: values.length, values }
    },
  },
  settled_transactions_read: {
    description: 'Read a bounded PayPal Transaction Search window for reconciliation. Read-only: cannot capture, refund, or move money. Requires start_date and end_date in ISO date-time format; maximum window is 31 days.',
    input_schema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'ISO date-time, e.g. 2026-07-01T00:00:00Z' },
        end_date: { type: 'string', description: 'ISO date-time after start_date, maximum 31 days later' },
        page: { type: 'integer', minimum: 1, maximum: 10000 },
        page_size: { type: 'integer', minimum: 1, maximum: 100 },
      },
      required: ['start_date', 'end_date'],
      additionalProperties: false,
    },
    available: () => { try { return paypal.configured() } catch { return false } },
    run: async ({ start_date, end_date, page = 1, page_size = 100 } = {}) => {
      const result = await paypal.listTransactions({
        startDate: start_date,
        endDate: end_date,
        page,
        pageSize: Math.min(100, Number(page_size) || 100),
      })
      if (!result.ok) throw new Error(result.reason || 'payment-paypal_read_failed')
      const transactions = result.transactions.slice(0, 100).map((row) => {
        const info = row && typeof row === 'object' ? row.transaction_info || {} : {}
        return {
          id: info.transaction_id || null,
          at: info.transaction_initiation_date || info.transaction_updated_date || null,
          status: info.transaction_status || null,
          eventCode: info.transaction_event_code || null,
          gross: info.transaction_amount || null,
          fee: info.fee_amount || null,
          net: info.transaction_amount && info.fee_amount
            ? {
                currency_code: info.transaction_amount.currency_code || null,
                value: Number(info.transaction_amount.value || 0) - Number(info.fee_amount.value || 0),
              }
            : null,
        }
      })
      return {
        transactions,
        page: result.page,
        totalItems: result.totalItems,
        totalPages: result.totalPages,
      }
    },
  },
  crm_deals_read: {
    description: 'Read a bounded page of Pipedrive deals for pipeline briefs. Read-only: cannot create or modify CRM records.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 100 },
        cursor: { type: 'string', maxLength: 2048 },
        status: { type: 'string', enum: ['open', 'won', 'lost', 'deleted'] },
      },
      additionalProperties: false,
    },
    available: () => { try { return pipedrive.configured() } catch { return false } },
    run: async ({ limit = 100, cursor, status } = {}) => {
      const result = await pipedrive.listDeals({ limit: Math.min(100, Number(limit) || 100), cursor, status })
      if (!result.ok) throw new Error(result.reason || 'crm-pipedrive_read_failed')
      return {
        deals: result.deals.slice(0, 100).map((deal) => ({
          id: deal?.id || null,
          title: deal?.title || null,
          status: deal?.status || null,
          value: deal?.value ?? null,
          currency: deal?.currency || null,
          expectedCloseDate: deal?.expected_close_date || null,
          updatedAt: deal?.update_time || null,
        })),
        nextCursor: result.nextCursor,
      }
    },
  },
  work_tasks_read: {
    description: 'Read one ClickUp List page for an operator work brief. Read-only: cannot create, assign, close, or modify tasks.',
    input_schema: {
      type: 'object',
      properties: {
        list_id: { type: 'string', pattern: '^\\d{1,32}$' },
        page: { type: 'integer', minimum: 0, maximum: 10000 },
        include_closed: { type: 'boolean' },
        subtasks: { type: 'boolean' },
      },
      required: ['list_id'],
      additionalProperties: false,
    },
    available: () => { try { return clickup.configured() } catch { return false } },
    run: async ({ list_id, page = 0, include_closed = false, subtasks = false } = {}) => {
      const result = await clickup.listTasks({
        listId: list_id,
        page,
        includeClosed: include_closed,
        subtasks,
      })
      if (!result.ok) throw new Error(result.reason || 'data-clickup_read_failed')
      return {
        tasks: result.tasks.slice(0, 100).map((task) => {
          const status = typeof task?.status === 'string' ? task.status : task?.status?.status
          const priority = typeof task?.priority === 'string' ? task.priority : task?.priority?.priority
          return {
            id: task?.id || null,
            name: task?.name || null,
            status: status || null,
            dueAt: task?.due_date || null,
            priority: priority || null,
            url: task?.url || null,
          }
        }),
        page: result.page,
      }
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
