// Contract guard for the MANAGED (AI-assisted) channel order draft.
//
// This is the path where a model reads a customer's Messenger or Viber message and proposes
// an order. Everything it claims is treated as untrusted input, and this is the strictest
// verification in the product:
//
//   - the response is digest-bound to the exact message AND the exact thread it answered,
//     so a draft cannot be replayed against a different conversation
//   - every field it attributes must come with source_spans, and each span's OFFSETS are
//     checked against the real message: message.slice(start, end) must equal the quote
//   - a span whose end does not equal start + quote.length is rejected as internally
//     inconsistent, before the slice is even consulted
//
// That third layer is what makes fabrication structurally impossible rather than merely
// discouraged: the model cannot claim a quote without pointing at where it actually is.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { buildManagedChannelOrderDraft } from './channel-order-intake.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/managed-intake-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { buildManagedChannelOrderDraft } =
  await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}
async function rejects(run, label) {
  checks += 1
  await assert.rejects(run, undefined, label)
}

const sha256Reference = async (value) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

const MESSAGE = 'Ma Thida here. Please send 2 of SM-1001 and I will pay with KBZPay.'
const SOURCE_LABEL = 'Messenger thread 4471'
const CATALOG = ['SM-1001', 'SM-1003']

const span = (quote) => {
  const start = MESSAGE.indexOf(quote)
  assert.ok(start >= 0, `fixture error: "${quote}" is not in the test message`)
  return { quote, start, end: start + quote.length }
}

const buildResponse = async (overrides = {}, draftOverrides = {}) => ({
  source_label_digest: await sha256Reference(SOURCE_LABEL),
  draft: {
    schema_version: 'supermega.order_intake.draft.v1',
    message_digest: await sha256Reference(MESSAGE),
    status: 'ready_for_review',
    scope: 'single_item_order',
    missing_fields: [],
    uncertain_fields: [],
    blockers: [],
    customer_reference: 'Ma Thida',
    // null, not 'messenger': the channel is not stated in the message text, and any non-null
    // value the model asserts MUST carry source evidence. Saying null lets the known thread
    // metadata supply it instead of inventing a quote -- which is the rule working correctly.
    channel: null,
    sku: 'SM-1001',
    quantity: 2,
    payment: 'KBZPay',
    // Explicit null, not omitted. The evidence rule is `value !== null`, so an ABSENT field
    // is undefined and still demands source spans -- only an explicit null declares "the
    // message does not say". Omitting it is not the same as declaring it absent.
    fulfilment: null,
    provenance: [
      { field: 'customer_reference', source_spans: [span('Ma Thida')] },
      { field: 'sku', source_spans: [span('SM-1001')] },
      { field: 'quantity', source_spans: [span('2 of')] },
      { field: 'payment', source_spans: [span('KBZPay')] },
    ],
    ...draftOverrides,
  },
  ...overrides,
})

const run = async (response) => buildManagedChannelOrderDraft({
  catalogSkus: CATALOG, fallbackChannel: 'Messenger', message: MESSAGE,
  response, sourceLabel: SOURCE_LABEL,
})

// --- an honest managed draft --------------------------------------------------
const draft = await run(await buildResponse())
check(Boolean(draft), 'a well-formed managed draft is accepted')
check(draft.customer === 'Ma Thida', 'the customer reference is carried through')
check(draft.sku === 'SM-1001', 'and the SKU')
check(draft.quantity === 2, 'and the quantity')
check(draft.provenance.length > 0, 'with provenance recorded')
for (const entry of draft.provenance.filter((item) => item.kind === 'quote')) {
  check(
    MESSAGE.slice(entry.start, entry.end) === entry.quote,
    `the retained offsets for "${entry.quote}" still point at that text`,
  )
}

// --- the response is bound to THIS message and THIS thread -------------------
await rejects(
  async () => run(await buildResponse({ source_label_digest: await sha256Reference('Messenger thread 9999') })),
  'a draft answering a different thread is refused',
)
await rejects(
  async () => run(await buildResponse({}, { message_digest: await sha256Reference('a different customer message') })),
  'a draft answering a different message is refused -- it cannot be replayed onto this one',
)

// --- offsets must actually contain the quote ---------------------------------
// This is the anti-fabrication core: the model cannot claim a quote without pointing at
// where it really is. Each case below replaces ONE span in an otherwise complete provenance
// set -- supplying a partial set instead would make the draft fail the "every non-null field
// needs evidence" check first, and the test would pass for the wrong reason. It did exactly
// that on the first attempt; mutation testing is what surfaced it.
const fullProvenance = (skuSpan) => [
  { field: 'customer_reference', source_spans: [span('Ma Thida')] },
  { field: 'sku', source_spans: [skuSpan] },
  { field: 'quantity', source_spans: [span('2 of')] },
  { field: 'payment', source_spans: [span('KBZPay')] },
]

await rejects(
  async () => run(await buildResponse({}, { provenance: fullProvenance({ quote: 'SM-9999', start: 0, end: 7 }) })),
  'a quote whose offsets point at different text in the message is refused',
)
await rejects(
  async () => run(await buildResponse({}, { provenance: fullProvenance({ quote: 'SM-1001', start: 0, end: 3 }) })),
  'a span whose end does not equal start plus the quote length is refused as inconsistent',
)
await rejects(
  async () => run(await buildResponse({}, { provenance: fullProvenance({ quote: 'SM-1001', start: -1, end: 6 }) })),
  'a negative offset is refused',
)
await rejects(
  async () => run(await buildResponse({}, { provenance: fullProvenance({ ...span('SM-1001'), quote: '   ' }) })),
  'a blank quote is refused',
)

// --- a value asserted with no evidence at all --------------------------------
// Dropping ONE field from an otherwise complete set isolates the evidence rule, rather than
// tripping it incidentally as the offset cases above would have.
await rejects(
  async () => run(await buildResponse({}, {
    provenance: fullProvenance(span('SM-1001')).filter((entry) => entry.field !== 'payment'),
  })),
  'a non-null field with no source evidence is refused',
)

// --- the shape of the response itself ----------------------------------------
await rejects(async () => run(await buildResponse({}, { schema_version: 'supermega.order_intake.draft.v2' })),
  'a draft on an unrecognised schema version is refused')
await rejects(async () => run(await buildResponse({}, { status: 'approved' })),
  'a status outside the supported set is refused -- a model cannot self-approve')
await rejects(async () => run(await buildResponse({}, { scope: 'refund_request' })),
  'a scope outside the supported set is refused')
await rejects(async () => run(await buildResponse({}, { provenance: 'not an array' })),
  'non-array provenance is refused')
await rejects(async () => run(await buildResponse({}, { missing_fields: 'not a list' })),
  'non-list review fields are refused')
await rejects(async () => run({ draft: null }), 'a response with no draft is refused')
await rejects(async () => run('not an object'), 'a non-object response is refused')

// --- one field cannot be attributed twice ------------------------------------
await rejects(
  async () => run(await buildResponse({}, {
    provenance: [
      { field: 'sku', source_spans: [span('SM-1001')] },
      { field: 'sku', source_spans: [span('SM-1001')] },
    ],
  })),
  'the same field attributed twice is refused',
)
await rejects(
  async () => run(await buildResponse({}, {
    provenance: [{ field: 'invented_field', source_spans: [span('SM-1001')] }],
  })),
  'a field name outside the supported set is refused',
)
await rejects(
  async () => run(await buildResponse({}, {
    provenance: [{ field: 'sku', source_spans: [] }],
  })),
  'a field claiming provenance with no spans at all is refused',
)

console.log(`managed AI draft contract: ${checks} checks passed`)
