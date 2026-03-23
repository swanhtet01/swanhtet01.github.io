# Testing Log - 2026-03-24

## Local Tests

### Showroom

- Command: `npm run build`
- Result: pass

- Command: `npm run lint`
- Result: pass

### Internal Machine

- Command: `powershell -ExecutionPolicy Bypass -File .\tools\supermega_machine.ps1 -Action status -Config .\config.example.json`
- Result: pass
- Key outputs:
  - `supermega.dev` HTTPS ready
  - `www.supermega.dev` HTTPS ready
  - `gmail_token_exists`: false
  - `product_lab.md` regenerated

- Command: `powershell -ExecutionPolicy Bypass -File .\tools\pilot.ps1 product-lab --config .\config.example.json`
- Result: wrote outputs successfully, but wrapper returned non-zero because of interpreter handling
- Verified artifact:
  - `pilot-data/product_lab.md`
  - `pilot-data/product_lab.json`

## Git / Deploy

- Branch commit:
  - `0d116646`
  - message: `feat: reset showroom around real tools and control modules`

- Main deploy commit:
  - `c68ab73e`
  - pushed to `origin/main`

## GitHub Actions State At Log Time

- `pages build and deployment`
  - run: `23463348500`
  - branch: `main`
  - state at check: `in_progress`

- `Deploy SuperMega Showroom`
  - run: `23463349044`
  - branch: `main`
  - state at check: `in_progress`

- `Showroom CI`
  - run: `23463349072`
  - branch: `main`
  - state at check: `in_progress`

## Functional Notes

- Public website direction is improved:
  - simpler product ladder
  - better mission-control styling
  - cleaner live tools
- Internal product machine now matches public naming.
- Gmail remains the main blocker for end-to-end live supplier and quality flows.
