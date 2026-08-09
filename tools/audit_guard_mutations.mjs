// Audits the guards in this branch by breaking the code they claim to protect and checking
// each one actually fails. A guard that stays green against a real defect is worse than no
// guard: it reports confidence it has not earned.
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

// Run on demand, not in app:verify: it rewrites source files (restoring from a backup in a
// finally block) and takes minutes. Every mutation below is a defect a reader would expect
// the named guard to catch.
const ROOT = process.env.SUPERMEGA_ROOT ?? process.cwd()
const COMMERCE = `${ROOT}/showroom/src/core/commerce-workspace.ts`
const LIFECYCLE = `${ROOT}/showroom/src/products/ecommerce/ecommerce-buying-lifecycle.ts`
const TEMPLATES = `${ROOT}/showroom/src/products/shop/business-templates.ts`
const ONBOARD = `${ROOT}/showroom/src/core/client-onboarding.ts`
const EXPORT = `${ROOT}/showroom/src/products/website/website-export.ts`
const CORECSS = `${ROOT}/showroom/src/core/core-app.css`
const WEBMODEL = `${ROOT}/showroom/src/products/website/website-model.ts`
const PRODWS = `${ROOT}/showroom/src/core/production-workspace.ts`

// [guard script, target file, find, replace, what defect this simulates]
const MUTATIONS = [
  ['test_commerce_tax.mjs', COMMERCE,
    'return (numerator * 2n + denominator) / (denominator * 2n)', 'return numerator / denominator',
    'tax truncates instead of rounding half-up'],
  ['test_commerce_tax.mjs', COMMERCE,
    'if (!Number.isSafeInteger(listedSubtotalMmk) || listedSubtotalMmk < 1) return null',
    'if (!Number.isSafeInteger(listedSubtotalMmk)) return null',
    'zero/negative subtotals (REDUNDANT: also refused downstream by the total < 1 check, so removing this alone -- or even both copies -- does not change behaviour; verified empirically)'],
  ['test_commerce_order_integrity.mjs', COMMERCE,
    '      || item.price !== line.unitPriceMmk', '      || false',
    'caller may name its own price'],
  ['test_commerce_order_integrity.mjs', COMMERCE,
    '    total: calculation.totalMmk,', '    total: order.total,',
    'stored total copied from caller instead of recomputed'],
  ['test_commerce_corrections.mjs', COMMERCE,
    "    if (!Number.isSafeInteger(total) || total < 0) return null",
    '    if (!Number.isSafeInteger(total)) return null',
    'refunds may exceed what was charged'],
  ['test_commerce_corrections.mjs', COMMERCE,
    '    rateBasisPoints: order.calculation.taxRateBasisPoints,', '    rateBasisPoints: 1000,',
    'correction ignores the order rate'],
  ['test_ecommerce_return_intent.mjs', LIFECYCLE,
    'if (quantity > matching[0].quantity - returned)', 'if (quantity > matching[0].quantity)',
    'prior returns stop counting (double refund)'],
  ['test_ecommerce_return_intent.mjs', LIFECYCLE,
    '|| !isRecord(order.completion)', '|| false',
    'returns allowed without completion proof'],
  ['test_ecommerce_cancellation_intent.mjs', LIFECYCLE,
    "throw new Error('Cancellation request cannot predate the Shop order.')", 'void 0',
    'cancellation may predate its order'],
  ['test_shop_business_templates.mjs', TEMPLATES,
    "['PAD-BRAKE-FR', 'Front brake pad set', 'pack', 28_000, 38_000, 10, 4]",
    "['PAD-BRAKE-FR', 'Front brake pad set', 'pack', 48_000, 38_000, 10, 4]",
    'a template item priced below its own cost'],
  ['test_shop_business_templates.mjs', TEMPLATES,
    '${csvField(item.name)}', '${item.name}',
    'template CSV stops quoting item names'],
  ['test_onboarding_samples.mjs', ONBOARD,
    'RICE-25KG,Premium rice 25kg,18,6,72000\\r\\nOIL-1L', 'RICE-25KG,Premium rice 25kg,18,6,72000\\r\\nRICE-25KG',
    'duplicate SKU in a workflow-template sample'],
  ['test_website_export.mjs', EXPORT,
    "const documentLanguage = myanmarLetters > latinLetters ? 'my' : 'en'",
    "const documentLanguage = myanmarLetters > 0 ? 'my' : 'en'",
    'lang flips on a single Myanmar codepoint'],
  ['test_theme_surface_contract.mjs', CORECSS,
    '.catalog-import-table { max-height: 340px; overflow: auto; background: var(--core-panel); }',
    '.catalog-import-table { max-height: 340px; overflow: auto; background: #fff; }',
    'a fixed light surface reverts to hardcoded white'],
  ['test_commerce_state_validator.mjs', COMMERCE,
    '        || candidate.total !== calculation.totalMmk) throw new Error(`orders[${index}].calculation totals are invalid.`)',
    '        || false) throw new Error(`orders[${index}].calculation totals are invalid.`)',
    'the backstop stops checking an order total against its own calculation'],
  ['test_commerce_purchase_receiving.mjs', COMMERCE,
    '  if (!Number.isSafeInteger(quantity + rejectedQuantity) || quantity + rejectedQuantity > progress.remaining) return null',
    '  if (!Number.isSafeInteger(quantity + rejectedQuantity)) return null',
    'a delivery larger than the outstanding purchase-order quantity is accepted'],
  ['test_commerce_daily_close.mjs', COMMERCE,
    '      && !previouslyClosedOrderIds.has(order.id))', '      && true)',
    'an already-closed order is eligible for a second close'],
  ['test_ecommerce_correction_support.mjs', LIFECYCLE,
    "    || order.paymentStatus !== 'reconciled'", '    || false',
    'a correction runs against an unreconciled order'],
  ['test_plant_industry_packs.mjs', ONBOARD,
    'planningDateAfter(resolvedPlanningDate, 14)', 'planningDateAfter(resolvedPlanningDate, -14)',
    'plant sample due dates drift into the past'],
  // NOTE: '|| job.qualityHold' and '|| job.closure' each appear four times in this file, and
  // String.replace takes the FIRST -- which is a different function. Anchored on a line that
  // is unique instead: the hold recording who placed it, which the guard asserts.
  ['test_production_state_validator.mjs', PRODWS,
    "  assertOnlyFields(value, productionStateFields, 'Production workspace')", '  void 0',
    'the Plant backstop stops rejecting unexpected top-level fields'],
  ['test_production_quality_hold.mjs', PRODWS,
    '    heldBy: proof.actor,', "    heldBy: 'someone else',",
    'a quality hold records the wrong operator'],
  ['test_website_edit_session.mjs', WEBMODEL,
    '    && session.baseFingerprint === workspaceFingerprint(workspace)', '    && true',
    'edit session stops detecting content drift the counters miss'],
  ['test_website_publish_gate.mjs', WEBMODEL,
    'workspace.evidence.find((entry) => entry.kind === requirement.id && sameSource(entry.source, source))',
    'workspace.evidence.find((entry) => entry.kind === requirement.id)',
    'evidence stops being bound to the content it was recorded against'],
]

