import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const generator = readFileSync(resolve(root, 'tools/create_public_vercel_output.mjs'), 'utf8')

function fail(code, detail = {}) {
  console.error(JSON.stringify({ ok: false, code, ...detail }, null, 2))
  process.exit(1)
}

for (const token of [
  'const publicSourceToScreenHtml',
  'Free Source-to-Screen',
  'Browser-only first pass',
  'No model call until',
  'Cache by source hash',
  'Second run or export requires contact',
  'No free connectors',
  'Start AI Workcell Pilot',
  'data-source-to-screen-output',
  'buildSourceToScreenDraft',
  "resolve(staticDir, 'free'",
  "dest: '/free/index.html'",
  '<url><loc>https://supermega.dev/free/</loc>',
]) {
  if (!generator.includes(token)) fail('source_to_screen_contract_missing', { token })
}

const freeRouteMatch = generator.match(/src: '\^\/\(\?:try\|book[\s\S]*?dest: '\/free\/index\.html'[\s\S]*?\},/)
if (!freeRouteMatch) fail('source_to_screen_free_route_block_missing')

for (const retired of [
  "Location: '/contact/'",
  'Daily Close Checker',
  'Workflow Scope Builder',
  'unlimited free',
]) {
  if (retired === "Location: '/contact/'" && !freeRouteMatch[0].includes(retired)) continue
  if (generator.includes(retired)) fail('source_to_screen_retired_contract_found', { retired })
}

const generatedFreePath = resolve(root, '.vercel/output/static/free/index.html')
if (existsSync(resolve(root, '.vercel/output/config.json'))) {
  if (!existsSync(generatedFreePath)) fail('source_to_screen_generated_page_missing', { path: generatedFreePath })
  const generatedFree = readFileSync(generatedFreePath, 'utf8')
  for (const token of ['Free Source-to-Screen', 'Browser-only first pass', 'data-source-to-screen-output', 'Start AI Workcell Pilot']) {
    if (!generatedFree.includes(token)) fail('source_to_screen_generated_page_token_missing', { token })
  }
}

console.log(JSON.stringify({ ok: true, contract: 'public_source_to_screen' }, null, 2))
