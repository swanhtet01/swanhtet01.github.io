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
//   3. The record is ARITHMETICALLY USABLE as section 9 of
//      hq/research/order-intake-agent-evaluation-2026-08.md defines the correction-effort metric:
//      correction_effort = fields_corrected / total_extracted_fields, threshold <= 0.20, where
//      total_extracted_fields is every field the MODEL populated and fields_corrected is what a
//      NAMED operator changed. Three things follow and each is asserted below, because getting
//      any of them wrong misclassifies the threshold rather than failing loudly:
//        - the denominator is the SIX managed fields, read off the managed response, not the four
//          quote-mapped ones and not inferred from the browser draft;
//        - the numerator lives inside the denominator, so the ratio cannot exceed 1;
//        - no operator name, no record.
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
      channelOrderFields,
    } from './channel-order-intake.ts'
    export {
      ORDER_INTAKE_EVIDENCE_SCHEMA, ORDER_INTAKE_EVIDENCE_STORAGE_KEY,
      ORDER_INTAKE_EVIDENCE_MAX_RECORDS, ORDER_INTAKE_EVIDENCE_LEGACY_STORAGE_KEY,
      ORDER_INTAKE_EVIDENCE_STATE_CONTRACT, channelOrderCaptureFields,
      orderIntakeEvidenceScopeForWorkspace, orderIntakeEvidenceStorageKey,
      appendOrderIntakeEvidence, buildOrderIntakeEvidenceRecord, captureOrderIntakeCorrection,
      diffChannelOrderCorrections,
      readManagedIntakeGeneration, readOrderIntakeEvidence,
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
  channelOrderFields,
  ORDER_INTAKE_EVIDENCE_SCHEMA, ORDER_INTAKE_EVIDENCE_STORAGE_KEY,
  ORDER_INTAKE_EVIDENCE_MAX_RECORDS, ORDER_INTAKE_EVIDENCE_LEGACY_STORAGE_KEY,
  ORDER_INTAKE_EVIDENCE_STATE_CONTRACT, channelOrderCaptureFields,
  orderIntakeEvidenceScopeForWorkspace, orderIntakeEvidenceStorageKey,
  appendOrderIntakeEvidence, buildOrderIntakeEvidenceRecord, captureOrderIntakeCorrection,
  diffChannelOrderCorrections,
  readManagedIntakeGeneration, readOrderIntakeEvidence,
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
// The named operator section 9 requires. A managed userId, deliberately not an email or a person's
// name -- the leak sweep below would fail on either, which is the point.
const ACTOR = '4f5b2a10-8c3d-4e71-9a52-6b0d1c8e37af'
// Records are partitioned per workspace, so every call names one. A shop device where two companies
// sign in must not pool their operator IDs into a single blob.
const WORKSPACE_ID = 'ws-9f21c7d4'
const SCOPE = orderIntakeEvidenceScopeForWorkspace(WORKSPACE_ID)
const SCOPED_KEY = orderIntakeEvidenceStorageKey(SCOPE)

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
    raw: () => map.get(SCOPED_KEY) ?? '',
    keys: () => [...map.keys()],
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
// The denominator is only defined against the managed contract's full field list. A response that
// omits one of them cannot answer "how many fields did the model populate", and a denominator
// guessed from a short response is a wrong number rather than a missing one.
for (const field of ['customer_reference', 'channel', 'sku', 'quantity', 'payment', 'fulfilment']) {
  const short = structuredClone(response)
  delete short.draft[field]
  check(readManagedIntakeGeneration(short) === null,
    `a response missing the ${field} key yields no generation -- the denominator is undefined without it`)
  const undefinedField = structuredClone(response)
  undefinedField.draft[field] = undefined
  check(readManagedIntakeGeneration(undefinedField) === null,
    `and an explicitly undefined ${field} is refused too, not read as null`)
}
check(generation.extractedFields.total === 4,
  'the base fixture populated four of the six managed fields')
check(generation.extractedFields.populated.join(',') === 'customer,sku,quantity,payment',
  'and its null channel is absent from the reviewable set')

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
  generation, proposed, accepted: corrected, acceptedAt: ACCEPTED_AT, actor: ACTOR, scope: SCOPE,
})
check(written !== null, 'accepting a corrected draft writes an evidence record')
check(written.schema === ORDER_INTAKE_EVIDENCE_SCHEMA, 'the record declares the versioned evidence schema')
// v2, not the v1 the research contract's section 4 sketched: the record now names the operator and
// carries the extracted-field set section 9 needs, so the shape genuinely changed. Bumping it is
// what stops a v1 blob from being read back under v2 rules and silently discarded.
check(written.schema === 'supermega.order-intake-evidence.v2', 'and that schema is the section 9 revision of the one the research contract designed')
check(written.version === 2, 'the record version is bumped alongside it')
check(written.correctionCount === 1, 'the correction count is 1')
check(written.fieldsCorrected.join(',') === 'quantity', 'the corrected FIELD NAME is recorded')
check(written.totalExtractedFields === 4,
  'four of the six managed fields were populated -- channel and fulfilment came back null')
