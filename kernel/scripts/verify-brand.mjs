import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (name) => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8')
const pages = {
  console: read('index.html'),
  status: read('status.html'),
}

const banned = /Fraunces|Georgia|#f7f4e[cd]|#c2603f|#D97757|#d9895f|#C9A24B|rgba\(217,137,95|--clay|--gold|radial-gradient|linear-gradient/i

for (const [name, html] of Object.entries(pages)) {
  assert.match(html, /#07111f/i, `${name} must use canonical Void Blue`)
  assert.match(html, /#3B82F6/i, `${name} must use canonical Electric Blue`)
  assert.match(html, /Space\+Grotesk|Space Grotesk/, `${name} must use Space Grotesk`)
  assert.match(html, /Inter/, `${name} must use Inter`)
  assert.doesNotMatch(html, banned, `${name} contains retired brand tokens`)
}

assert.match(pages.console, /&gt;_<\/b>SuperMega/)
assert.match(pages.status, /M6\.5 8 L11 12 L6\.5 16/)

console.log(
  JSON.stringify({
    ok: true,
    contract: 'kernel_void_electric_brand',
    pages: Object.keys(pages),
  })
)
