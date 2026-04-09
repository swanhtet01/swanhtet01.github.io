type BrandMarkProps = {
  className?: string
}

type BrandWordmarkProps = {
  className?: string
}

export function BrandMark({ className = '' }: BrandMarkProps) {
  return (
    <span className={`sm-brand-mark ${className}`.trim()} aria-hidden="true">
      <svg fill="none" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
        <rect height="64" rx="18" width="64" fill="#07111F" />
        <rect height="63" rx="17.5" width="63" x="0.5" y="0.5" stroke="rgba(146,169,196,0.24)" />
        <path
          d="M14 18H30C37.2 18 42 21.92 42 27.82C42 31.36 40.18 34.08 36.54 35.42C40.68 36.74 43 39.74 43 44.1C43 50.06 38.02 54 30.38 54H14V46.54H29.66C32.58 46.54 34.5 45.1 34.5 42.88C34.5 40.7 32.58 39.34 29.66 39.34H20.64V32.12H29.08C31.96 32.12 33.82 30.76 33.82 28.58C33.82 26.36 31.96 24.9 29.08 24.9H14V18Z"
          fill="#25D0FF"
        />
        <path d="M39 18H45.72L50 26.2L54.28 18H61V46H54.1V30.48L50 38.16L45.9 30.48V46H39V18Z" fill="#FF7A18" />
      </svg>
    </span>
  )
}

export function BrandWordmark({ className = '' }: BrandWordmarkProps) {
  return (
    <span className={`sm-brand-wordmark ${className}`.trim()}>
      <span>SUPERMEGA</span>
      <span className="sm-brand-wordmark-dot">.dev</span>
    </span>
  )
}
