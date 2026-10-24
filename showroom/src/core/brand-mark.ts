/** Shared brand identity for the app shell, public pages, and browser icon. */
export const superMegaBrandIdentity = {
  name: 'SuperMega',
  accent: '#2563eb',
} as const

/** Single source for the unboxed SuperMega terminal mark geometry. */
export const superMegaBrandMark = {
  viewBox: '0 0 72 44',
  width: 30,
  height: 18,
  strokeWidth: 6,
  path: 'M10 9 26 22 10 35M35 35h27',
  segments: [
    [10, 9, 26, 22],
    [26, 22, 10, 35],
    [35, 35, 62, 35],
  ],
} as const
