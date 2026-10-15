// Contract guard for order-intake correction capture -- the first layer of the data flywheel.
//
// Two properties are being defended here and they pull in opposite directions, which is why
// both get assertions rather than one standing in for the other:
//
//   1. The correction SURVIVES. A shop owner fixing what AI got wrong on a Burmese or Viber
//      message produces the pair (proposed, accepted). That pair used to be destroyed by the
//      first edit. If the diff stops recording the corrected field, the flywheel has no fuel
//      and nothing else in the product would notice.
//
//   2. The message does NOT survive. The free tier promises nothing leaves the device, and the
//      record that proves the AI was corrected must not become the place a customer's message,
//      name or phone number gets written to disk. So the leak assertion is not a spot check of
//      known strings -- it walks the ENTIRE serialised record and fails on any substring of the
//      raw message, so a future field that quietly carries text fails here rather than shipping.
//
// The cap is asserted on WRITE, not merely on read: a device left running for a year must hold
// 200 records, not a growing blob that happens to be trimmed when it is read back.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      buildChannelOrderDraft, buildManagedChannelOrderDraft, channelOrderDraftIsReady,
    } from './channel-order-intake.ts'
    export {
      ORDER_INTAKE_EVIDENCE_SCHEMA, ORDER_INTAKE_EVIDENCE_STORAGE_KEY,
      ORDER_INTAKE_EVIDENCE_MAX_RECORDS,
      appendOrderIntakeEvidence, buildOrderIntakeEvidenceRecord, captureOrderIntakeCorrection,
      countExtractedChannelOrderFields, diffChannelOrderCorrections,
      readManagedIntakeGeneration, readOrderIntakeEvidence,
      summarizeOrderIntakeCorrectionEffort,
      ORDER_INTAKE_CORRECTION_EFFORT_THRESHOLD, ORDER_INTAKE_CORRECTION_EFFORT_SAMPLE,
    } from './order-intake-correction-capture.ts'
    export { isLocalWorkspaceKey } from './local-workspace-storage.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/correction-capture-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  buildChannelOrderDraft, buildManagedChannelOrderDraft, channelOrderDraftIsReady,
  ORDER_INTAKE_EVIDENCE_SCHEMA, ORDER_INTAKE_EVIDENCE_STORAGE_KEY,
  ORDER_INTAKE_EVIDENCE_MAX_RECORDS,
  appendOrderIntakeEvidence, buildOrderIntakeEvidenceRecord, captureOrderIntakeCorrection,
  countExtractedChannelOrderFields, diffChannelOrderCorrections,
  readManagedIntakeGeneration, readOrderIntakeEvidence,
  summarizeOrderIntakeCorrectionEffort,
  ORDER_INTAKE_CORRECTION_EFFORT_THRESHOLD, ORDER_INTAKE_CORRECTION_EFFORT_SAMPLE,
  isLocalWorkspaceKey,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const sha256Reference = async (value) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

// A message with a real shape: a personal name, a phone number and a payment intent, all of
// which are exactly the things that must not reach storage.
const MESSAGE = 'Ma Thida here, 09-777-000111. Please send 2 of SM-1001 and I will pay with KBZPay.'
const SOURCE_LABEL = 'Viber thread 4471'
const CATALOG = ['SM-1001', 'SM-1003']
const ACCEPTED_AT = new Date('2026-08-18T04:30:00.000Z')
const GENERATED_AT = '2026-08-18T04:29:12.000Z'

const span = (quote) => {
  const start = MESSAGE.indexOf(quote)
  assert.ok(start >= 0, `fixture error: "${quote}" is not in the test message`)
  return { quote, start, end: start + quote.length }
}

