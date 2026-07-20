type BrandMarkProps = {
  className?: string
  src?: string
}

type BrandWordmarkProps = {
  className?: string
  label?: string
}

type BrandLockupProps = {
  className?: string
  markClassName?: string
  markSrc?: string
  label?: string
  wordmarkClassName?: string
  meta?: string
}

export function BrandMark({ className = '', src = '/favicon.svg' }: BrandMarkProps) {
  return (
    <span className={`sm-brand-mark ${className}`.trim()} aria-hidden="true">
      <img alt="" draggable="false" loading="eager" src={src} />
    </span>
  )
}

export function BrandWordmark({ className = '', label }: BrandWordmarkProps) {
  if (label) {
    return (
      <span className={`sm-brand-wordmark ${className}`.trim()} translate="no">
        {label}
      </span>
    )
  }

  return (
    <span className={`sm-brand-wordmark ${className}`.trim()} translate="no">
      <span>SUPERMEGA</span>
      <span className="sm-brand-wordmark-dot">.dev</span>
    </span>
  )
}

export function BrandLockup({ className = '', markClassName = '', markSrc, label, wordmarkClassName = '', meta = '' }: BrandLockupProps) {
  return (
    <span className={`sm-brand-lockup ${className}`.trim()} translate="no">
      <BrandMark className={markClassName || 'h-10 w-10'} src={markSrc} />
      <span className="sm-brand-lockup-copy">
        <BrandWordmark className={wordmarkClassName || 'text-lg text-white'} label={label} />
        {meta ? <span className="sm-brand-lockup-meta">{meta}</span> : null}
      </span>
    </span>
  )
}
