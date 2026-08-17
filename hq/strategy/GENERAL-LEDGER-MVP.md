# General Ledger MVP: the ledger as a projection, not a second set of books

Date: 2026-08-14
Author: Ledger Codex
Status: design (no deploy, write, or gate change authorized by this document)
Sources: showroom/src/core/commerce-workspace.ts (accounting-handoff v3 lines
730-769 and 9719-9995, account roles line 126, closes lines 621-670, corrections
lines 295-306, supplier invoices lines 1120-1139), shop-daily-close-summary.ts,
shop-ar-aging-summary.ts, shop-ap-aging-summary.ts, shop-working-capital-summary.ts,
products/shop/business-templates.ts, local-workspace-storage.ts,
hq/strategy/ERP-COMPETITIVE-ROADMAP.md (Accounting row; 90-day item 9).

Rule inherited from the roadmap: every claim cites a repo file or names the gap.

---

## 1. Principle: derive, never transcribe

The repo already computes balanced double-entry artifacts from the operating
record: commerceAccountingHandoff emits debit/credit entries per close with a
fail-closed control-total check (commerce-workspace.ts line 9891 returns null
on imbalance), supplier payables and customer receivables ship as balanced
review-only handoffs, and 454 brief modules prove the projection lattice works.

The general ledger is therefore NOT a new store the owner writes into. It is a
deterministic projection over events that already exist and already carry a
CommerceActionProof (actionId, capturedAt, actor, reason, evidenceReference --
line 1257). Consequences that matter:

- The ledger can never disagree with the operating record; it IS the record,
  re-read. No sync, no drift, no "which book is right" conversation.
- Zero new persisted keys: no local-workspace-storage.ts registration, no
  company-backup.ts change, no reset-scope change, no migration.
- The owner never types a journal entry in v1. Manual entries (opening
  balances, accruals) are a v2 feature gated on accountant review, because a
  typed entry is the first line with no source event -- it needs a reviewer.

## 2. Scope: which events become journal entries

Every entry derives from one existing evidence-gated event. v1 sources:

| Source event (existing)            | Journal entry (derived)                              |
|---|---|
| Daily close (CommerceClose + daily-close-export v3) | DR payment_clearing per method / CR sales_revenue, tax_payable, sales_revenue_unverified -- exactly today's handoff entries, promoted to journal lines |
| Close settlement line variance (CommerceCloseSettlementLine) | DR/CR cash_over_short vs payment_clearing per line; varianceOwner is the accountable operator |
| Order correction (CommerceOrderCorrection, credit/debit) | The CORR-* reversal-shaped lines already emitted by the handoff (lines 9850-9888), unchanged |
| Refund settlement (refundSettledAt + proof fields on CommerceOrder) | DR sales_adjustment (+ tax reversal) / CR payment_clearing |
| Credit-order payment reconciliation (paymentReconciledAt after paymentDueAt) | DR payment_clearing / CR accounts_receivable; the matching DR accounts_receivable posts at the close that contained the credit sale |
| Supplier invoice payable review (CommerceSupplierInvoice.payableReview) | DR purchases_expense / CR accounts_payable |
| Supplier credit note (CommerceSupplierCreditNote) | DR accounts_payable / CR purchases_expense (reversal shape) |

Not events, not entries: stock movements (no cost layers exist -- see cut
line), storefront requests (not yet orders), leads, production jobs.

## 3. Chart of accounts: grow the existing role surface

CommerceAccountRole (line 126) already names 7 roles and the account-mapping
configuration already maps roles to external accountant codes with a proof and
a revision (CommerceAccountMappingConfiguration, validated generationally at
lines 2656-2662: 4 legacy roles or 7 current -- adding a third generation of 12
follows the established pattern). v1 chart:

  Assets:      cash_kbz_wallet, cash_wave_wallet, cash_drawer (split of
               payment_clearing by method label), accounts_receivable
  Liabilities: accounts_payable, tax_payable, correction_payable
  Income:      sales_revenue, sales_revenue_unverified
  Expense:     purchases_expense, sales_adjustment, cash_over_short
  Contra/AR:   correction_receivable

