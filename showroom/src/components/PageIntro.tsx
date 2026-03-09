type PageIntroProps = {
  eyebrow: string
  title: string
  description: string
}

export function PageIntro({ eyebrow, title, description }: PageIntroProps) {
  return (
    <section className="animate-rise rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.65)] lg:p-10">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-700">{eyebrow}</p>
      <h1 className="mt-3 max-w-4xl text-3xl font-bold tracking-tight text-slate-900 lg:text-5xl">
        {title}
      </h1>
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-700 lg:text-lg">{description}</p>
    </section>
  )
}
