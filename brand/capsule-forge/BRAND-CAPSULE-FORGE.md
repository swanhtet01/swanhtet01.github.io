# Capsule Forge — Brand System

> **Status: Proposed 2026-06-26 — pending founder approval; not yet rolled out.**
> This document is the source-of-truth specification for the *Capsule Forge* visual identity for SuperMega (`supermega.dev`).
> It is a proposal. Nothing here ships until Swan ratifies it. When ratified, remove this banner and change the status line to `Ratified <date>`.
> Design workshop score: **91/100** (tokens locked).

---

## 0. How to use this doc

Another agent should be able to build **any surface** from this file alone. Every visual decision is expressed as a token, a rule, or a copy-pasteable CSS block. When you build a surface:

1. Pull colors from the **token table** (§2) — never hardcode a hex that isn't in it.
2. Pull sizes/weights from the **type ladder** (§3).
3. Build the capsule using the **motif build spec** (§4). Do not freehand a pill.
4. Apply the **aura** (§5) only under its rationing rules.
5. Obey the **95/5 doctrine** (§1) as the tie-breaker for every judgment call.

If a rule here conflicts with an older SuperMega brand doc, **this doc wins for any surface tagged Capsule Forge** — but only after ratification.

---

## 1. Concept — Capsule Corp, made literal

Capsule Forge takes the one honest visual idea behind Capsule Corp — **enormous capability compressed into a small, calm object you carry in your pocket** — and makes it literal. A SuperMega product is a *capsule*: press it, and a factory's worth of work unfolds. The brand is the physics of that compression, not the cartoon around it.

### The 95/5 doctrine (the core operating rule)

**95% of every surface is calm. 5% is charged.**

- The calm 95% is warm paper, ink, generous space, quiet type. It reads as a serious tool, not a toy.
- The charged 5% is gold — the aura, the one live CTA, the power-level fill. Because energy is **scarce**, it reads as **expensive**. The moment gold is everywhere, it is worth nothing.
- The doctrine is the tie-breaker. When unsure whether an element should glow, pulse, or go gold: it should not. Default to calm; spend charge deliberately.

### Zero-IP guardrail (non-negotiable)

The Dragon Ball influence appears **only as physics** — compression, aura, power-level, charge-up. It **never** appears as:

- characters, silhouettes, or poses,
- the Capsule Corp logo, Dragon Ball logo, or any trademarked mark,
- spiky-hair motifs, "Saiyan" iconography, orange gi, dragon balls, or any recognizable IP asset.

"Saiyan Gold" and "Ki Orange" are **internal token names** for our own colors. They must not surface in public copy, alt text, file names shipped to users, or UI labels. Publicly they are just "gold" and "the deploy accent." Treat the zero-IP line as a legal bright line, not a style preference.

---

## 2. Color tokens (locked)

The palette is warm paper + ink, with a single rationed gold through-line and two supporting warms. Cream page canvas is unchanged from the existing SuperMega system.

| Token (CSS var) | Hex | Role |
|---|---|---|
| `--cf-cream` | `#F7F4EC` | Page canvas. The default background of every surface. Unchanged from existing system. |
| `--cf-paper` | `#FFFDF8` | Cards, capsule surfaces, raised panels. Slightly brighter than cream so surfaces lift off the canvas. |
| `--cf-ink` | `#2A241C` | Primary text on cream/paper. Warm near-black, never pure `#000`. |
| `--cf-charcoal` | `#181410` | Forge Charcoal. Dark ground — dark sections, capsule bases, the dark hero. |
| `--cf-gold` | `#E9B949` | **Saiyan Gold.** THE through-line accent + aura color. Capsule top band, press node, power-level fill, aura glow. *(Internal name; publicly "gold".)* |
| `--cf-gold-hi` | `#F2C75A` | Gold highlight — the lighter stop of the capsule top-band gradient and the top of any gold fill. |
| `--cf-gold-text` | `#B8892E` | **Accessible gold for TEXT on cream/paper.** `--cf-gold` fails AA as text; use this token wherever gold must be *read* as a word/number. See §7. |
| `--cf-orange` | `#F26419` | **Ki Orange.** The ONE "Deploy" CTA color. Action-only — see §6. Never decorative, never a background wash, never used for two CTAs in one viewport. *(Internal name; publicly "the deploy accent".)* |
| `--cf-clay` | `#C2603F` | Clay. Connective warm — links on dark, secondary accents, the *empty/low* end of the power-level meter, connector-rail default. |
| `--cf-clay-dk` | `#D97757` | Clay dark variant — clay on the Forge Charcoal ground, where `--cf-clay` is too muddy. |