Per-trade extension: a pack may RENAME and ADD leaf accounts, never remove or
re-type a core role. Grounded in ShopBusinessTemplate.industryPackId
(business-templates.ts): a restaurant pack labels purchases_expense "Kitchen
purchases", a pharmacy adds an expiry_writeoff expense (v2, needs a source
event). Display names carry Burmese labels the same way service packs do
(shop-service-scheduling.ts pattern) without invalidating saved workspaces.

## 4. What the owner sees (never a T-account)

Monthly statement, owner language, one screen, derived per Myanmar business
month (myanmarBusinessDate, commerce-workspace.ts line 1892):

  "What you sold"            sales_revenue + unverified, net of adjustments
  "What you gave back"       refunds + credit corrections
  "What you bought"          purchases_expense
  "Till differences"         cash_over_short, with variance owners named
  "Kept before other costs"  the honest label -- NOT "profit", because rent,
                             wages, fuel are not in the record in v1

Balance snapshot, same screen: "Cash and wallets" (per method), "Customers owe
you" (ties to shop-ar-aging-summary totals), "You owe suppliers" (ties to
shop-ap-aging-summary), "Tax collected, not yet paid". The tie-out to the
existing AR/AP briefs is a checked invariant, not a hope (test plan, sec 7).

Accountant export: accounting-handoff grows a v4 with a ledger section --
the full journal CSV (digest-sealed like every handoff CSV) plus a monthly
trial balance per account. status: 'review_required', postingAuthority:
'none', externalPostingPerformed: false stay exactly as v3 has them: the
device never claims the accountant's books were written.

## 5. Evidence discipline

1. Traceability: every LedgerJournalLine carries source event kind + id +
   the source artifact digest (closes and handoffs are already digest-sealed).
   A line with no source event cannot be constructed in v1 -- the type has no
   optional source.
2. Period lock: one close per businessDate is already enforced (validation at
   line 4150; commerceCloseExpectation refuses a duplicate date, line 9247).
   A businessDate with a close is a locked period. Events proved after that
   close post into the current open period carrying sourcePeriod, mirroring
   how corrections already work rather than rewriting history.
3. Corrections are reversals, never edits: the CORR-* pattern (paired
   debit/credit lines referencing documentId + sourceCalculationDigest) is
   the only correction shape. reversalOfEntryId links the pair.
4. Fail closed: the journal builder mirrors the handoff control-total check --
   if any entry does not balance or the journal totals differ, it refuses to
   emit and names the offending source event id. No partial ledger exists.

## 6. Data shape (TypeScript, showroom/src/core conventions)

  export const SHOP_LEDGER_JOURNAL_SCHEMA = 'supermega.shop.ledger-journal.v1'
  export type LedgerAccountType = 'asset'|'liability'|'equity'|'income'|'expense'
  export type LedgerAccountRole = CommerceAccountRole
    | 'accounts_receivable' | 'accounts_payable'
    | 'purchases_expense' | 'cash_over_short'
  export type LedgerAccount = {
    code: string; role: LedgerAccountRole; type: LedgerAccountType
    name: string; nameMy?: string; packId?: string   // core accounts: no packId
  }
  export type LedgerSourceEvent = {
    kind: 'daily_close'|'close_settlement'|'order_correction'
      |'refund_settlement'|'payment_reconciliation'
      |'supplier_invoice'|'supplier_credit_note'
    id: string; artifactDigest: string | null
  }
  export type LedgerJournalLine = {
    lineId: string; side: 'debit'|'credit'; accountCode: string
    accountRole: LedgerAccountRole; amountMmk: number; memo: string
  }
  export type LedgerJournalEntry = {
    entryId: string; businessDate: string; postedPeriod: string
    source: LedgerSourceEvent; actor: string; evidenceReference: string
    reversalOfEntryId?: string; lines: LedgerJournalLine[]
  }
  export type LedgerJournal = {
    schema: typeof SHOP_LEDGER_JOURNAL_SCHEMA; currency: 'MMK'
    fromDate: string; toDate: string; entries: LedgerJournalEntry[]
    totalDebitMmk: number; totalCreditMmk: number; digest: string
  }

