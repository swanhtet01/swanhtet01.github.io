type PageIntroProps = {
  eyebrow: string
  title: string
  description: string
}

export function PageIntro({ eyebrow, title, description }: PageIntroProps) {
  return (
    <section className="animate-rise rounded-[1.9rem] border border-[var(--sm-line)] bg-[var(--sm-paper)]/92 p-6 shadow-[var(--sm-shadow)] lg:p-10">
      <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-[var(--sm-accent)]">{eyebrow}</p>
      <h1 className="mt-3 max-w-4xl text-3xl font-extrabold tracking-tight text-[var(--sm-ink)] lg:text-5xl">
        {title}
      </h1>
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{description}</p>
    </section>
  )
}