### Semantic aliases (build against these, not raw tokens where a role exists)

```css
:root {
  /* raw palette */
  --cf-cream:     #F7F4EC;
  --cf-paper:     #FFFDF8;
  --cf-ink:       #2A241C;
  --cf-charcoal:  #181410;
  --cf-gold:      #E9B949;
  --cf-gold-hi:   #F2C75A;
  --cf-gold-text: #B8892E;
  --cf-orange:    #F26419;
  --cf-clay:      #C2603F;
  --cf-clay-dk:   #D97757;

  /* semantic roles (light ground) */
  --cf-bg:            var(--cf-cream);
  --cf-surface:       var(--cf-paper);
  --cf-text:          var(--cf-ink);
  --cf-text-muted:    #6B6152;   /* ink at ~65% presence, warm */
  --cf-accent:        var(--cf-gold);
  --cf-accent-text:   var(--cf-gold-text);   /* AA-safe gold text */
  --cf-cta:           var(--cf-orange);       /* Deploy only */
  --cf-link:          var(--cf-clay);
  --cf-seam:          rgba(42,36,28,.14);     /* capsule seam on paper */
  --cf-hairline:      rgba(42,36,28,.10);     /* borders/dividers on light */
}

/* dark ground overrides — apply on .cf-dark sections */
.cf-dark {
  --cf-bg:         var(--cf-charcoal);
  --cf-surface:    #201B15;      /* charcoal, one step up */
  --cf-text:       #F3ECDE;      /* warm off-white */
  --cf-text-muted: #B7AC98;
  --cf-link:       var(--cf-clay-dk);
  --cf-seam:       rgba(243,236,222,.16);
  --cf-hairline:   rgba(243,236,222,.12);
  /* --cf-accent-text on dark: --cf-gold is fine as text on charcoal (passes AA); keep var(--cf-gold) there, not gold-text */
}
```

> **Gold-text rule of thumb:** on **light** ground, gold *words/numbers* use `--cf-gold-text` (`#B8892E`). On **dark** ground (`--cf-charcoal`), `--cf-gold` (`#E9B949`) is legible and preferred — do not swap to the darker token there.

---

## 3. Type ladder

Three faces, strict roles. The ladder *is* the "power-up": display face at the top, warm serif for editorial voice, neutral workhorse for everything functional.

| Tier | Face | Fallback | Used for | Rules |
|---|---|---|---|---|
| Display | **Clash Display** | Space Grotesk | Wordmark + hero H1 **only** | Never below hero scale. Never for body. Upright always — **never italic**. Medium/Bold only. |
| Editorial | **Fraunces** | Georgia, serif | Section subheads, pull-quotes, editorial intros | Kept **warm** — use the soft/old-style optical settings, low contrast. Not for UI controls. |
| Body / UI | **Inter** | system-ui, sans-serif | All body copy, labels, buttons, tables, forms, nav | `font-feature-settings: "tnum" 1;` (**tabular-nums**) on anything with numbers — prices, meters, tables, counters. |
| Burmese | **Noto Sans Myanmar** | Padauk | All Burmese text, at every tier | **Never** set Burmese in the display face. Burmese hero text uses Noto Sans Myanmar at hero scale, not Clash. |

### Scale (rem, 16px base)

| Role | Size | Weight | Line-height | Face | Tracking |
|---|---|---|---|---|---|
| Hero H1 | `3.5rem` (clamp 2.5–4rem) | 600 | 1.02 | Clash Display | -0.02em |
| H2 | `2rem` | 600 | 1.1 | Fraunces | -0.01em |
| H3 | `1.375rem` | 550 | 1.2 | Fraunces | normal |
| Body-lg | `1.125rem` | 400 | 1.6 | Inter | normal |
| Body | `1rem` | 400 | 1.6 | Inter | normal |
| Small / caption | `0.875rem` | 400 | 1.5 | Inter | normal |
| Overline / label | `0.75rem` | 600 | 1.4 | Inter | 0.08em, uppercase |
| Numeric (tabular) | inherit | inherit | inherit | Inter | `"tnum" 1` required |

```css
.cf-display { font-family: "Clash Display", "Space Grotesk", sans-serif; font-style: normal; }
.cf-editorial { font-family: "Fraunces", Georgia, serif; }
body, .cf-ui { font-family: "Inter", system-ui, sans-serif; font-feature-settings: "tnum" 1; }
:lang(my), .cf-my { font-family: "Noto Sans Myanmar", "Padauk", sans-serif; }
.cf-num { font-variant-numeric: tabular-nums; font-feature-settings: "tnum" 1; }
```

---

## 4. The capsule motif — build spec

