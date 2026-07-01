import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const generator = readFileSync(resolve(root, 'tools/create_public_vercel_output.mjs'), 'utf8')

function fail(code, detail = {}) {
  console.error(JSON.stringify({ ok: false, code, ...detail }, null, 2))
  process.exit(1)
}

const sourceMatch = generator.match(/const publicSourceToScreenHtml = `([\s\S]*?)`\s*\n\nfunction publicContactRedirectHtml/)
if (!sourceMatch) fail('free_source_to_screen_block_missing')

const freeHtml = sourceMatch[1]

for (const token of [
  'Workcell templates',
  'Proof order packet',
  'data-workcell-template',
  'data-proof-order-output',
  'data-start-paid-pilot-link',
  'buildPaidPilotOrderPacket',
  'free_load_policy: browser_only_until_contact',
  'required_sources',
  'proof_target',
]) {
  if (!freeHtml.includes(token)) fail('free_workcell_order_token_missing', { token })
}

for (const token of [
  'Daily cash close',
  'Receivables chase',
  'Inventory exception desk',
  'Lead reply desk',
  'Document ledger',
]) {
  if (!freeHtml.includes(token)) fail('free_workcell_template_missing', { token })
}

if (/fetch\s*\(/.test(freeHtml)) fail('free_page_should_not_call_network')
if (!freeHtml.includes('utm_content=free_workcell_order')) fail('paid_pilot_link_missing_source_context')

const generatedFreePath = resolve(root, '.vercel/output/static/free/index.html')
if (existsSync(resolve(root, '.vercel/output/config.json'))) {
  if (!existsSync(generatedFreePath)) fail('generated_free_page_missing', { path: generatedFreePath })
  const generatedFree = readFileSync(generatedFreePath, 'utf8')
  for (const token of ['Workcell templates', 'Proof order packet', 'data-proof-order-output', 'free_load_policy: browser_only_until_contact']) {
    if (!generatedFree.includes(token)) fail('generated_free_workcell_order_token_missing', { token })
  }
  if (/fetch\s*\(/.test(generatedFree)) fail('generated_free_page_should_not_call_network')
}

console.log(JSON.stringify({ ok: true, contract: 'public_free_workcell_order' }, null, 2))