check(written.fieldsExtracted.join(',') === 'customer,sku,quantity,payment',
  `and the record names which four, got "${written.fieldsExtracted.join(',')}"`)
check(written.actor === ACTOR, 'the named operator who reviewed the draft is recorded')
check(written.modelVersion === 'gpt-5-mini' && written.promptVersion === 'supermega.order_intake.extract.v1',
  'the record is bound to the model and prompt that produced the proposal')
check(written.messageDigest === generation.messageDigest, 'and to the digest of the message the model saw')
check(written.acceptedAt === ACCEPTED_AT.toISOString(), 'acceptance time is recorded')
check(written.capturedAt === GENERATED_AT, 'separately from the time the draft was generated')

const stored = readOrderIntakeEvidence(storage, SCOPE)
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
  generation, proposed, accepted: untouched, acceptedAt: ACCEPTED_AT, actor: ACTOR, scope: SCOPE,
})
check(cleanRecord !== null, 'an accepted-as-proposed draft is still recorded -- a correct extraction is a label too')
check(cleanRecord.correctionCount === 0, 'with a correction count of zero')
check(cleanRecord.fieldsCorrected.length === 0, 'and no corrected fields')
check(diffChannelOrderCorrections(proposed, untouched).length === 0, 'the diff itself reports no change')

// A partial extraction is counted honestly rather than assumed to be four.
const { draft: partial, generation: partialGeneration } = await proposeWithAi({
  payment: null,
  missing_fields: ['payment'],
  blockers: ['incomplete_required_fields'],
  provenance: [
    { field: 'customer_reference', source_spans: [span('Ma Thida')] },
    { field: 'sku', source_spans: [span('SM-1001')] },
    { field: 'quantity', source_spans: [span('2 of')] },
  ],
})
check(partialGeneration.extractedFields.total === 3,
  `a proposal missing the payment counts three extracted fields, got ${partialGeneration.extractedFields.total}`)
check(partialGeneration.extractedFields.populated.join(',') === 'customer,sku,quantity',
  'and names them, so "the model missed payment" is readable from the record')

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
  generation: partialGeneration, proposed: partial, accepted: repaired, acceptedAt: ACCEPTED_AT, actor: ACTOR, scope: SCOPE,
})
check(repairRecord !== null, 'a blocked AI proposal repaired by hand IS recorded')
// WHICH array names the payment changed here, and that is a deliberate move rather than a lost
// signal. Scoring "the model returned null and a person filled it in" as a CORRECTION of the model
// put section 9's numerator outside its denominator -- one correction over three extracted fields
// here, but a message where the model populated one field and the operator filled three would have
// produced a correction_effort of 3.0, against a metric whose own definition tops out at 1. So
// fieldsCorrected now covers only fields the model actually populated, and the miss is recorded by
// ABSENCE from fieldsExtracted, which is strictly more information: a payment the model got wrong
// appears in both arrays, a payment it never attempted appears in neither.
check(repairRecord.fieldsCorrected.length === 0,
  `filling a field the model left null is not a correction OF the model, got "${repairRecord.fieldsCorrected.join(',')}"`)
check(repairRecord.fieldsExtracted.join(',') === 'customer,sku,quantity',
  `the payment AI failed on is recorded by its absence, got "${repairRecord.fieldsExtracted.join(',')}"`)
check(!repairRecord.fieldsExtracted.includes('payment'), 'stated directly: AI never populated the payment')
check(repairRecord.totalExtractedFields === 3,
  'and the record admits AI populated only three of the six managed fields')
check(!repairStorage.raw().includes('KBZPay'), 'still no value text reaches storage on this path')