// The managed response as the server really sends it: generation metadata included, which is
// where model and prompt version come from. The existing channel:ai:verify fixture omits that
// block, so it is asserted here rather than assumed.
const buildResponse = async (draftOverrides = {}) => ({
  source_label_digest: await sha256Reference(SOURCE_LABEL),
  draft: {
    schema_version: 'supermega.order_intake.draft.v1',
    request_id: 'OID-0123456789abcdef0123456789abcdef',
    generated_at: GENERATED_AT,
    message_digest: await sha256Reference(MESSAGE),
    generation: {
      provider: 'openai',
      response_id: 'resp_0123456789',
      model: 'gpt-5-mini',
      prompt_version: 'supermega.order_intake.extract.v1',
    },
    status: 'ready_for_review',
    scope: 'single_item_order',
    missing_fields: [],
    uncertain_fields: [],
    blockers: [],
    customer_reference: 'Ma Thida',
    channel: null,
    sku: 'SM-1001',
    quantity: 2,
    // The server's payment CODE, not the display label -- OrderIntakePayment is
    // Literal["kbzpay", ...] and buildManagedChannelOrderDraft maps it to 'KBZPay'. Sending the
    // label here yields a payment_invalid blocker and a draft that can never be accepted, which
    // would make every assertion below vacuous.
    payment: 'kbzpay',
    fulfilment: null,
    provenance: [
      { field: 'customer_reference', source_spans: [span('Ma Thida')] },
      { field: 'sku', source_spans: [span('SM-1001')] },
      { field: 'quantity', source_spans: [span('2 of')] },
      { field: 'payment', source_spans: [span('KBZPay')] },
    ],
    ...draftOverrides,
  },
})

const proposeWithAi = async (draftOverrides = {}) => {
  const response = await buildResponse(draftOverrides)
  const draft = await buildManagedChannelOrderDraft({
    catalogSkus: CATALOG,
    fallbackChannel: 'Viber',
    message: MESSAGE,
    response,
    sourceLabel: SOURCE_LABEL,
  })
  return { response, draft, generation: readManagedIntakeGeneration(response) }
}

// The operator's edit, re-run through the same builder the UI uses, so the accepted draft is a
// real draft rather than a hand-made object that could not exist in the app.
const acceptWith = (overrides) => buildChannelOrderDraft({
  sourceLabel: SOURCE_LABEL,
  message: MESSAGE,
  channel: 'Viber',
  customer: 'Ma Thida',
  sku: 'SM-1001',
  quantity: 2,
  payment: 'KBZPay',
  catalogSkus: CATALOG,
  attributions: {
    customer: { kind: 'quote', quote: 'Ma Thida' },
    sku: { kind: 'quote', quote: 'SM-1001' },
    quantity: { kind: 'quote', quote: '2 of' },
    payment: { kind: 'quote', quote: 'KBZPay' },
  },
  ...overrides,
})

function makeStorage(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)) },
    removeItem: (key) => { map.delete(key) },
    raw: () => map.get(ORDER_INTAKE_EVIDENCE_STORAGE_KEY) ?? '',
  }
}

// --- the generation metadata is read, and read strictly ----------------------
const { response, draft: proposed, generation } = await proposeWithAi()
check(channelOrderDraftIsReady(proposed), 'the fixture produces a draft the operator could accept')
check(generation !== null, 'generation metadata is read off a well-formed managed response')
check(generation.model === 'gpt-5-mini', 'the model name is carried')
check(generation.promptVersion === 'supermega.order_intake.extract.v1', 'the prompt version is carried')
check(/^sha256:[0-9a-f]{64}$/.test(generation.messageDigest), 'the message digest is a sha256 reference')

for (const [label, mutate] of [
  ['no generation block at all', (d) => { delete d.generation }],
  ['an empty model name', (d) => { d.generation = { ...d.generation, model: '' } }],
  ['a missing prompt version', (d) => { d.generation = { ...d.generation, prompt_version: null } }],
  ['a malformed message digest', (d) => { d.message_digest = 'sha256:not-hex' }],
  ['an unparseable generated_at', (d) => { d.generated_at = 'sometime yesterday' }],
]) {
  const broken = structuredClone(response)
  mutate(broken.draft)
  check(readManagedIntakeGeneration(broken) === null, `a response with ${label} yields no generation -- fail closed`)
}
check(readManagedIntakeGeneration(null) === null, 'a null response yields no generation')
check(readManagedIntakeGeneration({ draft: {} }) === null, 'a response with an empty draft yields no generation')

