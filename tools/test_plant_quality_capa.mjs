// Contract guard for the Plant quality CAPA system:
// buildProductionQualityCorrectiveAction, resolveProductionIssue with quality CAPA,
// recurrence detection, and recurrence-key Unicode normalization.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export {
      createSeedProduction,
      openProductionIssue,
      resolveProductionIssue,
      buildProductionQualityCorrectiveAction,
      isCapaEffectivenessOverdue,
      productionQualityCauseCategories,
      PRODUCTION_QUALITY_CAPA_SCHEMA,
    } from './production-workspace.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/quality-capa-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  createSeedProduction,
  openProductionIssue,
  resolveProductionIssue,
  buildProductionQualityCorrectiveAction,
  isCapaEffectivenessOverdue,
  productionQualityCauseCategories,
  PRODUCTION_QUALITY_CAPA_SCHEMA,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const seed = createSeedProduction()

let seqId = 0
function nextId() { return `TEST-${String(++seqId).padStart(4, '0')}` }

function proof(overrides = {}) {
  return {
    actionId: nextId(),
    capturedAt: '2026-08-11T08:00:00.000Z',
    actor: 'Quality Inspector',
    reason: 'Defect found during final inspection',
    evidenceReference: `QC-${seqId}`,
    ...overrides,
  }
}

function makeQualityIssue(id, kind = 'quality', extra = {}) {
  return {
    id,
    createdAt: '2026-08-11T07:00:00.000Z',
    area: 'Assembly Line A',
    kind,
    summary: 'Surface crack found on finished product',
    status: 'open',
    severity: 'high',
    owner: 'QC Lead',
    dueAt: '2026-08-12T07:00:00.000Z',
    containment: 'Batch isolated and tagged for review',
    ...extra,
  }
}

function capInput(overrides = {}) {
  return {
    failureMode: 'Surface crack on weld joint',
    causeCategory: 'machine',
    rootCause: 'Weld temperature calibration drift over 30-day period',
    correctiveAction: 'Recalibrate welding machine; verify with calibrated gauge',
    verificationResult: 'Post-calibration check passes; 10 units inspected clean',
    effectivenessOwner: 'Maintenance Lead',
    effectivenessDue: '2026-09-10T08:00:00.000Z',
    ...overrides,
  }
}

// Helper: open a quality issue on the seed state
function withIssue(state, issue, p = null) {
  return openProductionIssue(state, issue, p ?? proof())
}

// 1. CAPA schema constant is correct
check(PRODUCTION_QUALITY_CAPA_SCHEMA === 'supermega.production.quality-capa.v1', 'CAPA schema constant value')

// 2. Six recognized cause categories
check(productionQualityCauseCategories.length === 6, 'six cause categories')
for (const cat of ['material', 'method', 'machine', 'measurement', 'people', 'environment']) {
  check(productionQualityCauseCategories.includes(cat), `cause category ${cat} is recognized`)
}

// 3. buildProductionQualityCorrectiveAction returns null for missing issue
check(buildProductionQualityCorrectiveAction(seed, 'no-such-issue', capInput()) === null, 'null for missing issue id')

// 4. Returns null for non-quality kind
const opsIssue = makeQualityIssue('OPS-001', 'operations')
const stateWithOps = withIssue(seed, opsIssue)
check(stateWithOps !== null, 'operations issue opened')
check(buildProductionQualityCorrectiveAction(stateWithOps, 'OPS-001', capInput()) === null, 'null for non-quality kind')

// 5. Returns null for resolved issue
const qIssue1 = makeQualityIssue('Q-001')
const stateQ1 = withIssue(seed, qIssue1)
const capa1 = buildProductionQualityCorrectiveAction(stateQ1, 'Q-001', capInput())
check(capa1 !== null, 'CAPA builds for open quality issue')
const resolvedQ1 = resolveProductionIssue(stateQ1, 'Q-001', proof(), undefined, capa1)
check(resolvedQ1 !== null, 'quality issue resolves with CAPA')
check(buildProductionQualityCorrectiveAction(resolvedQ1, 'Q-001', capInput()) === null, 'null for already-resolved issue')

// 6. CAPA has correct contract field
check(capa1.contract === PRODUCTION_QUALITY_CAPA_SCHEMA, 'CAPA contract field matches schema constant')

