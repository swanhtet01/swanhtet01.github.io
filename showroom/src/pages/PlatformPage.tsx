import { Link } from 'react-router-dom'

import { PageIntro } from '../components/PageIntro'
import { products } from '../content'

const coreModules = products.filter((product) =>
  ['Supplier Watch', 'Receiving Control', 'Inventory Pulse', 'Quality Closeout', 'Cash Watch'].includes(product.name),
)

const valueBlocks = [
  {
    name: 'Input',
    detail: 'Gmail, Drive, Sheets, and simple team updates.',
  },
  {
    name: 'Output',
    detail: 'One action board with owners, due dates, and exceptions.',
  },
  {
    name: 'Use',
    detail: 'Directors see what matters. Managers run the day from one board.',
  },
]

export function PlatformPage() {
  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Action OS"
        title="One shared board for work that is currently buried in Gmail, Drive, and spreadsheets."
        description="This is the main SuperMega product. It turns messy updates into one manager and director operating layer first. Then the deeper modules plug into it."
      />

      <section className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
        <article className="sm-surface-deep p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">What it replaces</p>
          <h2 className="mt-3 text-4xl font-bold text-white">Less chasing. One board. Clear ownership.</h2>
          <p className="mt-4 text-sm leading-relaxed text-[var(--sm-muted)]">
            Action OS is for companies where important updates still arrive by email, sheet, chat, or phone call and then disappear. The first win is simple:
            one place to see the work, who owns it, and what is blocked.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {valueBlocks.map((block) => (
              <div className="sm-chip text-white" key={block.name}>
                <p className="sm-kicker text-[var(--sm-accent)]">{block.name}</p>
                <p className="mt-2 text-sm">{block.detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="sm-button-primary" to="/workspace">
              Open Action OS
            </Link>
            <Link className="sm-button-secondary" to="/workbench">
              Open live demo
            </Link>
            <Link className="sm-button-accent" to="/contact?package=Action%20OS">
              Start with this
            </Link>
          </div>
        </article>

        <article className="sm-terminal p-6">
          <p className="sm-kicker text-[var(--sm-accent)]">Good first rollout</p>
          <div className="mt-5 grid gap-3">
            {[
              'Connect one inbox, sheet, or daily update source.',
              'Assign owners and due dates on one board.',
              'Run one weekly review from the same board.',
            ].map((step) => (
              <div className="sm-proof-card" key={step}>
                <p className="text-sm text-white">{step}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 sm-chip text-white">
            <p className="sm-kicker text-[var(--sm-accent-alt)]">Next step</p>
            <p className="mt-2 text-sm">Add the module that closes the biggest blind spot first: receiving, inventory, supplier, quality, or cash.</p>
          </div>
        </article>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="sm-kicker text-[var(--sm-accent)]">Modules that plug in</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Use Action OS first, then go deeper.</h2>
          </div>
          <Link className="sm-link" to="/products">
            See all modules
          </Link>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
          {coreModules.map((module) => (
            <article className="sm-surface-soft p-5" key={module.name}>
              <h3 className="text-lg font-bold text-white">{module.name}</h3>
              <p className="mt-3 text-sm text-[var(--sm-muted)]">{module.tagline}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
