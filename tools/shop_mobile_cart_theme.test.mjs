import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const css = readFileSync(new URL('../showroom/src/core/core-app.css', import.meta.url), 'utf8')
const luminance = hex => {
  const channels = hex.match(/[a-f0-9]{2}/gi).map(v => parseInt(v, 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return channels.reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0)
}
test('mobile cart uses the paired accent colors rather than a fixed dark-theme color', () => {
  const rules = [...css.matchAll(/\.shop-mobile-cart \{([^}]+)\}/g)]
    .map(match => match[1]).filter(rule => /background:/.test(rule))
  assert.equal(rules.length, 1)
  const [rule] = rules
  assert.match(rule, /background: var\(--core-green\)/)
  assert.match(rule, /color: var\(--core-on-accent\)/)
  assert.doesNotMatch(rule, /#[a-f0-9]{3,8}/i)
  for (const selector of [':root', '.theme-dark']) {
    const body = css.slice(css.indexOf(selector + ' {')).split('}')[0]
    const color = name => body.match(new RegExp('--' + name + ': (#[a-f0-9]{6});', 'i'))[1]
    const values = [luminance(color('core-green')), luminance(color('core-on-accent'))].sort((a,b) => a-b)
    assert.ok((values[1] + .05) / (values[0] + .05) >= 4.5, selector + ' text contrast')
  }
})
