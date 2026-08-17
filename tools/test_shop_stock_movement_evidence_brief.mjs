// Shop stock movement evidence brief: evidenceReference distribution + conversionNote rate.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopStockMovementEvidenceBrief } from './shop-stock-movement-evidence-brief.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectShopStockMovementEvidenceBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

let movementId = 0

function movement({ evidenceReference, conversionNote } = {}) {
  movementId++
  const base = {
    id: `MOV-${movementId}`,
    actionId: 'ACT-1',
    createdAt: '2026-08-12T09:00:00Z',
    actor: 'operator-1',
    reason: 'Sale.',
    evidenceReference: evidenceReference ?? 'EVD-DEFAULT',
    kind: 'sale',
    sku: 'SKU-1',
    quantityDelta: -1,
  }
  if (conversionNote !== undefined) base.conversionNote = conversionNote
  return base
}

function state(movements = []) {
  return { schema: SCHEMA, items: [], orders: [], movements, closes: [] }
}

// 1. Empty movements → all zeros
{
  const r = projectShopStockMovementEvidenceBrief(state([]))
  check(r.totalMovements === 0, 'empty: totalMovements 0')
  check(r.uniqueEvidenceReferences === 0, 'empty: uniqueEvidenceReferences 0')
  check(r.topEvidenceReferencesByCount.length === 0, 'empty: topEvidenceReferencesByCount empty')
  check(r.movementsWithConversionNote === 0, 'empty: movementsWithConversionNote 0')
  check(r.conversionNoteRate === 0, 'empty: conversionNoteRate 0')
}

// 2. Single movement, no conversion note
{
  const r = projectShopStockMovementEvidenceBrief(state([movement({ evidenceReference: 'EVD-001' })]))
  check(r.totalMovements === 1, 'single-no-note: totalMovements 1')
  check(r.uniqueEvidenceReferences === 1, 'single-no-note: uniqueEvidenceReferences 1')
  check(r.topEvidenceReferencesByCount[0]?.reference === 'EVD-001', 'single-no-note: top reference')
  check(r.movementsWithConversionNote === 0, 'single-no-note: movementsWithConversionNote 0')
  check(r.conversionNoteRate === 0, 'single-no-note: conversionNoteRate 0')
}

// 3. Movement with conversion note
{
  const r = projectShopStockMovementEvidenceBrief(state([
    movement({ evidenceReference: 'EVD-001', conversionNote: 'Converted from kg.' }),
  ]))
  check(r.movementsWithConversionNote === 1, 'with-note: movementsWithConversionNote 1')
  check(r.conversionNoteRate === 100, 'with-note: conversionNoteRate 100')
}

// 4. Shared evidenceReference across multiple movements
{
  const r = projectShopStockMovementEvidenceBrief(state([
    movement({ evidenceReference: 'EVD-A' }),
    movement({ evidenceReference: 'EVD-A' }),
    movement({ evidenceReference: 'EVD-B' }),
  ]))
  check(r.totalMovements === 3, 'shared-ref: totalMovements 3')
  check(r.uniqueEvidenceReferences === 2, 'shared-ref: uniqueEvidenceReferences 2')
  check(r.topEvidenceReferencesByCount[0]?.reference === 'EVD-A', 'shared-ref: top is EVD-A')
  check(r.topEvidenceReferencesByCount[0]?.count === 2, 'shared-ref: top count 2')
}

// 5. Mixed conversion notes — rate 50%
{
  const r = projectShopStockMovementEvidenceBrief(state([
    movement({ conversionNote: 'Unit note.' }),
    movement({}),
  ]))
  check(r.movementsWithConversionNote === 1, 'mixed-note: movementsWithConversionNote 1')
  check(r.conversionNoteRate === 50, 'mixed-note: conversionNoteRate 50')
}

// 6. Top-5 cap and tiebreak: 6 distinct references, each count 1
{
  const refs = ['EVD-F', 'EVD-A', 'EVD-C', 'EVD-B', 'EVD-D', 'EVD-E']
  const r = projectShopStockMovementEvidenceBrief(state(refs.map(ref => movement({ evidenceReference: ref }))))
  check(r.uniqueEvidenceReferences === 6, 'top5: uniqueEvidenceReferences 6')
  check(r.topEvidenceReferencesByCount.length === 5, 'top5: capped at 5')
  check(r.topEvidenceReferencesByCount[0]?.reference === 'EVD-A', 'top5: tiebreak alphabetic first')
}

console.log(JSON.stringify({ ok: true, checks }))
