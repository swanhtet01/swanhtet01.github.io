import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const generator = readFileSync(resolve(root, 'tools/create_public_vercel_output.mjs'), 'utf8')

function fail(code, detail = {}) {
  console.error(JSON.stringify({ ok: false, code, ...detail }, null, 2))
  process.exit(1)
}

function extractConstTemplate(name, nextMarker) {
  const match = generator.match(new RegExp(`const ${name} = \`([\\s\\S]*?)\`\\s*\\n\\n${nextMarker}`))
  if (!match) fail('template_block_missing', { name })
  return match[1]
}

const contactHtml = extractConstTemplate('unicornContactHtml', 'const collapsedContactHtml')
const freeHtml = extractConstTemplate('publicSourceToScreenHtml', 'function publicContactRedirectHtml')

for (const token of [
  'sm_source_to_screen_order',
  'saveWorkcellOrderPacket',
  'localStorage.setItem(orderStorageKey',
  'source_to_screen_order_packet',
]) {
  if (!freeHtml.includes(token)) fail('free_handoff_token_missing', { token })
}

for (const token of [
  'data-source-to-screen-handoff',
  'loadSourceToScreenOrder',
  'source_to_screen_workcell_id',
  'source_to_screen_workcell_name',
  'source_to_screen_source_hash',
  'source_to_screen_proof_target',
  'source_to_screen_order_packet',
  'source_to_screen_free_load_policy',
  'Source-to-Screen packet carried from free draft',
]) {
  if (!contactHtml.includes(token)) fail('contact_handoff_token_missing', { token })
}

if (!contactHtml.includes("search.get('workcell')")) fail('contact_query_workcell_missing')
if (!contactHtml.includes("search.get('source_hash')")) fail('contact_query_source_hash_missing')
if (!contactHtml.includes("localStorage.getItem('sm_source_to_screen_order')")) fail('contact_local_storage_handoff_missing')

const generatedContactPath = resolve(root, '.vercel/output/static/contact/index.html')
const generatedFreePath = resolve(root, '.vercel/output/static/free/index.html')
if (existsSync(resolve(root, '.vercel/output/config.json'))) {
  for (const [path, tokens] of [
    [generatedFreePath, ['sm_source_to_screen_order', 'saveWorkcellOrderPacket', 'source_to_screen_order_packet']],
    [generatedContactPath, ['data-source-to-screen-handoff', 'loadSourceToScreenOrder', 'source_to_screen_order_packet']],
  ]) {
    if (!existsSync(path)) fail('generated_handoff_page_missing', { path })
    const html = readFileSync(path, 'utf8')
    for (const token of tokens) {
      if (!html.includes(token)) fail('generated_handoff_token_missing', { path, token })
    }
  }
}

console.log(JSON.stringify({ ok: true, contract: 'public_source_to_paid_intake_handoff' }, null, 2))
