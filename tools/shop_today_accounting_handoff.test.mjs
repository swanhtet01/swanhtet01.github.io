import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const root = resolve(import.meta.dirname, '..')
const [core, today] = await Promise.all([
  readFile(resolve(root, 'showroom', 'src', 'core', 'CoreApp.tsx'), 'utf8'),
  readFile(resolve(root, 'showroom', 'src', 'core', 'ShopToday.tsx'), 'utf8'),
])

test('Shop Today exposes the real reviewed accounting handoff after close', () => {
  assert.match(core, /accountingExport=\{latestAccountingDownload \? \{ businessDate:/)
  assert.match(today, /data-shop-accounting-export="accounting-csv-v1"/)
  assert.ok(today.includes("accountingExport.mappingReady ? 'Mapped' : 'Unmapped'"))
  assert.match(today, /data-shop-accounting-export="accounting-csv-v1"[\s\S]*?<strong>CSV<\/strong>/)
})

test('Shop Today removes empty sales duplication and distinguishes unpaid orders from recorded takings', async () => {
  assert.match(today, /salesPatternReady \|\| salesPulse\.today\.count > 0 \? <article aria-label=\{uiText\('Sales insight'\)\}/)
  assert.match(today, /attentionPriority\.id === 'payment_pending' \? 'Orders awaiting payment' : attentionPriority\.title/)
  assert.match(today, /uiText\('Reconcile recorded takings'\)/)
  const locale = await readFile(resolve(root, 'showroom', 'src', 'core', 'ui-locale-my.ts'), 'utf8')
  assert.match(locale, /'Orders awaiting payment': 'ငွေပေးချေရန် စောင့်နေသော အော်ဒါများ'/)
  assert.match(locale, /'Reconcile recorded takings': 'မှတ်တမ်းတင်ထားသော ရငွေများကို စစ်ဆေးရန်'/)
})

test('accounting CSV bytes are created only when the operator downloads', () => {
  const start = core.indexOf('const latestAccountingDownload = useMemo(')
  const end = core.indexOf('const supplierPayablesDownload = useMemo(', start)
  const accountingBlock = core.slice(start, end)

  assert.ok(start >= 0 && end > start)
  assert.doesNotMatch(accountingBlock, /data:text\/csv/)
  assert.match(accountingBlock, /const downloadLatestAccountingHandoff = \(\) =>/)
  assert.match(accountingBlock, /new Blob\(\[`\\uFEFF\$\{commerceAccountingHandoffCsv/)
  assert.match(core, /<button className="text-link" onClick=\{downloadLatestAccountingHandoff\}/)
})
