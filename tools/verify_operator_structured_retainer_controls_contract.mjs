import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const generator = readFileSync(resolve(root, 'tools/create_public_vercel_output.mjs'), 'utf8')

function fail(code, detail = {}) {
  console.error(JSON.stringify({ ok: false, code, ...detail }, null, 2))
  process.exit(1)
}

for (const token of [
  'data-enterprise-delivery-reference-target',
  'enterprise_delivery_reference_required',
  'data-customer-success-reference-target',
  'customer_success_reference_required',
  'data-retainer-growth-reference-target',
  'retainer_growth_reference_required',
  'data-retainer-payment-amount-target',
  'data-retainer-payment-period-target',
  'data-retainer-payment-owner-target',
  'data-retainer-payment-proof-target',
  'retainer_payment_amount_required',
  'retainer_payment_owner_reference_required',
  'retainer_payment_proof_reference_required',
]) {
  if (!generator.includes(token)) fail('operator_structured_retainer_control_missing', { token })
}

for (const retired of [
  "window.prompt('Enterprise delivery evidence reference')",
  "window.prompt('Customer success evidence reference')",
  "window.prompt('Retainer growth evidence reference')",
  "window.prompt('Retainer amount MMK')",
  "window.prompt('Payment period: monthly, quarterly, annual, or one_time_retainer','monthly')",
  "window.prompt('Owner approval reference')",
  "window.prompt('Payment proof reference')",
]) {
  if (generator.includes(retired)) fail('operator_prompt_retainer_control_found', { retired })
}

console.log(JSON.stringify({ ok: true, contract: 'operator_structured_retainer_controls' }, null, 2))