// 7. CAPA recurrenceKey follows causeCategory:token pattern
check(typeof capa1.recurrenceKey === 'string', 'recurrenceKey is a string')
check(capa1.recurrenceKey.startsWith('machine:'), 'recurrenceKey starts with cause category')
check(!capa1.recurrenceKey.includes(' '), 'recurrenceKey has no spaces')

// 8. All six cause categories produce a valid CAPA
for (const cat of productionQualityCauseCategories) {
  const qIssue = makeQualityIssue(`Q-CAT-${cat}`)
  const st = withIssue(seed, qIssue)
  const c = buildProductionQualityCorrectiveAction(st, `Q-CAT-${cat}`, capInput({ causeCategory: cat }))
  check(c !== null, `CAPA builds for cause category ${cat}`)
  check(c.recurrenceKey.startsWith(`${cat}:`), `recurrenceKey starts with ${cat}: for cause category ${cat}`)
}

// 9. Invalid cause category returns null
const qIssueInvalid = makeQualityIssue('Q-BAD-CAT')
const stInvalid = withIssue(seed, qIssueInvalid)
check(buildProductionQualityCorrectiveAction(stInvalid, 'Q-BAD-CAT', capInput({ causeCategory: 'human' })) === null, 'null for invalid cause category')

// 10. Empty failureMode returns null
const qIssueEmpty = makeQualityIssue('Q-EMPTY-FM')
const stEmpty = withIssue(seed, qIssueEmpty)
check(buildProductionQualityCorrectiveAction(stEmpty, 'Q-EMPTY-FM', capInput({ failureMode: '' })) === null, 'null for empty failureMode')

// 11. Whitespace-only failureMode returns null
check(buildProductionQualityCorrectiveAction(stEmpty, 'Q-EMPTY-FM', capInput({ failureMode: '   ' })) === null, 'null for whitespace-only failureMode')

// 12. Too-long failureMode returns null (> 120 chars)
check(
  buildProductionQualityCorrectiveAction(stEmpty, 'Q-EMPTY-FM', capInput({ failureMode: 'a'.repeat(121) })) === null,
  'null for failureMode exceeding 120 chars',
)

// 13. CAPA stores all provided fields
check(capa1.failureMode === 'Surface crack on weld joint', 'failureMode stored')
check(capa1.causeCategory === 'machine', 'causeCategory stored')
check(typeof capa1.rootCause === 'string' && capa1.rootCause.length > 0, 'rootCause stored')
check(typeof capa1.correctiveAction === 'string' && capa1.correctiveAction.length > 0, 'correctiveAction stored')
check(typeof capa1.effectivenessOwner === 'string' && capa1.effectivenessOwner.length > 0, 'effectivenessOwner stored')
check(capa1.effectivenessDue === '2026-09-10T08:00:00.000Z', 'effectivenessDue stored')

// 14. resolveProductionIssue with CAPA advances revision once
check(resolvedQ1.revision === stateQ1.revision + 1, 'resolve with CAPA advances revision once')

// 15. Resolved issue status is 'resolved'
const resolvedIssue = resolvedQ1.issues.find((i) => i.id === 'Q-001')
check(resolvedIssue !== undefined, 'resolved issue found in state')
check(resolvedIssue.status === 'resolved', 'resolved issue status is resolved')

// 16. Resolved issue carries qualityCorrectiveAction in resolution
check(resolvedIssue.resolution?.qualityCorrectiveAction !== undefined, 'resolution has qualityCorrectiveAction')
check(resolvedIssue.resolution.qualityCorrectiveAction.contract === PRODUCTION_QUALITY_CAPA_SCHEMA, 'CAPA in resolution has correct contract')

// 17. Actionable quality issue cannot resolve WITHOUT CAPA
const qIssue2 = makeQualityIssue('Q-002')
const stateQ2 = withIssue(seed, qIssue2)
check(resolveProductionIssue(stateQ2, 'Q-002', proof()) === null, 'actionable quality issue cannot resolve without CAPA')

// 18. Non-quality issue resolves without CAPA (operations kind)
const opsIssue2 = makeQualityIssue('OPS-002', 'operations')
const stOps2 = withIssue(seed, opsIssue2)
check(stOps2 !== null, 'operations issue with all fields opened successfully')
const resolvedOps = resolveProductionIssue(stOps2, 'OPS-002', proof())
check(resolvedOps !== null, 'operations issue resolves without CAPA')

