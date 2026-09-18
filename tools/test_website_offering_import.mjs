import assert from 'node:assert/strict'
import test from 'node:test'
import { previewWebsiteOfferingCsv } from '../showroom/src/products/website/website-offering-import.ts'

test('reuses quoted CSV parsing and retains Myanmar names and supplied prices', () => {
  assert.deepEqual(previewWebsiteOfferingCsv('\uFEFFdescription,name\r\n"2,000 MMK, hot or iced",လက်ဖက်ရည်'), [{ name: 'လက်ဖက်ရည်', details: '2,000 MMK, hot or iced' }])
  assert.deepEqual(previewWebsiteOfferingCsv('name,description\nConsultation,"30 minutes\nAsk for price"'), [{ name: 'Consultation', details: '30 minutes Ask for price' }])
})
test('rejects malformed, oversized, duplicate and unsupported inputs without truncation', () => {
  for (const input of ['', 'name,description', 'name,name\na,b', 'name,description,price\na,b,3', 'name,description\na,"unterminated', 'name,description\na,b,c', 'name,description\na,b\nA,c', 'name,description\na|b,c', 'name,description\n' + Array(5).fill('a,b').join('\n'), 'name,description\na,' + 'x'.repeat(361), 'x'.repeat(65537)]) assert.throws(() => previewWebsiteOfferingCsv(input))
})
test('HTML-like input remains inert text rather than being executed or interpreted', () => {
  assert.deepEqual(previewWebsiteOfferingCsv('name,description\n<script>,<b>Owner text</b>'), [{ name: '<script>', details: '<b>Owner text</b>' }])
})
