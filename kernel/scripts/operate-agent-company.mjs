#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { stdin, stdout } from 'node:process'
import { resolve } from 'node:path'

import {
  createAgentCompanyApi,
  runGuidedAgentCompany,
} from '../agent-company-operator.mjs'
import { TerminalPrompt } from '../terminal-prompt.mjs'

function parseArgs(argv) {
  const out = {}
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') out.help = true
    else if (arg === '--manifest') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error('argument_value_required:--manifest')
      out.manifest = value
      index += 1
    } else throw new Error(`unknown_argument:${arg}`)
  }
  return out
}

function help() {
  return [
    'SuperMega Agent Company operator',
    '',
    '  SUPERMEGA_OPS_KEY=<owner-provided> npm run agent-company:operate -- --manifest <work-order.json>',
    '',
    'The command validates a redacted manifest, prints a plan, and stops by default. Queueing,',
    'dispatch, and internal evaluation each require a separate exact terminal confirmation.',
    'The Ops key is accepted only from the process environment and is never printed or stored.',
    'This command cannot record a customer review or perform connector writes.',
  ].join('\n')
}

function answer(value, label) {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'y' || normalized === 'yes') return true
  if (!normalized || normalized === 'n' || normalized === 'no') return false
  throw new Error(`agent_company_operator_invalid_answer:${label}`)
}

function resultSummary(workOrder) {
  return {
    workOrderId: workOrder.workOrderId,
    clientId: workOrder.clientId,
    cycleId: workOrder.cycleId,
    status: workOrder.status,
    planHash: workOrder.planHash,
    resultHash: workOrder.resultHash,
    completedAt: workOrder.completedAt,
    evidenceState: workOrder.evidenceState,
    result: workOrder.result,
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) { stdout.write(`${help()}\n`); return }
  if (!args.manifest) throw new Error('manifest_path_required')
  const opsKey = String(process.env.SUPERMEGA_OPS_KEY || '').trim()
  if (!opsKey) throw new Error('agent_company_ops_key_required')

  const manifest = JSON.parse(await readFile(resolve(args.manifest), 'utf8'))
  const prompt = new TerminalPrompt(stdin, stdout)
  prompt.assertInteractive()
  const request = createAgentCompanyApi({ opsKey })

  stdout.write('Ops key stays in process memory. No connector writes or customer review are available.\n')
  const result = await runGuidedAgentCompany(manifest, {
    request,
    readConfirmation: (confirmation, stage) => prompt.read(
      `Type ${confirmation} to ${stage === 'queue' ? 'queue the reviewed plan' : 'dispatch model work'}, or press Enter to stop: `,
    ),
    onPlan: (plan) => stdout.write(`${JSON.stringify({ ok: true, mode: 'agent_company_plan', plan }, null, 2)}\n`),
    onQueued: (workOrder) => stdout.write(`${JSON.stringify({
      ok: true,
      mode: 'agent_company_queued',
      workOrder: {
        workOrderId: workOrder.workOrderId,
        clientId: workOrder.clientId,
        cycleId: workOrder.cycleId,
        status: workOrder.status,
        planHash: workOrder.planHash,
        evidenceState: workOrder.evidenceState,
      },
    }, null, 2)}\n`),
    onResult: (workOrder) => stdout.write(`${JSON.stringify({
      ok: true,
      mode: 'agent_company_result',
      workOrder: resultSummary(workOrder),
    }, null, 2)}\n`),
    readEvaluation: async (workOrder) => {
      if (!answer(await prompt.read('Record an immutable internal evaluation now? [y/N]: '), 'evaluation')) return null
      const checks = {
        accurate: answer(await prompt.read('Accurate against the supplied evidence? [y/N]: '), 'accurate'),
        complete: answer(await prompt.read('Complete for the accepted internal outcome? [y/N]: '), 'complete'),
        usable: answer(await prompt.read('Usable by the operator now? [y/N]: '), 'usable'),
        boundarySafe: answer(await prompt.read('Stayed inside the no-write and evidence boundaries? [y/N]: '), 'boundary_safe'),
      }
      const confirmation = `EVALUATE ${workOrder.workOrderId}`
      return {
        verdict: Object.values(checks).every(Boolean) ? 'accepted' : 'revision_required',
        checks,
        confirmation: await prompt.read(`Type ${confirmation} to store this checklist, or Ctrl+C to stop: `),
      }
    },
    onEvaluation: (evaluation) => stdout.write(`${JSON.stringify({
      ok: true,
      mode: 'agent_company_internal_evaluation',
      evaluation,
    }, null, 2)}\n`),
    onProof: (proofPacket) => stdout.write(`${JSON.stringify({
      ok: true,
      mode: 'agent_company_delivery_proof',
      proofPacket,
    }, null, 2)}\n`),
  })
  stdout.write(`${JSON.stringify({
    ok: result.ok,
    status: result.status,
    workOrderId: result.workOrder?.workOrderId || null,
    evaluationRecorded: Boolean(result.evaluation),
    proofPacketHash: result.proofPacket?.packetHash || null,
    customerReviewRecorded: false,
  }, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    ok: false,
    reason: String(error?.message || 'agent_company_operator_failed').slice(0, 500),
  })}\n`)
  process.exitCode = 1
})