// --- section 9's denominator is the SIX managed fields, not the four quote-mapped ones -------
// The old count walked channelOrderFields, which is exactly ['customer','sku','quantity','payment'].
// The model also populates `channel` and `fulfilment` -- both are OrderIntakeField members in
// supermega_runtime/order_intake.py and both are required to carry source evidence by
// buildManagedChannelOrderDraft -- so a fixture where the model filled all six was scored 4, and a
// correction_effort computed from it came out inflated by up to 1.5x against a <= 0.20 threshold.
//
// The denominator is now read off the managed RESPONSE, which is the only source that can answer
// the question correctly, and the two fields prove why the draft cannot:
//   - `fulfilment` has no field on ChannelOrderDraft at all, so no draft-walking count could ever
//     see it;
//   - `draft.channel` is populated even when the model returned null, because
//     buildManagedChannelOrderDraft substitutes the operator's own "Received through" selection.
//     Counting that as a model extraction would inflate the denominator in the other direction.
// Both directions matter: either one silently misclassifies the <= 0.20 threshold.
const WIDE_MESSAGE = 'Viber order from Ma Thida: 2 of SM-1001, deliver to Yangon, paying KBZPay.'
const wideSpan = (quote) => {
  const start = WIDE_MESSAGE.indexOf(quote)
  assert.ok(start >= 0, `fixture error: "${quote}" is not in the wide test message`)
  assert.ok(WIDE_MESSAGE.indexOf(quote, start + 1) < 0, `fixture error: "${quote}" is ambiguous in the wide test message`)
  return { quote, start, end: start + quote.length }
}
const WIDE_PROVENANCE = [
  { field: 'customer_reference', source_spans: [wideSpan('Ma Thida')] },
  { field: 'channel', source_spans: [wideSpan('Viber')] },
  { field: 'sku', source_spans: [wideSpan('SM-1001')] },
  { field: 'quantity', source_spans: [wideSpan('2 of')] },
  { field: 'payment', source_spans: [wideSpan('KBZPay')] },
  { field: 'fulfilment', source_spans: [wideSpan('deliver to Yangon')] },
]
const buildWideResponse = async (draftOverrides = {}) => ({
  source_label_digest: await sha256Reference(SOURCE_LABEL),
  draft: {
    schema_version: 'supermega.order_intake.draft.v1',
    request_id: 'OID-0123456789abcdef0123456789abcdef',
    generated_at: GENERATED_AT,
    message_digest: await sha256Reference(WIDE_MESSAGE),
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
    channel: 'viber',
    sku: 'SM-1001',
    quantity: 2,
    payment: 'kbzpay',
    fulfilment: 'delivery',
    provenance: WIDE_PROVENANCE,
    ...draftOverrides,
  },
})
const acceptWide = (overrides = {}) => buildChannelOrderDraft({
  sourceLabel: SOURCE_LABEL,
  message: WIDE_MESSAGE,
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

const wideResponse = await buildWideResponse()
const wideGeneration = readManagedIntakeGeneration(wideResponse)
check(wideGeneration !== null, 'a fully populated managed response still yields generation metadata')
check(wideGeneration.extractedFields.total === 6,
  `all six managed fields count toward the denominator, got ${wideGeneration.extractedFields.total}`)
check(wideGeneration.extractedFields.populated.join(',') === 'customer,channel,sku,quantity,payment',
  `five of the six are reviewable; fulfilment has no control to correct it, got "${wideGeneration.extractedFields.populated.join(',')}"`)
check(wideGeneration.extractedFields.total > wideGeneration.extractedFields.populated.length,
  'and the gap between them is visible, so an evaluator cannot read a falsely low correction_effort')

// The null case: the same two fields are SKIPPED rather than counted, and `channel` is skipped even
// though the draft ends up carrying one.
const nullWideResponse = await buildWideResponse({
  channel: null,
  fulfilment: null,
  missing_fields: ['channel', 'fulfilment'],
  provenance: WIDE_PROVENANCE.filter((entry) => entry.field !== 'channel' && entry.field !== 'fulfilment'),
})
const nullWideGeneration = readManagedIntakeGeneration(nullWideResponse)
check(nullWideGeneration.extractedFields.total === 4,
  `a null channel and a null fulfilment are not counted, got ${nullWideGeneration.extractedFields.total}`)
check(!nullWideGeneration.extractedFields.populated.includes('channel'),
  'and channel is absent from the reviewable set')
const fallbackDraft = await buildManagedChannelOrderDraft({
  catalogSkus: CATALOG,
  fallbackChannel: 'Messenger',
  message: WIDE_MESSAGE,
  response: nullWideResponse,
  sourceLabel: SOURCE_LABEL,
})
check(fallbackDraft.channel === 'Messenger',
  'the draft DOES carry a channel -- the operator form supplied it, the model did not')
check(!nullWideGeneration.extractedFields.populated.includes('channel'),
  'so counting the draft rather than the response would have credited the model with the operator\'s own choice')

// A channel correction is now recorded. The old four-field diff could not see it at all.
const wideProposed = await buildManagedChannelOrderDraft({
  catalogSkus: CATALOG,
  fallbackChannel: 'Viber',
  message: WIDE_MESSAGE,
  response: wideResponse,
  sourceLabel: SOURCE_LABEL,
})
check(wideProposed.channel === 'Viber', 'the model resolved the channel from the message')
const channelCorrected = acceptWide({ channel: 'Messenger' })
const channelChanges = diffChannelOrderCorrections(wideProposed, channelCorrected)
check(channelChanges.length === 1 && channelChanges[0].field === 'channel',
  `switching the channel is a correction, got ${JSON.stringify(channelChanges.map((change) => change.field))}`)
const wideStorage = makeStorage()
const wideRecord = captureOrderIntakeCorrection(wideStorage, {
  generation: wideGeneration, proposed: wideProposed, accepted: channelCorrected, acceptedAt: ACCEPTED_AT, actor: ACTOR, scope: SCOPE,
})
check(wideRecord.fieldsCorrected.join(',') === 'channel', 'and it is recorded by name')
check(wideRecord.totalExtractedFields === 6, 'against a denominator of six')
check(wideRecord.correctionCount / wideRecord.totalExtractedFields < 0.2,
  'so this fixture computes a correction_effort of 1/6, which the old denominator would have reported as 1/4')
check(!wideStorage.raw().includes('Messenger') && !wideStorage.raw().includes('Viber'),
  'and the channel VALUES stay out of storage, exactly like every other corrected value')

// --- a managed value the CLIENT could not translate is not the model's mistake ---------------
// The server's OrderIntakeChannel includes `website` and `walk_in`; managedChannels in
// channel-order-intake.ts has entries for neither, so buildManagedChannelOrderDraft turns them
// into null and the draft comes back with a channel_invalid blocker. The model DID populate the
// field, so it belongs in section 9's denominator -- but the operator never saw the value, so the
// dropdown choice they are then forced to make is compensation for a client mapping gap, not a
// correction of the model. Counting it would inflate correction_effort against the <= 0.20
// threshold for a defect the model did not cause.
const unmappableResponse = await buildWideResponse({
  channel: 'website',
  // The quote is incidental here; what is under test is a server enum value the client cannot map.
  provenance: WIDE_PROVENANCE,
})
const unmappableGeneration = readManagedIntakeGeneration(unmappableResponse)
check(unmappableGeneration.extractedFields.total === 6,
  'an unmappable channel is still a field the model populated, so it stays in the denominator')
check(unmappableGeneration.extractedFields.populated.includes('channel'),
  'and it is a capture-scope field, so it reaches the narrowing step')
const unmappableProposed = await buildManagedChannelOrderDraft({
  catalogSkus: CATALOG,
  fallbackChannel: '',
  message: WIDE_MESSAGE,
  response: unmappableResponse,
  sourceLabel: SOURCE_LABEL,
})
check(unmappableProposed.channel === null,
  'the client dropped the value it could not translate, exactly as managedChannels is written')
check(unmappableProposed.blockers.includes('channel_invalid'), 'so the operator is forced to choose one')
const unmappableRecord = buildOrderIntakeEvidenceRecord({
  generation: unmappableGeneration,
  proposed: unmappableProposed,
  accepted: acceptWide(),
  acceptedAt: ACCEPTED_AT,
  actor: ACTOR,
  scope: SCOPE,
})
check(!unmappableRecord.fieldsExtracted.includes('channel'),
  'a value that never reached the operator is not scored as reviewed')
check(unmappableRecord.fieldsCorrected.length === 0,
  `so picking one from the dropdown is not a correction, got "${unmappableRecord.fieldsCorrected.join(',')}"`)
check(unmappableRecord.totalExtractedFields === 6,
  'while the denominator still counts all six the model populated')

// --- a proposal that populated NOTHING has no correction_effort ------------------------------
// correction_effort = fields_corrected / total_extracted_fields is NaN at a denominator of zero.
// Stored, one such record turns an evaluation average into NaN, or -- if the evaluator sums
// numerators and denominators instead -- reads as a flawless extraction of a message the model in
// fact failed on completely. There is no observation here, so there is no record.
const emptyResponse = await buildWideResponse({
  scope: 'not_an_order',
  status: 'needs_clarification',
  customer_reference: null,
  channel: null,
  sku: null,
  quantity: null,
  payment: null,
  fulfilment: null,
  missing_fields: ['customer_reference', 'channel', 'sku', 'quantity', 'payment', 'fulfilment'],
  blockers: ['not_an_order'],
  provenance: [],
})
const emptyGeneration = readManagedIntakeGeneration(emptyResponse)
check(emptyGeneration.extractedFields.total === 0, 'the model populated nothing at all')
const emptyProposed = await buildManagedChannelOrderDraft({
  catalogSkus: CATALOG,
  fallbackChannel: 'Viber',
  message: WIDE_MESSAGE,
  response: emptyResponse,
  sourceLabel: SOURCE_LABEL,
})
const fullyManual = acceptWide()
check(channelOrderDraftIsReady(fullyManual), 'the operator typed the whole order in by hand')
check(buildOrderIntakeEvidenceRecord({
  generation: emptyGeneration, proposed: emptyProposed, accepted: fullyManual, acceptedAt: ACCEPTED_AT, actor: ACTOR, scope: SCOPE,
}) === null, 'and a zero denominator produces no record rather than a NaN correction_effort')
const zeroStorage = makeStorage()
check(captureOrderIntakeCorrection(zeroStorage, {
  generation: emptyGeneration, proposed: emptyProposed, accepted: fullyManual, acceptedAt: ACCEPTED_AT, actor: ACTOR, scope: SCOPE,
}) === null && zeroStorage.raw() === '', 'the capture entry point writes nothing for it either')
const zeroDenominator = makeStorage({
  [SCOPED_KEY]: JSON.stringify({
    contract: ORDER_INTAKE_EVIDENCE_STATE_CONTRACT,
    version: 2,
    records: [{ ...written, fieldsExtracted: [], fieldsCorrected: [], correctionCount: 0, totalExtractedFields: 0 }],
  }),
})
check(readOrderIntakeEvidence(zeroDenominator, SCOPE).length === 0,
  'and one hand-written into storage is refused on read')

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
  generation, proposed, accepted: leakAccepted, acceptedAt: ACCEPTED_AT, actor: ACTOR, scope: SCOPE,
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
// The operator identity is the one NEW thing the record carries, so it gets its own leak check:
// it must be the opaque managed userId and must not have smuggled a person's name in beside it.
check(leakRecord.actor === ACTOR, 'the named operator is stored as the opaque managed userId')
check(!/@/.test(serialized), 'no email address reaches storage alongside the operator identity')

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
  buildOrderIntakeEvidenceRecord({ generation, proposed, accepted: otherMessage, acceptedAt: ACCEPTED_AT, actor: ACTOR }) === null,
  'a proposal and an acceptance for DIFFERENT messages produce no record',
)
check(
  buildOrderIntakeEvidenceRecord({ generation, proposed: null, accepted: corrected, acceptedAt: ACCEPTED_AT, actor: ACTOR }) === null,
  'a manual draft with no AI proposal produces no record',
)
check(
  buildOrderIntakeEvidenceRecord({ generation: null, proposed, accepted: corrected, acceptedAt: ACCEPTED_AT, actor: ACTOR }) === null,
  'a proposal with no generation metadata produces no record',
)
check(
  buildOrderIntakeEvidenceRecord({ generation, proposed, accepted: corrected, acceptedAt: new Date('nope'), actor: ACTOR }) === null,
  'an invalid acceptance time produces no record',
)

// --- section 9 measures a NAMED operator -------------------------------------
// "fields_corrected is the number of ... fields a named operator changed during the review of the
// draft." An anonymous edit is not that observation, and a record that looked like one would be
// averaged into the correction-effort metric as if a person had signed for it.
for (const [label, actor] of [
  ['an empty operator', ''],
  ['a whitespace-only operator', '   '],
  ['a missing operator', undefined],
  ['a non-string operator', 12345],
  ['an operator name longer than the 80-character bound', 'x'.repeat(81)],
]) {
  check(
    buildOrderIntakeEvidenceRecord({ generation, proposed, accepted: corrected, acceptedAt: ACCEPTED_AT, actor }) === null,
    `${label} produces no record -- an unsigned correction is not a section 9 observation`,
  )
}
const unsignedStorage = makeStorage()
check(captureOrderIntakeCorrection(unsignedStorage, {
  generation, proposed, accepted: corrected, acceptedAt: ACCEPTED_AT, actor: '', scope: SCOPE,
}) === null, 'and the capture entry point writes nothing for it')
check(unsignedStorage.raw() === '', 'storage is untouched, not written with a nameless record')
const strippedActor = makeStorage({
  [SCOPED_KEY]: JSON.stringify({
    contract: ORDER_INTAKE_EVIDENCE_STATE_CONTRACT,
    version: 2,
    records: [{ ...written, actor: '' }],
  }),
})
check(readOrderIntakeEvidence(strippedActor, SCOPE).length === 0,
  'a stored record whose operator name was stripped is refused on read too')

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
    actor: ACTOR,
    scope: SCOPE,
  })
}
const capped = readOrderIntakeEvidence(cappedStorage, SCOPE)
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
  ['a wrong version', JSON.stringify({ contract: ORDER_INTAKE_EVIDENCE_STATE_CONTRACT, version: 9, records: [] })],
  ['records that are not an array', JSON.stringify({ contract: ORDER_INTAKE_EVIDENCE_STATE_CONTRACT, version: 2, records: 'x' })],
]) {
  const hostile = makeStorage({ [SCOPED_KEY]: raw })
  check(readOrderIntakeEvidence(hostile, SCOPE).length === 0, `stored state with ${label} reads back empty rather than throwing`)
}
// A record whose counts disagree with its field list is rejected: correctionCount is the number
// downstream analysis would trust, so it must not be assertable independently of the names.
const inconsistent = makeStorage({
  [SCOPED_KEY]: JSON.stringify({
    contract: ORDER_INTAKE_EVIDENCE_STATE_CONTRACT,
    version: 2,
    records: [{ ...written, correctionCount: 4 }],
  }),
})
check(readOrderIntakeEvidence(inconsistent, SCOPE).length === 0,
  'a record claiming more corrections than it names is rejected')