// 19. Quality issue cannot resolve with maintenance CAPA (wrong type)
const qIssue3 = makeQualityIssue('Q-003')
const stateQ3 = withIssue(seed, qIssue3)
const fakeMaintCapa = { contract: 'wrong', notes: 'some notes', completedBy: 'someone', toolsRequired: '' }
check(resolveProductionIssue(stateQ3, 'Q-003', proof(), fakeMaintCapa) === null, 'quality issue rejects maintenance CAPA')

// 20. Both CAPA types cannot be provided simultaneously
const qIssue4 = makeQualityIssue('Q-004')
const stateQ4 = withIssue(seed, qIssue4)
const capa4 = buildProductionQualityCorrectiveAction(stateQ4, 'Q-004', capInput())
check(resolveProductionIssue(stateQ4, 'Q-004', proof(), { contract: 'something' }, capa4) === null, 'cannot provide both CAPA types')

// 21. Idempotency: replaying the same resolve proof returns the same state
const qIssue5 = makeQualityIssue('Q-005')
const stateQ5 = withIssue(seed, qIssue5)
const capa5 = buildProductionQualityCorrectiveAction(stateQ5, 'Q-005', capInput())
const p5 = proof()
const resolved5 = resolveProductionIssue(stateQ5, 'Q-005', p5, undefined, capa5)
check(resolved5 !== null, 'first resolve succeeds')
const replayed5 = resolveProductionIssue(resolved5, 'Q-005', p5, undefined, capa5)
check(replayed5 === resolved5, 'replaying identical resolve returns same state object')

// 22. Recurrence: priorIssueIds is empty when no prior issues
const capa6 = buildProductionQualityCorrectiveAction(stateQ1, 'Q-001', capInput())
check(Array.isArray(capa6.priorIssueIds), 'priorIssueIds is an array')
check(capa6.priorIssueIds.length === 0, 'priorIssueIds is empty on first occurrence')

// 23. Recurrence detection: priorIssueIds populated for same recurrenceKey
const qIssue7 = makeQualityIssue('Q-007')
const stateQ7 = withIssue(resolvedQ1, qIssue7)  // seed already has Q-001 resolved
const capa7 = buildProductionQualityCorrectiveAction(stateQ7, 'Q-007', capInput())
check(capa7 !== null, 'CAPA builds after prior issue exists')
check(capa7.priorIssueIds.includes('Q-001'), 'prior resolved issue with same recurrenceKey appears in priorIssueIds')

// 24. Recurrence detection: different failure mode means different recurrenceKey = no prior link
const qIssue8 = makeQualityIssue('Q-008')
const stateQ8 = withIssue(resolvedQ1, qIssue8)
const capaDifferent = buildProductionQualityCorrectiveAction(stateQ8, 'Q-008', capInput({ failureMode: 'Paint adhesion failure on outer coat' }))
check(capaDifferent !== null, 'CAPA builds for different failure mode')
check(!capaDifferent.priorIssueIds.includes('Q-001'), 'different failure mode does not link to prior issue with different key')

// 25. Recurrence detection: unresolved issues are not linked
const qIssue9 = makeQualityIssue('Q-009')
const stateQ9 = withIssue(stateQ1, qIssue9)  // Q-001 is still open here
const capa9 = buildProductionQualityCorrectiveAction(stateQ9, 'Q-009', capInput())
check(!capa9.priorIssueIds.includes('Q-001'), 'open (unresolved) issue is not in priorIssueIds')

// 26. Recurrence key normalization: Unicode lowercase
{
  const qUni = makeQualityIssue('Q-UNI')
  const stUni = withIssue(seed, qUni)
  const cLower = buildProductionQualityCorrectiveAction(stUni, 'Q-UNI', capInput({ failureMode: 'Surface Crack On Weld Joint' }))
  const cMixed = buildProductionQualityCorrectiveAction(stUni, 'Q-UNI', capInput({ failureMode: 'SURFACE CRACK ON WELD JOINT' }))
  check(cLower !== null && cMixed !== null, 'different-case failure modes both build CAPAs')
  check(cLower.recurrenceKey === cMixed.recurrenceKey, 'different-case failure modes produce same recurrenceKey after normalization')
}