The **capsule** is the single signature form. It is a two-tone rounded pill and it is *every* container in the system: the logo container, the favicon, the button shape, the card frame, the connector chip, and — when its base fills clay→gold — the power-level meter.

### Anatomy (top to bottom)

1. **Gold top band** — `linear-gradient(180deg, var(--cf-gold-hi), var(--cf-gold))`, occupying **~42%** of the capsule height, capped at the top with the same `999px` radius.
2. **Base** — paper (`--cf-paper`) on light ground, or charcoal (`--cf-charcoal`) on dark ground. Fills the lower ~58%.
3. **Seam line** — a 1px hairline (`--cf-seam`) at the band/base boundary. This is what makes it read as a *capsule* and not a highlighted button.
4. **Press node** — one small gold dot, offset (not centered), sitting on/near the seam or upper base. This is the "press me" affordance made physical. Exactly **one** per capsule.

### Base capsule CSS (the container everything inherits)

```css
.capsule {
  --cap-h: 44px;                 /* height drives everything; override per use */
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--cap-h);
  padding: 0 1.25em;
  border-radius: 999px;          /* the locked capsule radius — never square a capsule */
  background: var(--cf-surface);  /* the base */
  color: var(--cf-text);
  border: 1px solid var(--cf-hairline);
  overflow: hidden;               /* clip the top band + seam to the pill */
  isolation: isolate;
}

/* gold top band — ~42% height, capped by the pill radius */
.capsule::before {
  content: "";
  position: absolute;
  inset: 0 0 auto 0;
  height: 42%;
  background: linear-gradient(180deg, var(--cf-gold-hi), var(--cf-gold));
  z-index: -1;
}

/* seam line at the band/base boundary */
.capsule::after {
  content: "";
  position: absolute;
  left: 0; right: 0;
  top: 42%;
  height: 1px;
  background: var(--cf-seam);
  z-index: -1;
}

/* the offset press node — one gold dot */
.capsule > .cap-node {
  position: absolute;
  top: calc(42% + 4px);          /* just below the seam */
  right: 14px;                    /* offset, never centered */
  width: 6px; height: 6px;
  border-radius: 999px;
  background: var(--cf-gold);
}
```

```html
<span class="capsule"><span class="cap-node" aria-hidden="true"></span>Label</span>
```

### Sizing variants

| Variant | `--cap-h` | Use |
|---|---|---|
| `.capsule--sm` | 32px | Connector chips, tags, inline pills |
| `.capsule` (base) | 44px | Buttons, nav items |
| `.capsule--lg` | 56px | Primary actions, feature capsules |
| `.capsule--logo` | 40px square-ish | Logo container / favicon (see §4.1) |

### 4.1 Favicon / logo container

The favicon **is** a capsule shown edge-on — a compact pill with the gold band + seam + node, no label. Render it on `--cf-cream` at 16/32/48px. At 16px, drop the seam hairline (it disappears anyway) but keep the gold band and the node — those two are the recognizable silhouette. Provide SVG master + PNG raster fallbacks. Node stays gold; band stays the `--cf-gold-hi → --cf-gold` gradient.

### 4.2 The power-level meter (clay → gold fill)

The one place the capsule *animates its fill* to show progress/charge. Empty = clay; full = gold. The fill goes in the **base**, rising, while the top band stays gold as the "target."

```css
.cf-meter {
  /* a capsule laid horizontal; base shows a clay→gold fill by width */
  position: relative;
  height: 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--cf-clay) 22%, transparent);
  overflow: hidden;
}
.cf-meter > .cf-meter-fill {
  height: 100%;
  border-radius: 999px;
  /* clay at empty end → gold at charged end */
  background: linear-gradient(90deg, var(--cf-clay), var(--cf-gold));
  width: var(--level, 0%);        /* drive with --level: e.g. 73% */
  transition: width .5s ease;
}
```

Only the meter that represents a **genuine live value** may carry the gold aura (§5) — and only when it reaches a real milestone (e.g. 100% / task complete).

---

## 5. The gold aura — rationed charge

The aura is the capsule's **charged state**. It is the single most expensive gesture in the system and is governed hard by the 95/5 doctrine.

### The aura value (locked)

```css
.is-charged {
  box-shadow:
    0 0 0 1px var(--cf-gold),
    0 8px 40px rgba(233, 185, 73, .28);
}
```

### When the aura may fire (all must hold)

1. **Only on a genuine action or win** — a deploy succeeds, a task completes, a connection goes live, a real milestone is hit. Never on idle, never on hover-for-decoration, never on page load "just because."
2. **One charged element per viewport.** If two things could glow, only the most important one does. Never two auras visible at once.
3. **Dropped entirely under `prefers-reduced-motion`** (and never animate the glow in/out for those users).

