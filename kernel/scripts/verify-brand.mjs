import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (name) => readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8')
const pages = {
  console: read('index.html'),
  status: read('status.html'),
}
const favicon = read('favicon.svg')

const banned = /Fraunces|Georgia|#f7f4e[cd]|#c2603f|#D97757|#d9895f|#C9A24B|rgba\(217,137,95|--clay|--gold|#3b82f6|rgba\(59,130,246/i

for (const [name, html] of Object.entries(pages)) {
  assert.match(html, /#2563eb/i, `${name} must use the canonical cobalt accent`)
  assert.match(html, /cobalt-unboxed-v14-2026-10/, `${name} must use the current brand asset version`)
  assert.doesNotMatch(html, /SUPERMEGA/, `${name} must use the title-case wordmark`)
  assert.match(html, /Space\+Grotesk|Space Grotesk/, `${name} must use Space Grotesk`)
  assert.match(html, /Inter/, `${name} must use Inter`)
  assert.doesNotMatch(html, banned, `${name} contains retired brand tokens`)
}

assert.match(pages.console, /<img class="brand-mark" src="\/favicon\.svg\?v=cobalt-unboxed-v14-2026-10" alt="" width="30" height="18" \/>/)
assert.match(pages.console, /<span class="brand-word">SuperMega<\/span>/)
assert.match(pages.status, /<img class="mark" src="\/favicon\.svg\?v=cobalt-unboxed-v14-2026-10" alt="" width="30" height="18" \/>/)
assert.match(pages.status, /<div class="brand"><b>SuperMega<\/b><\/div>/)
assert.match(favicon, /viewBox="0 0 72 44"/)
assert.match(favicon, /d="M10 9 26 22 10 35M35 35h27"[^>]*stroke="#2563eb" stroke-width="6"/)
assert.doesNotMatch(favicon, /<rect\b/i)
assert.doesNotMatch(favicon, banned)
assert.match(pages.console, /id="ownerGate"/)
assert.match(pages.console, /id="consoleShell" hidden/)
assert.match(pages.console, /async function loadProtectedState\(\)/)
assert.match(pages.console, /async function validateOwnerAccess\(\)/)
assert.match(pages.console, /\$\('#consoleShell'\)\.hidden=!unlocked/)
assert.doesNotMatch(pages.console, /function renderLockedOverview/)

console.log(
  JSON.stringify({
    ok: true,
    contract: 'kernel_cobalt_unboxed_brand',
    pages: [...Object.keys(pages), 'favicon'],
  })
)
