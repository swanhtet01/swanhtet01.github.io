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
    await locale.ensureUiLocaleReady()
    assert.equal(locale.uiText('Today'), 'ယနေ့')
    assert.equal(locale.uiText('Products'), 'ကုန်ပစ္စည်းများ')
    assert.equal(locale.uiText('Unpaid'), 'ငွေမပေးရသေး')
    assert.equal(locale.uiText('due soon'), 'မကြာမီ ရောက်မည်')
    assert.equal(locale.uiText('Account changed in another tab'), 'အခြားတဘ်တွင် အကောင့် ပြောင်းထားသည်')
    assert.equal(locale.uiText('Shop task shortcuts'), 'ဆိုင်လုပ်ငန်း အမြန်လမ်းကြောင်းများ')
    assert.equal(locale.uiText('Customer receipt'), 'ဖောက်သည်ပြေစာ')
    assert.equal(locale.uiText('Print receipt'), 'ပြေစာ ပုံနှိပ်ရန်')
    assert.equal(locale.uiText('Payment pending'), 'ငွေပေးရန် ကျန်')
    assert.equal(locale.uiText('Order late'), 'အော်ဒါ နောက်ကျနေ')
    assert.equal(locale.uiText('Record payment only'), 'ငွေပေးချေမှုကိုသာ မှတ်တမ်းတင်ရန်')
    assert.equal(locale.uiText('Record settled refund'), 'ပြီးစီးသော ငွေပြန်အမ်းမှုကို မှတ်တမ်းတင်ရန်')
    assert.equal(locale.uiText('Cancel order'), 'အော်ဒါ ပယ်ဖျက်ရန်')
    assert.equal(locale.uiText('Camera scan'), 'ကင်မရာဖြင့် ဘားကုဒ်ဖတ်ရန်')
    assert.equal(locale.uiText('Finish scanning'), 'ဖတ်ခြင်း ပြီးဆုံးရန်')
    assert.equal(locale.uiText('Not added. Check the product code and available stock.'), 'မထည့်နိုင်ပါ။ ကုန်ပစ္စည်းကုဒ်နှင့် လက်ကျန်ကို စစ်ဆေးပါ။')
    assert.equal(locale.uiText('Record a refund already completed with the external payment provider. This does not send money.'), 'ပြင်ပငွေပေးချေမှုဝန်ဆောင်မှုတွင် ပြန်အမ်းပြီးသား ငွေကိုသာ ဤနေရာတွင် မှတ်တမ်းတင်ပါ။ ဤလုပ်ဆောင်ချက်က ငွေမလွှဲပို့ပါ။')
    assert.equal(locale.uiText('Not a tax invoice, receipt, or payment confirmation.'), 'ဤမှတ်တမ်းသည် အခွန်ပြေစာ၊ အရောင်းပြေစာ သို့မဟုတ် ငွေပေးချေမှု အတည်ပြုချက် မဟုတ်ပါ။')
    await locale.setUiLocale('en')
    assert.equal(values.get('supermega.ui-locale.v1'), 'en')
    assert.equal(globalThis.document.documentElement.lang, 'en')
    assert.equal(locale.uiText('Today'), 'Today')
    assert.equal(locale.uiText('Account changed in another tab'), 'Account changed in another tab')

    await events.get('storage')?.({ key: 'supermega.ui-locale.v1', newValue: 'my' })
    assert.equal(locale.readUiLocale(), 'my', 'a choice in another tab reaches this tab')
    assert.equal(globalThis.document.documentElement.lang, 'my', 'a choice in another tab updates the document language')
    assert.equal(locale.uiText('Today'), 'ယနေ့')
    await events.get('storage')?.({ key: 'supermega.ui-locale.v1', newValue: 'invalid' })
    assert.equal(locale.readUiLocale(), 'en', 'an invalid saved value fails back to English')
    assert.equal(globalThis.document.documentElement.lang, 'en')
  } finally {
    globalThis.window = originalWindow
    globalThis.document = originalDocument
  }
})
