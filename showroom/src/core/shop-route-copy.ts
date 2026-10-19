import type { CommerceTab } from './commerce-tabs'
import type { UiLocale } from './ui-locale'

// Route-only draft. Keep Shop copy out of the eager account/shell locale bundle.
// A native Burmese reviewer must approve these phrases before language release.
const COPY: Record<CommerceTab, { en: string; my: string }> = {
  today: { en: 'See today’s next job and key numbers.', my: 'ယနေ့ ဆက်လုပ်ရမည့်အလုပ်နှင့် အဓိကကိန်းဂဏန်းများကို ကြည့်ပါ။' },
  counter: { en: 'Tap an item, choose payment, and confirm the sale.', my: 'ပစ္စည်းကို ရွေး၊ ငွေပေးချေမှုနည်းလမ်းကို ရွေးပြီး အရောင်းကို အတည်ပြုပါ။' },
  orders: { en: 'Finish fulfilment, follow up payment, and handle exceptions.', my: 'အော်ဒါများကို ပြင်ဆင်ပေးပို့၊ ငွေပေးချေမှုကို စစ်ဆေးပြီး ပြဿနာများကို ဖြေရှင်းပါ။' },
  inventory: { en: 'Count stock, replenish items, and review location availability.', my: 'ကုန်လက်ကျန်ကို ရေတွက်၊ ထပ်ဖြည့်ပြီး နေရာအလိုက် လက်ကျန်ကို စစ်ဆေးပါ။' },
}

function chosen(locale: UiLocale, english: string, myanmar: string): string {
  return locale === 'my' ? myanmar : english
}

export function shopRouteCopy(locale: UiLocale, tab: CommerceTab): string {
  return COPY[tab][locale]
}

export function shopRouteTasksLabel(locale: UiLocale): string {
  return chosen(locale, 'Shop tasks', 'ဆိုင်လုပ်ငန်းများ')
}

export function shopRouteTemplateNotice(
  locale: UiLocale,
  kind: 'managed-unapplied' | 'checking' | 'local-active',
  templateName?: string,
): string {
  if (kind === 'checking') return chosen(locale,
    'Checking workspace access. Your catalog has not been changed.',
    'လုပ်ငန်းနေရာဝင်ခွင့်ကို စစ်ဆေးနေသည်။ ကုန်ပစ္စည်းစာရင်း မပြောင်းလဲသေးပါ။')
  const detail = kind === 'managed-unapplied'
    ? chosen(locale,
      'The public request needs a separate company review before it changes your catalog.',
      'အများပြည်သူမှ တောင်းဆိုချက်သည် ကုန်ပစ္စည်းစာရင်းကို မပြောင်းလဲမီ ကုမ္ပဏီ၏ သီးခြားစစ်ဆေးမှု လိုအပ်ပါသည်။')
    : chosen(locale,
      'Choose an item, select a local payment method, and review the sale.',
      'ပစ္စည်းနှင့် ငွေပေးချေမှုနည်းလမ်းကို ရွေးပြီး အရောင်းကို စစ်ဆေးပါ။')
  return templateName ? `${templateName}: ${detail}` : detail
}
