# Internal Android Shop QA handoff

Status: source-owned internal procedure. It does not prove installation,
production signing, update continuity, backup/restore, physical hardware,
merchant acceptance, deployment, or launch readiness.

## Purpose

The native CI builds a separate Android application named **Shop QA** with
application ID `dev.supermega.supermega_shop.qa`. It is debug-signed,
promotion-ineligible, and intended only for synthetic internal testing on a
separately approved disposable device or emulator.

The older `prepare_shop_android_smoke_packet.mjs` describes the browser showroom
and `app.supermega.dev`; it is not a handoff for this APK. Use
`prepare_shop_android_qa_handoff.mjs` for the native artifact.

## Before a run

Retain the original GitHub artifact archive without repacking it. Extract the
three original Android files:

- `app-qa-debug.apk`
- `app-qa-debug.apk.sha256`
- `app-qa-debug.apk.manifest`

Prepare a private metadata JSON file containing the exact PR head SHA, artifact
source/merge SHA, native tree, Actions run ID, artifact ID and URL, original archive SHA-256,
artifact expiry, passed producer `apkanalyzer` application-ID/label evidence,
and the truthful debug-signing classification. Do not include credentials,
customer data, or a signing key.

For pull-request Actions, `github.sha` is the tested merge commit and is the
`source-sha` written into the artifact manifest. Record the PR head separately;
never overwrite the manifest identity with the PR head.

Run the dependency-free verifier:

```text
node tools/prepare_shop_android_qa_handoff.mjs \
  --metadata <private-metadata.json> \
  --archive <original-artifact.zip> \
  --apk <app-qa-debug.apk> \
  --checksum <app-qa-debug.apk.sha256> \
  --manifest <app-qa-debug.apk.manifest> \
  --expected-head-sha <reviewed-pr-head-sha> \
  --expected-source-sha <retained-artifact-source-sha> \
  --expected-merge-sha <retained-pull-request-merge-sha> \
  --expected-native-tree <reviewed-native-source-tree> \
  --expected-run-id <retained-actions-run-id> \
  --expected-artifact-id <retained-artifact-id> \
  --expected-archive-sha256 <retained-original-archive-sha256> \
  --output <create-only-packet.json> \
  --markdown-output <create-only-run-card.md>
```

The tool hashes the supplied archive and APK, parses the ZIP central directory,
requires exactly the three expected safe entry names, proves the supplied APK,
checksum, and manifest bytes came from that archive, checks the exact QA identity
evidence, requires the
debug/non-production signing classification, and rejects expired evidence or
premature acceptance claims. A successful result is only
`ready_for_internal_install_run`.

Application-ID and label evidence is reported producer-CI evidence bound to the
exact run and pull-request merge SHA. This dependency-free tool does not rerun
`apkanalyzer` against the APK. Installed acceptance must observe the identity
again on the disposable target.

## Allowed internal run

On an approved clean disposable Android target containing no SuperMega data:

1. record package inventory and the production-data sentinel;
2. install the verified QA APK and confirm `Shop QA` plus the QA application ID;
3. create a fictional shop and synthetic products;
4. complete a cash sale and verify tender, change, saved sale, and stock;
5. reopen and reprint the saved receipt without another financial/stock effect;
6. close the synthetic shift and record totals;
7. terminate and reopen the app, verifying the same records;
8. uninstall only the QA application; and
9. verify the production package inventory and sentinel are unchanged.

Evidence remains private and synthetic. A failed or incomplete step is recorded
as `FAIL`, `BLOCKED`, or `NOT RUN`, never inferred as passing.

## Capabilities that remain blocked

- **Update continuity:** CI uses debug signing and no stable QA signing identity
  or certificate attestation is accepted across builds.
- **Encrypted backup/restore and CSV/file export:** the QA profile deliberately
  disables external file saving. The scoped evidence saver/loader described in
  the isolation plan is not implemented for installed proof.
- **Camera/gallery, physical scanner/printer, managed authentication, provider
  access, correction authorization, and customer/merchant operation:** these are
  disabled or separately gated and are not exercised by this handoff.
- **Production distribution:** this APK is not production-signed and must never
  be exposed as a public customer download or promotion input.

A real installed result must name the exact device/emulator, OS, package
inventory, artifact/run/source identities, hashes, observed sale/stock/receipt
records, restart result, removal result, and before/after production sentinel.
This document and a generated packet do not supply those observations.
