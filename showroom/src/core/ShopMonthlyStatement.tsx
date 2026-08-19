import type { ShopMonthlyStatement as ShopMonthlyStatementModel } from './shop-monthly-statement.ts'

type ShopMonthlyStatementProps = {
  statement: ShopMonthlyStatementModel
  download?: { href: string; filename: string } | null
}

function formatMmk(value: number): string {
  return `${value.toLocaleString()} MMK`
}

function periodLabel(statement: ShopMonthlyStatementModel): string {
  if (statement.period === 'all') return 'Since you started'
  const parsed = new Date(`${statement.period}-01T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return statement.period
  return parsed.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export function ShopMonthlyStatement({ statement, download = null }: ShopMonthlyStatementProps) {
  const { pnl, balance } = statement
  const soldRows: Array<[label: string, value: number, tone?: 'kept']> = [
    ['What you sold', pnl.soldMmk],
    ['What you gave back', pnl.gaveBackMmk],
    ['What you bought', pnl.boughtMmk],
    ['Till differences', pnl.tillDifferencesMmk],
  ]

  if (!statement.hasActivity) {
    return <section aria-label="Monthly statement" className="core-panel shop-monthly-statement" id="shop-monthly-statement">
      <div className="panel-head">
        <div><span className="core-eyebrow">Monthly statement</span><h2>Nothing to show yet</h2></div>
      </div>
      <p className="panel-note">Your statement starts at your first daily close. Record a close and this fills in from your own sales, refunds, purchases, and till counts &mdash; no typing, no second set of books.</p>
    </section>
  }

  return <section aria-label="Monthly statement" className="core-panel shop-monthly-statement" id="shop-monthly-statement" data-shop-monthly-statement={statement.tiesToAgingBriefs ? 'ties' : 'untied'}>
    <div className="panel-head">
      <div>
        <span className="core-eyebrow">Monthly statement</span>
        <h2>{periodLabel(statement)}</h2>
        <small>{statement.fromDate ? `${statement.fromDate} to ${statement.toDate}` : 'Since you started'} &middot; Myanmar Kyat</small>
      </div>
    </div>

    <div className="statement-block" aria-label="What happened this period">
      <div className="statement-rows">
        {soldRows.map(([label, value]) => (
          <span className="statement-row" key={label}>
            <small>{label}</small>
            <b>{formatMmk(value)}</b>
          </span>
        ))}
      </div>
      <div className="statement-kept" role="group" aria-label="Kept before other costs">
        <span><small>Kept before other costs</small><b>{formatMmk(pnl.keptBeforeOtherCostsMmk)}</b></span>
        <small className="panel-note">Not profit &mdash; rent, wages, and fuel are not in your records yet. This is what is left after what you gave back, what you bought, and till differences.</small>
      </div>
    </div>

    <div className="statement-block" aria-label="Where things stand now">
      <h3>Where things stand now</h3>
      <div className="statement-rows">
        {balance.cashAndWallets.length ? balance.cashAndWallets.map((account) => (
          <span className="statement-row" key={account.accountCode}>
            <small>{account.name}</small>
            <b>{formatMmk(account.balanceMmk)}</b>
          </span>
        )) : <span className="statement-row"><small>Cash and wallets</small><b>{formatMmk(0)}</b></span>}
        <span className="statement-row statement-row-subtotal">
          <small>Cash and wallets total</small>
          <b>{formatMmk(balance.cashAndWalletsTotalMmk)}</b>
        </span>
        <span className="statement-row">
          <small>Customers owe you</small>
          <b>{formatMmk(balance.customersOweYouMmk)}</b>
        </span>
        <span className="statement-row">
          <small>You owe suppliers</small>
          <b>{formatMmk(balance.youOweSuppliersMmk)}</b>
        </span>
        <span className="statement-row">
          <small>Tax collected, not yet paid</small>
          <b>{formatMmk(balance.taxCollectedNotPaidMmk)}</b>
        </span>
      </div>
      <small className="panel-note">&ldquo;Customers owe you&rdquo; and &ldquo;You owe suppliers&rdquo; match your receivables and payables reports exactly.</small>
    </div>

    {statement.correctionsOutstanding.correctionsOwedToYouMmk !== 0 || statement.correctionsOutstanding.correctionsYouOweMmk !== 0 ? <div className="statement-block" aria-label="Invoice corrections outstanding">
      <h3>Invoice corrections outstanding</h3>
      <div className="statement-rows">
        {statement.correctionsOutstanding.correctionsOwedToYouMmk !== 0 ? <span className="statement-row">
          <small>Invoice corrections owed to you</small>
          <b>{formatMmk(statement.correctionsOutstanding.correctionsOwedToYouMmk)}</b>
        </span> : null}
        {statement.correctionsOutstanding.correctionsYouOweMmk !== 0 ? <span className="statement-row">
          <small>Invoice corrections you owe</small>
          <b>{formatMmk(statement.correctionsOutstanding.correctionsYouOweMmk)}</b>
        </span> : null}
      </div>
      <small className="panel-note">From corrected invoices. These amounts are not part of &ldquo;Customers owe you&rdquo; or &ldquo;You owe suppliers&rdquo; &mdash; they are shown here on their own so the money stays visible.</small>
    </div> : null}

    {statement.tillVarianceOwners.length ? <div className="statement-block" aria-label="Till differences by operator">
      <h3>Till differences by operator</h3>
      <div className="statement-rows">
        {statement.tillVarianceOwners.map((owner) => (
          <span className="statement-row" key={owner.owner}>
            <small>{owner.owner}</small>
            <b>{owner.tillDifferenceMmk > 0 ? `${formatMmk(owner.tillDifferenceMmk)} short` : `${formatMmk(-owner.tillDifferenceMmk)} over`}</b>
          </span>
        ))}
      </div>
    </div> : null}

    {download ? <div className="statement-block statement-export">
      <a className="text-link" data-shop-ledger-journal="review-required" download={download.filename} href={download.href}>Download ledger CSV</a>
      <small className="panel-note">The full journal for your accountant to review. No ledger post, tax filing, or bank settlement runs from this statement.</small>
    </div> : null}
  </section>
}
