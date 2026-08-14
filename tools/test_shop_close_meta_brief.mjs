// Shop close meta brief: CommerceClose.reason? and evidenceReference? coverage.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectShopCloseMetaBrief } from './shop-close-meta-brief.ts'`,
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

const { projectShopCloseMetaBrief } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const SCHEMA = 'supermega.commerce.workspace.v2'

let closeId = 0
function close({ reason, evidenceReference } = {}) {
  closeId++
  const base = {
    id: `CLS-${closeId}`,
    createdAt: `2026-08-${String(closeId).padStart(2, '0')}T09:00:00Z`,
    total: 1000,
    orders: 1,
  }
  if (reason !== undefined) base.reason = reason
  if (evidenceReference !== undefined) base.evidenceReference = evidenceReference
  return base
}

function state(closes = []) {
  return { schema: SCHEMA, items: [], orders: [], movements: [], closes }
}

// 1. Empty closes → all zeros
{
  const r = projectShopCloseMetaBrief(state([]))
  check(r.totalCloses === 0, 'empty: totalCloses 0')
  check(r.closesWithReason === 0, 'empty: closesWithReason 0')
  check(r.closesWithoutReason === 0, 'empty: closesWithoutReason 0')
  check(r.reasonRate === 0, 'empty: reasonRate 0')
  check(r.topReasonsByCount.length === 0, 'empty: topReasonsByCount empty')
  check(r.closesWithEvidence === 0, 'empty: closesWithEvidence 0')
  check(r.closesWithoutEvidence === 0, 'empty: closesWithoutEvidence 0')
  check(r.evidenceRate === 0, 'empty: evidenceRate 0')
}

// 2. Single close with no optional fields
{
  const r = projectShopCloseMetaBrief(state([close()]))
  check(r.totalCloses === 1, 'no-optional: totalCloses 1')
  check(r.closesWithReason === 0, 'no-optional: closesWithReason 0')
  check(r.closesWithoutReason === 1, 'no-optional: closesWithoutReason 1')
  check(r.reasonRate === 0, 'no-optional: reasonRate 0')
  check(r.closesWithEvidence === 0, 'no-optional: closesWithEvidence 0')
  check(r.closesWithoutEvidence === 1, 'no-optional: closesWithoutEvidence 1')
  check(r.evidenceRate === 0, 'no-optional: evidenceRate 0')
}

// 3. Single close with reason only
{
  const r = projectShopCloseMetaBrief(state([close({ reason: 'early shift end' })]))
  check(r.closesWithReason === 1, 'reason-only: closesWithReason 1')
  check(r.closesWithoutReason === 0, 'reason-only: closesWithoutReason 0')
  check(r.reasonRate === 100, 'reason-only: reasonRate 100')
  check(r.topReasonsByCount[0].reason === 'early shift end', 'reason-only: top reason')
  check(r.topReasonsByCount[0].count === 1, 'reason-only: count 1')
  check(r.closesWithEvidence === 0, 'reason-only: no evidence')
}

// 4. Single close with evidenceReference only
{
  const r = projectShopCloseMetaBrief(state([close({ evidenceReference: 'EVD-001' })]))
  check(r.closesWithEvidence === 1, 'evidence-only: closesWithEvidence 1')
  check(r.closesWithoutEvidence === 0, 'evidence-only: closesWithoutEvidence 0')
  check(r.evidenceRate === 100, 'evidence-only: evidenceRate 100')
  check(r.closesWithReason === 0, 'evidence-only: no reason')
}

// 5. Mixed closes: reason and evidence independence
{
  const r = projectShopCloseMetaBrief(state([
    close({ reason: 'early shift end', evidenceReference: 'EVD-001' }),
    close({ reason: 'early shift end' }),
    close({ evidenceReference: 'EVD-002' }),
    close(),
  ]))
  check(r.totalCloses === 4, 'mixed: totalCloses 4')
  check(r.closesWithReason === 2, 'mixed: closesWithReason 2')
  check(r.closesWithoutReason === 2, 'mixed: closesWithoutReason 2')
  check(r.reasonRate === 50, 'mixed: reasonRate 50')
  check(r.closesWithEvidence === 2, 'mixed: closesWithEvidence 2')
  check(r.closesWithoutEvidence === 2, 'mixed: closesWithoutEvidence 2')
  check(r.evidenceRate === 50, 'mixed: evidenceRate 50')
  check(r.topReasonsByCount[0].reason === 'early shift end', 'mixed: top reason early shift end')
  check(r.topReasonsByCount[0].count === 2, 'mixed: top reason count 2')
}

// 6. Top reason ordering: most frequent first
{
  const r = projectShopCloseMetaBrief(state([
    close({ reason: 'A' }), close({ reason: 'B' }), close({ reason: 'A' }),
    close({ reason: 'C' }), close({ reason: 'A' }), close({ reason: 'B' }),
  ]))
  check(r.topReasonsByCount[0].reason === 'A', 'top-sort: A first')
  check(r.topReasonsByCount[0].count === 3, 'top-sort: A count 3')
  check(r.topReasonsByCount[1].reason === 'B', 'top-sort: B second')
  check(r.topReasonsByCount[1].count === 2, 'top-sort: B count 2')
}

// 7. Rounding: 1 of 3 has reason → 33%
{
  const r = projectShopCloseMetaBrief(state([
    close({ reason: 'X' }), close(), close(),
  ]))
  check(r.reasonRate === 33, 'rounding: reasonRate 33')
}

// 8. Rounding: 2 of 3 have evidence → 67%
{
  const r = projectShopCloseMetaBrief(state([
    close({ evidenceReference: 'E1' }), close({ evidenceReference: 'E2' }), close(),
  ]))
  check(r.evidenceRate === 67, 'rounding: evidenceRate 67')
}

console.log(JSON.stringify({ ok: true, checks }))
