#!/usr/bin/env node

import { readFile } from 'node:fs/promises'
import { stdin, stdout } from 'node:process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { TerminalPrompt } from '../terminal-prompt.mjs'
import { runGuidedActivation } from '../workcell-guided-activation.mjs'

const KERNEL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv) {
  const out = { allowExisting: false, allowDirtySource: false, keepTemp: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--allow-existing') out.allowExisting = true
    else if (arg === '--allow-dirty-source') out.allowDirtySource = true
    else if (arg === '--keep-temp') out.keepTemp = true
    else if (arg === '--help' || arg === '-h') out.help = true
    else if (['--manifest', '--scope', '--source'].includes(arg)) {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) throw new Error(`argument_value_required:${arg}`)
      out[arg.slice(2)] = value
      index += 1
    } else throw new Error(`unknown_argument:${arg}`)
  }
  return out
}

function help() {
  return [
    'SuperMega guided client activation',
    '',
    '  npm run workcell:activate -- --manifest <client.json> --scope <vercel-team>',
    '',
    'The command masks every client input, keeps values only in this process, prints a value-free',
    'plan, requires the exact project confirmation, and reuses the fail-closed provisioner.',
  ].join('\n')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) { stdout.write(`${help()}\n`); return }
  if (!args.manifest) throw new Error('manifest_path_required')
  const scope = args.scope || process.env.VERCEL_SCOPE
  if (!scope) throw new Error('vercel_scope_required')
  const manifest = JSON.parse(await readFile(resolve(args.manifest), 'utf8'))
  const prompt = new TerminalPrompt(stdin, stdout)
  prompt.assertInteractive()

  stdout.write('Client values are masked and remain in memory only. Nothing changes before exact confirmation.\n')
  const result = await runGuidedActivation(manifest, {
    scope,
    sourceDirectory: resolve(args.source || KERNEL_DIR),
    allowExisting: args.allowExisting,
    allowDirtySource: args.allowDirtySource,
    keepTemp: args.keepTemp,
    chooseInput: (group) => prompt.choose(group),
    readSecret: ({ label, inputName, bootstrapOnly }) => prompt.read(
      `${label}${bootstrapOnly ? ' (not deployed)' : ''} [${inputName}]: `,
      { masked: true },
    ),
    confirmBootstrap: async () => {
      const answer = (await prompt.read('Bootstrap the client schema now? [Y/n]: ')).trim().toLowerCase()
      if (!answer || answer === 'y' || answer === 'yes') return true
      if (answer === 'n' || answer === 'no') return false
      throw new Error('guided_bootstrap_choice_invalid')
    },
    onPlan: (plan) => stdout.write(`${JSON.stringify({ ok: true, mode: 'guided_plan', ...plan }, null, 2)}\n`),
    readConfirmation: (confirmation) => prompt.read(`Type ${confirmation} to activate: `),
  })
  stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ ok: false, reason: String(error?.message || 'activation_failed').slice(0, 500) })}\n`)
  process.exitCode = 1
})
