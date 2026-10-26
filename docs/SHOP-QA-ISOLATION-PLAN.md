# Shop synthetic-QA isolation plan

Status: implementation-ready design only. This document does not authorize an app launch, claim a QA build exists, or change production storage.

## Current unsafe boundary

The current Android debug APK and unsigned Windows ZIP use production-identical identity and storage behavior:

- `main.dart` opens `SharedPreferences.getInstance()` and `getApplicationDocumentsDirectory()` before rendering.
- `ShopDatabase.privateDatabaseFile` always resolves `supermega_shop.sqlite` in that documents directory.
- startup immediately inspects and opens an existing database and runs backup/restore staging cleanup in the same directory;
- locale, pending photo-picker intent, printer host and printer paper width use unscoped preference keys;
- backup locks, plaintext staging, restore markers and encrypted import/export temporary files are not profile-namespaced;
- Android uses `dev.supermega.supermega_shop`; iOS uses `dev.supermega.supermegaShop`;
- the generated Windows runner has no separate QA product identity;
- provider credentials are absent from CI artifacts, but networking, LAN printer paths, camera/gallery and the default API URL still exist.

Therefore, a copied Windows folder is not isolated. Installing the APK over an existing matching application ID can reuse data or fail on a signing mismatch. Existing artifacts may be run only in a disposable OS sandbox/emulator containing no Shop data.

### Current local executor capability

The 24 October 2026 read-only local check found no ready disposable environment:

- Windows edition metadata reports Home Single Language. Microsoft documents Windows Sandbox as unsupported on Home editions, so an elevated feature query or enablement script is not an approved or credible unblock.
- Hardware virtualization prerequisites are present, but no usable VM image or VMware/VirtualBox/QEMU process or artifact was found.
- Android SDK, AVD, `emulator`, `avdmanager` and `adb` were not found.
- DISM feature-state inspection returned elevation error 740 and was not escalated.
- The reported Windows label and build number are internally unusual and must not be used to infer an exact OS version.

No current Windows Sandbox, VM or Android emulator route is therefore proven. Installing an emulator/hypervisor, enabling OS features or creating a new machine remains a separate owner-approved setup action, not part of this source plan.

## Smallest implementation shape

### 1. One fail-closed runtime profile

Add `mobile/shop_pos/lib/shop_runtime_profile.dart`:

- `production` remains the default only when all QA defines are absent;
- `syntheticQa` requires all of:
  - `SHOP_RUNTIME_PROFILE=synthetic_qa_v1`;
  - `SHOP_QA_PROFILE_ID=synthetic-qa-v1`;
  - a build-generated platform-identity constant matching the QA application ID, bundle ID or Windows product identity;
- unknown, partial, mixed production/QA, or unsafe profile IDs fail before preferences, documents, temporary files, Supabase or Drift are opened;
- QA rejects non-empty `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SHOP_API_BASE_URL`, enabled connected orders, or an external-I/O override;
- the production branch keeps the current API default and existing storage names unchanged.

The profile is immutable for the process lifetime. There is no in-app switch and no migration between QA and production. A free-form Dart define is not identity proof: each platform build generates a static-contract-verifiable identity constant, and the artifact verifier independently inspects the Android manifest, iOS bundle settings or Windows executable metadata. Runtime startup compares the profile tuple to that generated constant before preferences or storage. CI rejects a production artifact paired with QA defines, a QA artifact paired with production defaults, or any artifact whose inspected identity differs from the generated constant.

### 2. One storage and capability object

Add `mobile/shop_pos/lib/shop_runtime_scope.dart` with:

- runtime profile and exact profile ID;
- resolved documents and temporary roots;
- database file, restore marker, backup lock/staging root and encrypted import/export temporary root;
- namespaced preference-key lookup;
- capability flags fixed by profile: managed auth, correction authorization, connected orders, network printer, camera, gallery and external file saving.

