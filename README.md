# >_ SuperMega

SuperMega is building dependable operating software for Myanmar businesses.
The active launch focus is **SuperMega Shop**, a native, offline-first point of
sale and stock application for Android tablet, iPad, and Windows PC.

Shop currently has a verified internal release candidate. It is not yet a
signed public release, a production deployment, or a merchant-accepted product.
See [`supergoal.md`](supergoal.md) for the objective and
[`CURRENT.md`](CURRENT.md) for the exact candidate and open gates.

## Start here

- [`DOCUMENTATION-INDEX.md`](DOCUMENTATION-INDEX.md) — authority and navigation
- [`AGENTS.md`](AGENTS.md) — repository working contract
- [`SKILLS.md`](SKILLS.md) — recurring capability routes and handoffs
- [`mobile/shop_pos/README.md`](mobile/shop_pos/README.md) — native Shop behavior
  and developer setup
- [`docs/SHOP-RELEASE-RUNBOOK.md`](docs/SHOP-RELEASE-RUNBOOK.md) — release gates
- [`docs/FOUNDER-OPERATING-MODEL.md`](docs/FOUNDER-OPERATING-MODEL.md) — Swan and
  Vivian coordination

## Active repository areas

| Path | Purpose |
| --- | --- |
| `mobile/shop_pos/` | Flutter Shop app, Drift/SQLite data, platform builds, and tests |
| `tools/public-assets/` and public build inputs | Honest public Shop/product evidence |
| `tools/public_native_shop_gallery.mjs` | Native screenshot provenance contract |
| `.github/workflows/shop-native-ci.yml` | Android, iPad/iOS, and Windows candidate checks |
| `docs/` | Release, operating, acceptance, and durable product guidance |

The repository also retains a larger browser platform, older products, HQ
experiments, and company research. They are historical or parked during this
Shop launch cycle; their presence does not put them into release scope.

## Native Shop development

From `mobile/shop_pos/`:

```bash
flutter pub get
dart run build_runner build
flutter analyze
flutter test
```

Read the nested [`mobile/shop_pos/AGENTS.md`](mobile/shop_pos/AGENTS.md) before
changing native code. Exact-head native CI remains required for a release
candidate. If Flutter is unavailable locally, report that limit rather than
claiming a local result.

## Public Shop verification

From the repository root:

```bash
npm run public:build
npm run public:verify
```

These checks validate source and public artifact contracts. They do not replace
installed device, scanner, printer, merchant, signing, or production evidence.

## Retained browser-platform development

The parked browser platform remains testable for maintenance work:

```bash
npm run dev
```

This starts the canonical FastAPI runtime and Vite together on loopback. The
default launcher clears managed provider configuration, so managed writes remain disabled.
Running this retained surface does not put its older products or release path
into the active Shop scope.

## Release policy

Use one integration lane and the gates in the Shop release runbook. Production
deployment, live database/IAM changes, secrets, spending, customer contact,
pricing commitments, and public launch require their named human decisions.
Never commit credentials or private customer data.

The first complete Shop proof is:

> catalog → sale → stock → correction or refund → close → export → restart →
> restore

Passing CI is an important step toward that outcome, not the outcome itself.