// --- a corrected field IS recorded -------------------------------------------
// AI read the quantity as 2; the shop owner knows this customer and fixes it to 5.
const corrected = acceptWith({ quantity: 5, attributions: {
  customer: { kind: 'quote', quote: 'Ma Thida' },
  sku: { kind: 'quote', quote: 'SM-1001' },
  quantity: { kind: 'operator_supplied' },
  payment: { kind: 'quote', quote: 'KBZPay' },
} })
check(channelOrderDraftIsReady(corrected), 'the corrected draft is itself acceptable')

const changes = diffChannelOrderCorrections(proposed, corrected)
check(changes.length === 1, `exactly one field changed, got ${changes.length}`)
check(changes[0].field === 'quantity', 'and it is the quantity')
check(changes[0].from === '2' && changes[0].to === '5', 'the diff carries the before and after values for the caller')

const storage = makeStorage()
const written = captureOrderIntakeCorrection(storage, {
  generation, proposed, accepted: corrected, acceptedAt: ACCEPTED_AT,
})
check(written !== null, 'accepting a corrected draft writes an evidence record')
check(written.schema === ORDER_INTAKE_EVIDENCE_SCHEMA, 'the record declares the versioned evidence schema')
check(written.schema === 'supermega.order-intake-evidence.v1', 'and that schema is the one the research contract designed')
check(written.correctionCount === 1, 'the correction count is 1')
check(written.fieldsCorrected.join(',') === 'quantity', 'the corrected FIELD NAME is recorded')
check(written.totalExtractedFields === 4, 'all four provenance fields were extracted by AI')
check(written.modelVersion === 'gpt-5-mini' && written.promptVersion === 'supermega.order_intake.extract.v1',
  'the record is bound to the model and prompt that produced the proposal')
check(written.messageDigest === generation.messageDigest, 'and to the digest of the message the model saw')
check(written.acceptedAt === ACCEPTED_AT.toISOString(), 'acceptance time is recorded')
check(written.capturedAt === GENERATED_AT, 'separately from the time the draft was generated')

const stored = readOrderIntakeEvidence(storage)
check(stored.length === 1, 'the record is readable back from storage')
check(stored[0].fieldsCorrected.join(',') === 'quantity', 'and survives the round trip intact')

// Every field can be corrected, not just the one the happy path exercises.
for (const [label, overrides, expected] of [
  ['the customer reference', { customer: 'Daw Khin Aye' }, 'customer'],
  ['the catalog item', { sku: 'SM-1003' }, 'sku'],
  ['the payment intent', { payment: 'WavePay' }, 'payment'],
]) {
  const edited = acceptWith({ ...overrides, attributions: {
    customer: { kind: 'operator_supplied' },
    sku: { kind: 'quote', quote: 'SM-1001' },
    quantity: { kind: 'quote', quote: '2 of' },
    payment: { kind: 'operator_supplied' },
  } })
  const fields = diffChannelOrderCorrections(proposed, edited).map((change) => change.field)
  check(fields.includes(expected), `correcting ${label} is recorded as a ${expected} correction`)
}

// --- an UNCORRECTED extraction records zero corrections ----------------------
// The negative case matters as much as the positive one: a capture that reported a correction
// every time would be indistinguishable from a broken model, and would poison the training set.
const untouched = acceptWith({})
check(channelOrderDraftIsReady(untouched), 'the untouched draft is acceptable')
const cleanStorage = makeStorage()
const cleanRecord = captureOrderIntakeCorrection(cleanStorage, {
  generation, proposed, accepted: untouched, acceptedAt: ACCEPTED_AT,
})
check(cleanRecord !== null, 'an accepted-as-proposed draft is still recorded -- a correct extraction is a label too')
check(cleanRecord.correctionCount === 0, 'with a correction count of zero')
check(cleanRecord.fieldsCorrected.length === 0, 'and no corrected fields')
check(diffChannelOrderCorrections(proposed, untouched).length === 0, 'the diff itself reports no change')

// A partial extraction is counted honestly rather than assumed to be four.
const { draft: partial } = await proposeWithAi({
  payment: null,
  missing_fields: ['payment'],
  blockers: ['incomplete_required_fields'],
  provenance: [
    { field: 'customer_reference', source_spans: [span('Ma Thida')] },
    { field: 'sku', source_spans: [span('SM-1001')] },
    { field: 'quantity', source_spans: [span('2 of')] },
  ],
})
check(countExtractedChannelOrderFields(partial) === 3,
  `a proposal missing the payment counts three extracted fields, got ${countExtractedChannelOrderFields(partial)}`)