Production returns the existing documents/temp roots and the existing filenames and preference keys byte-for-byte. Synthetic QA uses a dedicated application-support root and temporary root containing `synthetic-qa-v1`.

QA root bootstrap is atomic and fail closed:

1. Resolve the parent without following a symlink into another profile.
2. If the QA root is absent, create it exclusively, verify that it is empty and inside the QA application container, then create the sentinel exclusively and fsync the sentinel and directory where supported.
3. If the root already exists and is non-empty without the exact sentinel, fail. Never adopt or clean it.
4. On every later launch, require an exact sentinel profile ID, platform identity and stable isolation-contract format version match. The sentinel does not contain the evolving Shop database schema version; database migrations remain governed by the existing database contract.
5. A symlinked, malformed, mismatched or non-directory root fails before cleanup, preferences or database open.

An empty pre-existing root without the sentinel is also rejected; only the process that exclusively creates the root may initialize it. A failed bootstrap is never repaired automatically.

No caller constructs persistent or QA-sensitive storage paths directly after this change. Transient in-memory image objects are outside this rule.

### 3. Route every persisted path through the scope

Exact source changes:

| File | Minimal change |
|---|---|
| `mobile/shop_pos/lib/main.dart` | Resolve and validate the runtime scope before preferences/storage; pass it into startup and `ShopApp`; never initialize Supabase in QA; reject connected-orders drift; render a persistent locale-aware synthetic-QA banner. |
| `mobile/shop_pos/lib/shop_database.dart` | Keep the existing directory-injected opener and `privateDatabaseFile`; pass the scoped documents directory and add disjoint-root tests. Preserve `supermega_shop.sqlite` and all restore verification. |
| `mobile/shop_pos/lib/shop_startup.dart` | Use scoped database, import-temp root and preference adapter. Keep automatic existing-store verification inside only the selected scope. |
| `mobile/shop_pos/lib/shop_backup.dart` | Do not refactor its lock/transaction algorithm. Call it only with roots already validated by the scope, and extend its confinement tests for mismatched/cross-profile roots. |
| `mobile/shop_pos/lib/shop_backup_export_screen.dart` | Receive scoped plaintext and encrypted-temp roots plus the injected QA evidence saver/loader. QA filenames include `SYNTHETIC-QA`; cancellation remains mutation-free. |
| `mobile/shop_pos/lib/printer_services.dart` | Receive namespaced preferences and a transport policy. QA permits only an injected loopback/fake transport; discovery and TCP/LAN fail closed. `buildShopReceiptTicket` adds the synthetic marker in QA. |
| `mobile/shop_pos/lib/printer_setup_screen.dart` | Receive scope-owned settings and transport policy instead of constructing `ReceiptPrinterSettings` or `PrinterDiscoveryService` internally; explain that physical discovery is unavailable in synthetic QA and expose only the existing simulator/test seam. Service/transport guards remain authoritative. |
| `mobile/shop_pos/lib/menu_import_screen.dart`, `mobile/shop_pos/lib/menu_import_service.dart` and `mobile/shop_pos/lib/main.dart` | Disable camera/gallery and remote import entry in QA; allow only bundled synthetic fixtures in tests. |
| `mobile/shop_pos/lib/camera_barcode_scanner.dart` | Require the scope-owned camera capability before constructing `MobileScanner`; a direct constructor call in QA fails closed even when a caller forgets to hide its button. |
| `mobile/shop_pos/lib/connected_orders_screen.dart` | Remain unreachable in QA even if a build define drifts. |
| `mobile/shop_pos/lib/connected_orders_service.dart` | Reject every network operation in QA even when called outside the screen. |
| `mobile/shop_pos/lib/shop_correction_authorization_service.dart` | Do not construct a remote authorizer in QA. Normal selling remains local; protected correction stays unavailable. |
| `mobile/shop_pos/lib/shop_build_identity.g.dart` and `tools/generate_shop_build_identity.mjs` | Generate a fixed build-identity constant from an allowlisted platform/profile tuple; dependency-free verification regenerates it and rejects drift. It never reads runtime environment variables. |
| `mobile/shop_pos/android/app/build.gradle.kts`, `android/app/src/production/AndroidManifest.xml`, `android/app/src/qa/AndroidManifest.xml` and flavor resources | Define the explicit flavor dimension, preserve the production ID/name and bind the QA ID/name to the generated constant. |
| `mobile/shop_pos/ios/Runner.xcodeproj/project.pbxproj`, `ios/Runner.xcodeproj/xcshareddata/xcschemes/qa.xcscheme`, `ios/Flutter/QA.xcconfig` and `ios/Runner/Info.plist` | Add the no-codesign `qa` configuration/scheme and bind its bundle/display identity to the generated constant. |
| `mobile/shop_pos/scripts/configure_windows_qa_runner.ps1` and generated Windows runner inputs | Patch the freshly generated runner source and resources before compilation, then rebuild and inspect the produced metadata. |
| `.github/workflows/shop-native-ci.yml` | Build production and QA variants with their exact profile tuples, inspect identities before packaging, use distinct artifact names and keep every QA artifact promotion-ineligible. |

