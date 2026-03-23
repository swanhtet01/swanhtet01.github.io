type PageIntroProps = {
  eyebrow: string
  title: string
  description: string
}

export function PageIntro({ eyebrow, title, description }: PageIntroProps) {
  return (
    <section className="animate-rise sm-surface relative overflow-hidden p-6 text-[var(--sm-ink)] lg:p-10">
      <div className="pointer-events-none absolute -right-12 -top-14 h-44 w-44 rounded-full bg-[radial-gradient(circle,_rgba(25,188,222,0.25),_transparent_70%)]" />
      <p className="sm-kicker text-[var(--sm-accent)]">{eyebrow}</p>
      <h1 className="mt-3 max-w-4xl text-3xl font-extrabold tracking-tight lg:text-5xl">
        {title}
      </h1>
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-[var(--sm-muted)] lg:text-lg">{description}</p>
    </section>
  )
}
