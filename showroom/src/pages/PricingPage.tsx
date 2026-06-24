import { Link } from 'react-router-dom'

const startSteps = [
  ['Source', 'File, sheet, folder, screenshot, export, menu, issue log, or repeated task.'],
  ['App map', 'First screen, modules, owner action, data boundary, missing fields, and acceptance test.'],
  ['Build', 'One usable desktop/mobile app first, then expand after proof.'],
] as const

const productStarts = [
  ['Daily work', 'Back Office Workflow Desk', 'Workflow scope, source intake, approval queue, and weekly proof.'],
  ['Factories', 'Factory Operations App', 'Issues, assets, readings, WCM board, CAPA, ISO evidence, and manager closeout.'],
  ['Shops', 'Restaurant POS + Inventory', 'Menu and QR, orders, payment proof, stock exceptions, shift close, and owner report.'],
] as const

export function PricingPage() {
  return (
    <div className="space-y-8 pb-14">
      <section className="sm-site-panel overflow-hidden">
        <div className="grid gap-8 xl:grid-cols-[0.92fr_1.08fr] xl:items-end">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Start</p>
            <h1 className="mt-4 max-w-4xl text-5xl font-black tracking-[-0.08em] text-white lg:text-7xl">
              Start with one source.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              Send one real source. We map the first useful app, the owner decision, the safety boundary, and the acceptance test.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/contact?source=start-page">
                Send a source
              </Link>
              <Link className="sm-button-secondary" to="/products">
                See products
              </Link>
            </div>
          </div>
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5">
            <p className="sm-kicker text-[var(--sm-accent)]">Simple path</p>
            <div className="mt-4 grid gap-3">
              {startSteps.map(([label, detail], index) => (
                <article className="grid grid-cols-[auto_1fr] gap-3 rounded-[1.35rem] border border-white/10 bg-white/[0.035] p-4" key={label}>
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[var(--sm-accent)] text-xs font-black text-[var(--sm-bg)]">
                    {index + 1}
                  </span>
                  <div>
                    <h2 className="text-lg font-black leading-tight text-white">{label}</h2>
                    <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--sm-muted)]">{detail}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="sm-site-panel" aria-label="Start products">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Products</p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.06em] text-white">Choose one product.</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--sm-muted)]">
            The first release stays small enough to test with real work and clear enough for the team to use.
          </p>
        </div>
        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          {productStarts.map(([eyebrow, name, detail]) => (
            <article className="sm-proof-card" key={name}>
              <p className="sm-kicker text-[var(--sm-accent)]">{eyebrow}</p>
              <h3 className="mt-3 text-xl font-black leading-tight text-white">{name}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Approval first</p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.06em] text-white">No account before approval.</h2>
          </div>
          <p className="text-base leading-relaxed text-[var(--sm-muted)]">
            No connector, data write, external send, or automation runs until the source boundary and owner approval are clear.
          </p>
        </div>
      </section>
    </div>
  )
}