// 27. Recurrence key normalization: punctuation stripped
{
  const qPunct = makeQualityIssue('Q-PUNCT')
  const stPunct = withIssue(seed, qPunct)
  const cPunct = buildProductionQualityCorrectiveAction(stPunct, 'Q-PUNCT', capInput({ failureMode: 'Surface-crack/on+weld.joint!' }))
  const cPlain = buildProductionQualityCorrectiveAction(stPunct, 'Q-PUNCT', capInput({ failureMode: 'Surface crack on weld joint' }))
  check(cPunct !== null && cPlain !== null, 'punctuated and plain failure modes both build CAPAs')
  check(cPunct.recurrenceKey === cPlain.recurrenceKey, 'punctuation in failure mode does not change recurrenceKey')
}

// 28. priorIssueIds rejects mismatched value on resolve
{
  const qIssueR = makeQualityIssue('Q-MISMATCH')
  const stR = withIssue(resolvedQ1, qIssueR)
  const capaR = buildProductionQualityCorrectiveAction(stR, 'Q-MISMATCH', capInput())
  const tampered = { ...capaR, priorIssueIds: [] }
  check(resolveProductionIssue(stR, 'Q-MISMATCH', proof(), undefined, tampered) === null, 'tampered priorIssueIds is rejected on resolve')
}

// 29. Issue event trail: issue_opened and issue_resolved events are both retained
const resolvedIssueEvents = resolvedQ1.events.filter((e) => e.subjectId === 'Q-001')
check(resolvedIssueEvents.some((e) => e.kind === 'issue_opened'), 'issue_opened event retained after resolve')
check(resolvedIssueEvents.some((e) => e.kind === 'issue_resolved'), 'issue_resolved event present after resolve')

// 30. Original state is not mutated by resolve
const qIssueM = makeQualityIssue('Q-MUT')
const stMut = withIssue(seed, qIssueM)
const capaMut = buildProductionQualityCorrectiveAction(stMut, 'Q-MUT', capInput())
const revisionBefore = stMut.revision
resolveProductionIssue(stMut, 'Q-MUT', proof(), undefined, capaMut)
check(stMut.revision === revisionBefore, 'original state is not mutated by resolveProductionIssue')

// 31. Missing effectivenessDue returns null
{
  const qEd = makeQualityIssue('Q-ED-MISSING')
  const stEd = withIssue(seed, qEd)
  check(buildProductionQualityCorrectiveAction(stEd, 'Q-ED-MISSING', capInput({ effectivenessDue: undefined })) === null, 'null when effectivenessDue is missing')
}

// 32. Date-only effectivenessDue (not a full ISO timestamp) returns null
{
  const qEdDate = makeQualityIssue('Q-ED-DATE')
  const stEdDate = withIssue(seed, qEdDate)
  check(buildProductionQualityCorrectiveAction(stEdDate, 'Q-ED-DATE', capInput({ effectivenessDue: '2026-09-10' })) === null, 'null for date-only effectivenessDue')
}

// 33. isCapaEffectivenessOverdue: returns true when asOf is after effectivenessDue
{
  const qOd = makeQualityIssue('Q-OD')
  const stOd = withIssue(seed, qOd)
  const capaOd = buildProductionQualityCorrectiveAction(stOd, 'Q-OD', capInput({ effectivenessDue: '2026-09-10T08:00:00.000Z' }))
  check(capaOd !== null, 'CAPA built for overdue test')
  check(isCapaEffectivenessOverdue(capaOd, '2026-09-11T00:00:00.000Z') === true, 'overdue when asOf is after effectivenessDue')
}

// 34. isCapaEffectivenessOverdue: returns false when asOf is before effectivenessDue
{
  const qOdNot = makeQualityIssue('Q-OD-NOT')
  const stOdNot = withIssue(seed, qOdNot)
  const capaOdNot = buildProductionQualityCorrectiveAction(stOdNot, 'Q-OD-NOT', capInput({ effectivenessDue: '2026-09-10T08:00:00.000Z' }))
  check(capaOdNot !== null, 'CAPA built for not-overdue test')
  check(isCapaEffectivenessOverdue(capaOdNot, '2026-08-11T08:00:00.000Z') === false, 'not overdue when asOf is before effectivenessDue')
}

console.log(`\ntest_plant_quality_capa: ${checks} checks passed\n`)
