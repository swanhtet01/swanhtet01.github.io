import { Link } from 'react-router-dom'

import { trackEvent } from '../lib/analytics'
import { getTenantConfig } from '../lib/tenantConfig'
import { YANGON_TYRE_MODEL } from '../lib/tenantOperatingModel'

const screenshotSize = {
  width: 1440,
  height: 1024,
} as const

const rolloutSteps = [
  {
    title: 'Pick your business template',
    detail: 'Spa, salon, retail, cafe, or repair desk — DeskPOS sets up the right services, staff fields, and payment methods.',
  },
  {
    title: 'Enter prices, staff, and stock',
    detail: 'No data entry training. Type your services, set MMK prices, add your team and inventory. Done in an afternoon.',
  },
  {
    title: 'Open the register and sell',
    detail: 'Take cash, KBZPay, or MMQR. Track bookings. Close the day with one click. Works on a tablet without internet.',
  },
] as const

const deskposVerticals = [
  { name: 'Spa', detail: 'Bookings, therapists, rooms, deposits, recipes.' },
  { name: 'Salon', detail: 'Chairs, stylists, commissions, retail shelf.' },
  { name: 'Retail', detail: 'Counter sales, stock counts, receipts.' },
  { name: 'Cafe', detail: 'Menu, cash/QR, shift close, ingredient stock.' },
  { name: 'Repair', detail: 'Jobs, technicians, parts, customer notes.' },
] as const

const deskposVsIncumbents = [
  { feature: 'MMK / KBZPay / MMQR native', deskpos: 'Yes', square: 'No', fresha: 'No', vagaro: 'No' },
  { feature: 'Works offline', deskpos: 'Yes (PWA)', square: 'Partial', fresha: 'No', vagaro: 'No' },
  { feature: 'Monthly fee', deskpos: '$0', square: '$0–$60', fresha: 'Free + 2.19% on payments', vagaro: '$25–$165' },
  { feature: 'Card-reader lock-in', deskpos: 'None', square: 'Square reader required', fresha: 'Optional', vagaro: 'Required for in-person' },
  { feature: 'Burmese UI', deskpos: 'Yes', square: 'No', fresha: 'No', vagaro: 'No' },
  { feature: 'Tablet + PC + phone', deskpos: 'All three', square: 'Tablet + phone', fresha: 'Tablet + phone', vagaro: 'Tablet + phone' },
] as const

const yangonTyreHighlights = [
  'One customer portal for sales, operations, quality, maintenance, management, and admin.',
  'Connects Gmail, Drive, Calendar, ERP exports, forms, and uploaded files.',
  'Built from reusable templates instead of a one-off custom stack.',
] as const

