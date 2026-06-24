import { Link } from 'react-router-dom'

import { appClientLoginBaseUrl, buildProofLoginHref, productDemoSurfaces } from '../lib/demoSurfaces'
import {
  DELIVERY_PODS,
  GENERAL_USE_TOOL_WEDGES,
  MYANMAR_CLIENT_INTAKE_QUESTIONS,
  MYANMAR_COMPETITIVE_REALITY,
  MYANMAR_PREMIUM_PACKAGES,
} from '../lib/myanmarProductOpportunities'
import { useUiLanguage } from '../lib/uiLanguageContext'

function proofHref(portalId: string, route: string) {
  return buildProofLoginHref(portalId, route)
}

function portalForPackage(id: string) {
  if (id.includes('restaurant')) return 'restaurant-group-os'
  if (id.includes('service')) return 'restaurant-group-os'
  if (id.includes('industrial')) return 'industrial-plant-os'
  return 'ai-workflow-desk'
}

function statusLabel(status: (typeof MYANMAR_PREMIUM_PACKAGES)[number]['status']) {
  switch (status) {
    case 'proof-ready':
      return 'Proof ready'
    case 'sprint-ready':
      return 'Sprint ready'
    default:
      return 'Next build'
  }
}

export function MyanmarMarketPage() {
  const { t } = useUiLanguage()
  const productSurfaces = productDemoSurfaces.filter((surface) => surface.publicDemo)

  return (
    <div className="space-y-7 pb-14">
      <section className="sm-site-panel">
        <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr] xl:items-end">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">
              {t({ en: 'Myanmar product line', my: 'မြန်မာစျေးကွက် product line' })}
            </p>
            <h1 className="mt-4 max-w-4xl text-5xl font-black tracking-[-0.08em] text-white lg:text-7xl">
              {t({
                en: 'Business software that starts from the work.',
                my: 'လုပ်ငန်းအလုပ်ကနေစတဲ့ software.',
              })}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">
              {t({
                en: 'Galaxy-style and MIT-style suites win because buyers understand ERP, POS, HR, and reports. SuperMega competes by shipping the first useful workflow faster, then expanding into the client system.',
                my: 'ERP, POS, HR, report တွေကို client တွေ နားလည်ပြီးသားပါ။ SuperMega ကတော့ အရင်ဆုံး အသုံးဝင်တဲ့ workflow တစ်ခုကို မြန်မြန်ထုတ်ပြီးနောက်မှ system အဖြစ်ချဲ့ပါတယ်။',
              })}
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link className="sm-button-primary" to="/contact?market=myanmar">
                {t({ en: 'Map my first workflow', my: 'ပထမ workflow ကို map လုပ်ရန်' })}
              </Link>
              <a className="sm-button-secondary" href={`${appClientLoginBaseUrl}/login?next=/app/start`}>
                {t({ en: 'Open app login', my: 'App login ဖွင့်ရန်' })}
              </a>
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5">
            <h2 className="text-2xl font-black text-white">{t({ en: 'Simple domain map', my: 'Domain map' })}</h2>
            <div className="mt-4 grid gap-3">
              {[
                ['supermega.dev', 'public website, products, pricing, contact'],
                ['app.supermega.dev', 'main login for product proof and client workspaces'],
                ['ytf.supermega.dev', 'Factory Client private implementation only'],
                ['pos.supermega.dev', 'separate POS proof host'],
              ].map(([domain, detail]) => (
                <div className="rounded-3xl border border-white/10 bg-black/20 p-4" key={domain}>
                  <p className="font-mono text-sm font-black text-white">{domain}</p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--sm-muted)]">{detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="sm-site-panel" aria-label="Premium Myanmar packages">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">
              {t({ en: 'Premium packages', my: 'Premium packages' })}
            </p>
            <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.06em] text-white">
              {t({ en: 'Clear products, not a confusing portal menu.', my: 'ရှင်းလင်းတဲ့ products, မရှုပ်တဲ့ portal menu.' })}
            </h2>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-[var(--sm-muted)]">
            {t({
              en: 'Show these first. Each package has a buyer, first workflow, first metric, and proof or sprint path.',
              my: 'အရင်ဆုံး ဒီ package တွေကို ပြပါ။ buyer, first workflow, metric, proof/sprint path တစ်ခုစီပါပါတယ်။',
            })}
          </p>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-5">
          {MYANMAR_PREMIUM_PACKAGES.map((item) => (
            <article className="rounded-[1.6rem] border border-white/10 bg-white/[0.035] p-5" key={item.id}>
              <span className="sm-status-pill">{statusLabel(item.status)}</span>
              <h3 className="mt-4 text-2xl font-black tracking-[-0.04em] text-white">{item.name}</h3>
              <p className="mt-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--sm-accent)]">{item.buyer}</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{item.oneLine}</p>
              <div className="mt-4 rounded-3xl border border-white/10 bg-black/20 p-4">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-white/55">First workflow</p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-white">{item.firstWorkflow}</p>
              </div>
              <p className="mt-4 text-sm font-bold text-white">{item.outcomeMetric}</p>
              <a className="sm-link mt-4 inline-flex" href={proofHref(portalForPackage(item.id), item.proofRoute)}>
                {item.status === 'next-build' ? 'Scope build' : 'Open proof'}
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]" aria-label="Competitive answer">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">How we compete</p>
          <h2 className="mt-3 text-4xl font-black tracking-[-0.06em] text-white">Keep what buyers trust. Remove what slows rollout.</h2>
          <div className="mt-6 grid gap-3">
            {MYANMAR_COMPETITIVE_REALITY.map((item) => (
              <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.035] p-5" key={item.id}>
                <h3 className="text-lg font-black text-white">{item.buyerQuestion}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">
                  <strong className="text-white">Expected:</strong> {item.legacyExpectation}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">
                  <strong className="text-[var(--sm-accent)]">SuperMega:</strong> {item.supermegaAnswer}
                </p>
              </div>
            ))}
          </div>
        </article>

        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Client checklist</p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white">Ask four questions before building.</h2>
          <div className="mt-6 grid gap-3">
            {MYANMAR_CLIENT_INTAKE_QUESTIONS.map((item, index) => (
              <div className="rounded-[1.4rem] border border-white/10 bg-black/20 p-4" key={item.id}>
                <span className="sm-status-pill">{String(index + 1).padStart(2, '0')}</span>
                <h3 className="mt-3 text-lg font-black text-white">{item.label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{item.whyItMatters}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel" aria-label="Live product routes">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Live product paths</p>
            <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.06em] text-white">Open the product, not a fake workspace.</h2>
          </div>
          <Link className="sm-button-secondary" to="/products">
            See product page
          </Link>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {productSurfaces.map((product) => (
            <article className="rounded-[1.6rem] border border-white/10 bg-white/[0.035] p-5" key={product.portalId}>
              <span className="sm-status-pill">{product.badge}</span>
              <h3 className="mt-4 text-xl font-black text-white">{product.label}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{product.detail}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {product.modules.slice(0, 4).map((module) => (
                  <span className="sm-status-pill" key={`${product.portalId}-${module}`}>
                    {module}
                  </span>
                ))}
              </div>
              <a className="sm-link mt-5 inline-flex" href={proofHref(product.portalId, product.to)}>
                Open
              </a>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]" aria-label="Delivery system">
        <article className="sm-site-panel">
          <p className="sm-kicker text-[var(--sm-accent)]">Delivery system</p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.05em] text-white">The client sees simple software. The build machine handles the rest.</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">
            Behind every package is a controlled internal team: product architecture, implementation, QA, release, and market intelligence.
            This is how SuperMega can move faster than custom software shops without turning the client screen into an automation console.
          </p>
        </article>
        <article className="sm-site-panel">
          <div className="grid gap-3 md:grid-cols-2">
            {DELIVERY_PODS.map((pod) => (
              <div className="rounded-[1.4rem] border border-white/10 bg-white/[0.035] p-4" key={pod.id}>
                <h3 className="text-lg font-black text-white">{pod.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--sm-muted)]">{pod.mandate}</p>
                <p className="mt-3 text-sm font-semibold leading-relaxed text-white">{pod.output}</p>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="sm-site-panel" aria-label="General use tools">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Lead magnets</p>
            <h2 className="mt-3 max-w-3xl text-4xl font-black tracking-[-0.06em] text-white">Small tools that can bring users in.</h2>
          </div>
          <Link className="sm-button-primary" to="/contact?package=free-tool">
            Request a quick tool
          </Link>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {GENERAL_USE_TOOL_WEDGES.map((tool) => (
            <article className="rounded-[1.6rem] border border-white/10 bg-black/20 p-5" key={tool.id}>
              <h3 className="text-lg font-black text-white">{tool.name}</h3>
              <p className="mt-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--sm-accent)]">{tool.audience}</p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--sm-muted)]">{tool.promise}</p>
              <p className="mt-4 text-sm font-semibold text-white">{tool.output}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