All amounts are integer MMK like every totalMmk in the workspace. The monthly
owner statement and trial balance are plain projection types over LedgerJournal
following the WorkingCapitalSummary shape (pure function, no store).

## 7. File plan

New files (all pure projection modules unless noted):
  showroom/src/core/shop-ledger-accounts.ts      (~150 lines) chart + pack extension
  showroom/src/core/shop-ledger-journal.ts       (~650 lines) derivation + digest + CSV
  showroom/src/core/shop-monthly-statement.ts    (~200 lines) owner P&L + balance snapshot
  showroom/src/core/ShopMonthlyStatement.tsx     (~220 lines) owner surface (UI)

Changed files:
  showroom/src/core/commerce-workspace.ts   export myanmarBusinessDate; add
    handoff v4 constant + ledger section builder delegating to shop-ledger-journal
  showroom/src/core/account-routes.ts / CoreApp.tsx   route the statement page
  (account mapping validation gains the third role generation, same file)

Deliberately unchanged: local-workspace-storage.ts, company-backup.ts,
capability-tiers.ts (the ledger is a local capability, FREE_FOREVER applies).

Tests (repo pattern: tools/test_*.mjs, esbuild-bundled from showroom/src/core,
assert/strict, check-counter -- mirror test_shop_daily_close_summary.mjs):
  tools/test_shop_ledger_journal_balances.mjs      every entry and journal balances; imbalance fails closed
  tools/test_shop_ledger_journal_sources.mjs       every line traces to a real event id + digest
  tools/test_shop_ledger_period_lock.mjs           post-close events land in the open period, linked
  tools/test_shop_ledger_correction_reversal.mjs   corrections emit reversal pairs, never edits
  tools/test_shop_ledger_accounts_pack.mjs         pack extension cannot remove or re-type core roles
  tools/test_shop_monthly_statement.mjs            statement ties to trial balance and AR/AP briefs
  tools/test_shop_ledger_handoff_v4_csv.mjs        CSV digest integrity, v3 exports still verify

Size against the artifact budget: ~1,200 new source lines -> roughly 30-45 KB
of bundled JS, noise against the 180 MB / 30,000-file public artifact budget
(tools/verify_public_vercel_artifact_budget.mjs lines 74-75). Real gate is CI:
app:verify plus the separate showroom/ lint run -- new files must lint clean
on their own.

## 8. v1 cut line (explicitly OUT, and why that is fine for 100 shops)

  OUT: multi-currency. Every amount in the record is integer MMK (totalMmk
    throughout commerce-workspace.ts). The first 100 shops trade in MMK only.
  OUT: manual journal entries and opening balances. The ledger starts at the
    shop's first close ("since you started") and says so on the statement.
    Accountant-reviewed manual entries are the v2 headline feature.
  OUT: COGS and inventory valuation. No cost layers exist (stock movements
    carry quantity, not cost basis). Purchases post as expense; periodic
    stocktake valuation stays with the accountant. Faking FIFO would be the
    dishonest ledger this design exists to avoid.
  OUT: tax filing. tax_payable shows the balance; filing forms are the
    accountant's jurisdiction.
  OUT: bank/wallet statement reconciliation. KBZPay/WavePay evidence is
    transfer screenshots referenced by evidenceReference today; statement
    import is a v2+ event source, not a v1 blocker.
  OUT: consolidation, multi-shop, fixed assets, depreciation, cash-flow
    statement.

  Why fine: the target shop hands books to an external accountant (roadmap
  Accounting row). v1's job is to make that handoff so complete the
  accountant stops re-keying -- not to replace the accountant.

## 9. Acceptance path

Roadmap 90-day item 9 (accountant field test of handoff v3) is the entry
evidence for this design: build the journal only after measuring what one real
accountant corrects. Exit test for v1: the same accountant receives handoff v4
with the ledger section and re-keys nothing. No hosted gate is touched; the
ledger ships as local projection code under FREE_FOREVER.

---

End of document.
