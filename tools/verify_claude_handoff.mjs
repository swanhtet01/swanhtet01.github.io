#!/usr/bin/env node

import { access, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packet = await readFile(resolve(root, 'CLAUDE.md'), 'utf8')
const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))

const checkpoint = 'bdcb6a58d9615f4d73f0d2b4b7afd16c65468a82'
const requiredFiles = [
  'showroom/src/core/plant-output-entry-recovery.ts',
  'showroom/src/core/CoreApp.tsx',
  'showroom/src/core/core-app.css',
  'tools/verify_app_build.mjs',
]
const requiredStatements = [
  '# Claude Code: owner-controlled SuperMega review packet',
  '## Assignment CLAUDE-004',
  checkpoint,
  'Autonomous company cycles use loopback Ollama with `llama3.2:1b`',
  'Use Read, Grep, and Glob only.',
  'Do not start, continue, close, terminate, or inspect any existing Claude or Bionic process',
  'No automated Claude dispatch lane exists in this repository.',
  'Codex independently reproduces every accepted finding before changing source.',
]
const forbiddenStaleMarkers = [
  'ENG-001',
  'ENG-002',
  '2ffcc757206ced8f595efaaa03e32ebf57cae960',
  'b6dfc3d31473819b7bdda3afa5c5da0df44d7b88',
  'PR #411',
  'PR #412',
  'PR #413',
  'claude:eng001',
  'invoke_claude_eng001_review',
]

for (const file of requiredFiles) {
  await access(resolve(root, file))
  if (!packet.includes(`\`${file}\``)) throw new Error(`Claude handoff is missing ${file}.`)
}
for (const statement of requiredStatements) {
  if (!packet.includes(statement)) throw new Error(`Claude handoff is missing required boundary: ${statement}`)
}
for (const marker of forbiddenStaleMarkers) {
  if (packet.includes(marker)) throw new Error(`Claude handoff retains stale assignment marker: ${marker}`)
}

const scripts = packageJson.scripts ?? {}
if (scripts['claude:handoff:verify'] !== 'node tools/verify_claude_handoff.mjs') {
  throw new Error('Claude handoff verifier script is not canonical.')
}
if (!String(scripts['app:verify'] ?? '').includes('npm run claude:handoff:verify')) {
  throw new Error('The full app gate does not verify the current Claude handoff.')
}
if (Object.keys(scripts).some((name) => name.startsWith('claude:eng001'))) {
  throw new Error('A stale automated ENG-001 provider lane remains in package scripts.')
}

console.log(JSON.stringify({
  ok: true,
  contract: 'supermega.claude-owner-handoff.v1',
  assignment: 'CLAUDE-004',
  checkpoint,
  files: requiredFiles.length,
  providerRequests: 0,
  automatedDispatch: false,
  ownerSessionsInspected: false,
  processTerminationCalls: 0,
}, null, 2))
