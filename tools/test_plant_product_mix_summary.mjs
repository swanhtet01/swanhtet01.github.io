// Plant product mix analytics: analyzes production by product across job records.
// Tests: empty state, single/multi-product, closed/open/hold job classification,
// output-only-for-closed-jobs, scrap accumulation, quality rate, completion rate,
// topProductsByOutput ranking + tie-breaking, top-5 cap, absent purchaseOrders guard.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `export { projectPlantProductMixSummary } from './plant-product-mix-summary.ts'`,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/mix-test-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const { projectPlantProductMixSummary } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`
)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

function job({ product, target, output = 0, scrap, qualityHold, closure }) {
  return {
    id: `j-${Math.random().toString(36).slice(2)}`,
    line: 'L1',
    product,
    target,
    output,
    ...(scrap !== undefined ? { scrap } : {}),
    ...(qualityHold !== undefined ? { qualityHold } : {}),
    ...(closure !== undefined ? { closure } : {}),
  }
}

const CLOSED = { closedAt: '2026-08-01T00:00:00Z', operator: 'op1' }
const HOLD = { heldAt: '2026-08-01T00:00:00Z', reason: 'defect' }

// 1. Empty jobs list
{
  const r = projectPlantProductMixSummary({ jobs: [] })
  check(r.totalDistinctProducts === 0, 'empty: totalDistinctProducts = 0')
  check(Object.keys(r.byProduct).length === 0, 'empty: byProduct is empty')
  check(r.topProductsByOutput.length === 0, 'empty: topProductsByOutput is empty')
}

// 2. Single closed job
{
  const r = projectPlantProductMixSummary({
    jobs: [job({ product: 'Widget-A', target: 100, output: 90, scrap: 5, closure: CLOSED })],
  })
  check(r.totalDistinctProducts === 1, 'single job: totalDistinctProducts = 1')
  const s = r.byProduct['Widget-A']
  check(s !== undefined, 'single job: Widget-A exists in byProduct')
  check(s.totalJobs === 1, 'single job: totalJobs = 1')
  check(s.closedJobs === 1, 'single job: closedJobs = 1')
  check(s.openJobs === 0, 'single job: openJobs = 0')
  check(s.onHoldJobs === 0, 'single job: onHoldJobs = 0')
  check(s.totalTarget === 100, 'single job: totalTarget = 100')
  check(s.totalOutput === 90, 'single job: totalOutput = 90 (from closed job)')
  check(s.totalScrap === 5, 'single job: totalScrap = 5')
  check(s.completionRate === 100, 'single job: completionRate = 100% (1/1 closed)')
  check(s.qualityRate === 95, 'single job: qualityRate = round(90/95*100) = 95%')
}

// 3. Open job — output not counted
{
  const r = projectPlantProductMixSummary({
    jobs: [job({ product: 'Widget-B', target: 50, output: 30 })],
  })
  const s = r.byProduct['Widget-B']
  check(s.openJobs === 1, 'open job: openJobs = 1')
  check(s.closedJobs === 0, 'open job: closedJobs = 0')
  check(s.totalOutput === 0, 'open job: output NOT counted (job is open)')
  check(s.completionRate === 0, 'open job: completionRate = 0%')
}

// 4. Quality hold job — not closed, not open, counted as onHold
{
  const r = projectPlantProductMixSummary({
    jobs: [job({ product: 'Widget-C', target: 40, output: 0, qualityHold: HOLD })],
  })
  const s = r.byProduct['Widget-C']
  check(s.onHoldJobs === 1, 'hold job: onHoldJobs = 1')
  check(s.openJobs === 0, 'hold job: openJobs = 0')
  check(s.closedJobs === 0, 'hold job: closedJobs = 0')
  check(s.totalOutput === 0, 'hold job: output not counted (not closed)')
}

// 5. Closed job with no scrap — qualityRate = 100%
{
  const r = projectPlantProductMixSummary({
    jobs: [job({ product: 'Perfect', target: 10, output: 10, closure: CLOSED })],
  })
  const s = r.byProduct['Perfect']
  check(s.qualityRate === 100, 'no scrap: qualityRate = 100%')
  check(s.totalScrap === 0, 'no scrap: totalScrap = 0')
}

// 6. Multiple jobs for same product — all fields accumulate
{
  const jobs = [
    job({ product: 'Valve', target: 100, output: 80, scrap: 10, closure: CLOSED }),
    job({ product: 'Valve', target: 50, output: 45, scrap: 5, closure: CLOSED }),
    job({ product: 'Valve', target: 60, output: 0 }),
  ]
  const r = projectPlantProductMixSummary({ jobs })
  const s = r.byProduct['Valve']
  check(s.totalJobs === 3, 'multi-job same product: totalJobs = 3')
  check(s.closedJobs === 2, 'multi-job: closedJobs = 2')
  check(s.openJobs === 1, 'multi-job: openJobs = 1')
  check(s.totalTarget === 210, 'multi-job: totalTarget = 100+50+60 = 210')
  check(s.totalOutput === 125, 'multi-job: totalOutput = 80+45 (only closed jobs)')
  check(s.totalScrap === 15, 'multi-job: totalScrap = 10+5')
  check(s.completionRate === 67, 'multi-job: completionRate = round(2/3*100) = 67%')
  // qualityRate = round(125 / (125+15) * 100) = round(125/140*100) = round(89.28) = 89
  check(s.qualityRate === 89, 'multi-job: qualityRate = round(125/140*100) = 89%')
}

