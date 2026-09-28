import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('natural-height Website and Ecommerce use the non-shrinking scroll shell', () => {
  const shell = readFileSync(new URL('../showroom/src/core/CoreShell.tsx', import.meta.url), 'utf8')
  const css = readFileSync(new URL('../showroom/src/core/core-app.css', import.meta.url), 'utf8')
  assert.match(shell, /routeProduct === 'ecommerce' \|\| routeProduct === 'website' \? ' natural-scroll'/)
  assert.match(css, /\.core-main\.natural-scroll\s*\{[^}]*overflow-y:\s*auto/)
  assert.match(css, /\.core-main\.natural-scroll \.core-route-content\s*\{[^}]*flex:\s*none/)
})