// Section 9's ratio is only meaningful while its numerator sits inside its denominator. Both ways
// out of range are refused rather than averaged into a correction-effort figure.
const outOfScope = makeStorage({
  [SCOPED_KEY]: JSON.stringify({
    contract: ORDER_INTAKE_EVIDENCE_STATE_CONTRACT,
    version: 2,
    records: [{ ...written, fieldsCorrected: ['channel'], correctionCount: 1 }],
  }),
})
check(readOrderIntakeEvidence(outOfScope, SCOPE).length === 0,
  'a record claiming a correction to a field the model never populated is rejected')
const oversizedDenominator = makeStorage({
  [SCOPED_KEY]: JSON.stringify({
    contract: ORDER_INTAKE_EVIDENCE_STATE_CONTRACT,
    version: 2,
    records: [{ ...written, totalExtractedFields: 7 }],
  }),
})
check(readOrderIntakeEvidence(oversizedDenominator, SCOPE).length === 0,
  'and a denominator larger than the managed contract has fields is rejected')
const shrunkDenominator = makeStorage({
  [SCOPED_KEY]: JSON.stringify({
    contract: ORDER_INTAKE_EVIDENCE_STATE_CONTRACT,
    version: 2,
    records: [{ ...written, totalExtractedFields: 2 }],
  }),
})
check(readOrderIntakeEvidence(shrunkDenominator, SCOPE).length === 0,
  'as is a denominator smaller than the fields the same record says were extracted')
