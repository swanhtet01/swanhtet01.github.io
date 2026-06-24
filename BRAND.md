# SUPERMEGA — Brand & Design System

> "Claude design" applied to SuperMega. Warm, editorial, calm, premium. One clay accent.
> This is the source of truth for color, type, logo, and voice across supermega.dev and every product.

---

## 1. Brand essence

SuperMega builds useful business software from real, messy work — for Myanmar shops, factories, and restaurants. The brand should feel **trustworthy, calm, and modern**: less neon-SaaS, more well-made tool. We borrow Anthropic/Claude's visual restraint — warm paper, editorial serif headlines, generous space, a single confident accent.

**Tone:** plain, concrete, confident. Short sentences. No hype words. Sentence case.

---

## 2. Color themes

One accent family — **clay / terracotta**. No cyan, no electric blue, no neon.

### Light theme (marketing default — live on supermega.dev)

| Token | Hex | Use |
|---|---|---|
| `--cream` (bg) | `#F7F4EC` | page canvas (top `#FBF9F3`, bottom `#EFE9DD`) |
| `--paper` | `#FFFDF8` | cards, raised surfaces |
| `--ink` | `#2A241C` | primary text / headings (warm near-black) |
| `--muted` | `#6F665A` | secondary text |
| `--line` | `rgba(42,36,28,0.14)` | hairline borders |
| `--blue` (accent) | `#C2603F` | clay accent — links, eyebrows, primary buttons |
| accent light | `#D9895F` | secondary clay |
| `--blue-soft` | `#F2E4DB` | soft clay fills/chips |

### Dark theme (native)

| Token | Hex | Use |
|---|---|---|
| bg | `#1B1815` | page canvas (warm near-black) |
| paper | `#242019` / `#2B261E` | cards / raised |
| ink | `#F3EFE6` | primary text (warm off-white) |
| muted | `#A8A092` | secondary text |
| line | `rgba(243,239,230,0.10)` | hairline borders |
| accent | `#D97757` | clay (brighter for dark) |
| accent-strong | `#C2603F` | hover / emphasis |
| accent-soft | `rgba(217,119,87,0.14)` | soft fills |

**Accessibility:** clay on ivory and ink on ivory both clear AA. On dark, clay `#D97757` text on `#1B1815` ≈ 5.6:1 (pass). Primary buttons use clay fill with near-white or near-black label — verify ≥ 4.5:1 for any new pairing.

---

## 3. Typography

- **Display / headings (h1–h3):** **Fraunces** — editorial serif, optical sizing, weight ~560, letter-spacing −0.02em. Loaded from Google Fonts (`opsz 9..144, wght 400..700`).
- **Body / UI:** **Inter** — weights 400–700 (loaded 400..900 so emphasis weights are real, not synthesized).
- Sentence case everywhere. Never ALL CAPS for headlines (the wordmark is the only uppercase lockup).

---

## 4. Logo

**Direction:** a **clay sunburst / radial-burst** mark — kin to the Claude/Anthropic mark, but our terracotta color and a more distinctive geometry. Wordmark: `SUPERMEGA` + clay `.dev`. (Concepts rendered 2026-06-23 for selection; chosen mark to be filled in here once picked.)

**Usage:** mark in a warm-dark or clay tile at small sizes; never recolor the mark outside the clay family; keep clear space ≈ the height of the "S".

---

## 5. Surfaces & components

- Cards: paper bg, 0.5–1px warm line border, soft natural shadow (no neon glow), radius 18–28px.
- Buttons: primary = clay (gradient `#B1542F → #CC6E48`) with white label; secondary = warm glass (`rgba(255,255,255,0.62)`) with line border.
- No scanlines, no grids-as-decoration, no glow. Calm flat warm surfaces.
- Motion: gentle scroll-reveal (fade + 16–18px rise, ~640ms), respects `prefers-reduced-motion`.

---

## 6. Where it lives

- Canonical public site generator: `tools/create_public_vercel_output.mjs` → shared `unicornShellStyle`.
- React showroom (warm-dark variant): `C:\sm-site\showroom/src/index.css`.
- This document is the brand source of truth — update it when the system changes.

---

## 7. Creative direction — "Arcane Atelier"

Illuminated-grimoire-meets-Swiss-diagram. The calm ivory/clay base is charged with *functional* arcane grammar (not a decorative skin):

- **Casting ring** — focus rings, progress, the master mark's boundary.
- **Constellation lines** — flows, pipelines, graph/ERP relationships.
- **Runes as status glyphs** — always paired with a text label, never rune-only.
- **Ember motes** — a single restrained spark on a genuine win.
- **Hex grid (60°)** — the geometry everything snaps to.
- **Gilt `#C9A24B`** — decorative only (rings, motes, hairlines); never text or essential icons.

**Energy doctrine (the rationed "mega" power):** 95% calm, 5% charged.
1. Energy only on action — the workspace is silent at rest.
2. "Power-level" charge-bars (clay→gilt) for hero metrics only — never inside data tables.
3. One milestone power-up burst per view, capped at **one charged element per viewport**.
4. The wordmark powers up: `SUPER` small-caps → **MEGA** heavier.
5. Anvil-baseline grounding bar under hero CTAs ("we build real things").
6. Rich comic illustration + speech-balloon AI replies live only in empty-states / onboarding / marketing.
7. All motion is single-shot and respects `prefers-reduced-motion`.

Tagline: **"Cast real work into software."**

### Logo
Master mark = an angular **M-rune** (reads as M / crown / upward rune) inside a clay **casting ring**, with a gilt node-star at the top gap and a gilt charged-core star at the M's valley, plus three faint constellation lines locking the rune into the ring. Favicon degrades to ring + rune + core star.

### Product family (one DNA, per-product accent)

| Product | Name | Accent | Signature moment |
|---|---|---|---|
| DeskPOS (live) | **Sigil** | ember `#E8A33D` | day-close "sealing the sigil" — ring gap closes on zero variance |
| Yangon Tyre portal | **Aegis Forge** | ember `#E8A23D` | "closing the loop" — ring completes when a CAPA root cause is killed |
| Ops Intelligence | **Scry** | violet `#6B5BD8` | "The Reveal" — threads snap from sources into the sigil on connect |
| Workflow agent *(concept)* | **Familiar** | amber `#E0913C` | "The Cast" — gate closes + one ember on your approval |

Each mark = casting ring + M-rune + the product-accent spark.

