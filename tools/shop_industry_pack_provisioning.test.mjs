import assert from 'node:assert/strict'
import test from 'node:test'

import {
  clientImportTemplate,
  createClientImportPreview,
} from '../showroom/src/core/client-onboarding.ts'
import {
  createShopServiceScheduleDemo,
  isGuidedSampleShopSchedule,
  projectShopServiceSchedule,
  shopIndustryPacks,
  validateShopServiceSchedule,
} from '../showroom/src/core/shop-service-scheduling.ts'
import { shopBusinessTemplates } from '../showroom/src/products/shop/business-templates.ts'

const PLANNING_DAY = '2026-08-07'

// Setup offers every pack in this list, so every pack has to survive the exact
// path the "Create Shop and start selling" button takes. A pack whose sample
// CSV does not stage throws in the client's face at that moment.
test('every shop industry pack stages a working catalog', async () => {
  for (const pack of shopIndustryPacks) {
    const preview = await createClientImportPreview(
      clientImportTemplate('commerce', pack.workflowTemplateId, { shopIndustryPackId: pack.id }),
      'commerce',
      undefined,
      `sample-${pack.id}.csv`,
      pack.workflowTemplateId,
    )
    assert.equal(preview.readyForStaging, true, `${pack.id} sample must be ready for staging`)
    assert.ok(preview.rows.length >= 1, `${pack.id} sample must carry rows`)
    const blocked = preview.rows.filter((row) => row.status !== 'ready')
    assert.deepEqual(blocked, [], `${pack.id} sample rows must all be ready`)
    for (const row of preview.rows) {
      assert.ok(row.values.sku, `${pack.id} row needs a sku`)
      assert.ok(row.values.name, `${pack.id} row needs a name`)
      assert.ok(Number.isFinite(Number(row.values.price)), `${pack.id} row needs a numeric price`)
      assert.ok(Number.isFinite(Number(row.values.onHand)), `${pack.id} row needs numeric stock`)
    }
  }
})

test('every shop industry pack seeds a schedule the day view can render', () => {
  for (const pack of shopIndustryPacks) {
    const schedule = createShopServiceScheduleDemo(pack.id, PLANNING_DAY)
    validateShopServiceSchedule(schedule)
    assert.equal(schedule.industryPackId, pack.id)
    assert.ok(isGuidedSampleShopSchedule(schedule), `${pack.id} seeded schedule must stay replaceable`)
    const projection = projectShopServiceSchedule(schedule, new Date(`${PLANNING_DAY}T04:00:00.000Z`))
    assert.ok(projection.activeServices >= 1, `${pack.id} needs bookable services`)
    assert.ok(projection.activeResources >= 1, `${pack.id} needs staff or rooms`)
    // An empty day view is the shell complaint: the pack installs but the first
    // screen a client opens shows nothing to act on.
    assert.ok(projection.today.length >= 1, `${pack.id} needs bookings on the planning day`)
  }
})

test('every starter catalog belongs to a pack setup can reach', () => {
  const packIds = new Set(shopIndustryPacks.map((pack) => pack.id))
  for (const template of shopBusinessTemplates) {
    assert.ok(
      packIds.has(template.industryPackId),
      `${template.id} names industry pack ${template.industryPackId}, which setup cannot offer`,
    )
  }
})

// Setup filters starter catalogs to the selected pack. A pack with no catalog of
// its own still has to reach a usable Shop through its standard sample, so the
// filtered list being empty must stay a supported state rather than a dead end.
test('a pack without its own starter catalog still has a standard sample', async () => {
  const covered = new Set(shopBusinessTemplates.map((template) => template.industryPackId))
  const uncovered = shopIndustryPacks.filter((pack) => !covered.has(pack.id))
  assert.ok(uncovered.length >= 1, 'this test is only meaningful while some pack has no starter catalog')
  for (const pack of uncovered) {
    const preview = await createClientImportPreview(
      clientImportTemplate('commerce', pack.workflowTemplateId, { shopIndustryPackId: pack.id }),
      'commerce',
      undefined,
      `sample-${pack.id}.csv`,
      pack.workflowTemplateId,
    )
    assert.equal(preview.readyForStaging, true, `${pack.id} standard sample must stage`)
  }
})