// --- the case the flywheel exists for: AI got it WRONG and a person fixed it -
// Everything above starts from a proposal that was already acceptable. The valuable record is
// the other one: AI could not resolve the payment, the draft came back blocked, and the shop
// owner supplied the field by hand. buildOrderIntakeEvidenceRecord does not require the
// PROPOSAL to be ready -- only that it describes the same message -- and that is deliberate, so
// it is asserted here rather than left to be inferred from the happy path.
check(!channelOrderDraftIsReady(partial), 'the partial AI proposal is genuinely blocked')
check(partial.blockers.includes('payment_invalid'), 'because AI could not resolve the payment')
const repaired = acceptWith({ attributions: {
  customer: { kind: 'quote', quote: 'Ma Thida' },
  sku: { kind: 'quote', quote: 'SM-1001' },
  quantity: { kind: 'quote', quote: '2 of' },
  payment: { kind: 'operator_supplied' },
} })
check(channelOrderDraftIsReady(repaired), 'the operator-repaired draft is acceptable')
const repairStorage = makeStorage()
const repairRecord = captureOrderIntakeCorrection(repairStorage, {
  generation, proposed: partial, accepted: repaired, acceptedAt: ACCEPTED_AT,
})
check(repairRecord !== null, 'a blocked AI proposal repaired by hand IS recorded')
check(repairRecord.fieldsCorrected.join(',') === 'payment',
  `the field AI failed on is the one recorded, got "${repairRecord.fieldsCorrected.join(',')}"`)
check(repairRecord.totalExtractedFields === 3,
  'and the record admits AI only extracted three of the four fields')
check(!repairStorage.raw().includes('KBZPay'), 'still no value text reaches storage on this path')

// --- NO raw message text is ever stored --------------------------------------
// The serialised record is searched for every meaningful fragment of the message, not just the
// fields anyone thought to check. This is the assertion that must survive future field additions.
//
// The scenario deliberately corrects the CUSTOMER, not the quantity. A quantity correction
// carries only digits, so a record that leaked its before/after values would still pass every
// string check below and the guard would be decorative -- verified by mutation: adding the raw
// diff to the stored record passed this section until the correction was changed to one whose
// "before" value is a person's name lifted straight out of the message.
const leakAccepted = acceptWith({ customer: 'Daw Khin Aye', quantity: 5, attributions: {
  customer: { kind: 'operator_supplied' },
  sku: { kind: 'quote', quote: 'SM-1001' },
  quantity: { kind: 'operator_supplied' },
  payment: { kind: 'quote', quote: 'KBZPay' },
} })
check(channelOrderDraftIsReady(leakAccepted), 'the leak-scenario draft is acceptable')
const leakChanges = diffChannelOrderCorrections(proposed, leakAccepted)
check(leakChanges.some((change) => change.field === 'customer' && change.from === 'Ma Thida'),
  'the in-memory diff DOES expose the customer name it read from the message')

const leakStorage = makeStorage()
captureOrderIntakeCorrection(leakStorage, {
  generation, proposed, accepted: leakAccepted, acceptedAt: ACCEPTED_AT,
})
const serialized = leakStorage.raw()
check(serialized.length > 0, 'something was actually written -- otherwise the leak check is vacuous')

const forbidden = [
  MESSAGE,
  'Ma Thida',          // the customer's name as AI read it out of the message
  'Daw Khin Aye',      // and the name the operator corrected it to
  '09-777-000111',     // a phone number that appears only in the message
  'Please send',
  'I will pay with',
  'Viber thread 4471', // the source label
  'SM-1001',           // an extracted value
]
for (const fragment of forbidden) {
  check(!serialized.includes(fragment), `the stored record does not contain "${fragment}"`)
}
// Word-level sweep: any token of the message longer than three characters must be absent.
const leaked = [...new Set(MESSAGE.split(/[^\p{L}\p{N}-]+/u))]
  .filter((word) => word.length > 3 && serialized.includes(word))