const smuggled = makeStorage({
  [SCOPED_KEY]: JSON.stringify({
    contract: ORDER_INTAKE_EVIDENCE_STATE_CONTRACT,
    version: 2,
    records: [{ ...written, rawMessageIncluded: true }],
  }),
})
check(readOrderIntakeEvidence(smuggled, SCOPE).length === 0,
  'a record that admits to carrying raw message text is refused on read')
check(appendOrderIntakeEvidence(makeStorage(), { schema: 'wrong' }, SCOPE).length === 0,
  'appending a malformed record writes nothing')

// --- the storage key is registered -------------------------------------------
// An unregistered key is not erased by "Reset this device". Asserted here as well as in
// workspace:storage:verify so the failure names THIS feature.
check(ORDER_INTAKE_EVIDENCE_STORAGE_KEY === 'supermega.shop.order-intake-evidence.v2',
  'the key family follows the supermega.<domain>.<name>.v<n> convention')
check(isLocalWorkspaceKey(SCOPED_KEY),
  'and a scoped key is registered in local-workspace-storage.ts, so a device reset reaches it')
check(isLocalWorkspaceKey(ORDER_INTAKE_EVIDENCE_LEGACY_STORAGE_KEY),
  'the superseded v1 key stays registered too, so a device still holding one has it erased')
