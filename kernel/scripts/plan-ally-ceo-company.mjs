#!/usr/bin/env node

import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { buildAllyCeoCompanyPlan } from '../ally-ceo-company-plan.mjs'

const root = resolve(import.meta.dirname, '..', '..')

function outputFor(result) {
  const planHash = String(result?.preflight?.expectedPlanHash || '')
  if (!/^[a-f0-9]{64}$/.test(planHash)) throw new Error('ally_ceo_company_plan_hash_invalid')
  return join(tmpdir(), `supermega-ally-ceo-company-plan-${planHash.slice(0, 12)}.json`)
}

function parseArgs(argv) {
  const result = { verify: false }
  for (const arg of argv) {
    if (arg === '--verify') result.verify = true
    else if (arg === '--help' || arg === '-h') result.help = true
    else throw new Error(`ally_ceo_company_plan_unknown_argument:${arg}`)
  }
  return result
}

function help() {
  return [
    'SuperMega Ally CEO company planner',
    '',
    '  npm run company:ally:plan',
    '  npm run company:ally:plan:verify',
    '',
    'Builds or verifies one temporary, planning-only Agent Company manifest.',
    'It performs no model, connector, queue, deployment, or customer write.',
  ].join('\n')
}

async function currentPlan(now) {
  const [hqNow, workboard, portfolioText, completedAutomationArchiveText, managedReadinessText] = await Promise.all([
    readFile(resolve(root, 'hq', 'NOW.md'), 'utf8'),
    readFile(resolve(root, 'hq', 'WORKBOARD.md'), 'utf8'),
    readFile(resolve(root, 'hq', 'portfolio.json'), 'utf8'),
    readFile(resolve(root, 'hq', 'archive', 'completed-local-automations-through-ops-225.json'), 'utf8'),
    readFile(resolve(root, 'hq', 'readiness', 'managed-pilot-readiness.json'), 'utf8'),
  ])
  return buildAllyCeoCompanyPlan({ now, hqNow, workboard, portfolioText, completedAutomationArchiveText, managedReadinessText })
}

async function safeExistingOutput(output) {
  let stat
  try { stat = await lstat(output) }
  catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > 64 * 1024) {
    throw new Error('ally_ceo_company_plan_output_unsafe')
  }
  return readFile(output, 'utf8')
}

function summary(result, output, mode, replayed = false) {
  return {
    ok: true,
    contract: result.contract,
    mode,
    output,
    outcomeId: result.outcomeId,
    productWorkOrderId: result.productFocus?.workOrderId ?? null,
    agentCount: result.manifest?.agents.length ?? 0,
    roleBudget: result.manifest?.roleBudget ?? 0,
    expectedWorkOrderId: result.preflight?.expectedWorkOrderId ?? null,
    expectedPlanHash: result.preflight?.expectedPlanHash ?? null,
    replayed,
    controls: result.controls,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) { process.stdout.write(`${help()}\n`); return }

  const result = await currentPlan(new Date())
  if (result.declined || !result.manifest) throw new Error(result.reason || 'ally_ceo_company_plan_declined')
  const output = outputFor(result)
  const existing = await safeExistingOutput(output)
  const serialized = `${JSON.stringify(result.manifest, null, 2)}\n`
  if (args.verify) {
    if (!existing) throw new Error('ally_ceo_company_plan_missing')
    if (existing !== serialized) throw new Error('ally_ceo_company_plan_current_evidence_mismatch')
    process.stdout.write(`${JSON.stringify(summary(result, output, 'verified', true))}\n`)
    return
  }

  await mkdir(tmpdir(), { recursive: true })
  let replayed = false
  try { await writeFile(output, serialized, { encoding: 'utf8', flag: 'wx' }) }
  catch (error) {
    if (error?.code !== 'EEXIST') throw error
    if (existing !== serialized) throw new Error('ally_ceo_company_plan_conflict')
    replayed = true
  }
  process.stdout.write(`${JSON.stringify(summary(result, output, 'planned', replayed))}\n`)
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, reason: String(error?.message || 'ally_ceo_company_plan_failed').slice(0, 300) })}\n`)
  process.exitCode = 1
})
