import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="rounded-3xl border border-[var(--sm-line)] bg-[var(--sm-paper)] p-10 text-center">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--sm-accent)]">404</p>
      <h1 className="mt-3 text-3xl font-bold text-[var(--sm-ink)]">Page not found</h1>
      <p className="mt-2 text-sm text-[var(--sm-muted)]">The route may have changed during showroom rebuild.</p>
      <Link className="mt-5 inline-flex rounded-full bg-[var(--sm-accent)] px-5 py-3 text-sm font-bold text-white hover:bg-[#0a5b5d]" to="/">
        Back to home
      </Link>
    </section>
  )
}
