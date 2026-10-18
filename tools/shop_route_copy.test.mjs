import assert from 'node:assert/strict'
import test from 'node:test'

import { shopRouteCopy, shopRouteTasksLabel, shopRouteTemplateNotice } from '../showroom/src/core/shop-route-copy.ts'

test('Shop route changes complete task copy between English and Burmese', () => {
  for (const tab of ['today', 'counter', 'orders', 'inventory']) {
    const english = shopRouteCopy('en', tab)
    const myanmar = shopRouteCopy('my', tab)
    assert.match(english, /[A-Za-z]/)
    assert.match(myanmar, /[\u1000-\u109f]/u)
    assert.doesNotMatch(myanmar, /[A-Za-z]/, `${tab} must not mix English task copy into Burmese mode`)
  }
  assert.equal(shopRouteTasksLabel('en'), 'Shop tasks')
  assert.equal(shopRouteTasksLabel('my'), 'ဆိုင်လုပ်ငန်းများ')
})

test('a template notice uses one locale and the selected template name', () => {
  for (const kind of ['managed-unapplied', 'checking', 'local-active']) {
    assert.match(shopRouteTemplateNotice('en', kind, 'Mini mart'), /[A-Za-z]/)
    const myanmar = shopRouteTemplateNotice('my', kind, 'ကုန်စုံဆိုင်')
    assert.doesNotMatch(myanmar, /[A-Za-z]/)
    if (kind !== 'checking') assert.match(myanmar, /^ကုန်စုံဆိုင်:/)
  }
})
