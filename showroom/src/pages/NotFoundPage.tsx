import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white/90 p-10 text-center">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-700">404</p>
      <h1 className="mt-3 text-3xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-700">The route may have changed during showroom rebuild.</p>
      <Link className="mt-5 inline-flex rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700" to="/">
        Back to home
      </Link>
    </section>
  )
}