const results = []
for (const [guard, file, find, replace, defect] of MUTATIONS) {
  const backup = `${file}.mutation-backup`
  copyFileSync(file, backup)
  let verdict
  try {
    const source = readFileSync(file, 'utf8')
    if (!source.includes(find)) {
      verdict = 'PATTERN-MISSING'
    } else {
      writeFileSync(file, source.replace(find, replace))
      try {
        execFileSync('node', [`tools/${guard}`], { cwd: ROOT, stdio: 'pipe', timeout: 240000 })
        verdict = 'NOT CAUGHT'
      } catch {
        verdict = 'caught'
      }
    }
  } finally {
    copyFileSync(backup, file)
    unlinkSync(backup)
  }
  results.push({ guard, defect, verdict })
  console.log(`${verdict === 'caught' ? 'OK  ' : '>>> '} ${verdict.padEnd(15)} ${guard.replace('test_', '').replace('.mjs', '').padEnd(34)} ${defect}`)
}

const missed = results.filter((entry) => entry.verdict !== 'caught')
console.log(`\n${results.length - missed.length}/${results.length} simulated defects caught`)
if (missed.length) {
  console.log('NOT CAUGHT:')
  for (const entry of missed) console.log(`  ${entry.guard}: ${entry.defect} (${entry.verdict})`)
}
