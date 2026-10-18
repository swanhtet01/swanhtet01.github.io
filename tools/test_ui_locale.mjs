import assert from 'node:assert/strict'
import test from 'node:test'

test('language choice survives refresh and follows another tab without mixing label text', async () => {
  const values = new Map([['supermega.ui-locale.v1', 'my']])
  const events = new Map()
  const originalWindow = globalThis.window
  const originalDocument = globalThis.document
  try {
    globalThis.window = {
      localStorage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
      },
      addEventListener: (kind, listener) => events.set(kind, listener),
    }
    globalThis.document = { documentElement: { lang: 'en' } }
    const locale = await import('../showroom/src/core/ui-locale.ts')

    assert.equal(locale.readUiLocale(), 'my', 'the saved choice loads before a route renders')
    assert.equal(globalThis.document.documentElement.lang, 'my', 'a saved choice restores the document language on load')
    assert.equal(locale.uiText('Today'), 'ယနေ့')
    assert.equal(locale.uiText('Products'), 'ကုန်ပစ္စည်းများ')
    assert.equal(locale.uiText('Account changed in another tab'), 'အခြားတဘ်တွင် အကောင့် ပြောင်းထားသည်')
    assert.equal(locale.uiText('Shop task shortcuts'), 'ဆိုင်လုပ်ငန်း အမြန်လမ်းကြောင်းများ')
    assert.equal(locale.uiText('Customer receipt'), 'ဖောက်သည်ပြေစာ')
    assert.equal(locale.uiText('Print receipt'), 'ပြေစာ ပုံနှိပ်ရန်')
    assert.equal(locale.uiText('Not a tax invoice, receipt, or payment confirmation.'), 'ဤမှတ်တမ်းသည် အခွန်ပြေစာ၊ အရောင်းပြေစာ သို့မဟုတ် ငွေပေးချေမှု အတည်ပြုချက် မဟုတ်ပါ။')
    locale.setUiLocale('en')
    assert.equal(values.get('supermega.ui-locale.v1'), 'en')
    assert.equal(globalThis.document.documentElement.lang, 'en')
    assert.equal(locale.uiText('Today'), 'Today')
    assert.equal(locale.uiText('Account changed in another tab'), 'Account changed in another tab')

    events.get('storage')?.({ key: 'supermega.ui-locale.v1', newValue: 'my' })
    assert.equal(locale.readUiLocale(), 'my', 'a choice in another tab reaches this tab')
    assert.equal(globalThis.document.documentElement.lang, 'my', 'a choice in another tab updates the document language')
    assert.equal(locale.uiText('Today'), 'ယနေ့')
    events.get('storage')?.({ key: 'supermega.ui-locale.v1', newValue: 'invalid' })
    assert.equal(locale.readUiLocale(), 'en', 'an invalid saved value fails back to English')
    assert.equal(globalThis.document.documentElement.lang, 'en')
  } finally {
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
})
