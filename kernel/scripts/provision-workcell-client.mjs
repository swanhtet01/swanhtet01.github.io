#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { applyProvisionPlan, buildProvisionPlan, isSourceClean } from '../workcell-provision.mjs'

const KERNEL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv) {
  const out = { apply: false, plan: false, allowExisting: false, allowDirtySource: false, keepTemp: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--apply') out.apply = true
    else if (arg === '--plan') out.plan = true
    else if (arg === '--allow-existing') out.allowExisting = true
    else if (arg === '--allow-dirty-source') out.allowDirtySource = true
    else if (arg === '--keep-temp') out.keepTemp = true
    else if (arg === '--help' || arg === '-h') out.help = true
    else if (['--manifest', '--scope', '--confirm', '--source'].includes(arg)) {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`argument_value_required:${arg}`)
      out[arg.slice(2)] = value
      index += 1
    } else throw new Error(`unknown_argument:${arg}`)
  }
  if (out.apply && out.plan) throw new Error('choose_plan_or_apply')
  if (!out.apply) out.plan = true
  return out
}

function help() {
  return [
    'SuperMega isolated workcell provisioner',
    '',
    'Plan only (default, no mutation):',
    '  npm run workcell:provision -- --manifest workcells/client-manifest.example.json --scope <vercel-team>',
    '',
    'Apply:',
    '  npm run workcell:provision -- --apply --manifest <manifest.json> --scope <vercel-team> --confirm "PROVISION <project>"',
    '',
    'Apply reads required secret values from the current process environment. Secrets are sent to',
    'Vercel over stdin and are never included in the printed plan or command arguments. Every',
    'client value must use the SUPERMEGA_NEW_CLIENT_* input name printed by the plan.',
    '',
    'Before apply, run supabase/workcell-client.sql in the dedicated client Supabase project.',
    'Apply verifies the schema and a temporary idempotent claim before it changes Vercel.',
  ].join('\n')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) { process.stdout.write(`${help()}\n`); return }
  if (!args.manifest) throw new Error('manifest_path_required')
  const manifestPath = resolve(args.manifest)
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  const sourceDirectory = resolve(args.source || KERNEL_DIR)
  const scope = args.scope || process.env.VERCEL_SCOPE

  if (args.plan) {
    const plan = buildProvisionPlan(manifest, { scope, env: process.env, sourceDirectory })
    const sourceClean = await isSourceClean(sourceDirectory)
    process.stdout.write(`${JSON.stringify({ ok: true, mode: 'plan', sourceClean, ...plan }, null, 2)}\n`)
    return
  }

  const result = await applyProvisionPlan(manifest, {
    scope,
    env: process.env,
    sourceDirectory,
    confirm: args.confirm,
    allowExisting: args.allowExisting,
    allowDirtySource: args.allowDirtySource,
    keepTemp: args.keepTemp,
  })
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, reason: String(error?.message || 'provision_failed').slice(0, 500) })}\n`)
  process.exitCode = 1
})