Preference keys requiring the adapter:

- `shop_locale_myanmar`
- `shop_pending_picker_intent`
- `shop_receipt_printer_host_v1`
- `shop_receipt_paper_width_v1`

Production uses these exact keys. QA prefixes them with `qa.synthetic-qa-v1.` inside its separate application identity.

### 4. Separate platform identity

- Android: introduce one flavor dimension with explicit `production` and `qa` flavors. `production` retains exact application ID `dev.supermega.supermega_shop`; `qa` uses `dev.supermega.supermega_shop.qa` and display name `Shop QA`. For identity/default-storage comparison, run `node tools/generate_shop_build_identity.mjs --platform android --profile production`, then build only a production-flavor **debug** artifact with `flutter build apk --debug --no-pub --flavor production` and no QA defines. Regenerate for the QA tuple with `node tools/generate_shop_build_identity.mjs --platform android --profile synthetic_qa_v1`, then build QA with `flutter build apk --debug --no-pub --flavor qa --dart-define=SHOP_RUNTIME_PROFILE=synthetic_qa_v1 --dart-define=SHOP_QA_PROFILE_ID=synthetic-qa-v1`. Expected comparison artifacts are `build/app/outputs/flutter-apk/app-production-debug.apk` and `build/app/outputs/flutter-apk/app-qa-debug.apk`. Regeneration is followed by a clean-tree/content check so one tuple cannot leak into the other. The contract verifier rejects every flavor/define mismatch. The existing unsigned-release rejection stays intact: a signed production-flavor release identity build is explicitly `NOT RUN` until signing identities and authority exist, and this plan never weakens or bypasses that guard.
- iOS/iPad: add a shared `qa` scheme and QA build configuration with bundle ID `dev.supermega.supermegaShop.qa` and display name `Shop QA`. In its production workspace, run `node tools/generate_shop_build_identity.mjs --platform ios --profile production` immediately before the existing production no-codesign build. In a separate clean QA workspace, run the generator with `--platform ios --profile synthetic_qa_v1`, then build with `flutter build ios --debug --no-codesign --no-pub --flavor qa --dart-define=SHOP_RUNTIME_PROFILE=synthetic_qa_v1 --dart-define=SHOP_QA_PROFILE_ID=synthetic-qa-v1`; inspect `build/ios/iphoneos/Runner.app/Info.plist`. This remains a no-codesign build and does not create an installable artifact.
- Windows: use separate clean production and QA workspaces. In production, generate with `--platform windows --profile production` immediately before the existing production runner generation/build. In QA, run `flutter create --platforms=windows` into its temporary runner source, copy the generated runner inputs, run `node tools/generate_shop_build_identity.mjs --platform windows --profile synthetic_qa_v1`, then run checked-in `mobile/shop_pos/scripts/configure_windows_qa_runner.ps1` **before** compilation. Build with `flutter build windows --release --no-pub --dart-define=SHOP_RUNTIME_PROFILE=synthetic_qa_v1 --dart-define=SHOP_QA_PROFILE_ID=synthetic-qa-v1`, producing `supermega_shop_qa.exe`, product name `Shop QA`, and a QA-only package filename. The verifier inspects the compiled executable/product metadata. The explicit runtime scope—not the executable folder—provides data isolation.
- QA artifact names and manifests include `synthetic-qa`, exact source SHA and checksum. Release tooling rejects them as promotion inputs.

