import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const component = await readFile(new URL('../showroom/src/products/AssistedDeliveryScope.tsx', import.meta.url), 'utf8')
const generator = await readFile(new URL('./create_public_vercel_output.mjs', import.meta.url), 'utf8')
const submit = component.match(/<form onSubmit=\{event => \{([\s\S]*?)\n    \}\}>/)?.[1]
const prefill = generator.split('\n').filter(line => /^  if\(handoff.get\('(company|goal)'\)/.test(line)).join('\n')
assert.ok(submit, 'execute the actual brief submit handler')
assert.equal(prefill.split('\n').length, 2, 'execute both actual receiving field assignments')

for (const product of ['website', 'ecommerce']) {
  for (const [name, values] of [
    ['Myanmar and URL symbols', { company: '  မြန်မာ & Tea #1  ', description: 'Tea + snacks\nစျေးနှုန်း ၁၀၀၀ & delivery?', reference: 'https://example.test/menu?q=tea&lang=my#catalog' }],
    ['maximum field lengths', { company: 'က'.repeat(180), description: 'ခ'.repeat(3000), reference: 'ဂ'.repeat(700) }],
    ['optional reference absent', { company: 'Tea shop', description: 'Tea and snacks', reference: '   ' }],
  ]) {
    test(`${product}: ${name} reaches contact without loss or query disclosure`, () => {
      let destination
      let prevented = false
      vm.runInNewContext(submit, { ...values, product, URLSearchParams,
        event: { preventDefault() { prevented = true } },
        window: { location: { assign(url) { destination = url } } },
      })
      assert.equal(prevented, true)
      const url = new URL(destination)
      assert.equal(url.origin, 'https://supermega.dev')
      assert.equal(url.pathname, '/contact/')
      assert.deepEqual([...url.searchParams], [['product', product], ['source', `${product}-brief`]])
      const company = { value: '' }, goal = { value: '' }
      vm.runInNewContext(prefill, { handoff: new URLSearchParams(url.hash.slice(1)), company, goal })
      assert.equal(company.value, values.company.trim())
      assert.equal(goal.value, values.description.trim() + (values.reference.trim() ? `\nExisting page or catalog: ${values.reference.trim()}` : ''))
      assert.ok(goal.value.length <= 4000)
    })
  }
}
