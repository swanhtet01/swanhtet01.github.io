import { useSyncExternalStore } from 'react'

export type UiLocale = 'en' | 'my'

const STORAGE_KEY = 'supermega.ui-locale.v1'
const listeners = new Set<() => void>()
let currentLocale: UiLocale = 'en'

function isUiLocale(value: unknown): value is UiLocale {
  return value === 'en' || value === 'my'
}

if (typeof window !== 'undefined') {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (isUiLocale(saved)) currentLocale = saved
  } catch {
    // Language remains usable when browser storage is unavailable.
  }
  if (typeof document !== 'undefined') document.documentElement.lang = currentLocale
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return
    const next = isUiLocale(event.newValue) ? event.newValue : 'en'
    if (next === currentLocale) return
    currentLocale = next
    if (typeof document !== 'undefined') document.documentElement.lang = next
    listeners.forEach((listener) => listener())
  })
}

export function readUiLocale(): UiLocale { return currentLocale }

export function setUiLocale(next: UiLocale): void {
  if (!isUiLocale(next) || next === currentLocale) return
  currentLocale = next
  if (typeof document !== 'undefined') document.documentElement.lang = next
  try { window.localStorage.setItem(STORAGE_KEY, next) } catch { /* Keep this tab's choice. */ }
  listeners.forEach((listener) => listener())
}

export function useUiLocale(): UiLocale {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    readUiLocale,
    () => 'en',
  )
}

