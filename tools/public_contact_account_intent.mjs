export const managedAccountHelpCopy = Object.freeze({
  en: Object.freeze({
    heading: 'Get help with your SuperMega account',
    lede: 'Tell us what happened when you signed in or opened your assigned workspace. We will reply by email. Sending this form does not create an account or grant access.',
  }),
  my: Object.freeze({
    heading: 'SuperMega အကောင့်အတွက် အကူအညီရယူရန်',
    lede: 'အကောင့်ဝင်စဉ် သို့မဟုတ် သတ်မှတ်ပေးထားသော လုပ်ငန်းခွင်ကို ဖွင့်စဉ် ဖြစ်ပျက်ခဲ့သည်ကို ပြောပြပါ။ အီးမေးလ်ဖြင့် ပြန်လည်ဆက်သွယ်ပါမည်။ ဤဖောင်ကို ပို့ခြင်းဖြင့် အကောင့်ဖန်တီးပေးခြင်း သို့မဟုတ် အသုံးပြုခွင့်ပေးခြင်း မရှိပါ။',
  }),
})

export function isManagedAccountHelpQuery(query, contactProducts) {
  if (!query || typeof query.get !== 'function' || typeof query.getAll !== 'function'
    || !Array.isArray(contactProducts)) return false
  const exactValue = (name, value) => {
    const values = query.getAll(name)
    return values.length === 1 && values[0] === value
  }
  const requestedProduct = query.get('product')
  return contactProducts.includes(requestedProduct || '')
    && query.getAll('product').length === 1
    && exactValue('template', 'managed-account')
    && exactValue('utm_source', 'app')
    && exactValue('utm_medium', 'business_setup')
}

export function canonicalContactLanguageSearch(query, allowedNames) {
  if (!query || typeof query.getAll !== 'function' || !Array.isArray(allowedNames)) return ''
  const canonical = new URLSearchParams()
  for (const name of allowedNames) {
    const values = query.getAll(name)
    if (values.length === 1 && values[0] && values[0].length <= 160) canonical.set(name, values[0])
  }
  return canonical.toString()
}
