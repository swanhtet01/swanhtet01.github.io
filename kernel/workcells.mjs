// Sellable operator workcells. Each definition binds one business outcome to a fixed,
// read-only tool plan. One deployment serves one client so provider credentials and owner
// delivery channels stay isolated in that client's Vercel project environment.

import { availableTools } from './tools.mjs'

const DEFAULT_TIME_ZONE = 'Asia/Yangon'
const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/

function text(value, max = 160) {
  try { return String(value ?? '').trim().slice(0, max) } catch { return '' }
}

function integer(value, fallback, min, max) {
  const parsed = Number.parseInt(text(value, 20), 10)
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback
}

function validTimeZone(value) {
  const candidate = text(value, 80) || DEFAULT_TIME_ZONE
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date(0))
    return candidate
  } catch {
    return DEFAULT_TIME_ZONE
  }
}

function rollingWindow(now, hours) {
  const end = now instanceof Date && Number.isFinite(now.getTime()) ? now : new Date()
  return {
    start_date: new Date(end.getTime() - hours * 60 * 60 * 1000).toISOString(),
    end_date: end.toISOString(),
  }
}

export function resolveWorkcellConfig(env = process.env, now = new Date()) {
  const lookbackHours = integer(env.WORKCELL_LOOKBACK_HOURS, 24, 1, 168)
  const timeZone = validTimeZone(env.WORKCELL_TIME_ZONE)
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  return {
    clientName: text(env.WORKCELL_CLIENT_NAME, 120) || 'Client',
    clientId: text(env.WORKCELL_CLIENT_ID, 80) || undefined,
    clickupListId: text(env.WORKCELL_CLICKUP_LIST_ID, 32),
    currency: (text(env.WORKCELL_CURRENCY, 8) || 'MMK').toUpperCase(),
    timeZone,
    localDate,
    lookbackHours,
    window: rollingWindow(now, lookbackHours),
  }
}

const DEFINITIONS = {
  'cash-close': {
    slug: 'cash-close',
    name: 'Cash Close',
    outcome: 'A daily settled-cash, fees, net receipts, and exception brief.',
    requiredConnectors: ['payment-paypal'],
    requiredTools: ['settled_transactions_read'],
    requiredInputs: [],
    buildSteps(config) {
      return [{
        tool: 'settled_transactions_read',
        args: { ...config.window, page: 1, page_size: 100 },
      }]
    },
    goal(config) {
      return `Close the latest ${config.lookbackHours}-hour cash window for ${config.clientName}. State gross receipts, fees, net cash, transaction count, and any settlement exceptions. Use ${config.currency} when the evidence is in that currency; never convert or invent a number.`
    },
  },
  'pipeline-control': {
    slug: 'pipeline-control',
    name: 'Pipeline Control',
    outcome: 'Revenue-at-risk deals matched against the team work queue.',
    requiredConnectors: ['crm-pipedrive', 'data-clickup'],
    requiredTools: ['crm_deals_read', 'work_tasks_read'],
    requiredInputs: ['WORKCELL_CLICKUP_LIST_ID'],
    buildSteps(config) {
      return [
        { tool: 'crm_deals_read', args: { limit: 100, status: 'open' } },
        { tool: 'work_tasks_read', args: { list_id: config.clickupListId, page: 0, include_closed: false, subtasks: true } },
      ]
    },
    goal(config) {
      return `Give ${config.clientName} a revenue-control brief from open deals and the active work queue. Rank deals or delivery commitments at risk, cite the exact deal/task evidence, and name the single next owner action. Do not claim a deal-task relationship unless names or evidence support it.`
    },
  },
  'owner-command': {
    slug: 'owner-command',
    name: 'Owner Command',
    outcome: 'One daily command brief across cash, sales pipeline, and delivery work.',
    requiredConnectors: ['payment-paypal', 'crm-pipedrive', 'data-clickup'],
    requiredTools: ['settled_transactions_read', 'crm_deals_read', 'work_tasks_read'],
    requiredInputs: ['WORKCELL_CLICKUP_LIST_ID'],
    buildSteps(config) {
      return [
        { tool: 'settled_transactions_read', args: { ...config.window, page: 1, page_size: 100 } },
        { tool: 'crm_deals_read', args: { limit: 100, status: 'open' } },
        { tool: 'work_tasks_read', args: { list_id: config.clickupListId, page: 0, include_closed: false, subtasks: true } },
      ]
    },
    goal(config) {
      return `Prepare ${config.clientName}'s daily owner command brief across the latest ${config.lookbackHours} hours of settled cash, open sales pipeline, and active delivery work. Lead with money at stake, cite exact source numbers, identify exceptions, and give one concrete owner action. Never infer missing links or invent values.`
    },
  },
}

export function getWorkcell(slug) {
  const key = text(slug, 60)
  return SLUG_RE.test(key) ? DEFINITIONS[key] || null : null
}

export function scheduledWorkcellSlugs(env = process.env) {
  const raw = text(env.SUPERMEGA_WORKCELL_SLUGS || env.SUPERMEGA_WORKCELL_SLUG, 240)
  const out = []
  for (const part of raw.split(',')) {
    const slug = text(part, 60).toLowerCase()
    if (SLUG_RE.test(slug) && !out.includes(slug)) out.push(slug)
    if (out.length === 3) break
  }
  return out
}

export function workcellReadiness(slug, options = {}) {
  const definition = getWorkcell(slug)
  if (!definition) return { ready: false, missing: ['unknown_workcell'] }
  const env = options.env || process.env
  const config = options.config || resolveWorkcellConfig(env, options.now)
  const listTools = options.availableTools || availableTools
  let toolNames = new Set()
  try { toolNames = new Set(listTools().map((tool) => tool.name)) } catch { /* fail closed */ }

  const missing = []
  for (const tool of definition.requiredTools) if (!toolNames.has(tool)) missing.push(`tool:${tool}`)
  if (definition.requiredInputs.includes('WORKCELL_CLICKUP_LIST_ID') && !/^\d{1,32}$/.test(config.clickupListId)) {
    missing.push('input:WORKCELL_CLICKUP_LIST_ID')
  }
  return { ready: missing.length === 0, missing, config }
}

export function listWorkcells(options = {}) {
  const env = options.env || process.env
  const scheduled = new Set(scheduledWorkcellSlugs(env))
  return Object.values(DEFINITIONS).map((definition) => {
    const readiness = workcellReadiness(definition.slug, options)
    return {
      slug: definition.slug,
      name: definition.name,
      outcome: definition.outcome,
      requiredConnectors: [...definition.requiredConnectors],
      requiredTools: [...definition.requiredTools],
      requiredInputs: [...definition.requiredInputs],
      configured: readiness.ready,
      missing: readiness.missing,
      scheduled: scheduled.has(definition.slug),
    }
  })
}

export default { getWorkcell, listWorkcells, resolveWorkcellConfig, scheduledWorkcellSlugs, workcellReadiness }