export function HomePage() {
  const tenant = getTenantConfig()

  if (tenant.key !== 'default') {
    return (
      <div className="space-y-10 pb-16">
        <section className="sm-site-panel">
          <div className="grid gap-8 xl:grid-cols-[0.92fr_1.08fr] xl:items-center">
            <div>
              <p className="sm-kicker text-[var(--sm-accent)]">{tenant.homeEyebrow}</p>
              <h1 className="mt-4 max-w-4xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">{tenant.homeTitle}</h1>
              <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{tenant.homeDescription}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link className="sm-button-primary" to={tenant.homePrimaryCta.to}>
                  {tenant.homePrimaryCta.label}
                </Link>
                <Link className="sm-button-secondary" to={tenant.homeSecondaryCta.to}>
                  {tenant.homeSecondaryCta.label}
                </Link>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {tenant.toolCards.map((item) => (
                <article className="sm-proof-card" key={item.title}>
                  <p className="font-semibold text-white">{item.title}</p>
                  <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{item.detail}</p>
                  <div className="mt-5">
                    <Link className="sm-link" to={item.to}>
                      Open
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="sm-site-final">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Next step</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Open the workspace you need.</h2>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/app/receiving">
              Open operations
            </Link>
            <Link className="sm-button-secondary" to="/app/sales">
              Open sales
            </Link>
            <Link className="sm-button-secondary" to="/app/platform-admin">
              Open admin
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="space-y-10 pb-16">
      <section className="sm-site-panel">
        <div className="grid gap-8 xl:grid-cols-[0.84fr_1.16fr] xl:items-center">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">DeskPOS by SUPERMEGA · Live now</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-extrabold tracking-tight text-white lg:text-6xl">
              A free POS that runs your spa, salon, retail, cafe, or repair desk.
            </h1>
            <p className="mt-3 max-w-2xl text-base text-[var(--sm-muted)] lg:text-lg" lang="my" style={{ fontFamily: "'Pyidaungsu', 'Noto Sans Myanmar', sans-serif" }}>
              မြန်မာစီးပွားရေးအတွက် POS — KBZPay နှင့် MMQR ပါပြီးသား။
            </p>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              MMK / KBZPay / MMQR / cash from day one. Runs on a tablet or PC, works offline. No monthly fee. No card-reader lock-in.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm text-[var(--sm-muted)]">
              <span className="sm-status-pill">MMK · KBZPay · MMQR</span>
              <span className="sm-status-pill">Offline-ready</span>
              <span className="sm-status-pill">No monthly fee</span>
              <span className="sm-status-pill">Burmese &amp; English</span>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                className="sm-button-primary"
                href="https://pos.supermega.dev/"
                onClick={() => trackEvent('offer_open_click', { offer: 'DeskPOS live' })}
                rel="noopener"
                target="_blank"
              >
                Try the live demo →
              </a>
              <Link
                className="sm-button-secondary"
                onClick={() => trackEvent('contact_open_click', { source: 'home_hero_deskpos' })}
                to="/contact?package=DeskPOS"
              >
                Talk to us
              </Link>
            </div>
            <p className="mt-4 text-xs text-[var(--sm-muted)]">
              Demo: login as <code className="rounded bg-white/5 px-1.5 py-0.5">owner</code> / <code className="rounded bg-white/5 px-1.5 py-0.5">owner</code> · then click <em>Load sample spa</em>
            </p>
          </div>

          <article className="sm-surface-deep p-4 lg:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="sm-kicker text-[var(--sm-accent)]">Live at</p>
                <p className="mt-2 text-lg font-semibold text-white">pos.supermega.dev</p>
              </div>
              <span className="sm-status-pill">PWA · tablet &amp; PC</span>
            </div>
            <img
              alt="DeskPOS — the simple POS for Myanmar businesses"
              className="mt-4 aspect-[1200/630] w-full rounded-2xl border border-white/10 bg-[#020612] object-cover object-center"
              decoding="async"
              fetchPriority="high"
              height={630}
              src="https://pos.supermega.dev/og-card.svg"
              width={1200}
            />
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Verticals</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Spa · Salon · Retail · Cafe · Repair</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Payments</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">MMK cash, KBZPay, MMQR, bank transfer, card</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Counter ops</p>
                <p className="mt-2 text-sm text-[var(--sm-muted)]">Bookings, stock, daily close, ESC/POS print</p>
              </div>
            </div>
          </article>
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Built for the way you sell</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-5xl">One POS, five verticals.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Pick a template at setup. DeskPOS configures services, payment methods, and stock recipes for your business — no generic-software wrestling.
          </p>
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {deskposVerticals.map((vertical) => (
            <article className="sm-proof-card" key={vertical.name}>
              <p className="text-lg font-semibold text-white">{vertical.name}</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{vertical.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Why DeskPOS</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-5xl">vs Square, Fresha, Vagaro.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            Honest comparison for shop owners in Yangon. The big POS brands don&rsquo;t take MMK, don&rsquo;t do offline, and charge a US-dollar subscription. DeskPOS is built locally so it doesn&rsquo;t need any of that.
          </p>
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-[var(--sm-muted)]">
                <th className="py-3 pr-4 font-semibold uppercase tracking-wider text-xs">Feature</th>
                <th className="py-3 px-3 font-semibold uppercase tracking-wider text-xs text-[var(--sm-accent)]">DeskPOS</th>
                <th className="py-3 px-3 font-semibold uppercase tracking-wider text-xs">Square</th>
                <th className="py-3 px-3 font-semibold uppercase tracking-wider text-xs">Fresha</th>
                <th className="py-3 px-3 font-semibold uppercase tracking-wider text-xs">Vagaro</th>
              </tr>
            </thead>
            <tbody>
              {deskposVsIncumbents.map((row) => (
                <tr className="border-b border-white/5 text-white" key={row.feature}>
                  <td className="py-3 pr-4 text-[var(--sm-muted)]">{row.feature}</td>
                  <td className="py-3 px-3 font-semibold text-[var(--sm-accent)]">{row.deskpos}</td>
                  <td className="py-3 px-3 text-white/80">{row.square}</td>
                  <td className="py-3 px-3 text-white/80">{row.fresha}</td>
                  <td className="py-3 px-3 text-white/80">{row.vagaro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-[var(--sm-muted)]">
          Pricing figures based on each vendor&rsquo;s public website at the time of writing. We are not affiliated with Square, Fresha, or Vagaro.
        </p>
      </section>

      <section className="sm-site-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">How setup works</p>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold text-white lg:text-5xl">From sign-in to first sale in an afternoon.</h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)] lg:text-base">
            No installer, no card-reader, no provider account. Open pos.supermega.dev on the tablet or laptop you already have.
          </p>
        </div>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {rolloutSteps.map((step, index) => (
            <article className="sm-proof-card" key={step.title}>
              <p className="sm-kicker text-[var(--sm-accent)]">Step {index + 1}</p>
              <p className="mt-2 font-semibold text-white">{step.title}</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{step.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="sm-site-panel">
        <div className="grid gap-8 xl:grid-cols-[1.04fr_0.96fr]">
          <div>
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Also from SUPERMEGA</p>
            <h2 className="mt-3 text-3xl font-bold text-white lg:text-4xl">Custom ops portals — when a POS isn&rsquo;t enough.</h2>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-[var(--sm-muted)]">
              For larger operations we build branded company portals: sales desks, operations queues, quality and maintenance lanes. Yangon Tyre is the first named example.
            </p>
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Modules</p>
                <p className="mt-2 text-3xl font-bold">{YANGON_TYRE_MODEL.modules.length}</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent-alt)]">Roles</p>
                <p className="mt-2 text-3xl font-bold">{YANGON_TYRE_MODEL.roles.length}</p>
              </div>
              <div className="sm-chip text-white">
                <p className="sm-kicker text-[var(--sm-accent)]">Connectors</p>
                <p className="mt-2 text-3xl font-bold">{YANGON_TYRE_MODEL.connectors.length}</p>
              </div>
            </div>
            <div className="mt-6 space-y-3">
              {yangonTyreHighlights.map((point) => (
                <div className="sm-site-point" key={point}>
                  <span className="sm-site-point-dot" />
                  <span>{point}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link className="sm-button-secondary" to="/clients/yangon-tyre">
                Read the case study
              </Link>
              <Link className="sm-link" to="/contact">
                Talk to us
              </Link>
            </div>
          </div>
          <img
            alt="Yangon Tyre client portal"
            className="aspect-[16/10] w-full self-start rounded-2xl border border-white/10 bg-[#020612] object-cover object-top"
            decoding="async"
            height={screenshotSize.height}
            loading="lazy"
            src="/site/receiving-control-live.png"
            width={screenshotSize.width}
          />
        </div>
      </section>

      <section className="sm-site-final">
        <div>
          <p className="sm-kicker text-[var(--sm-accent)]">Try it now</p>
          <h2 className="mt-3 text-3xl font-bold text-white lg:text-5xl">Open DeskPOS on your phone or tablet.</h2>
          <p className="mt-3 text-sm text-[var(--sm-muted)]">Login as <code className="rounded bg-white/5 px-1.5 py-0.5">owner</code> / <code className="rounded bg-white/5 px-1.5 py-0.5">owner</code> — no email, no card, no signup.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a
            className="sm-button-primary"
            href="https://pos.supermega.dev/"
            onClick={() => trackEvent('offer_open_click', { offer: 'DeskPOS final cta' })}
            rel="noopener"
            target="_blank"
          >
            Try the live demo →
          </a>
          <Link className="sm-button-secondary" to="/contact?package=DeskPOS">
            Talk to us
          </Link>
        </div>
      </section>
    </div>
  )
}