```css
@media (prefers-reduced-motion: reduce) {
  .is-charged { box-shadow: 0 0 0 1px var(--cf-gold); }  /* keep the ring, drop the soft glow + any pulse */
  .is-charged, .cf-meter-fill { transition: none; animation: none; }
}
```

> If you find yourself adding a fourth aura to a page, you have violated 95/5 — remove auras until one remains.

---

## 6. Ki Orange — the Deploy CTA rule

`--cf-orange` (`#F26419`) is **action-only** and reserved for the single "Deploy"-class primary action.

- Exactly **one** orange CTA may be visible per viewport. Secondary actions use paper/ink capsules or clay links — never a second orange.
- Orange is **never** a background wash, a section color, a border decoration, or a text color for body copy.
- The Deploy CTA is a `.capsule--lg` whose **base** is orange (not the gold band — the band stays gold; orange fills the base):

```css
.capsule--deploy {
  --cap-h: 56px;
  background: var(--cf-orange);
  color: #FFF6F0;               /* warm white; check contrast, AA large text */
  border-color: color-mix(in srgb, var(--cf-orange) 70%, #000);
  font-weight: 600;
}
/* on success, the deploy capsule earns the aura — one per viewport */
.capsule--deploy.is-charged { /* inherits §5 aura */ }
```

**Charge-on-approval:** the aura on a Deploy action fires **only after the action is genuinely approved/succeeded** — not on click, not on submit, not optimistically. Wire the `.is-charged` class to the success/approval event, so the glow is a truthful signal that real work landed. An aura that fires before approval is a lie and breaks the whole "energy is expensive" promise.

---

## 7. Accessibility notes

- **Gold text on cream/paper must use `#B8892E` (`--cf-gold-text`) for AA.** Raw `--cf-gold` (`#E9B949`) on cream is decorative-only and fails as text. Any gold *word or number* that must be read uses `--cf-gold-text`. (On the dark charcoal ground, `--cf-gold` passes and is preferred — do not darken it there.)
- **Tabular numbers everywhere numbers live** — prices, meters, counters, tables — via `font-variant-numeric: tabular-nums` / `"tnum" 1`. Prevents jitter and keeps columns aligned.
- **`prefers-reduced-motion`**: drop the aura's soft glow (keep only the 1px gold ring), and disable meter-fill transitions and any charge-up animation. See §5.
- **Ink is never pure black** — `--cf-ink` (`#2A241C`) on `--cf-cream`/`--cf-paper` clears AA for body text; verify AAA for small body where feasible.
- **Orange CTA contrast**: `#FFF6F0` on `#F26419` is borderline for small text — keep Deploy labels at ≥16px/600 (large-text AA) or darken the orange base per-surface if small text is unavoidable.
- **The press node and aura are decorative** — mark `aria-hidden="true"`; never rely on the glow alone to communicate state. Pair every aura with a text status ("Deployed", "Live").
- **Focus states** are non-negotiable: every capsule button gets a visible focus ring distinct from the aura (use a 2px `--cf-clay` outline offset, so focus ≠ charge).

---

## 8. Wordmark spec

The wordmark renders the power-up **in the logotype itself**: it climbs from calm to charged left-to-right.

```
SUPER   MEGA   .dev
 │        │       │
 medium   bold    gold, lowercase
 ink      ink +   (the tail, quietly charged)
          gold underglow
```

- **`SUPER`** — Clash Display, **medium** (500), `--cf-ink`. The calm run-up.
- **`MEGA`** — Clash Display, **bold** (700), `--cf-ink`, with a gold **underglow**: `text-shadow: 0 0 18px rgba(233,185,73,.35)`. This is the charge peak of the mark — the power-up.
- **`.dev`** — Inter or Clash, **lowercase**, colored gold. On light ground use `--cf-gold-text` (`#B8892E`) for AA; on dark ground use `--cf-gold`.
- **Upright always. Never italic.** No skew, no slant, no motion-lines.
- Word spacing between SUPER / MEGA is a single space; `.dev` sits tight to MEGA.

```css
.cf-wordmark { font-family: "Clash Display", "Space Grotesk", sans-serif; font-style: normal; color: var(--cf-ink); letter-spacing: -0.01em; }
.cf-wordmark .wm-super { font-weight: 500; }
.cf-wordmark .wm-mega  { font-weight: 700; text-shadow: 0 0 18px rgba(233,185,73,.35); }
.cf-wordmark .wm-dev   { color: var(--cf-gold-text); font-weight: 600; text-transform: lowercase; }
.cf-dark .cf-wordmark { color: var(--cf-text); }
.cf-dark .cf-wordmark .wm-dev { color: var(--cf-gold); }
```