// Keep a whole phrase as the translation unit. These labels are a source draft;
// native review and full route coverage remain launch checks.
const UI_TRANSLATIONS: Readonly<Record<string, string>> = {
  'Today': 'ယနေ့', 'Sell': 'ရောင်းရန်', 'Orders': 'အော်ဒါများ', 'Stock': 'ကုန်လက်ကျန်',
  'Products': 'ကုန်ပစ္စည်းများ', 'Product': 'ကုန်ပစ္စည်း', 'Price': 'ဈေးနှုန်း',
  'Shop': 'ဆိုင်', 'Workspace': 'လုပ်ငန်းနေရာ', 'Settings': 'ဆက်တင်များ',
  'Language': 'ဘာသာစကား', 'English': 'English', 'မြန်မာ': 'မြန်မာ',
  'Switch to English': 'အင်္ဂလိပ်ဘာသာသို့ ပြောင်းရန်', 'Switch to Burmese': 'မြန်မာဘာသာသို့ ပြောင်းရန်',
  'Account': 'အကောင့်', 'Private customer review': 'သီးသန့် ဖောက်သည်စစ်ဆေးမှု',
  'Open your prepared review.': 'အသင့်ပြင်ထားသော စစ်ဆေးမှုကို ဖွင့်ပါ။',
  'Create your account.': 'သင့်အကောင့်ကို ဖွင့်ပါ။',
  'Sign in with the account assigned to this review.': 'ဤစစ်ဆေးမှုအတွက် သတ်မှတ်ထားသော အကောင့်ဖြင့် ဝင်ပါ။',
  'Confirm your email first. Company access is a separate step.': 'အီးမေးလ်ကို အရင် အတည်ပြုပါ။ ကုမ္ပဏီဝင်ခွင့်ကို သီးခြား ဆက်လုပ်ရပါမည်။',
  'Sign in to your workspace.': 'သင့်လုပ်ငန်းနေရာသို့ ဝင်ပါ။',
  'Login unavailable': 'အကောင့်ဝင်၍ မရသေးပါ',
  'Login is currently unavailable.': 'ယခု အကောင့်ဝင်၍ မရသေးပါ။',
  'Review sign-in is unavailable here.': 'ဤနေရာမှ စစ်ဆေးမှုအကောင့်သို့ ဝင်၍ မရပါ။',
  'Keep your original review link and ask SuperMega in your existing setup conversation to restore access. Use the account associated with this review.': 'မူရင်း စစ်ဆေးမှုလင့်ခ်ကို သိမ်းထားပါ။ ဝင်ခွင့်ပြန်ရရန် မူလစတင်ပြင်ဆင်မှု ဆွေးနွေးချက်မှ SuperMega ကို ဆက်သွယ်ပါ။ ဤစစ်ဆေးမှုနှင့် ချိတ်ထားသော အကောင့်ကို အသုံးပြုပါ။',
  'Contact support for account access.': 'အကောင့်ဝင်ခွင့်အတွက် အကူအညီတောင်းပါ။',
  'Contact support for account access. Your saved work is still available on this device.': 'အကောင့်ဝင်ခွင့်အတွက် အကူအညီတောင်းပါ။ ဤစက်ပေါ်တွင် သိမ်းထားသော လုပ်ငန်းမှတ်တမ်းများကို ဆက်လက်ကြည့်နိုင်ပါသည်။',
  'Contact support': 'အကူအညီတောင်းရန်', 'Saved work on this device': 'ဤစက်ပေါ်ရှိ မှတ်တမ်းများ',
  'Create an account': 'အကောင့်ဖွင့်ရန်', 'View Shop sample screens': 'Shop နမူနာမျက်နှာပြင်များ ကြည့်ရန်',
  'Company': 'ကုမ္ပဏီ', 'Contact': 'ဆက်သွယ်ရန်', 'Login': 'အကောင့်ဝင်ရန်', 'Sign in': 'အကောင့်ဝင်ရန်',
  'Account changed in another tab': 'အခြားတဘ်တွင် အကောင့် ပြောင်းထားသည်',
  'Reload to verify the current account. Saved records are unchanged; unsaved edits may need to be entered again.': 'လက်ရှိအကောင့်ကို စစ်ဆေးရန် ပြန်ဖွင့်ပါ။ သိမ်းပြီးသားမှတ်တမ်းများ မပြောင်းလဲပါ။ မသိမ်းရသေးသော ပြင်ဆင်မှုများကို ပြန်ထည့်ရနိုင်သည်။',
  'Reload workspace': 'လုပ်ငန်းနေရာကို ပြန်ဖွင့်ရန်', 'Opening…': 'ဖွင့်နေသည်…',
  'Checking your account.': 'သင့်အကောင့်ကို စစ်ဆေးနေသည်။',
  'Skip to workspace': 'လုပ်ငန်းနေရာသို့ တိုက်ရိုက်သွားရန်', 'Application': 'အက်ပ်',
  'Shop task shortcuts': 'ဆိုင်လုပ်ငန်း အမြန်လမ်းကြောင်းများ',
  'Current product navigation': 'လက်ရှိထုတ်ကုန် လမ်းညွှန်',
  'Verifying this company and its assigned products.': 'ကုမ္ပဏီနှင့် အသုံးပြုခွင့်ရ ထုတ်ကုန်များကို စစ်ဆေးနေသည်။',
  'Opening company portal…': 'ကုမ္ပဏီစာမျက်နှာကို ဖွင့်နေသည်…',
  'Sign in again': 'ပြန်လည် အကောင့်ဝင်ရန်', 'Access issue': 'ဝင်ခွင့် ပြဿနာ',
  'Your company has no active products yet. SuperMega can help you get started.': 'သင့်ကုမ္ပဏီအတွက် အသုံးပြုနိုင်သော ထုတ်ကုန် မရှိသေးပါ။ စတင်ရန် SuperMega ကို ဆက်သွယ်ပါ။',
  'No products yet': 'ထုတ်ကုန် မရှိသေးပါ', 'Checking products.': 'ထုတ်ကုန်များကို စစ်ဆေးနေသည်။',
  'Sign in to your business.': 'သင့်လုပ်ငန်းအကောင့်သို့ ဝင်ပါ။',
  'Welcome back': 'ပြန်လည်ကြိုဆိုပါသည်', 'Active company': 'လက်ရှိကုမ္ပဏီ',
  'Switch company': 'ကုမ္ပဏီ ပြောင်းရန်', 'Your workspace': 'သင့်လုပ်ငန်းနေရာ',
  'Sales, stock and your daily totals.': 'အရောင်း၊ ကုန်လက်ကျန်နှင့် နေ့စဉ်စုစုပေါင်း။',
  'Your services, photos and contact details.': 'သင့်ဝန်ဆောင်မှုများ၊ ဓာတ်ပုံများနှင့် ဆက်သွယ်ရန် အချက်အလက်များ။',
  'A product catalog and customer requests.': 'ကုန်ပစ္စည်းစာရင်းနှင့် ဖောက်သည်တောင်းဆိုမှုများ။',
  'Account recovery': 'အကောင့် ပြန်လည်ရယူရန်', 'Account setup': 'အကောင့် စတင်ပြင်ဆင်ရန်',
  'All products': 'ထုတ်ကုန်အားလုံး', 'Switch': 'ပြောင်းရန်', 'More': 'နောက်ထပ်',
  'Shop setup': 'ဆိုင် စတင်အသုံးပြုရန်', 'New sale': 'အရောင်းအသစ်',
  "Today's sales": 'ယနေ့ အရောင်း', 'Open orders': 'ဖွင့်ထားသော အော်ဒါများ',
  'Stock alerts': 'ကုန်လက်ကျန် သတိပေးချက်များ', 'Shop summary': 'ဆိုင်အကျဉ်းချုပ်',
  'Shop operating view': 'ဆိုင်လုပ်ငန်း အခြေအနေ', 'Product list': 'ကုန်ပစ္စည်းစာရင်း',
  'Order queue': 'ဆောင်ရွက်ရန် အော်ဒါများ', 'Sales insight': 'အရောင်း သုံးသပ်ချက်',
  'Sales activity': 'အရောင်း လှုပ်ရှားမှု', 'Quick tasks': 'ဆက်လုပ်ရန် အလုပ်များ',
  'View products': 'ကုန်ပစ္စည်းများ ကြည့်ရန်', 'Open all orders': 'အော်ဒါအားလုံး ကြည့်ရန်',
  'Queue clear': 'ဆောင်ရွက်ရန် အော်ဒါမရှိပါ',
  'No open orders need fulfilment.': 'ဆောင်ရွက်ရန် အော်ဒါ မရှိပါ။',
  'No sales yet today': 'ယနေ့ အရောင်းမရှိသေးပါ',
  'Completed counter sales will appear here.': 'ပြီးစီးသော ကောင်တာအရောင်းများကို ဤနေရာတွင် ပြပါမည်။',
  'Sales by time': 'အချိန်အလိုက် အရောင်း',
  'At least 3 sales across 2 time blocks show your busiest hours.': 'အချိန်ပိုင်း နှစ်ပိုင်းတွင် အနည်းဆုံး အရောင်းသုံးခုရှိလျှင် အလုပ်အများဆုံးအချိန်ကို ပြပါမည်။',
  'Advanced controls': 'အဆင့်မြင့် စီမံမှု', 'Costs, trends and operations': 'ကုန်ကျစရိတ်၊ အရောင်းလမ်းကြောင်းနှင့် လုပ်ငန်းများ',
  'Explore': 'ကြည့်ရန်', 'Reorder': 'ထပ်မှာရန်', 'Payment due': 'ငွေပေးရန် ကျန်',
  'Paid': 'ငွေပေးပြီး', 'Customer': 'ဖောက်သည်', 'Walk-in': 'ဆိုင်လာဝယ်သူ',
  'No sales yesterday': 'မနေ့က အရောင်းမရှိပါ', 'Level with yesterday': 'မနေ့ကနှင့် တူညီပါသည်',
  'Up': 'တိုး', 'Down': 'လျော့', 'vs yesterday': 'မနေ့ကထက်',
  'in stock': 'ခု ကျန်', 'open': 'ခု ဖွင့်ထား', 'total': 'ခု စုစုပေါင်း',
  'Awaiting fulfilment': 'ဆောင်ရွက်ရန် စောင့်နေသည်',
  'At or below reorder': 'ပြန်မှာရန် သတ်မှတ်ချက်သို့ ရောက်နေသည်',
  'No reorder alerts': 'ပြန်မှာရန် သတိပေးချက် မရှိပါ',
  'need action': 'ခု ဆောင်ရွက်ရန်လို', 'before returns': 'ပြန်အပ်မှု မတွက်မီ',
  'completed': 'ပြီးစီးသော', 'sale': 'အရောင်း', 'sales': 'အရောင်း', 'today': 'ယနေ့',
  'item': 'ပစ္စည်း', 'items': 'ပစ္စည်း', 'Next:': 'နောက်တစ်ဆင့်:',
  'Review payments': 'ငွေပေးချေမှု စစ်ဆေးရန်', 'Mapped': 'ချိတ်ဆက်ပြီး', 'Unmapped': 'မချိတ်ဆက်ရသေး',
  'Nothing to close': 'ပိတ်ရန် မရှိပါ', 'Close on file': 'ပိတ်သိမ်းမှတ်တမ်းရှိ',
  'Loading advanced controls…': 'အဆင့်မြင့် စီမံမှုများ ဖွင့်နေသည်…',
  'Status and recovery': 'အခြေအနေနှင့် ပြန်လည်ရယူခြင်း',
  'Choose your language.': 'သင်အသုံးပြုလိုသော ဘာသာစကားကို ရွေးပါ။',
  'Saved on this device.': 'ဤစက်တွင် သိမ်းထားသည်။',
  'Back to Shop': 'ဆိုင်သို့ ပြန်ရန်',
  'Shift': 'အလုပ်ချိန်', 'Operating unit': 'လုပ်ငန်းခွဲ', 'Operator': 'တာဝန်ခံ',
  'Sales counter': 'အရောင်းကောင်တာ', 'Counter context': 'ကောင်တာ အခြေအနေ',
  'orders to finish': 'အော်ဒါ ဆက်လုပ်ရန်', 'low stock': 'ကုန်လက်ကျန်နည်း',
  'Sales paused · Review': 'အရောင်းရပ်ထားသည် · စစ်ဆေးရန်',
  'Checking': 'စစ်ဆေးနေသည်', 'Find or scan an item': 'ပစ္စည်း ရှာရန် သို့မဟုတ် စကန်ဖတ်ရန်',
  'Search products or scan barcode': 'ကုန်ပစ္စည်းရှာရန် သို့မဟုတ် ဘားကုဒ်ဖတ်ရန်',
  'Product categories': 'ကုန်ပစ္စည်းအမျိုးအစားများ', 'All items': 'ပစ္စည်းအားလုံး',
  'Uncategorized': 'အမျိုးအစား မသတ်မှတ်ရသေး',
  'Add product with this barcode': 'ဤဘားကုဒ်ဖြင့် ပစ္စည်းထည့်ရန်',
  'Previous': 'ယခင်', 'Next': 'ရှေ့ဆက်', 'Page': 'စာမျက်နှာ', 'of': 'မှ',
  'in sale': 'အရောင်းစာရင်းတွင်', 'Add': 'ထည့်ရန်',
  'Your catalog is empty.': 'ကုန်ပစ္စည်းစာရင်း ဗလာဖြစ်နေသည်။',
  'Add a product': 'ကုန်ပစ္စည်း ထည့်ရန်', 'or': 'သို့မဟုတ်',
  'import a CSV': 'CSV ဖိုင် တင်သွင်းရန်',
  'Close current sale': 'လက်ရှိအရောင်းကို ပိတ်ရန်',
  'Current sale': 'လက်ရှိ အရောင်း', 'Current sale items': 'လက်ရှိအရောင်း၏ ပစ္စည်းများ',
  'Choose a product to start': 'စတင်ရန် ကုန်ပစ္စည်းရွေးပါ',
  'selected': 'ရွေးထားသည်', 'Park sale': 'အရောင်းကို ခေတ္တသိမ်းရန်',
  'Parked': 'ခေတ္တသိမ်းထား', 'Resume': 'ပြန်ဆက်ရန်', 'Clear': 'ရှင်းရန်',
  'Item': 'ပစ္စည်း', 'Quantity': 'အရေအတွက်', 'optional': 'မဖြစ်မနေမလို',
  'Guest': 'ဧည့်သည်', 'Cash': 'ငွေသား', 'Payment': 'ငွေပေးချေမှု',
  'Leave unpaid': 'ငွေမပေးရသေးအဖြစ် သိမ်းရန်',
  'Track it in Orders and finish later.': 'အော်ဒါစာရင်းတွင် ဆက်လက်စောင့်ကြည့်ပြီး နောက်မှ ပြီးစီးအောင် လုပ်ပါ။',
  'Review stock': 'ကုန်လက်ကျန် စစ်ဆေးရန်',
  'Review & complete sale': 'အရောင်းကို စစ်ဆေးပြီး အတည်ပြုရန်',
  'Review and save close': 'ပိတ်သိမ်းစာရင်းကို စစ်ဆေးပြီး သိမ်းရန်',
  'Review order': 'အော်ဒါ စစ်ဆေးရန်', 'Sales paused': 'အရောင်း ရပ်ထားသည်',
  'Total': 'စုစုပေါင်း', 'Remove': 'ဖယ်ရန်', 'Out of stock': 'ကုန်လက်ကျန် မရှိပါ',
  'Add to this sale': 'ဤအရောင်းထဲ ထည့်ရန်',
  'Ready for the next sale': 'နောက်အရောင်းအတွက် အဆင်သင့်',
  'Search, scan or choose a product.': 'ပစ္စည်းကို ရှာပါ၊ စကန်ဖတ်ပါ သို့မဟုတ် ရွေးပါ။',
  'Not added. Stock limit or saving paused.': 'မထည့်နိုင်ပါ။ ကုန်လက်ကျန်မလုံလောက်ခြင်း သို့မဟုတ် သိမ်းဆည်းမှုရပ်ထားခြင်း ဖြစ်နိုင်သည်။',
  'This SKU or barcode matches more than one product. Correct the duplicate product codes before scanning again.': 'ဤ SKU သို့မဟုတ် ဘားကုဒ်သည် ကုန်ပစ္စည်းတစ်မျိုးထက်ပို၍ ကိုက်ညီနေသည်။ ထပ်နေသောကုဒ်များကို ပြင်ပြီး ပြန်ဖတ်ပါ။',
  'No product matches this SKU or barcode. Check the code or add the product.': 'ဤ SKU သို့မဟုတ် ဘားကုဒ်နှင့် ကိုက်ညီသောပစ္စည်း မရှိပါ။ ကုဒ်ကို စစ်ဆေးပါ သို့မဟုတ် ပစ္စည်းထည့်ပါ။',
  'This product is out of stock. Review stock before selling it.': 'ဤပစ္စည်း ကုန်သွားပါပြီ။ မရောင်းမီ ကုန်လက်ကျန်ကို စစ်ဆေးပါ။',
  'More than one product has this name. Choose one from the list.': 'ဤအမည်ဖြင့် ပစ္စည်းတစ်မျိုးထက်ပိုရှိသည်။ စာရင်းမှ တစ်မျိုးရွေးပါ။',
  'added to this sale.': 'ဤအရောင်းထဲ ထည့်ပြီးပါပြီ။',
  'Printing was blocked. Allow pop-ups for this site, then try again.': 'ပုံနှိပ်ရန် ဖွင့်မရပါ။ ဤဆိုက်အတွက် ပေါ့ပ်အပ်များကို ခွင့်ပြုပြီး ပြန်ကြိုးစားပါ။',
  'The receipt could not be opened. Try the browser menu to print it.': 'ပြေစာကို ဖွင့်မရပါ။ ဘရောက်ဇာမီနူးမှ ပုံနှိပ်ကြည့်ပါ။',
  'Print dialog opened. Choose a printer or Save as PDF.': 'ပုံနှိပ်ရန် ပြတင်းပေါက် ဖွင့်ထားပါသည်။ ပရင်တာကို ရွေးပါ၊ သို့မဟုတ် PDF အဖြစ် သိမ်းပါ။',
  'Test slip opened. Choose your receipt printer; no sale was recorded.': 'စမ်းသပ်စာရွက် ဖွင့်ထားပါသည်။ ပြေစာပရင်တာကို ရွေးပါ။ အရောင်းမှတ်တမ်း မဖန်တီးထားပါ။',
  'ready': 'အဆင်သင့်', 'preparing': 'ပြင်ဆင်နေ', 'pending': 'စောင့်ဆိုင်းနေ',
}

export function uiText(english: string): string {
  return currentLocale === 'my' ? UI_TRANSLATIONS[english] ?? english : english
}
