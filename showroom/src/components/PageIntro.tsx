type PageIntroProps = {
  eyebrow: string
  title: string
  description: string
}

export function PageIntro({ eyebrow, title, description }: PageIntroProps) {
  return (
    <section className="animate-rise sm-surface-deep relative overflow-hidden p-6 text-[var(--sm-ink)] lg:p-10">
      <div className="pointer-events-none absolute inset-x-6 top-5 h-px bg-gradient-to-r from-transparent via-[rgba(37,208,255,0.55)] to-transparent" />
      <div className="pointer-events-none absolute -right-12 -top-14 h-44 w-44 rounded-full bg-[radial-gradient(circle,_rgba(37,208,255,0.22),_transparent_70%)]" />
      <div className="sm-status-bar">
        <span className="sm-status-pill">{eyebrow}</span>
      </div>
      <h1 className="mt-3 max-w-4xl text-3xl font-extrabold tracking-tight text-white lg:text-5xl">
        {title}
      </h1>
      <p className="mt-4 max-w-3xl text-base leading-relaxed text-[rgba(232,243,255,0.78)] lg:text-lg">{description}</p>
    </section>
  )
}
