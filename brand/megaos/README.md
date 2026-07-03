# MegaOS — brand direction (resolved 2026-06-26)

The chosen identity for the SUPERMEGA.dev → **MegaOS** rebrand. Captured here so the rollout is
"apply these tokens" rather than a rebuild, and so all three lanes (Creative / Technical / CEO)
work from one source.

> **Status: chosen, NOT yet rolled to production.** The visual direction + voice below are settled
> with the founder. The actual live rollout is held for the founder's explicit go because it's a
> **name change** (SUPERMEGA → MegaOS) on the public site — a founder/CEO call, not a Creative one.

## Name
**MegaOS** — "the system your business runs on." Keeps the "Mega" equity; "OS" executes the pivot from
"custom-software studio" to "the operating system for your business." (Do **not** use *WorkOS* — a taken
US trademark. The logotype is `MegaOS`, never `MegaOS.dev`; `.dev` lives in the URL only.)

## Direction: **Command Center** (dark) — the default skin
The founder chose a **dark** direction. Cobalt (light) is retained as an optional daylight/funnel skin;
both share the same wordmark, type stack, and "live" grammar (see `tokens.css`).

- **Palette (dark default):** Void `#07090C` ground · Deck `#0D1117` / Panel `#161C26` surfaces ·
  Signal `#E6EAF0` text · **Volt-lime `#A6FF3C`** the one accent (rationed to live-state + the single CTA) ·
  Cyan `#3DD6C4` secondary · Alert `#FF5C5C` errors only.
- **Type:** Space Grotesk (wordmark + display) → Inter (body, tabular-nums on all numbers) →
  JetBrains Mono (numbers, status words, `//` eyebrows). Sharp — 7px radii, **hairline borders carry
  structure, not shadows**. Never pills.
- **Wordmark:** `Mega`(muted 500) + `OS`(bright 800) + a Volt cursor `▮` (blinks only on the marketing
  hero, never under reduced-motion).
- **Signature motif:** the **live connector console** as the hero — Myanmar rails (KBZPay/Wave/AYA/CB
  Pay/MMQR/Viber) lit Volt as "live," global ones neutral. Plus the "live = Volt dot + text label"
  grammar everywhere (a glow never carries meaning alone). *(The capsule/gold "Capsule Forge" concept
  is retired — that was the warm direction the founder rejected.)*

## Voice: plain human English, simple, real
Founder steer: *"content in English mainly, simple, real person not too fake."*
- English is the voice. Short, honest, like a shop owner talking to another shop owner.
- **No hype** — no "supercharge / 10x / game-changer / unlock / seamless." Say the plain thing.
- Burmese, if used at all, is a light local accent only — English carries everything.
- Examples (from the reference page): *"Run your whole business from one screen." · "We handle the
  messy parts. You just run your shop." · "Nothing happens without your say-so." · "Try it free. See
  if it fits your shop. If it doesn't, walk away — you've lost nothing."*

## Files
- `tokens.css` — the two-skin token system + shared primitives (`.mo-wordmark`, `.mo-btn`, `.mo-dot`).
- `reference-command-home.html` — the dark Command Center homepage, full-page, in the plain-English voice.
- `TECHNICAL-UVP.md` — the technical value prop the messaging leans on.
- Live previews: dark https://claude.ai/code/artifact/d55b0f3a-1f7c-4842-8a72-2cabbfd9b90f ·
  light-cobalt https://claude.ai/code/artifact/b536121f-26e5-4c27-a250-8ea8c0b941e5

## Rollout (on founder's go — ordered)
1. `create_public_vercel_output.mjs`: swap the shared header wordmark + the site color tokens to the
   Command Center set; replace the warm-gold with Void/Volt.
2. Homepage: the live-console hero + plain-English copy (per the reference page).
3. products / ai-agents / offers / contact / card — same tokens + voice.
4. app.supermega.dev login (separate `showroom/` app, own branch — Technical confirms deploy).
5. favicon + OG image → the MegaOS mark on Void with one Volt accent.
