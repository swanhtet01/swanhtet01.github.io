import type { WebsiteReleasePackage } from '../products/website/website-release-foundation.ts'

export type WebsiteReleaseBrandBrief = {
  bodyFont: 'system-sans' | 'noto-sans-myanmar' | 'system-serif'
  headingFont: 'system-sans' | 'noto-sans-myanmar' | 'system-serif'
  fontsMatch: boolean
  radiusPx: number
  isSharp: boolean
  isRounded: boolean
  isVeryRounded: boolean
}

export function projectWebsiteReleaseBrandBrief(pkg: WebsiteReleasePackage): WebsiteReleaseBrandBrief {
  const { typography, radiusPx } = pkg.brand

  return {
    bodyFont: typography.body,
    headingFont: typography.heading,
    fontsMatch: typography.body === typography.heading,
    radiusPx,
    isSharp: radiusPx === 0,
    isRounded: radiusPx >= 1 && radiusPx <= 8,
    isVeryRounded: radiusPx > 8,
  }
}