check(SCOPED_KEY === `${ORDER_INTAKE_EVIDENCE_STORAGE_KEY}.managed%3Aws-9f21c7d4`,
  `the scope is encoded into the key, got "${SCOPED_KEY}"`)
check(orderIntakeEvidenceScopeForWorkspace(null) === 'local' && orderIntakeEvidenceScopeForWorkspace(undefined) === 'local',
  'a device-local workspace gets the "local" scope, matching shopLoyaltyScopeForWorkspace')
for (const bad of ['', '   ', 'x'.repeat(161)]) {
  assert.throws(() => orderIntakeEvidenceStorageKey(bad), 'an unusable scope throws rather than writing to a truncated key')
  checks += 1
}
// Two workspaces on one browser profile do not pool their records -- which is what makes recording
// the operator identity safe in the first place.
const sharedDevice = makeStorage()
captureOrderIntakeCorrection(sharedDevice, {
  generation, proposed, accepted: corrected, acceptedAt: ACCEPTED_AT, actor: ACTOR, scope: SCOPE,
})
const otherScope = orderIntakeEvidenceScopeForWorkspace('ws-other')
captureOrderIntakeCorrection(sharedDevice, {
  generation, proposed, accepted: untouched, acceptedAt: ACCEPTED_AT, actor: 'other-operator', scope: otherScope,
})
check(sharedDevice.keys().length === 2, 'two workspaces write to two separate keys on the same device')
check(readOrderIntakeEvidence(sharedDevice, SCOPE).length === 1,
  'and each scope reads back only its own records')
