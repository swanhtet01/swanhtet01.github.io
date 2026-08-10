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
const STORAGE = `${ROOT}/showroom/src/core/local-workspace-storage.ts`
const INVENTORY = `${ROOT}/showroom/src/core/shop-inventory-foundation.ts`
const STOREFRONT = `${ROOT}/showroom/src/products/ecommerce/storefront-draft.ts`
const SCHEDULING = `${ROOT}/showroom/src/core/shop-service-scheduling.ts`
const INTAKE = `${ROOT}/showroom/src/core/channel-order-intake.ts`
const TRADEBRIEF = `${ROOT}/showroom/src/products/website/website-trade-brief.ts`
const ONBOARDRUN = `${ROOT}/showroom/src/core/product-onboarding-runtime.ts`

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
  ['test_plant_to_shop_journey.mjs', COMMERCE,
    '      || (timestampMicros(proof.capturedAt) as bigint) < (timestampMicros(checkedReceipt.releasedAt) as bigint)) return null',
    '      ) return null',
    'a factory batch can be banked into shop stock before it was released'],
  ['test_shop_to_plant_journey.mjs', COMMERCE,
    '    || current.movements.some((movement) => movement.productionRequestId === checkedRequest.requestId)) return null',
    '    || false) return null',
    'the same material request may be issued to the floor twice under a new action id'],
  ['test_shop_to_plant_journey.mjs', COMMERCE,
    '  const nextBalance = safeBalance(item.onHand, -stockQuantity)',
    '  const nextBalance = item.onHand - stockQuantity',
    'stock may be issued to the floor that the shop does not have'],
  ['test_website_trade_brief.mjs', TRADEBRIEF,
    '    businessName: request.businessName,',
    '    businessName: request.businessName.slice(0, 60),',
    "the website draft silently truncates the owner's business name instead of reporting it"],
  ['test_website_trade_brief.mjs', TRADEBRIEF,
    "  'tea-coffee': {", "  'tea-coffee-DISABLED': {",
    'a Shop trade loses its website copy and that owner falls back to blank boxes'],
  ['test_website_trade_detection.mjs', ONBOARDRUN,
    '    if (!installed) return null',
    '    if (!installed) return shopBusinessTemplates[0].id',
    'a device with no trade installed is guessed at rather than asked'],
  ['test_website_trade_detection.mjs', ONBOARDRUN,
    '    const match = shopBusinessTemplates.find((template) => template.id === installed)',
    '    const match = { id: installed }',
    'website wording is drafted from a stored id that is not a trade Shop offers'],
  ['test_commerce_accounting_balance.mjs', COMMERCE,
    '      amountMmk: group.amountMmk,',
    '      amountMmk: group.amountMmk - 1,',
    'the accounting handoff no longer balances -- an accountant cannot post it'],
  ['test_commerce_accounting_balance.mjs', COMMERCE,
    '  const entries: CommerceAccountingHandoffEntry[] = [...paymentGroups.entries()]',
    '  const entries: CommerceAccountingHandoffEntry[] = [...paymentGroups.entries()].slice(0, 1)',
    'takings on every payment method but the first vanish from the accounting handoff'],
  ['test_order_to_close_journey.mjs', COMMERCE,
    "    .filter((order) => order.status === 'completed'", "    .filter((order) => order.status === 'nope'",
    'a completed sale silently never reaches the daily close'],
  ['test_order_lifecycle_journey.mjs', COMMERCE,
    "  if (order.status === 'ready' && order.paymentStatus !== 'reconciled') return null", '  void order',
    'goods can be handed over before the payment is reconciled'],
  ['test_channel_to_order_journey.mjs', COMMERCE,
    '      || item.onHand < line.quantity) return null', '      || line.quantity > 1) return null',
    'the order path tightens without the channel intake knowing, stranding transcribed orders'],
  ['test_managed_ai_draft.mjs', INTAKE,
    '        || input.message.slice(Number(span.start), Number(span.end)) !== span.quote) {', '        || false) {',
    'the AI model claimed source offsets are no longer checked against the real message'],
  ['test_channel_order_intake.mjs', INTAKE,
    '    if (matches.length === 0) {', '    if (false) {',
    'an order detail quoted from a message that never contained it is accepted'],
  ['test_shop_service_scheduling.mjs', SCHEDULING,
    "    && booking.status !== 'cancelled'", '    && true',
    'a cancelled appointment keeps blocking its slot'],
  ['test_storefront_reconciliation.mjs', STOREFRONT,
    '    missingSkus: saved.filter((sku) => !catalogSet.has(sku)),', '    missingSkus: [],',
    'items removed from the catalog vanish from the storefront without being reported'],
  ['test_shop_inventory_foundation.mjs', INVENTORY,
    "  if (digest(expectedHeadDigest, 'expected_head_digest') !== current.headDigest) throw new Error('The inventory snapshot changed before this command was applied.')",
    "  digest(expectedHeadDigest, 'expected_head_digest')",
    'a stock write computed against a stale ledger applies on top instead of being refused'],
  ['test_workspace_storage_registry.mjs', STORAGE,
    "  'supermega.shop.counter_draft.v1',", '  // removed by mutation',
    'the in-progress counter sale stops being backed up or cleared'],
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
  // Anchored on the v2 branch CONDITION, not the legacy read: the v2 branch returns early,
  // so editing the legacy read can never execute when a v2 key is present. That mutation
  // reported "not caught" while testing nothing.
  ['test_website_workspace_load.mjs', WEBMODEL,
    '    if (currentRaw !== null) {', '    if (currentRaw !== null && parseStoredWorkspace(currentRaw)) {',
    'corrupt saved work silently falls through instead of failing closed'],
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
