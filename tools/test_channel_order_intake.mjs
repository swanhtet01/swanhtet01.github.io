// Contract guard for channel order intake -- turning a Messenger or Viber message into a
// Shop order draft.
//
// This is where an AI assistant, or a hurried operator, could invent order details that the
// customer never sent. The design refuses to let that happen quietly: EVERY field must be
// attributed, either to a verbatim quote from the message or explicitly as operator-supplied,
// and a quote is only accepted if it genuinely appears in the message exactly once.
//
// Three of those rules are subtle and each blocks a different way of faking provenance:
//   - a quote that is not in the message at all      -> fabricated outright
//   - a quote that appears twice                     -> which occurrence is it evidence of?
//   - a quote that IS the whole message              -> "attributed" while proving nothing
//
// The draft also records the character offsets of each quote, so the claim can be checked
// against the message later rather than trusted.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      buildChannelOrderDraft, channelOrderDraftIsReady, channelOrderFields,
    } from './channel-order-intake.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/intake-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { buildChannelOrderDraft, channelOrderDraftIsReady, channelOrderFields } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const MESSAGE = 'Hello, this is Ma Thida. I would like 2 of SM-1001 please, paying by KBZPay today.'
const CATALOG = ['SM-1001', 'SM-1003']

const draftWith = (attributions, overrides = {}) => buildChannelOrderDraft({
  sourceLabel: 'Messenger thread 4471',
  message: MESSAGE,
  channel: 'Messenger',
  customer: 'Ma Thida',
  sku: 'SM-1001',
  quantity: 2,
  payment: 'KBZPay',
  catalogSkus: CATALOG,
  attributions,
  ...overrides,
})

const honest = {
  customer: { kind: 'quote', quote: 'Ma Thida' },
  sku: { kind: 'quote', quote: 'SM-1001' },
  quantity: { kind: 'quote', quote: '2 of' },
  payment: { kind: 'quote', quote: 'KBZPay' },
}

// --- a properly attributed draft ---------------------------------------------
const ready = draftWith(honest)
check(ready.status === 'ready_for_confirmation', `an honestly quoted draft is ready, got ${ready.status} ${JSON.stringify(ready.blockers)}`)
check(ready.blockers.length === 0, 'with no blockers')
check(channelOrderDraftIsReady(ready), 'and passes the readiness type guard')
check(ready.provenance.length === channelOrderFields.length, 'every field carries provenance')

// The offsets must actually point at the quote, or the record cannot be re-checked later.
for (const entry of ready.provenance.filter((item) => item.kind === 'quote')) {
  check(
    MESSAGE.slice(entry.start, entry.end) === entry.quote,
    `the recorded offsets for "${entry.quote}" point at that exact text in the message`,
  )
}

check(Boolean(ready.messageFingerprint), 'the draft fingerprints the message it came from')
check(Boolean(ready.sourceRecordId), 'and identifies the thread it arrived on')

// --- fabricated provenance is refused ----------------------------------------
const fabricated = draftWith({ ...honest, quantity: { kind: 'quote', quote: 'I would like 7 units' } })
check(
  fabricated.blockers.includes('quantity_quote_not_found'),
  'a quote that does not appear in the message is refused as not found',
)
check(fabricated.status === 'needs_review', 'and the draft is held for review rather than confirmed')

// A quote appearing more than once cannot identify which occurrence is the evidence.
const repeated = 'Send 2 and 2 more of SM-1001, paying KBZPay. Ma Thida'
const ambiguous = buildChannelOrderDraft({
  sourceLabel: 'Messenger thread 4471', message: repeated, channel: 'Messenger',
  customer: 'Ma Thida', sku: 'SM-1001', quantity: 2, payment: 'KBZPay', catalogSkus: CATALOG,
  attributions: { ...honest, quantity: { kind: 'quote', quote: '2' } },
})
check(
  ambiguous.blockers.includes('quantity_quote_ambiguous'),
  'a quote appearing more than once is refused as ambiguous, not silently matched to the first',
)

// Quoting the entire message would "attribute" every field while proving nothing.
const wholeMessage = draftWith({ ...honest, customer: { kind: 'quote', quote: MESSAGE } })
check(
  wholeMessage.blockers.includes('customer_quote_must_be_excerpt'),
  'quoting the whole message is refused -- an excerpt is required',
)

// --- an entirely operator-invented order still needs one real quote ----------
const allOperator = draftWith(Object.fromEntries(
  channelOrderFields.map((field) => [field, { kind: 'operator_supplied' }]),
))
check(
  allOperator.blockers.includes('source_quote_required'),
  'a draft with NO field quoted from the message is refused -- at least one must be evidenced',
)

// ...but a mix is fine: some fields genuinely are not in the message.
const mixed = draftWith({ ...honest, payment: { kind: 'operator_supplied' } })
check(mixed.status === 'ready_for_confirmation', 'a mix of quoted and operator-supplied fields is accepted')
check(
  mixed.provenance.some((entry) => entry.kind === 'operator_supplied'),
  'and the operator-supplied field is recorded as such, not disguised as evidence',
)

// --- an unattributed field is refused ----------------------------------------
const missing = draftWith({ ...honest, sku: undefined })
check(missing.blockers.includes('sku_attribution_required'), 'a field with no attribution at all is refused')

// --- the order details themselves are still validated ------------------------
check(
  draftWith(honest, { sku: 'SM-9999' }).blockers.includes('sku_unknown'),
  'a SKU outside the Shop catalog is refused even when quoted',
)
for (const [quantity, label] of [[0, 'zero'], [-1, 'negative'], [1.5, 'fractional'], [10_000, 'absurd']]) {
  check(
    draftWith(honest, { quantity }).blockers.includes('quantity_invalid'),
    `a ${label} quantity is refused`,
  )
}
check(draftWith(honest, { channel: 'WhatsApp' }).blockers.includes('channel_invalid'), 'an unsupported channel is refused')
check(!draftWith(honest, { channel: 'Telegram' }).blockers.includes('channel_invalid'), 'Telegram is an accepted channel')
check(!draftWith(honest, { channel: 'TikTok' }).blockers.includes('channel_invalid'), 'TikTok is an accepted channel')
check(!draftWith({ ...honest, payment: { kind: 'operator_supplied' } }, { payment: 'AYA Pay' }).blockers.includes('payment_invalid'), 'AYA Pay is an accepted Myanmar payment method')
check(!draftWith({ ...honest, payment: { kind: 'operator_supplied' } }, { payment: 'MMQR' }).blockers.includes('payment_invalid'), 'MMQR is an accepted Myanmar payment method')
check(draftWith(honest, { payment: 'Bitcoin' }).blockers.includes('payment_invalid'), 'an unsupported payment method is refused')
check(draftWith(honest, { message: '' }).blockers.includes('source_message_required'), 'a draft with no source message is refused')
check(draftWith(honest, { sourceLabel: '' }).blockers.includes('source_label_required'), 'a draft with no source thread is refused')

console.log(`channel order intake contract: ${checks} checks passed`)
