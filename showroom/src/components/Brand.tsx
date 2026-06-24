type BrandMarkProps = {
  className?: string
}

type BrandWordmarkProps = {
  className?: string
}

type BrandLockupProps = {
  className?: string
  markClassName?: string
  wordmarkClassName?: string
  meta?: string
}

export function BrandMark({ className = '' }: BrandMarkProps) {
  return (
    <span className={`sm-brand-mark ${className}`.trim()} aria-hidden="true">
      <svg focusable="false" viewBox="0 0 64 64">
        <defs>
          <linearGradient id="supermegaTile" x1="8" x2="56" y1="5" y2="59" gradientUnits="userSpaceOnUse">
            <stop stopColor="#08203A" />
            <stop offset=".55" stopColor="#07111F" />
            <stop offset="1" stopColor="#02050C" />
          </linearGradient>
          <linearGradient id="supermegaSignal" x1="14" x2="50" y1="50" y2="14" gradientUnits="userSpaceOnUse">
            <stop stopColor="#7DF9FF" />
            <stop offset=".5" stopColor="#32B8FF" />
            <stop offset="1" stopColor="#2458FF" />
          </linearGradient>
          <filter id="supermegaGlow" x="-28%" y="-28%" width="156%" height="156%">
            <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#38BDF8" floodOpacity=".18" />
            <feDropShadow dx="0" dy="18" stdDeviation="14" floodColor="#2458FF" floodOpacity=".12" />
          </filter>
        </defs>
        <g filter="url(#supermegaGlow)">
          <rect width="64" height="64" rx="18" fill="url(#supermegaTile)" />
          <path d="M32 10L39.7 24.3L54 32L39.7 39.7L32 54L24.3 39.7L10 32L24.3 24.3L32 10Z" fill="none" stroke="url(#supermegaSignal)" strokeWidth="4.2" strokeLinejoin="round" />
          <path d="M22 32H42M32 22V42" stroke="#E7FBFF" strokeOpacity=".72" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="32" cy="32" r="6.4" fill="#E7FBFF" />
          <circle cx="32" cy="32" r="3.1" fill="#07111F" />
        </g>
        <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="17.25" fill="none" stroke="rgba(217, 247, 255, 0.2)" strokeWidth="1.5" />
      </svg>
    </span>
  )
}

export function BrandWordmark({ className = '' }: BrandWordmarkProps) {
  return (
    <span className={`sm-brand-wordmark ${className}`.trim()} translate="no">
      <span>SUPERMEGA</span>
      <span className="sm-brand-wordmark-dot">.dev</span>
    </span>
  )
}

export function BrandLockup({ className = '', markClassName = '', wordmarkClassName = '', meta = '' }: BrandLockupProps) {
  return (
    <span className={`sm-brand-lockup ${className}`.trim()} translate="no">
      <BrandMark className={markClassName || 'h-10 w-10'} />
      <span className="sm-brand-lockup-copy">
        <BrandWordmark className={wordmarkClassName || 'text-lg text-white'} />
        {meta ? <span className="sm-brand-lockup-meta">{meta}</span> : null}
      </span>
    </span>
  )
}
