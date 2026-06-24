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
      <img alt="" draggable="false" loading="eager" src="/favicon.svg" />
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