```html
<span class="cf-wordmark cf-display"><span class="wm-super">SUPER</span><span class="wm-mega">MEGA</span><span class="wm-dev">.dev</span></span>
```

> The gold underglow on MEGA is the wordmark's *one* charged element and it counts toward the "one aura per viewport" budget only loosely — it is a static, low-intensity `text-shadow`, not the full box-shadow aura. Do not additionally aura a capsule that sits directly beside the wordmark.

---

## 9. Connector-capsule rail rule

Connectors (integrations) render as **capsule chips** (`.capsule--sm`) arranged on a **rail**. The rail's accent encodes geography:

- **Myanmar rails → gold.** Connectors that are Myanmar-market rails (MMQR, KBZPay, Wave, AYA, local banks, Viber, etc.) sit on a **gold** rail — their chip seam/node and the rail line use `--cf-gold` (accent), signaling "home / core."
- **Global rails → neutral.** Global/generic connectors (Stripe, Gmail, Google Drive, Slack, generic AI providers, etc.) sit on a **neutral** rail — chip seam/node and rail line use `--cf-hairline`/`--cf-clay`, no gold. Global is calm; Myanmar is charged. This is a deliberate 95/5 expression: the home market is where we spend gold.

```css
.cf-rail { display: flex; gap: 10px; align-items: center; padding: 8px 0; position: relative; }
.cf-rail::before {                     /* the rail line */
  content: ""; position: absolute; left: 0; right: 0; top: 50%; height: 1px;
  background: var(--cf-hairline); z-index: -1;
}
.cf-rail--mm::before { background: color-mix(in srgb, var(--cf-gold) 60%, transparent); }
.cf-rail--mm .capsule .cap-node { background: var(--cf-gold); }
.cf-rail--global .capsule .cap-node { background: var(--cf-clay); }
```

- A connector chip shows the connector name (Inter, small) inside a `.capsule--sm`. Do **not** put third-party logos inside the gold band in a way that implies endorsement; logos sit on the paper base, monochrome-warm where possible.
- Live/connected connectors may show the meter or a single node in gold; **disconnected** connectors are clay-only, no gold — gold means "live."

---

## 10. Rollout surface list (ordered)

Build in this order. Each surface inherits the tokens/CSS above; do not fork the palette per surface.

1. **`brand/capsule-forge/tokens.css`** — ship §2 as the canonical stylesheet (raw palette + semantic aliases + `.cf-dark`). Every other surface imports this. *(Build first; nothing else can be correct without it.)*
2. **Favicon + wordmark assets** (§4.1, §8) — SVG masters + PNG rasters; the capsule favicon and the SUPER·MEGA·.dev logotype. These are referenced everywhere, so lock them second.
3. **Capsule component kit** (§4) — `.capsule` + variants, `.capsule--deploy`, `.cf-meter`, aura `.is-charged`. A single component file other surfaces consume.
4. **Marketing homepage — `supermega.dev`** — hero (Clash H1, one Deploy CTA, calm 95/5), the primary proving ground for the system.
5. **Console / kernel — `console.supermega.dev`** — apply capsules to buttons/cards, connector rail (§9), meters on live values, charge-on-approval on Deploy actions.
6. **Demo site — `demo.supermega.dev`** — product cards as capsules, single Deploy CTA per view.
7. **DeskPOS — `pos.supermega.dev`** — capsule buttons, tabular-nums on all money, aura only on a completed sale/deploy.
8. **Docs / brand page** — publish a public-facing, IP-scrubbed version of this system (no "Saiyan"/"Ki"/Dragon Ball references; gold + deploy-accent only).
9. **Ops pipeline + phone panel** — lowest priority; apply capsule buttons + meters, inherit tokens, no bespoke styling.

> After each surface ships, re-check the 95/5 budget on it: count the gold elements and the auras. If a surface has more than one aura in any viewport, or gold reads as "everywhere," it is not done.

---

## 11. Change control

- This palette and the aura value are **locked** (workshop, 91/100). Changing a hex, the aura box-shadow, or the 42%/999px capsule constants requires re-ratification — do not tune them per surface.
- The zero-IP guardrail (§1) is a legal bright line, not a style choice. No exceptions without Swan + legal sign-off.
- To propose a change: edit this doc under a dated proposal note, get Swan's ratification, then propagate to `tokens.css` in one pass so every surface updates together.

*End of spec — Proposed 2026-06-26, pending founder approval.*
