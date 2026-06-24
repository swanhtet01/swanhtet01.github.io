# SUPERMEGA — Design Manifesto & Standards

> v1 · 2026-06-23. The source of truth for how everything SUPERMEGA ships **looks, reads, and behaves**.
> [BRAND.md](./BRAND.md) is the *system* (the tokens). This is the *why* and the *bar*.
> This document seeds **supermega.creative**, our design-studio arm — it should read like a studio's standards.

---

## 1. Principles (the manifesto)

1. **Real work first.** We design from the customer's actual mess — their files, their counter, their factory floor — not from a blank template. The product fits the work; the work never bends to the product.
2. **Calm by default, energy on purpose.** The everyday surface is quiet and premium. Power shows up only at moments that earn it — a sale closed, a quality loop closed. Never ambient noise.
3. **Trust is designed, not claimed.** Every number traces to its source. AI drafts; people approve. We show the evidence. In a low-trust market, the interface itself earns trust.
4. **Premium is restraint.** One accent. Lots of space. Few weights. Real type. We reach polish by *removing*, not adding.
5. **Honest over impressive.** Real data, real screens, no fake demos, no hype adjectives, no invented metrics. If it isn't built, we label it "upcoming."
6. **Local-first.** MMK, KBZPay / MMQR, offline, and Burmese + English are defaults — not afterthoughts. We design for a cheap phone on shaky internet.
7. **Accessible is the floor.** If it isn't usable by everyone, in two languages, with the lights low, on a budget device — it isn't done.

---

## 2. The system (see [BRAND.md](./BRAND.md))

- **Color** — warm ivory (light) / warm-dark (dark), native toggle. **ONE** clay accent (`#C2603F` light / `#D97757` dark). No second accent, no neon.
- **Type** — Fraunces (serif display) + Inter (body/UI). Sentence case everywhere; the wordmark is the only all-caps.
- **Space** — generous, calm density; consistent rhythm.
- **Motion** — single-shot, triggered by action, `prefers-reduced-motion`-safe.
- **Logo** — the clay sunburst / M-sigil in a casting ring.

---

## 3. Standards (the measurable bar)

**Accessibility** — WCAG 2.1 AA minimum. Text contrast ≥ 4.5:1 (≥ 3:1 for large). A *visible* focus ring on every interactive element (real specificity; contrasting color on accent surfaces). Honor `prefers-reduced-motion`. Tap targets ≥ 24px (44px preferred). Correct `lang` attributes incl. `lang="my"`. Never encode meaning in color alone.

**Performance** — Static-first. LCP < 2.5s on a mid-tier phone. Lazy-load below the fold; set width/height (or aspect-ratio) to avoid layout shift. Fonts via `preconnect` + `display=swap`, never render-blocking `@import`. Long-cache, immutable, version-stamped assets.

**Content & voice** — Plain "what it does." Short sentences. Sentence case. No hype, no jargon, no Title Case, no ALL CAPS. Every claim must be true and specific, and backed by the artifact it describes. Never publish internal roadmap, self-grades, or competitor "gaps to copy."

**Motion** — Reveal once, ease in, ≤ ~660ms. At most **one** charged moment per viewport. Nothing loops while idle.

**Components** — Consistent radius, hairline borders, soft natural shadows (no glow). Identical spacing rhythm across pages. Exactly **one** primary action per view.

**Brand** — One accent, used sparingly. Logo clear-space = the height of its mark. Never recolor the mark outside the clay family. Don't stack effects.

---

## 4. How we work (the studio standard — seeds supermega.creative)

- **Research the real context first** — the business, the language, the device, the constraints.
- **Build from real data; verify visually before shipping** — look at the live result, in light and dark, on mobile.
- **Ship → look → measure → refine.** Design is not done at deploy.
- **Document the system and reuse it.** Every project strengthens the system; nothing is one-off.

---

## 5. Definition of done ("premium")

A surface is **done** when it is: on-system (tokens, type, space) · AA-accessible · fast · honest · working in light **and** dark · bilingual where it matters · offline where relevant · and calm, with exactly one confident moment of energy.

**Premium = nothing left to remove.**
