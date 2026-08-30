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
// 2. DRAFTING SOURCES, and nothing else. Batches 1 and 2 were entirely new text,
//    because no existing Burmese string in the app was an action VERB (confirmed by
//    a full Unicode sweep of every product surface). Batch 3 adds a second source
//    and deliberately narrows this rule: an entry may reuse a Burmese NOUN this app
//    already ships in its data layer -- shop-ledger-accounts.ts,
//    shop-service-scheduling.ts -- and those entries are marked `sourced:` with the
//    file, precisely so the native reviewer can check them against the ledger and
//    service names an owner already reads rather than treating them as new coinage.
//    Anything not marked `sourced:` is new text. What the existing vocabulary sets
//    either way is the register to match: plain second-person tone, no textbook
//    jargon, Burmese numerals over Arabic digits, phonetic transliteration for
//    loanwords -- see those two files for the precedent this follows.
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
  // DESIGN-PROGRAM batch 2, Option B (composed-label design note in
  // hq/strategy/DESIGN-PROGRAM.md): whole composed phrases as first-class entries,
  // because a verb-only gloss cannot distinguish "Save client setup" from "Save
  // restore point" for a Burmese-first reader. Drafted from the confirmed verbs
  // above as building blocks (Save သိမ်းမည်, Open ဖွင့်မည်, Sign in ဝင်ရောက်မည်,
  // Export ထုတ်ယူမည်, Clear ရှင်းလင်းမည်, Add ထည့်မည်) plus the app's loanword
  // convention (ကုမ္ပဏီ company, ဖိုင် file, အော်ဒါ order, ပက်ကက် packet). Object
  // marker ကို is dropped for button brevity except where an untranslated product
  // name precedes the verb. ALL of these stay pending_native_review -- rule 1
  // above means none of them renders until a native speaker signs each one off.
  'Back to sign in': { my: 'ဝင်ရောက်ရန်သို့ ပြန်သွားမည်', status: 'pending_native_review' },
  'Find my company': { my: 'ကျွန်ုပ်၏ကုမ္ပဏီ ရှာမည်', status: 'pending_native_review' },
  'Open company': { my: 'ကုမ္ပဏီ ဖွင့်မည်', status: 'pending_native_review' },
  'Open my Shop': { my: 'ကျွန်ုပ်၏ Shop ကို ဖွင့်မည်', status: 'pending_native_review' }, // "Shop" is the product name; native call needed on Shop vs ဆိုင်
  'Company sign in': { my: 'ကုမ္ပဏီအကောင့်ဖြင့် ဝင်ရောက်မည်', status: 'pending_native_review' },
  'Company login': { my: 'ကုမ္ပဏီအကောင့် ဝင်ရောက်မည်', status: 'pending_native_review' }, // near-synonym of "Company sign in"; reviewer may unify the two Burmese forms
  'Save client setup': { my: 'ဖောက်သည်စီစဉ်မှု သိမ်းမည်', status: 'pending_native_review' }, // persists a form -- reviewer should check သိမ်းမည် carries "keep this record", not "download"
  'Save restore point': { my: 'ပြန်လည်ရယူရန်အမှတ် သိမ်းမည်', status: 'pending_native_review' },
  'Save my claim file': { my: 'ကျွန်ုပ်၏တောင်းဆိုချက်ဖိုင် သိမ်းမည်', status: 'pending_native_review' }, // downloads to disk -- the sense-drift case from the design note; may need a different verb than the form-saving entries
  'Export full evidence': { my: 'အထောက်အထားအပြည့်အစုံ ထုတ်ယူမည်', status: 'pending_native_review' },
  'Clear packet': { my: 'ပက်ကက် ရှင်းလင်းမည်', status: 'pending_native_review' }, // ပက်ကက် is a raw transliteration; native call needed on a plainer word for a pasted data blob
  'Clear order packet': { my: 'အော်ဒါပက်ကက် ရှင်းလင်းမည်', status: 'pending_native_review' },
  'Load sample packet': { my: 'နမူနာပက်ကက် ထည့်မည်', status: 'pending_native_review' },
  'Load sample order packet': { my: 'နမူနာအော်ဒါပက်ကက် ထည့်မည်', status: 'pending_native_review' },
  // ERP-COMPETITIVE-ROADMAP G1, batch 3 -- THE COUNTER SLICE. Everything a cashier
  // touches: the four Shop work modes (commerce-tabs.ts), the sales counter, and the
  // receipt. Same Option B rule as batch 2 -- the reviewed unit is exactly the string
  // the operator sees -- and the same safety rule 1: every entry below is
  // pending_native_review, so bi() renders plain English for all of them and this
  // batch changes NOTHING on screen until a native speaker signs each line off.
  //
  // Drafted, not machine-translated. Two sources only: (a) the confirmed verbs above
  // as building blocks, and (b) Burmese nouns this app ALREADY ships in its data layer
  // -- shop-ledger-accounts.ts and shop-service-scheduling.ts. Entries anchored to (b)
  // are marked `sourced:` with the file that already uses the word, because those are
  // the cheapest for a reviewer to confirm; everything else carries the specific call
  // the reviewer has to make. Where neither source reaches, there is no entry at all
  // (see the two REFUSED notes at the end) -- a missing entry renders English, which
  // is the failure mode this table is built to prefer.
  //
  // -- Work modes (commerce-tabs.ts labels; the phone bottom bar and the in-page
  //    toolbar render the same four). These are the tightest space on the surface:
  //    five cells across a 375px bar. See .bi-label in core-app.css, which lets the
  //    composed label wrap to two lines there instead of being clipped by the
  //    nowrap/ellipsis rule the bar has always had.
  'Today': { my: 'ယနေ့', status: 'pending_native_review' },
  'Sell': { my: 'ရောင်းမည်', status: 'pending_native_review' }, // sourced: ရောင်းရငွေ (shop-ledger-accounts.ts sales_revenue)
  'Orders': { my: 'အော်ဒါများ', status: 'pending_native_review' }, // အော်ဒါ is the batch-2 loanword; reviewer call on whether များ is wanted on a tab
  'Stock': { my: 'ကုန်ပစ္စည်း', status: 'pending_native_review' }, // this tab is on-hand goods, not a stock market -- reviewer should check the word cannot be read as စတော့ (shares)
  // -- The sales counter
  'Counter open': { my: 'ကောင်တာ ဖွင့်ထား', status: 'pending_native_review' }, // sourced: ကောင်တာ (shop-service-scheduling.ts pickup counter) + ဖွင့် from the confirmed Open
  'Tap an item to add it': { my: 'ပစ္စည်းတစ်ခုကို နှိပ်၍ ထည့်ပါ', status: 'pending_native_review' }, // ထည့် from the confirmed Add; imperative ပါ, not verb-final မည်, because it instructs rather than labels a button
  'Current sale': { my: 'လက်ရှိ အရောင်း', status: 'pending_native_review' }, // sourced: အရောင်း (shop-service-scheduling.ts အရောင်းဆိုင်)
  'Ready for the first item': { my: 'ပထမပစ္စည်း ထည့်ရန် အဆင်သင့်', status: 'pending_native_review' },
  'Your sale is empty': { my: 'အရောင်းစာရင်း ဗလာဖြစ်နေသည်', status: 'pending_native_review' },
  'Tap any product to begin.': { my: 'စတင်ရန် ပစ္စည်းတစ်ခုကို နှိပ်ပါ။', status: 'pending_native_review' }, // စတင် from the confirmed Start
  'Out of stock': { my: 'ကုန်ပစ္စည်း ပြတ်နေသည်', status: 'pending_native_review' },
  // The product tile's accessible NAME. Reached via aria-labelledby rather than
  // aria-label so the tile's own subtree (price, stock, quantity, and the owner-typed
  // item.nameMy) survives instead of being overridden -- see the tile in CoreApp.tsx.
  // Reviewer question this one carries and the other counter entries do not: the
  // composed name is ONE flat string in source order, so English (verb-first) and
  // Burmese (verb-final) cannot both put the verb where their grammar wants it
  // relative to the product name that follows. The draft below keeps the verb phrase
  // whole in both halves; a reviewer may instead want the Burmese half to read as a
  // bare noun-phrase target. Do not confirm this entry without settling that.
  'Add to this sale': { my: 'ဤအရောင်းထဲ ထည့်မည်', status: 'pending_native_review' }, // ထည့်မည် is the confirmed Add; အရောင်း sourced: shop-service-scheduling.ts အရောင်းဆိုင်
  'No matching item. Search by name or SKU.': { my: 'ကိုက်ညီသော ပစ္စည်းမရှိပါ။ အမည် သို့မဟုတ် SKU ဖြင့် ရှာပါ။', status: 'pending_native_review' }, // SKU stays Latin: it is what is printed on the shelf label
  'Customer': { my: 'ဖောက်သည်', status: 'pending_native_review' }, // sourced: ဖောက်သည် (shop-ledger-accounts.ts accounts_receivable)
  'Payment': { my: 'ငွေပေးချေမှု', status: 'pending_native_review' },
  'Total': { my: 'စုစုပေါင်း', status: 'pending_native_review' }, // one entry serves the counter footer and the receipt total, which is the point of exact-match Option B
  'Review order': { my: 'အော်ဒါ စိစစ်မည်', status: 'pending_native_review' }, // depends on Review စိစစ်မည်, itself still pending above -- confirm that one first, then this
  'Sales paused': { my: 'အရောင်း ခေတ္တရပ်ထား', status: 'pending_native_review' },
  'Create order': { my: 'အော်ဒါ ဖွင့်မည်', status: 'pending_native_review' }, // this button RESERVES stock and opens an order, it does not take money -- reviewer should confirm ဖွင့်မည် reads that way and not as "finish the sale"
  // -- The merchant payment QR dialog, which opens from the counter's sale details
  //    when a non-cash method is chosen (PaymentQr.tsx). It is part of the counter
  //    slice for a concrete reason: its Close button is the same already-CONFIRMED
  //    key the receipt dialog uses, so leaving this dialog out would have shown one
  //    Burmese Close and one English Close in the same non-cash sale.
  'Scan to pay': { my: 'ငွေပေးရန် စကန်ဖတ်ပါ', status: 'pending_native_review' }, // စကန် is a transliteration; reviewer may prefer a native verb for reading a code
  'Amount due': { my: 'ပေးရန် ပမာဏ', status: 'pending_native_review' },
  // -- The receipt dialog
  'Order record': { my: 'အော်ဒါ မှတ်တမ်း', status: 'pending_native_review' }, // မှတ်တမ်း from the confirmed Record မှတ်တမ်းတင်မည်
  'Subtotal': { my: 'စုစုပေါင်းခွဲ', status: 'pending_native_review' },
  'Discount': { my: 'လျှော့ဈေး', status: 'pending_native_review' },
  'Delivery': { my: 'ပို့ဆောင်မှု', status: 'pending_native_review' }, // ပို့ from the confirmed Send
  'Tax': { my: 'အခွန်', status: 'pending_native_review' }, // sourced: အခွန် (shop-ledger-accounts.ts tax_payable)
  'Paid': { my: 'ငွေပေးပြီး', status: 'pending_native_review' },
  'Payment pending': { my: 'ငွေပေးချေရန် ကျန်', status: 'pending_native_review' },
  'Points redeemed': { my: 'အသုံးပြုပြီး အမှတ်', status: 'pending_native_review' },
  'Points balance': { my: 'အမှတ် လက်ကျန်', status: 'pending_native_review' },
  'Print receipt': { my: 'ဘောင်ချာ ပရင့်ထုတ်မည်', status: 'pending_native_review' }, // two loanwords in one label; reviewer may prefer ငွေဖြတ်ပိုင်း for the slip
  'Copy text': { my: 'စာသား ကူးယူမည်', status: 'pending_native_review' },
  // REFUSED, deliberately -- no entry, so bi() renders English and the surface stays
  // honest rather than confidently wrong:
  //   'Products' (CoreShell.tsx mobile bottom bar) -- this link opens the SuperMega
  //     PRODUCT CHOOSER (Shop, Plant, Website, Ecommerce), not the shop's goods. The
  //     obvious Burmese word for it (ထုတ်ကုန်) sits one cell away from the Stock tab
  //     and would read as "the things I sell". A cashier who taps it lands somewhere
  //     they did not ask for. Naming this needs a decision about what the chooser is
  //     called in Burmese, which is a founder/native question, not a translation.
  //   'Cash' / 'KBZPay' / 'WavePay' (payment method buttons) -- KBZPay and WavePay are
  //     brand names printed on the wallets themselves and are already shown in Latin
  //     script inside this app's own Burmese ledger names (KBZPay ပိုက်ဆံအိတ်). Glossing
  //     only 'Cash' would make one of three siblings bilingual, which reads as a
  //     different KIND of button rather than a translated one.
}

// The bilingual pattern already used everywhere in this app (SettingsPage.tsx,
// ProductOnboardingPage.tsx): English, a middle dot, Burmese. lang="my" on just the
// Burmese half activates the :lang(my) line-height rule already shipped in
// core-app.css, ecommerce-product.css, and website-product.css -- CSS that has had
// nothing to apply to until now, since no JSX anywhere actually set the attribute.
// The className is the one addition batch 3 makes to the mechanism itself, and it
// exists because of a measured problem, not for tidiness: .mobile-nav a has carried
// `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` since the bar
// shipped, so a composed label in a 5-across 375px bar would ellipsise away exactly
// the Burmese half a Burmese-first cashier is reading. Nothing can address that from
// inside the nav's own rule without also constraining every other label there. The
// class ships now, wired and styled, so that flipping a work-mode entry to
// 'confirmed' after review stays the one-line table edit batch 2 established.
export function bi(en: string): ReactNode {
  const entry = ACTION_TRANSLATIONS[en]
  if (!entry || entry.status !== 'confirmed') return en
  return createElement('span', { className: 'bi-label' }, `${en} · `, createElement('span', { lang: 'my' }, entry.my))
}