check(leaked.length === 0, `no word of the customer's message reaches storage, leaked: ${leaked.join(', ')}`)
check(JSON.parse(serialized).records[0].rawMessageIncluded === false,
  'and the record states outright that no raw message is included')

// The values that WERE corrected are absent too -- the diff exposes them in memory, storage does not.
check(!serialized.includes('KBZPay') && !serialized.includes('WavePay'),
  'corrected VALUES are not persisted, only the field names')
// Stated positively as well, so the record cannot pass by being empty: the field NAMES are what
// a training set needs, and they must be there.
const leakRecord = JSON.parse(serialized).records[0]
check(leakRecord.fieldsCorrected.join(',') === 'customer,quantity',
  `both corrected field names ARE recorded, got "${leakRecord.fieldsCorrected.join(',')}"`)
check(leakRecord.correctionCount === 2, 'with a correction count of 2')

// --- the pair must describe the SAME message ---------------------------------
// A stale proposal scored against a different message is a fabricated training label, which is
// worse than no label at all.
const otherMessage = buildChannelOrderDraft({
  sourceLabel: SOURCE_LABEL,
  message: 'Different customer, different order entirely: 1 of SM-1003, cash.',
  channel: 'Viber',
  customer: 'U Aung',
  sku: 'SM-1003',
  quantity: 1,
  payment: 'Cash',
  catalogSkus: CATALOG,
  attributions: {
    customer: { kind: 'quote', quote: 'U Aung' },
    sku: { kind: 'quote', quote: 'SM-1003' },
    quantity: { kind: 'quote', quote: '1 of' },
    payment: { kind: 'quote', quote: 'cash' },
  },
})
check(
  buildOrderIntakeEvidenceRecord({ generation, proposed, accepted: otherMessage, acceptedAt: ACCEPTED_AT }) === null,
  'a proposal and an acceptance for DIFFERENT messages produce no record',
)
check(
  buildOrderIntakeEvidenceRecord({ generation, proposed: null, accepted: corrected, acceptedAt: ACCEPTED_AT }) === null,
  'a manual draft with no AI proposal produces no record',
)
check(
  buildOrderIntakeEvidenceRecord({ generation: null, proposed, accepted: corrected, acceptedAt: ACCEPTED_AT }) === null,
  'a proposal with no generation metadata produces no record',
)
check(
  buildOrderIntakeEvidenceRecord({ generation, proposed, accepted: corrected, acceptedAt: new Date('nope') }) === null,
  'an invalid acceptance time produces no record',
)

// --- the history cap holds ----------------------------------------------------
check(ORDER_INTAKE_EVIDENCE_MAX_RECORDS === 200, 'the documented cap is 200 records')
const cappedStorage = makeStorage()
const overflow = ORDER_INTAKE_EVIDENCE_MAX_RECORDS + 25
for (let index = 0; index < overflow; index += 1) {
  captureOrderIntakeCorrection(cappedStorage, {
    generation,
    proposed,
    accepted: corrected,
    acceptedAt: new Date(ACCEPTED_AT.getTime() + index * 60_000),
  })
}
const capped = readOrderIntakeEvidence(cappedStorage)
check(capped.length === ORDER_INTAKE_EVIDENCE_MAX_RECORDS,
  `the history is capped at ${ORDER_INTAKE_EVIDENCE_MAX_RECORDS}, got ${capped.length}`)
// The cap must bind what is WRITTEN, not just what is read back -- otherwise the blob grows forever
// on a shop's device and only looks bounded.
const persisted = JSON.parse(cappedStorage.raw()).records
check(persisted.length === ORDER_INTAKE_EVIDENCE_MAX_RECORDS,
  `the SERIALISED history is capped too, got ${persisted.length}`)
// And it is the most recent window that survives, not the first 200.
check(capped[capped.length - 1].acceptedAt === new Date(ACCEPTED_AT.getTime() + (overflow - 1) * 60_000).toISOString(),
  'the newest record is kept')
check(capped[0].acceptedAt === new Date(ACCEPTED_AT.getTime() + (overflow - ORDER_INTAKE_EVIDENCE_MAX_RECORDS) * 60_000).toISOString(),
  'and the oldest records are the ones dropped')