// 7. Multiple distinct products
{
  const r = projectPlantProductMixSummary({
    jobs: [
      job({ product: 'A', target: 10, output: 8, closure: CLOSED }),
      job({ product: 'B', target: 20, output: 15, closure: CLOSED }),
      job({ product: 'C', target: 30, output: 0 }),
    ],
  })
  check(r.totalDistinctProducts === 3, 'multi-product: totalDistinctProducts = 3')
  check(Object.keys(r.byProduct).length === 3, 'multi-product: byProduct has 3 entries')
}

// 8. topProductsByOutput — ranked by output descending
{
  const r = projectPlantProductMixSummary({
    jobs: [
      job({ product: 'Alpha', target: 100, output: 30, closure: CLOSED }),
      job({ product: 'Beta', target: 100, output: 80, closure: CLOSED }),
      job({ product: 'Gamma', target: 100, output: 50, closure: CLOSED }),
    ],
  })
  check(r.topProductsByOutput.length === 3, 'top: 3 products ranked')
  check(r.topProductsByOutput[0].product === 'Beta', 'top[0]: Beta (80 units)')
  check(r.topProductsByOutput[1].product === 'Gamma', 'top[1]: Gamma (50 units)')
  check(r.topProductsByOutput[2].product === 'Alpha', 'top[2]: Alpha (30 units)')
}

// 9. topProductsByOutput — open jobs excluded (output=0)
{
  const r = projectPlantProductMixSummary({
    jobs: [
      job({ product: 'Open', target: 100, output: 50 }),
      job({ product: 'Closed', target: 100, output: 60, closure: CLOSED }),
    ],
  })
  const names = r.topProductsByOutput.map((x) => x.product)
  check(!names.includes('Open'), 'top: product with zero output excluded from topProductsByOutput')
  check(names.includes('Closed'), 'top: Closed product included')
  check(r.topProductsByOutput[0].output === 60, 'top: output value is 60')
}

// 10. topProductsByOutput — tie-break by product name (alphabetical)
{
  const r = projectPlantProductMixSummary({
    jobs: [
      job({ product: 'Zeta', target: 100, output: 50, closure: CLOSED }),
      job({ product: 'Alpha', target: 100, output: 50, closure: CLOSED }),
      job({ product: 'Mango', target: 100, output: 50, closure: CLOSED }),
    ],
  })
  check(r.topProductsByOutput[0].product === 'Alpha', 'tie-break: Alpha first (alphabetical)')
  check(r.topProductsByOutput[1].product === 'Mango', 'tie-break: Mango second')
  check(r.topProductsByOutput[2].product === 'Zeta', 'tie-break: Zeta last')
}

// 11. topProductsByOutput — capped at 5 even with more products
{
  const jobs = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'].map((p, i) =>
    job({ product: p, target: 10, output: 10 + i, closure: CLOSED }),
  )
  const r = projectPlantProductMixSummary({ jobs })
  check(r.topProductsByOutput.length === 5, 'top-5 cap: only 5 returned out of 7 products')
  check(r.topProductsByOutput[0].product === 'P7', 'top-5 cap: P7 has highest output (16)')
  check(r.totalDistinctProducts === 7, 'top-5 cap: totalDistinctProducts still = 7')
}

// 12. topProductsByOutput includes qualityRate per product
{
  const r = projectPlantProductMixSummary({
    jobs: [job({ product: 'Pipe', target: 10, output: 8, scrap: 2, closure: CLOSED })],
  })
  check(r.topProductsByOutput[0].qualityRate === 80, 'top: qualityRate included; 8/(8+2)*100=80%')
}

// 13. Quality rate zero-division guard (no output, no scrap, job is open)
{
  const r = projectPlantProductMixSummary({
    jobs: [job({ product: 'Nothing', target: 10, output: 0 })],
  })
  const s = r.byProduct['Nothing']
  check(s.qualityRate === 0, 'quality rate: 0 when totalProduced = 0')
}

// 14. completionRate zero-division guard (no jobs edge case — should not happen but safe)
// Test single job with completionRate rounded correctly
{
  const jobs = Array.from({ length: 3 }, (_, i) =>
    i < 1 ? job({ product: 'Bolt', target: 10, output: 8, closure: CLOSED }) : job({ product: 'Bolt', target: 10 }),
  )
  const r = projectPlantProductMixSummary({ jobs })
  check(r.byProduct['Bolt'].completionRate === 33, 'completionRate: round(1/3*100) = 33%')
}

// 15. Mixed product scenario: closed + hold + open across two products
{
  const r = projectPlantProductMixSummary({
    jobs: [
      job({ product: 'X', target: 100, output: 70, closure: CLOSED }),
      job({ product: 'X', target: 100, output: 0, qualityHold: HOLD }),
      job({ product: 'Y', target: 50, output: 0 }),
    ],
  })
  check(r.totalDistinctProducts === 2, 'mixed: 2 distinct products')
  const sx = r.byProduct['X']
  check(sx.totalJobs === 2, 'mixed X: 2 jobs')
  check(sx.closedJobs === 1, 'mixed X: 1 closed')
  check(sx.onHoldJobs === 1, 'mixed X: 1 on hold')
  check(sx.openJobs === 0, 'mixed X: 0 open')
  const names = r.topProductsByOutput.map((x) => x.product)
  check(names.includes('X'), 'mixed: X in top (has output)')
  check(!names.includes('Y'), 'mixed: Y NOT in top (no output)')
}

console.log(`Plant product mix summary: ${checks} checks passed`)
