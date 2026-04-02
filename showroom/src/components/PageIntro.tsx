type PageIntroProps = {
  eyebrow: string
  title: string
  description: string
  compact?: boolean
}

export function PageIntro({ eyebrow, title, description, compact = false }: PageIntroProps) {
  return (
    <section className={`animate-rise sm-surface-deep relative overflow-hidden text-[var(--sm-ink)] ${compact ? 'p-5 lg:p-7' : 'p-6 lg:p-10'}`}>
      <div className="pointer-events-none absolute inset-x-6 top-5 h-px bg-gradient-to-r from-transparent via-[rgba(37,208,255,0.55)] to-transparent" />
      <div className={`pointer-events-none absolute rounded-full bg-[radial-gradient(circle,_rgba(37,208,255,0.22),_transparent_70%)] ${compact ? '-right-10 -top-12 h-32 w-32' : '-right-12 -top-14 h-44 w-44'}`} />
      <div className="sm-status-bar">
        <span className="sm-status-pill">{eyebrow}</span>
      </div>
      <h1 className={`mt-3 max-w-4xl font-extrabold tracking-tight text-white ${compact ? 'text-2xl lg:text-4xl' : 'text-3xl lg:text-5xl'}`}>
        {title}
      </h1>
      <p className={`max-w-3xl leading-relaxed text-[rgba(232,243,255,0.78)] ${compact ? 'mt-3 text-sm lg:text-base' : 'mt-4 text-base lg:text-lg'}`}>{description}</p>
    </section>
  )
}