// --- corrupt or hostile stored state degrades to empty, never throws ---------
for (const [label, raw] of [
  ['unparseable JSON', '{not json'],
  ['a wrong contract', JSON.stringify({ contract: 'something.else', version: 1, records: [] })],
  ['a wrong version', JSON.stringify({ contract: 'supermega.local_order_intake_evidence_state.v1', version: 9, records: [] })],
  ['records that are not an array', JSON.stringify({ contract: 'supermega.local_order_intake_evidence_state.v1', version: 1, records: 'x' })],
]) {
  const hostile = makeStorage({ [ORDER_INTAKE_EVIDENCE_STORAGE_KEY]: raw })
  check(readOrderIntakeEvidence(hostile).length === 0, `stored state with ${label} reads back empty rather than throwing`)
}
// A record whose counts disagree with its field list is rejected: correctionCount is the number
// downstream analysis would trust, so it must not be assertable independently of the names.
const inconsistent = makeStorage({
  [ORDER_INTAKE_EVIDENCE_STORAGE_KEY]: JSON.stringify({
    contract: 'supermega.local_order_intake_evidence_state.v1',
    version: 1,
    records: [{ ...written, correctionCount: 4 }],
  }),
})
check(readOrderIntakeEvidence(inconsistent).length === 0,
  'a record claiming more corrections than it names is rejected')
const smuggled = makeStorage({
  [ORDER_INTAKE_EVIDENCE_STORAGE_KEY]: JSON.stringify({
    contract: 'supermega.local_order_intake_evidence_state.v1',
    version: 1,
    records: [{ ...written, rawMessageIncluded: true }],
  }),
})
check(readOrderIntakeEvidence(smuggled).length === 0,
  'a record that admits to carrying raw message text is refused on read')
check(appendOrderIntakeEvidence(makeStorage(), { schema: 'wrong' }).length === 0,
  'appending a malformed record writes nothing')

// --- the storage key is registered -------------------------------------------
// An unregistered key is not erased by "Reset this device". Asserted here as well as in
// workspace:storage:verify so the failure names THIS feature.
check(ORDER_INTAKE_EVIDENCE_STORAGE_KEY === 'supermega.shop.order-intake-evidence.v1',
  'the key follows the supermega.<domain>.<name>.v<n> convention')
check(isLocalWorkspaceKey(ORDER_INTAKE_EVIDENCE_STORAGE_KEY),
  'and is registered in local-workspace-storage.ts, so a device reset reaches it')

// --- layered guard, recorded so the count is not over-read -------------------
// Adding the raw before/after diff to the object buildOrderIntakeEvidenceRecord returns leaves
// every check here passing, because normalizeRecord rebuilds each record from a fixed field
// allowlist before appendOrderIntakeEvidence writes it, so the extra field is dropped on the way
// to storage. Verified by running the mutated build. The no-raw-text promise is protected twice;
// this file proves the PROPERTY, not that the builder's field list is individually load-bearing.
//
// The four mutations that ARE caught, each confirmed by running the broken build:
//   1. diffChannelOrderCorrections skipping a field    -> "exactly one field changed, got 0"
//   2. the record carrying the diff AND normalizeRecord passing objects through unchanged
//      -> 'the stored record does not contain "Ma Thida"'
//   3. dropping .slice() on the WRITE path only        -> "the SERIALISED history is capped too, got 201"
//   4. dropping the messageFingerprint equality check  -> "a proposal and an acceptance for
//      DIFFERENT messages produce no record"

