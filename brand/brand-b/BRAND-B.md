# Brand B — "Meridian"

A second brand direction for SuperMega, produced **for comparison only** against the
current live Brand A ("Void Blue + Fire Red"). This is design exploration — **not a
rollout**. Nothing here touches the live site, the generator, or any app.

Files in this folder:
- `tokens.css` — the Meridian design tokens (day default + optional graphite-night).
- `reference-b.html` — a self-contained board rendering the wordmark, buttons, cards,
  a homepage hero, the palette, and the type ladder. Open it in any browser.
- `BRAND-B.md` — this document.

---

## The idea in one line

**Meridian is a clean daylight enterprise system** — cool paper ground, one confident
**cobalt** accent, a graphite **"slate"** ink, and a geometric **keystone** mark. It reads
like a serious institutional tool (think Linear / Stripe / Vercel restraint), holds up on a
mid-range Android in bright sunlight, and is unmistakably **not** Void Blue + Fire Red.

Where Brand A is a *terminal at night* (dark ground, hot red, `>_` hacker mark), Brand B is
a *blueprint in daylight* (light ground, calm cobalt, an architectural keystone). Same
company, opposite temperature and posture.

---

## Palette (named hex)

Surfaces — cool daylight paper (never warm cream, never Void Blue):

| Role | Hex | Notes |
|---|---|---|
| Ground · paper | `#FBFCFE` | Page background. Cool near-white with a faint blue cast. |
| Card · raised | `#FFFFFF` | Cards/panels sit *above* the ground. |
| Sunk · well | `#F1F5FA` | Inputs, table zebra, sunken zones. |

Ink — graphite "slate" (reads like blueprint ink, not pure black):

| Role | Hex | Contrast on ground |
|---|---|---|
| Ink · primary text | `#0D1B2A` | 16.9:1 → **AAA** |
| Muted · secondary | `#4C5A6E` | 6.8:1 → **AA** |
| Faint · de-emphasis | `#8A97A8` | decorative only (the ".dev" tail) |

Accent — one confident cobalt (calm, trustworthy, institutional):

| Role | Hex | Contrast |
|---|---|---|
| Cobalt · accent | `#1D4ED8` | 6.5:1 text on ground → **AA**; white label on fill 6.7:1 → **AA** |
| Cobalt · deep (pressed) | `#1E40AF` | white label 8.7:1 → **AAA** |
| Cobalt · wash (chips/rows) | `#EAF1FE` | tinted background |

Second accent — teal, **rationed** (progress, "live", freshness — used sparingly):

| Role | Hex | Contrast |
|---|---|---|
| Teal · support | `#0E7C86` | 4.8:1 → **AA**; white label on fill 4.95:1 → **AA** |
| Teal · wash | `#E4F5F5` | tinted background |

Semantics — honest, and deliberately distinct from the brand accent:

| Role | Hex | Contrast |
|---|---|---|
| OK | `#0F7A4E` | 5.2:1 → AA |
| Warn | `#B45309` | 4.9:1 → AA |
| Bad | `#B42318` | 6.4:1 → AA (note: red is a *status*, not the brand colour) |

All ratios computed against the daylight ground `#FBFCFE` (or the stated fill). The optional
graphite-night variant (`data-theme="night"`, ground `#10151C`) brightens cobalt to `#5B8DEF`
(5.4:1) and teal to `#3BC9C0` (8.5:1) so both hold AA on dark.

**Contrast summary: every text and fill colour passes WCAG AA; primary ink and the deep-cobalt
button pass AAA.** Chosen for daylight legibility on mid-range Android — the exact buyer context.

---

## Type pairing

- **Display / headings / wordmark — Sora** (700 / 600). A geometric, slightly wide grotesk with
  a confident, modern-institutional feel. Deliberately **not** Space Grotesk (Brand A) — Sora is
  rounder and reads more "product company" than "terminal".
- **Body / UI — IBM Plex Sans** (400 / 500 / 600). A humanist sans commissioned as an engineering
  house typeface: exceptionally legible on screen, neutral, trustworthy, and it carries a subtle
  "built by engineers" credibility that fits a business-OS.
- **Data / numerals — IBM Plex Mono** (500 / 600). For prices, invoice IDs, timestamps, deltas —
  tabular figures that line up in tables and receipts.
- **Burmese — Noto Sans Myanmar.** Pairs cleanly with Plex.

No Aptos, no Fraunces, no Space Grotesk. The Sora + Plex pairing is ownable and distinct from A.

---

## The ONE signature motif — the "Meridian keystone"

A **stacked-chevron keystone**: two nested chevrons meeting at an apex node. It reads three ways
at once — an **arch keystone** (the stone that locks a structure together: "the system that holds
your business together"), a **mountain pass / meridian convergence**, and an upward **^** (growth).
It replaces Brand A's `>_` terminal mark entirely.

```
   ◹◸        M4 15 L12 6 L20 15   (outer chevron, solid cobalt)
    ^         M8 18 L12 13.5 L16 18 (inner chevron, 55% opacity)
```

Used as: the logo glyph in the wordmark lockup, a rounded tile inside cards, and — scaled to a
hairline — as the **"meridian line"**: a thin cobalt rule that caps the hero and separates
sections (`--meridian` in tokens.css). One motif, three scales. The SVG lives in `tokens.css`.

A secondary texture — a **faint blueprint grid** on the page ground — reinforces the
architectural/institutional idea without adding a second logo.

---

## Wordmark treatment

`◈ supermega.dev` — the keystone glyph, then **supermega** set in Sora 700 (tight `-0.02em`
tracking), with the **.dev** tail in `--faint` slate so the product name leads. Lowercase,
single word, no space — same naming as A, but a completely different glyph, font, and colour.
Never an "M" tile, never the `>_` mark.

---

## Tone

Plain, calm, confident. Short sentences. No hype words, no exclamation-mark energy. The voice of
a tool that respects the owner's time: *"Run your shop on one clear system — not Viber & Excel."*
"Yours to keep" (ownership) is a recurring note — it's what a pragmatic Myanmar SME buyer cares
about. AI stays invisible in the product; the brand sells clarity and trust, not magic. MMK only
on public prices.

---

## When Brand B wins over Brand A

Choose **Meridian (B)** when we want to read as:

1. **Daylight-first, Android-first.** The buyer is often on a mid-range phone in a sunlit shop or
   factory floor. A light system is easier to read there than a dark one, and cobalt-on-white is
   the highest-legibility, lowest-fatigue combination we have.
2. **Institutional trust over hacker cool.** Cobalt + slate is the palette of banks, ERPs, and
   serious infrastructure. If the goal is "a bank would trust this to run their shops," B lands it;
   A's red-on-black reads younger and more developer-facing.
3. **Rationed, calm colour.** A single blue accent (plus a whisper of teal) is quieter and ages
   better than a hot red that must be used sparingly to avoid alarm-fatigue.
4. **A clean break, not a re-skin.** New ground, new accent, new mark, new type — a genuinely
   different option to weigh, not a light-mode of A.

Choose **Void Blue + Fire Red (A)** instead when we want energy, a dark "command center" mood,
the developer/terminal signal, and the striking hot-accent memorability of the `>_` mark.

**Recommendation for the comparison:** put A and B side by side on the same hero copy and the same
pricing cards. B is the safer, more enterprise-credible, daylight-legible bet; A is the bolder,
more distinctive, night-mode bet. This board exists so that choice can be made by eye.
