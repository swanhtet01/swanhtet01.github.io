import { createElement, type ReactNode } from 'react'

// DESIGN-PROGRAM phase 2 item 6. Every existing bilingual string in this app is a
// data-layer noun (a product name, a service name, a ledger account) -- nothing
// operator-facing on a button or dialog action has ever carried a Burmese
// counterpart. This table is the start of that: shared action verbs used across
// Shop, Plant, Website, and Ecommerce.
//
// Two safety rules, both load-bearing:
// 1. 'confirmed' entries are common, unambiguous business verbs. 'pending_native_
//    review' entries have a draft translation recorded for a future pass but are
//    NOT rendered -- bi() below falls back to English-only for anything not
//    'confirmed', so adding a pending draft here can never surface an unverified
//    guess to a real operator. Flip status to 'confirmed' only after a native
//    Burmese speaker has actually checked the string.
// 2. Every translation here is genuinely NEW -- none reuses an existing app term,
//    because no existing Burmese string in the app is an action verb (confirmed by
//    a full Unicode sweep of every product surface). What the existing vocabulary
//    DOES set is the register to match: plain second-person tone, no textbook
//    jargon, Burmese numerals over Arabic digits, phonetic transliteration for
//    loanwords -- see shop-ledger-accounts.ts and shop-service-scheduling.ts for
//    the precedent this follows.
type ActionTranslationStatus = 'confirmed' | 'pending_native_review'

type ActionTranslation = {
  my: string
  status: ActionTranslationStatus
}

const ACTION_TRANSLATIONS: Record<string, ActionTranslation> = {
  'Cancel': { my: 'ပယ်ဖျက်မည်', status: 'confirmed' },
  'Confirm change': { my: 'အတည်ပြုမည်', status: 'confirmed' },
  'Retry same confirmation': { my: 'ပြန်လည်ကြိုးစားမည်', status: 'confirmed' },
  'Save': { my: 'သိမ်းမည်', status: 'confirmed' },
  'Close': { my: 'ပိတ်မည်', status: 'confirmed' },
  'Open': { my: 'ဖွင့်မည်', status: 'confirmed' },
  'Add': { my: 'ထည့်မည်', status: 'confirmed' },
  'Remove': { my: 'ဖယ်ရှားမည်', status: 'confirmed' },
  'Delete': { my: 'ဖျက်မည်', status: 'confirmed' },
  'Download': { my: 'ဒေါင်းလုဒ်လုပ်မည်', status: 'confirmed' },
  'Upload': { my: 'တင်မည်', status: 'confirmed' },
  'Record': { my: 'မှတ်တမ်းတင်မည်', status: 'confirmed' },
  'Edit': { my: 'ပြင်ဆင်မည်', status: 'confirmed' },
  'Back': { my: 'နောက်သို့', status: 'confirmed' },
  'Next': { my: 'ရှေ့ဆက်မည်', status: 'confirmed' },
  'Previous': { my: 'ယခင်', status: 'confirmed' },
  'Continue': { my: 'ဆက်လုပ်မည်', status: 'confirmed' },
  'Move up': { my: 'အပေါ်သို့ ရွှေ့မည်', status: 'confirmed' },
  'Move down': { my: 'အောက်သို့ ရွှေ့မည်', status: 'confirmed' },
  'Export': { my: 'ထုတ်ယူမည်', status: 'confirmed' },
  'Send': { my: 'ပို့မည်', status: 'confirmed' },
  'Sign in': { my: 'ဝင်ရောက်မည်', status: 'confirmed' },
  'Restore': { my: 'ပြန်လည်ရယူမည်', status: 'confirmed' },
  'Receive': { my: 'လက်ခံမည်', status: 'confirmed' },
  'Transfer': { my: 'ရွှေ့ပြောင်းမည်', status: 'confirmed' },
  'Reorder': { my: 'ထပ်မံမှာယူမည်', status: 'confirmed' },
  'Complete': { my: 'ပြီးဆုံးမည်', status: 'confirmed' },
  'Start': { my: 'စတင်မည်', status: 'confirmed' },
  'Resolve': { my: 'ဖြေရှင်းမည်', status: 'confirmed' },
  'Return': { my: 'ပြန်ပို့မည်', status: 'confirmed' },
  'Install': { my: 'ထည့်သွင်းမည်', status: 'confirmed' },
  'Clear': { my: 'ရှင်းလင်းမည်', status: 'confirmed' },
  'New': { my: 'အသစ်စတင်မည်', status: 'confirmed' },
  // Pending native review -- drafted, not yet shown to an operator. See rule 1 above.
  'Review': { my: 'စိစစ်မည်', status: 'pending_native_review' }, // the single most-used verb in the app; wrong here is the highest-cost mistake
  'Discard': { my: 'စွန့်ပစ်မည်', status: 'pending_native_review' },
  'Reload': { my: 'ပြန်လည်ဖွင့်မည်', status: 'pending_native_review' },
  'Duplicate': { my: 'ပွားမည်', status: 'pending_native_review' },
  'Free trial': { my: 'အခမဲ့ စမ်းသပ်မည်', status: 'pending_native_review' },
  'Activate': { my: 'အသက်သွင်းမည်', status: 'pending_native_review' },
  'Reset': { my: 'ပြန်လည်သတ်မှတ်မည်', status: 'pending_native_review' },
  'Hold': { my: 'ဆိုင်းငံ့မည်', status: 'pending_native_review' },
  'Check in': { my: 'စစ်ဆေးဝင်မည်', status: 'pending_native_review' },
  'Escalate': { my: 'အထက်သို့ တင်ပြမည်', status: 'pending_native_review' },
  'Reassign': { my: 'ပြန်လည်ခွဲဝေမည်', status: 'pending_native_review' },
  'Trace': { my: 'ခြေရာခံမည်', status: 'pending_native_review' },
  'Verify': { my: 'စိစစ်အတည်ပြုမည်', status: 'pending_native_review' }, // may fold into Confirm -- needs a native call, not guessed here
  'Disconnect': { my: 'ဆက်သွယ်မှု ဖြတ်တောက်မည်', status: 'pending_native_review' },
}

// The bilingual pattern already used everywhere in this app (SettingsPage.tsx,
// ProductOnboardingPage.tsx): English, a middle dot, Burmese. lang="my" on just the
// Burmese half activates the :lang(my) line-height rule already shipped in
// core-app.css, ecommerce-product.css, and website-product.css -- CSS that has had
// nothing to apply to until now, since no JSX anywhere actually set the attribute.
export function bi(en: string): ReactNode {
  const entry = ACTION_TRANSLATIONS[en]
  if (!entry || entry.status !== 'confirmed') return en
  return createElement('span', null, `${en} · `, createElement('span', { lang: 'my' }, entry.my))
}