Every artifact build runs in its own clean workspace and regenerates the identity constant immediately before compilation. The verifier checks that only the expected generated-file change exists, builds one tuple, inspects it, and discards that workspace. A QA-generated identity is never reused or restored into a production build workspace.

### 5. Visible and non-bypassable QA state

Wrap the root material app with an always-visible banner:

- English mode: `SYNTHETIC QA — NOT CUSTOMER DATA`
- Burmese mode: a fully Burmese equivalent, with no mixed bilingual sentence;
- semantics label announces the same status;
- screenshots and receipts produced by QA include a synthetic marker;
- production widget and receipt goldens assert the marker is absent.

## Tests before any app launch

### QA evidence export and restore boundary

General OS Save As/open-file dialogs, native pickers and arbitrary external paths remain disabled in QA. Installed acceptance instead injects a QA-only evidence saver/loader whose only accessible directory is `<qa-root>/synthetic-evidence`. It rejects symlinks, traversal, files without `SYNTHETIC-QA` in the generated name and every path outside that directory.

The QA archive wraps the unchanged encrypted production payload in a QA-only integrity-tagged envelope binding `syntheticQa`, the stable profile ID, platform identity, isolation-contract format version and payload digest. The tag uses a build-time synthetic-QA test key that is public/test-only and explicitly ineligible for production trust; it detects accidental cross-profile mixing, not malicious-device activity. Restore verifies the envelope before decrypting, accepts only the matching identity/profile, and restores only into an empty matching QA root. Production archive bytes and production picker behavior remain unchanged.

The isolated Android implementation is `ShopQaEvidenceStore`. It is available
only for the generated synthetic-QA profile on Android, writes beneath the
private `synthetic-evidence` root, and never enables the external Save As or
file-picker capability. Its `.smqa` envelope binds the exact profile, platform
identity, isolation-contract version, payload length and SHA-256. The public
synthetic-test HMAC detects accidental evidence/profile mixing; it is not a
production signature or a defense against a rooted device. The loader rejects
symlinks, oversized/truncated envelopes, header/payload tampering and foreign
identities before staging the still-encrypted `SMBK` payload. `ShopBackup` then
retains its empty-target, password, schema, semantic and no-replace checks.

Remote Android collection remains a two-sided acceptance step: export inside
the QA app, copy the `.smqa` bytes through the debug-only package sandbox,
start a fresh empty QA profile, place the unchanged envelope back inside that
profile's private evidence root, and restore through the in-app QA action.
Those package-sandbox transfers and the installed restart/restore result must
be observed on the authorized emulator; source tests do not prove them.

### Dependency-free checks runnable in the current cloud toolchain

Add `tools/verify_shop_qa_isolation_contract.mjs` and its Node test before native implementation. Audit mode must report the current blockers without claiming isolation; strict mode remains nonzero until the implementation is complete. The contract verifies:

- exact Android/iOS/Windows QA identities and artifact names;
- production IDs and default storage/key tokens remain unchanged;
- QA defines are all-or-none and unknown profiles are rejected;
- direct `SharedPreferences.getInstance`, `getApplicationDocumentsDirectory`, `getApplicationSupportDirectory`, `getTemporaryDirectory` and production path construction are limited to the runtime-scope adapter or explicitly approved test seams; `ShopDatabase.privateDatabaseFile` remains the sole fixed-filename seam and receives only a scope-validated root;
- `connected_orders_service.dart`, `menu_import_service.dart`, `shop_correction_authorization_service.dart`, direct `CameraBarcodeScanner`/`MobileScanner` construction, and `Socket.connect` in `printer_services.dart` are guarded at the service/transport boundary, not merely hidden in UI;
- QA build commands contain no provider values and cannot be treated as release artifacts;
- native CI retains truthful debug/unsigned/no-codesign labels.

