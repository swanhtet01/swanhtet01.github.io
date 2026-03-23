type PageIntroProps = {
  eyebrow: string
  title: string
  description: string
}

export function PageIntro({ eyebrow, title, description }: PageIntroProps) {
  return (
    <section className="animate-rise relative overflow-hidden rounded-[1.9rem] border border-white/60 bg-[linear-gradient(145deg,rgba(255,255,255,0.72),rgba(231,244,255,0.62))] p-6 text-[var(--sm-ink)] shadow-[0_24px_60px_-40px_rgba(4,12,26,0.5)] backdrop-blur-xl lg:p-10">
      <div className="pointer-events-none absolute -right-12 -top-14 h-44 w-44 rounded-full bg-[radial-gradient(circle,_rgba(25,188,222,0.25),_transparent_70%)]" />
      <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--sm-accent)]">{eyebrow}</p>
      <h1 className="mt-3 max-w-4xl text-3xl font-extrabold tracking-tight lg:text-5xl">
        {title}
      </h1>
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{description}</p>
    </section>
  )
}
