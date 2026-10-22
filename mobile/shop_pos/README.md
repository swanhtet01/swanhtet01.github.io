# SuperMega Shop native POS candidate

Flutter Shop targets Android tablets, iPad, and Windows PC. CI produces Android and unsigned Windows QA archives, but these are not signed installers or supported public downloads; the iPad build is unsigned too. Drift/SQLite is the on-device source of truth for the local catalog, completed sales, stock movements, and pending operations. The client can open offline and record local cash sales; it does not currently synchronize between devices or restore cloud backups.

## Current flows

- Add products manually or scan keyboard-wedge barcodes; barcode values stay text so leading zeroes are preserved.
- Photograph a paper menu on Android/iPad, or choose an existing photo on Windows; explicitly consent to cloud processing and receive editable English or Burmese candidates. Confirm name, price, and opening stock for every row; then import the accepted batch atomically into the local catalog. Choosing a desktop photo does not delete the merchant's original file.
- If Android restarts while the camera is open, Shop offers the recovered photo for review at the counter. Recovery never uploads the image or preserves cloud consent; discarding or leaving the import screen deletes the temporary camera file.
- Open Recent sales to find a committed sale by saved item or receipt ID. The list is bounded and ordered by the latest sale or reversal activity; it retains the original item, price, payment, amount, and time snapshots. Reversed receipts are visibly marked and cannot be reprinted as ordinary valid receipts.
- Schema v11 contains an atomic, append-only full-sale reversal core with an explicit all-items restock choice, original-price preservation, retry protection, daily gross/reversal/net reporting, and encrypted-backup validation. A cash reversal requires an explicit full-cash-return attestation bound to the exact reviewed open shift; a later shift cannot consume that authorization. Wallet reversals remain local reconciliation liabilities until a separate evidence-backed outcome says either money was returned or the original payment was not received; the incoming checkout record is never rewritten to imply settlement.
- The native app deliberately exposes no reversal or wallet-reconciliation button yet. `ShopCorrectionAuthorization` is only a transfer object, not proof: the production caller must first verify a short-lived managed owner receipt bound to the exact workspace, command, and capability. Partial returns and exchanges are not implemented. These authorization and launch-scope decisions remain release blockers, not hidden UI work.
- Search only the current private Wi-Fi subnet for possible ESC/POS devices on port 9100 after the operator starts discovery. Select a candidate, send a test slip, and confirm the paper before enabling receipts for the current app session. A remembered IP alone never authorizes printing after restart or a detected IP/subnet change; find and test the printer again. Completed sales print after the local transaction commits; a printer failure does not undo the sale and offers a retry. A different Wi-Fi reusing the same IP/subnet is not yet distinguishable; physical printer identity and receipt acceptance remain release gates.
- Store KBZPay/WavePay merchant details and the exact issuer-confirmed static Myanmar MMQR payload. Checkout shows the amount separately, so the customer enters it in their wallet. The cashier must verify receipt in the wallet app. This is not an amount-specific payment intent and does not settle automatically.
- Persist a wallet checkout intent before showing the QR. If the app closes while the customer is paying, the basket and amount remain available to resume; sale, stock movement, and outbox event commit together only after the cashier confirms receipt. Cancelling requires an explicit confirmation that no payment arrived.
- Block any different sale in the same database transaction while a wallet intent remains pending, even if the app has not finished restoring its screen state. Older pending checkouts without a saved QR use a manual wallet-app reconciliation dialog rather than showing an unverified replacement QR.
- Choose English or Burmese in Settings. Review device language rendering and Myanmar-script receipt output on supported hardware before release.
- Export an encrypted local backup that includes reversal, restock, wallet-reconciliation, cash-close, and retry audit records. Restore remains empty-target-only; a local archive is not cloud backup or cross-device sync.

## AI and privacy boundary

Never put an OpenAI key in Flutter. `POST /api/shop/menu-import` uses a server-side `OPENAI_API_KEY`, verified Supabase session, explicit cloud consent, and account allowlist. It returns structured candidates only; it does not write the server catalog. The current serving Vercel projects do not have the existing key or menu-import enablement variables configured, so the hosted feature remains unavailable. No key was created or copied into this app.

The camera image is temporary and is deleted by the app after the request, replacement, or screen exit when the operating system still exposes the file. An existing image selected on Windows is never deleted by the app. The image is not stored in Drift or the outbox. Wallet phone numbers never generate payment QR data and displaying a QR never confirms settlement.

## Configuration

Supply only non-secret app configuration at build time:

```powershell
flutter run `
  --dart-define=SUPABASE_URL=https://your-project.supabase.co `
  --dart-define=SUPABASE_PUBLISHABLE_KEY=your-publishable-key `
  --dart-define=SHOP_API_BASE_URL=https://app.supermega.dev
```

The first local sale does not require sign-in. Sign-in is requested only when a cloud-dependent feature is used.

## Verification and release gates

From this directory, run:

```powershell
flutter pub get
dart run build_runner build
flutter analyze
flutter test
```

The native CI workflow builds Android and unsigned iOS candidates, then attempts to generate a Windows runner in the clean CI checkout and build a Windows QA archive. This does not prove installation, hardware compatibility, signing, update, or end-user quality. Source-level flows are not customer acceptance. Android/iPad/Windows device use, process-kill recovery on a persistent database, named device and printer output, wallet payment rehearsal, Burmese receipt rendering, hosted auth/tenant isolation, cloud sync, and backup/restore remain release gates. Do not call local outbox entries “synced” or “backed up.”