These checks can run here with Node only. They do not prove Flutter behavior or installed isolation.

### Pinned Flutter 3.47.8 tests required in native CI

Add focused tests before the full suite:

1. `shop_runtime_profile_test.dart`
   - absent defines select unchanged production defaults;
   - exact QA tuple selects QA;
   - partial, unknown and provider-enabled QA configurations fail before storage.
2. `shop_runtime_scope_test.dart`
   - production paths/keys equal current values;
   - QA paths/keys never equal production;
   - atomic exclusive bootstrap succeeds only for a newly and exclusively created empty root;
   - pre-existing empty/non-empty roots without the exact sentinel, traversal, symlink, mismatched sentinel and cross-profile cleanup fail closed;
   - database, sidecars, backup lock/staging, restore marker and import/export temp remain under one QA root.
3. Extend `shop_backup_test.dart`
   - QA restart, encrypted export to the scoped synthetic-evidence directory and restore into an empty QA profile;
   - arbitrary OS picker paths, missing synthetic filename marker and archives from another profile are rejected;
   - QA envelope profile, platform identity, isolation-contract version and payload digest are authenticated; tampering fails before decrypt/restore;
   - the embedded production payload remains byte-compatible and production export bytes are unchanged;
   - no production file or sentinel changes;
   - interrupted cleanup cannot cross roots.
4. Extend `shop_foundation_test.dart`
   - QA database survives reopen/update with synthetic data;
   - production and QA databases cannot be opened by the opposite scope.
5. Extend `widget_test.dart`
   - EN/MY QA banner is always visible and accessible at 390 px and 320 px/1.5x;
   - production has no QA marker;
   - connected orders, remote correction, camera/gallery and physical printer actions are unavailable;
   - fake/loopback receipt tests remain reachable without sale/stock duplication.
   - direct `CameraBarcodeScanner` construction in QA is rejected before `MobileScanner` or any camera permission/session is created; production keeps its existing scanner path.
6. Extend printer tests
   - saved production printer settings are invisible to QA;
   - QA rejects private-LAN TCP and discovery even when old preferences exist;
   - only the injected loopback transport is accepted.

Any native-tree change also requires exact native CI and a new truthful gallery capture/provenance record before public integration.

### Installed disposable-profile proof

Only after source review and exact CI:

- A supported disposable Windows VM or separately provisioned test user/machine: install/run QA, make a synthetic sale, restart, update with the same QA identity, export/restore, then prove the production sentinel and database hashes are unchanged. Built-in Windows Sandbox is not an assumed route on the currently reported Home edition.
- Fresh Android emulator: same flow under `.qa`; verify production application ID is absent and QA storage survives same-ID update.
- iOS remains `NOT RUN` until an approved signed QA channel exists.

Record exact artifact SHA-256, OS image/emulator identity, commands, source commit, data-root evidence and before/after production sentinel hashes. Delete only the disposable environment created for this proof.

## Minimal prerequisite and sequencing

1. Review and approve this isolation contract.
2. Implement the runtime profile/scope plus dependency-free guard first, without UI or product changes.
3. Add Flutter storage/backup tests and the QA banner/capability wiring in one bounded native batch.
4. Publish that isolated branch and dispatch one pinned native CI run only after the existing branch-publication approval is resolved.
5. Build and launch QA artifacts only in a disposable profile.

Do not launch current artifacts on an ordinary profile, add credentials, enable providers, or treat simulated QA as signed-device, physical-hardware or merchant acceptance.