// --- Section 9 correction-effort metric -------------------------------------------------------
//
// The `ai-assistance` nextGate reads ONE number off this: average correction effort <= 0.20.
// The research doc defines it per fixture and then averages, so the assertions below pin the
// mean-of-ratios reading against the pooled one, and pin the two ways a bad run could clear the
// bar without deserving it.
{
  const effortRecord = (correctionCount, totalExtractedFields) => ({
    schema: ORDER_INTAKE_EVIDENCE_SCHEMA,
    version: 1,
    messageDigest: `sha256:${'0'.repeat(64)}`,
    intakeDraftSchema: 'supermega.order_intake.draft.v1',
    modelVersion: 'claude-haiku-4-5',
    promptVersion: 'v1',
    capturedAt: '2026-08-30T00:00:00.000Z',
    acceptedAt: '2026-08-30T00:00:01.000Z',
    fieldsCorrected: [],
    correctionCount,
    totalExtractedFields,
    rawMessageIncluded: false,
  })

  // Mean of ratios, NOT pooled. One draft corrected 1-of-1 and one corrected 1-of-9:
  // mean of ratios = (1 + 0.111)/2 = 0.556; pooled = 2/10 = 0.20. Pooled would CLEAR the 0.20
  // bar on a run where the operator rewrote an entire draft. Both are reported; the gate reads
  // the mean.
  const skewed = summarizeOrderIntakeCorrectionEffort([effortRecord(1, 1), effortRecord(1, 9)])
  assert.ok(Math.abs(skewed.averageEffort - 0.5555555555555556) < 1e-12,
    `mean of per-fixture ratios, got ${skewed.averageEffort}`)
  assert.ok(Math.abs(skewed.pooledEffort - 0.2) < 1e-12,
    `pooled effort is reported alongside, got ${skewed.pooledEffort}`)
  checks += 3

  // A model that populates NOTHING must not score a perfect 0 and clear the bar. Those drafts
  // have no defined ratio, so they are excluded from the mean and surface as undefinedCount --
  // the run then fails on sample size, which is the honest failure.
  const empties = summarizeOrderIntakeCorrectionEffort(
    Array.from({ length: 20 }, () => effortRecord(0, 0)),
  )
  assert.equal(empties.measuredCount, 0, 'zero-extraction drafts are not measured')
  assert.equal(empties.undefinedCount, 20, 'zero-extraction drafts are counted, not silently dropped')
  assert.equal(empties.averageEffort, null, 'no measurable fixture yields no average, not 0')
  checks += 3

  const thin = summarizeOrderIntakeCorrectionEffort([effortRecord(0, 4)])
  assert.equal(thin.averageEffort, 0, 'a clean draft measures 0 effort')
  checks += 1

  const good = summarizeOrderIntakeCorrectionEffort(
    Array.from({ length: ORDER_INTAKE_CORRECTION_EFFORT_SAMPLE }, () => effortRecord(1, 10)),
  )
  assert.equal(good.measuredCount, 20, 'all twenty fixtures measured')
  assert.ok(Math.abs(good.averageEffort - 0.1) < 1e-12, `average effort 0.1, got ${good.averageEffort}`)
  checks += 2

  // The verdict is deliberately absent, and the reasons are named rather than implied. Codex
  // found both on #568: the denominator walks four of the managed draft's six fields, and two
  // golden-set fixtures are `scope: "not_an_order"` with every value null, so a CORRECT run has
  // at most 18 non-zero denominators and a 20-measured gate would fail it. This assertion is
  // what stops a future caller reading a low average as a pass.
  assert.equal(good.meetsQualityBar, undefined, 'no gate verdict is rendered from these records')
  assert.deepEqual([...good.gateBlockedBy], [
    'denominator_counts_four_of_six_managed_fields',
    'non_order_outcomes_indistinguishable_from_failed_extraction',
  ], 'the capture-layer prerequisites are named')
  checks += 2

  // Kept from the revision that did render a verdict, because the arithmetic fact outlives it and
  // will bite whoever adds the comparison back: twenty fixtures each corrected 1-of-5 is exactly
  // 0.20 effort, but the accumulated mean is 0.20000000000000004 — ABOVE an inclusive 0.20 bar.
  // Any future `<=` here needs a tolerance or it fails a run sitting exactly on the threshold,
  // invisibly, on representation noise rather than on quality.
  const boundary = summarizeOrderIntakeCorrectionEffort(
    Array.from({ length: 20 }, () => effortRecord(1, 5)),
  )
  assert.ok(boundary.averageEffort > ORDER_INTAKE_CORRECTION_EFFORT_THRESHOLD,
    `float accumulation puts the exact-0.20 run above the bar, got ${boundary.averageEffort}`)
  assert.ok(Math.abs(boundary.averageEffort - 0.2) < 1e-9, 'and only just above it')
  checks += 2
}

console.log(`order intake correction capture contract: ${checks} checks passed`)
