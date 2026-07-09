# SuperMega — One system, two skins (A vs B)

SuperMega has **one brand**: *Void Blue + Fire Red*. It ships in **two skins** — a dark default and a
light counterpart. They are not two brands and not two directions to choose between; they are the same
identity rendered on dark vs light surfaces, the way a good product has a dark mode and a light mode.

| | **Skin A — Dark** | **Skin B — Light** |
|---|---|---|
| Nickname | Operator / terminal | Daylight / print / docs |
| Role | **The default.** Product UI, marketing, app surfaces. | The bright-surface counterpart. |
| Ground | Void Blue `#07111f` | Cool paper `#F7F9FC` / cards `#FFFFFF` |
| Text | Near-white `#f6fbff`, muted `#a9b8c7` | Ink `#0B1420`, muted `#566173` |
| Hairlines | White low-alpha `rgba(255,255,255,0.15)` | Ink low-alpha `rgba(11,20,32,0.12)` |
| Fire — fill | `#FF3B3B` | `#FF3B3B` (unchanged) |
| Fire — text | `#FF3B3B` | `#D92D2D` (deepened for AA) |
| Source file | `BRAND-TOKENS.css` (workspace root) | `brand/brand-b-light/tokens.css` |

Source of truth for A: `C:/Users/swann/OneDrive - BDA/BRAND-TOKENS.css`.
Skin B lives beside this doc as `tokens.css`; the visual board is `reference-light.html`.

---

## What the two skins SHARE (this is what makes it one system)

- **Type** — Space Grotesk (display / headings / wordmark) + Inter (body / UI). Burmese: Noto Sans Myanmar.
- **Mark** — the `>_` terminal glyph. Same geometry in both skins; only its stroke colour adapts.
- **Accent** — Fire Red is the through-line in both. It stays *rationed*: the **95% calm / 5% charged**
  doctrine holds on light exactly as on dark — most of the page is quiet, fire marks the one action.
- **Per-product accents** — Retail = Fire Red, Factory = Amber, Studio = Violet, in both skins (deepened
  for text on light; see below).
- **Radius** — 14px corners.
- **Variable names** — `tokens.css` mirrors `BRAND-TOKENS.css` variable-for-variable, so B is a literal
  drop-in skin, not a re-theme.

Because the variable names match, a surface built on the dark tokens can flip to the light skin with a
single attribute: `<html data-theme="light">` (that light block already exists inside `BRAND-TOKENS.css`
and resolves to the same values as this standalone `tokens.css`).

---

## When to use which

**Default to A (dark).** It is the operator surface and the company's native look: the product app,
supermega.dev, POS marketing, MegaOS. Unless there's a specific reason, ship dark.

**Reach for B (light) when the surface lives in bright, papery, or shared-document contexts:**

- **Docs & print** — PDFs, one-pagers, invoices, printable reports, slide decks that will be projected in
  a lit room or printed on white paper (dark grounds waste ink and glare).
- **Daylight embeds** — a widget or page that must sit inside a customer's already-light product.
- **Accessibility / preference** — a genuine light mode for users who ask for one.
- **Comparison / this exercise** — the "Brand B" option shown next to "Brand A" for the founder review.

Do **not** mix the two skins on a single page. Pick one skin per surface. (This mirrors the existing
workspace rule: don't mix brand *systems* on one page — here it's don't mix *skins* either.)

---

## The one real adjustment: Fire on light (WCAG AA)

Pure Fire Red `#FF3B3B` on white is only ~**3.5:1** contrast. That is fine behind a **solid fill** (a red
button with a white label reads as "large text" and passes AA-large), but it **fails AA for normal-size
text**. So the light skin splits fire into two roles:

- **`--fire-solid` = `#FF3B3B`** — the *fill*. The button background stays the exact brand red, so the
  primary action looks identical to A. Keep its label **≥15px semibold** (white) to clear AA-large.
- **`--fire` = `#D92D2D`** — *fire-coloured text, links, and small marks* (including the `>_` stroke).
  Deepened just enough to pass **AA (~4.6–4.8:1)** on white while still reading unmistakably as the same
  fire. This is the only meaningful colour that changes value between the skins.

The semantic and per-product accents get the same treatment — deepened **for text**, bright **for fills**:

| Token | Fill (bright, = A) | Text on light (deepened, AA) |
|---|---|---|
| Fire / Retail | `#FF3B3B` | `#D92D2D` |
| Factory / Amber | `#F59E1B` | `#A66200` |
| Studio / Violet | `#8B5CF6` | `#6D3BE0` |
| OK | `#58c98a` (A) | `#1A7F54` |
| Warn | `#e3b341` (A) | `#9A6B00` |
| Bad | `#FF5C4D` (A) | `#D92D2D` |

Text ink (`#0B1420`, ~17.5:1) and muted (`#566173`, ~5.9:1 on ground) both pass AA comfortably. `--dotdev`
(`#8A93A3`, ~3.1:1) is intentionally low-contrast — it's the de-emphasised `.dev` in the wordmark and
decorative status dashes only, never body text.

> **Rule of thumb:** on light, *fill* with the bright brand hue, *write* with the deepened one.

---

## Files

- `tokens.css` — the light token set (drop-in skin; variable names mirror `BRAND-TOKENS.css`).
- `reference-light.html` — self-contained board: wordmark, buttons (primary / secondary / fire), a card,
  a mini hero, palette swatches with hex, and a same-component dark-vs-light strip.
- `BRAND-A-VS-B.md` — this doc.

These are **new, additive** files. They do not modify Brand A or any live surface — this skin is a
proposal for the founder's A/B review.
