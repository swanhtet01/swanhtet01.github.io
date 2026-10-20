# SuperMega Shop native POS candidate

Flutter Shop targets Android tablets and iPad. Drift/SQLite is the on-device source of truth for the local catalog, completed sales, stock movements, and pending operations. The client can open offline and record local cash sales; it does not currently synchronize between devices or restore cloud backups.

## Current flows

- Add products manually or scan keyboard-wedge barcodes; barcode values stay text so leading zeroes are preserved.
- Photograph a paper menu, explicitly consent to cloud processing, and receive editable English or Burmese candidates. Confirm name, price, and opening stock for every row; then import the accepted batch atomically into the local catalog.
- Search only the current private Wi-Fi subnet for possible ESC/POS devices on port 9100 after the operator starts discovery. Select a candidate, send a test slip, and confirm the paper before saving it as the receipt printer. Completed sales print after the local transaction commits; a printer failure does not undo the sale and offers a retry.
- Store KBZPay/WavePay merchant details and the exact issuer-confirmed static Myanmar MMQR payload. Checkout shows the amount separately, so the customer enters it in their wallet. The cashier must verify receipt in the wallet app. This is not an amount-specific payment intent and does not settle automatically.
- Persist a wallet checkout intent before showing the QR. If the app closes while the customer is paying, the basket and amount remain available to resume; sale, stock movement, and outbox event commit together only after the cashier confirms receipt. Cancelling requires an explicit confirmation that no payment arrived.
- Choose English or Burmese in Settings. Review device language rendering and Myanmar-script receipt output on supported hardware before release.

## AI and privacy boundary

Never put an OpenAI key in Flutter. `POST /api/shop/menu-import` uses a server-side `OPENAI_API_KEY`, verified Supabase session, explicit cloud consent, and account allowlist. It returns structured candidates only; it does not write the server catalog. The current serving Vercel projects do not have the existing key or menu-import enablement variables configured, so the hosted feature remains unavailable. No key was created or copied into this app.

The camera image is temporary and is deleted by the app after the request, replacement, or screen exit when the operating system still exposes the file. The image is not stored in Drift or the outbox. Wallet phone numbers never generate payment QR data and displaying a QR never confirms settlement.

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

Source-level flows are not customer acceptance. Android/iPad builds, process-kill recovery on a persistent database, named device and printer output, wallet payment rehearsal, Burmese receipt rendering, hosted auth/tenant isolation, cloud sync, and backup/restore remain release gates. Do not call local outbox entries “synced” or “backed up.”