check(!sharedDevice.getItem(SCOPED_KEY).includes('other-operator'),
  'so one company never holds the other company operator IDs')

// --- the capture scope is its own list, deliberately ------------------------
// Widening channelOrderFields to serve section 9 would have demanded an exact message quote for a
// channel the operator picks from a dropdown and broken channelOrderDraftIsReady's one-provenance-
// entry-per-field rule for every existing draft. The capture scope is a separate constant instead.
check(channelOrderCaptureFields.join(',') === 'customer,channel,sku,quantity,payment',
  `the capture scope is the five reviewable fields, got "${channelOrderCaptureFields.join(',')}"`)
check(channelOrderFields.join(',') === 'customer,sku,quantity,payment',
  'and channelOrderFields is untouched, so quote attribution and draft readiness are unchanged')

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
//   5. reverting the denominator to channelOrderFields -> "all six managed fields count toward
//      the denominator, got 4"
//   6. crediting the model with a channel the operator's form supplied, which is what any
//      denominator read off the proposed DRAFT rather than the managed response would do
//      -> "the base fixture populated four of the six managed fields"
//   7. dropping the required actor                     -> "an empty operator produces no record"
//   8. skipping the reached-the-draft narrowing in buildOrderIntakeEvidenceRecord
//      -> "a value that never reached the operator is not scored as reviewed"
//   9. dropping the zero-denominator guard             -> "a zero denominator produces no record
//      rather than a NaN correction_effort"
//  10. reverting the storage key to a single device-wide one -> "a scoped key is registered in
//      local-workspace-storage.ts, so a device reset reaches it" (the registration check fires
//      first; "two workspaces write to two separate keys on the same device" catches it too)

console.log(`order intake correction capture contract: ${checks} checks passed`)
