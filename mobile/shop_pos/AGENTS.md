# Shop native app working contract

This Flutter app is the primary daily Shop interface for Android tablets, iPad, and Windows PC. The browser is an account and administration companion. Shared Dart source is not evidence that a feature works on every device.

- Keep one integration writer. Start a change by stating the operator job, affected paths, source revision, and observable acceptance result. Review current behavior before adding controls.
- Preserve the SQLite transaction boundary for sales, stock, saved wallet intents, and outbox records. A retry must not sell twice. An unresolved wallet intent must block another sale until verified or cancelled. Never infer wallet settlement from a QR display or phone number.
- Keep the first sale usable offline and label device-local records accurately. Do not call outbox rows synced or backed up until the server acknowledges them and a restore test passes. Account attach, workspace roles, plan entitlements, and paid AI require server authority.
- For MMQR changes, compare the parser against the [Myanmar QR specification](https://myanmarpay.gov.mm/frontend/assets/files/MyanmarQRSpecification.pdf) and the server validator. Preserve checksum, static-mode, amount, merchant, and issuer-confirmation checks. Test changed acceptance and rejection cases.
- Use the smallest meaningful regression test for a money, inventory, recovery, migration, or privacy change. Format changed Dart files, run `flutter analyze` and `flutter test`, and require exact-head Android/iPad/Windows CI. Where Flutter is absent locally, use CI diagnostics; do not report local tests as run.
- Record platform evidence separately: source, CI build, installed device, physical scanner/printer, wallet rehearsal, Burmese operator review, hosted account/tenant test, and customer acceptance. An unsigned QA archive is not a supported installer or public release.
- Keep secrets out of the app and tests. Menu-photo inference requires consent and a server-side provider/task/spend ceiling before enabling metered calls. Work from synthetic records unless a separately authorized test names the target.
