# Remote Android QA pilot

- Status: prepared, **not executed**
- Updated: 2026-10-26
- Scope: remote-only internal Android Emulator verification of the retained Shop
  QA artifact
- Maximum approved usage budget: US$15; this document does not select, create,
  link billing to, or authorize IAM changes in a Google Cloud project

## Outcome

Run one fresh, headless Android Emulator on a short-lived Google Compute Engine
VM and capture installed evidence for the existing QA artifact. The pilot proves
only simulated Android behavior. It does not prove production signing, physical
scanner/printer compatibility, a hosted founder account, merchant acceptance,
or production readiness.

The retained input is GitHub Actions artifact `12609717130`:

- file: `app-qa-debug.apk`
- bytes: `195800696`
- SHA-256:
  `d61170603382e96fda064fa68f4ec4db59b251795c26e1dc2ed3d835ffe5755b`
- package: `dev.supermega.supermega_shop.qa`
- CI source/merge SHA: `0a7fb8e4c01741a1195b6f2a586d43a1f0e3af6a`
- native tree: `3cbfc2038bef56d889fa0ccdef1d266783e0fcb8`
- signing: debug-signed, not production-signed

This artifact predates the unpushed local acceptance and UX checkpoints. The
pilot must never claim those newer changes are installed.

## Required owner-supplied selectors

Read-only browser evidence confirms that the owner's selected personal Google
account can open the existing `supermega-468612` project dashboard (project
number `453184845544`), and the owner separately confirms that billing is
linked. This establishes independently observed visibility and owner-reported
billing, not compute authority. Do not run a command below until read-only
inspection establishes the remaining non-secret values and execution authority:

- `PROJECT_ID=supermega-468612` (visible, not yet proven executable)
- `BILLING_ACCOUNT_ID` for the owner-confirmed existing linkage
- `ZONE` where `n2-standard-4` is available on Intel
- the authorized `gcloud` identity and its minimum project role(s)
- whether the organization policy permits nested virtualization

Google Workspace, Google One AI Premium/Google AI Pro, or another consumer
subscription must not be treated as Compute Engine credit. A project being
visible does not prove billing or create permission.

## Fixed resource and cost envelope

- one `n2-standard-4` VM: 4 vCPU, 16 GiB RAM
- Intel Haswell or later; nested virtualization explicitly enabled
- one 60 GiB balanced persistent boot disk retained while the VM is stopped;
  deleting the VM or disk remains a separate specifically authorized action
- Debian 12 or another owner-approved supported Linux x86_64 image
- no GPU, Local SSD, reserved IP, snapshot, image, database, or managed service
- maximum VM runtime: **6 hours**
- termination action: **STOP** after six hours
- labels: `purpose=supermega-shop-qa`, `data=synthetic`, `ttl=6h`
- one fresh AOSP API 35 x86_64 AVD: 2 vCPU, 2048 MiB RAM, no Play Store,
  account, camera, microphone, SD card, or snapshot

The prior estimate is about US$4.15 for 20 hours if resources are removed, so
six hours of compute should fit the US$15 ceiling with margin. Recalculate in
the chosen project and zone immediately before creation. Google Cloud budget
alerts are delayed and do not automatically cap ordinary usage. The provider's
six-hour STOP bounds compute runtime, but a stopped VM can continue to incur
persistent-disk, IP or other retained-resource costs. Therefore this is not a
hard dollar cap. Before creation, record the hourly compute estimate, daily
retained-resource estimate, a review deadline no later than 24 hours after the
automatic stop, and the person responsible for the later deletion decision. A
project-specific budget/spend cap is an additional owner-controlled safeguard
where the billing account supports it.

## Network and identity boundary

Use a dedicated pilot VPC/subnet or an equivalently isolated existing test
network. Permit SSH only through IAP. Do not expose Android Emulator console,
ADB, gRPC, VNC, RDP, or a web UI to the internet.

- no service account attached to the VM and no cloud API scopes;
- no application, GitHub, Supabase, Vercel, customer, or production credentials
  copied to the VM;
- ADB server and emulator console remain bound to loopback;
- never run `adb tcpip`, `adb -a`, or bind ports `5554-5585` externally;
- emulator starts with no window, audio, camera, snapshots, or host account;
- APK transfer uses authenticated `gcloud compute scp --tunnel-through-iap`
  from the authorized controller after the local SHA-256 check;
- evidence copied out contains synthetic screenshots, receipts, hashes, command
  versions, and redacted logs only.

The VM may have bounded outbound internet access only for official Debian and
Google Android SDK sources. If the selected network cannot provide that without
opening inbound access or adding an unapproved paid service, stop.

## Reproducible execution checklist

The commands are templates, not executed instructions. Replace only the named
selectors; keep the resource and safety flags unchanged.

### Offline preflight harness

Before any provider command, run the dependency-free source preflight:

```text
node tools/prepare_remote_android_qa_preflight.mjs \
  --dry-run \
  --input <read-only-host-and-session-observations.json> \
  --artifact-packet <verified-android-qa-handoff.json>
```

The input must explicitly bind the PR head, artifact source/merge SHA, native
tree, Actions run ID, artifact ID, original archive hash and APK hash. It also
requires read-only observations for nested KVM, CPU/RAM/disk, loopback-only
ADB/emulator/gRPC, no VM service account/scopes/credentials/production secrets,
synthetic-only data, six-hour STOP, the US$15 budget and 24-hour retained-cost
review. Scanner key input, sale, receipt capture/reprint, restart/reopen,
encrypted restore, evidence export and provider stop are distinct immutable
steps.

The harness imports and validates the reviewed native artifact handoff instead
of trusting caller artifact strings. It contains no command-execution,
networking or provider SDK import and cannot provision, connect, download an
SDK, start an emulator or run a database. Host and provider fields remain
explicitly labelled caller-reported planning input; an unkeyed packet digest is
integrity metadata, not authentication or authority. Version 1 always produces
`BLOCKED_OFFLINE_PLAN` and requires separately verified provider/host evidence.

The exact retained packet committed under
`evidence/remote-android-qa/retained-artifact-handoff.json` remains blocked for
`artifact_encrypted_restore_unavailable` and
`artifact_scoped_evidence_export_unavailable`. Provider access alone cannot
close these product-source gaps. The v1 handoff contract deliberately requires
both capabilities to remain blocked, so a future artifact cannot be relabeled
as ready under version 1. The source-only v2 contract requires the future APK's
compiled QA manifest to bind `supermega.shop.android-qa-capabilities.v1`, the
exact synthetic evidence envelope contract, scoped export/restore enabled, and
general external-file access disabled. CI must inspect those values and bind
the source, APK digest and sidecar before v2 is valid. No v2 artifact or
installed acceptance exists.

### 1. Controller preflight

1. Confirm the selected account, project, billing state, required roles, zone,
   current price estimate, quota, and `compute.disableNestedVirtualization`
   organization policy.
2. Confirm there is no existing resource with the pilot names.
3. Verify the retained APK locally:

   ```bash
   test "$(sha256sum app-qa-debug.apk | cut -d' ' -f1)" = \
     d61170603382e96fda064fa68f4ec4db59b251795c26e1dc2ed3d835ffe5755b
   ```

4. Create a new evidence directory whose manifest records project, zone, VM,
   start time, six-hour stop deadline, 24-hour retention-review deadline,
   estimated compute and retained-resource costs, artifact/run/source/native-
   tree identities, and every tool version. Do not include account email,
   tokens, project secrets, or environment dumps.

Stop if the artifact hash, source tuple, signing classification, project,
billing state, quota, organization policy, or estimate differs.

### 2. Create the disposable VM

Create the isolated network/firewall first, with inbound SSH restricted to IAP
and no ADB/emulator ports. Then create one VM:

```bash
gcloud compute instances create supermega-shop-qa-YYYYMMDD \
  --project="$PROJECT_ID" \
  --zone="$ZONE" \
  --machine-type=n2-standard-4 \
  --min-cpu-platform="Intel Haswell" \
  --enable-nested-virtualization \
  --boot-disk-size=60GB \
  --boot-disk-type=pd-balanced \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --no-service-account \
  --no-scopes \
  --max-run-duration=6h \
  --instance-termination-action=STOP \
  --labels=purpose=supermega-shop-qa,data=synthetic,ttl=6h \
  --network-interface="subnet=$PILOT_SUBNET"
```

Immediately read back and record `machineType`, CPU platform, nested
virtualization, boot-disk retention behavior, service-account absence,
`terminationTimestamp`, termination action, IP/firewall exposure, and labels.
Stop the VM immediately if any value differs. Do not delete it without the
required specific authorization, and do not proceed merely because creation
succeeded.

### 3. Host and KVM preflight

Connect only through IAP. Before installing Android tools, record redacted
outputs for:

```bash
grep -cw vmx /proc/cpuinfo
test -e /dev/kvm
df -h /
free -h
```

Require a nonzero VMX count, usable `/dev/kvm`, at least 20 GiB free disk after
OS packages, and at least 8 GiB total RAM. Stop the VM if hardware acceleration
is unavailable; do not delete it without specific authorization and do not
fall back to unaccelerated emulation.

### 4. Install only the pinned emulator toolchain

Install the minimal Debian runtime libraries plus official Google command-line
tools, platform-tools, emulator, and one AOSP API 35 x86_64 system image in a
workspace-local Android SDK root. Pin and record the same reviewed baseline
used by the prior setup where still available:

- command-line tools 22
- platform/build tools 37 / 37.0.1
- emulator 37.2.12
- `system-images;android-35;default;x86_64`

Accept only the Android SDK licenses required for those packages and retain the
license/output record. Verify every official archive checksum or SDK manager
package identity before use. Do not install Android Studio, Play services,
Docker, BlueStacks, third-party images, remote desktop, analytics agents, or
unrelated build dependencies.

Stop if a pinned package is unavailable, its source/checksum is not verified,
new legal terms appear, or installation would cross the disk/memory envelope.

### 5. Create and boot the synthetic AVD

Create a fresh AVD named `SuperMegaShop_QA_API_35_x86_64` with 2 vCPU and 2048
MiB RAM. Boot cold and headless:

```bash
emulator @SuperMegaShop_QA_API_35_x86_64 \
  -no-window -no-audio -no-boot-anim \
  -no-snapshot -camera-back none -camera-front none \
  -gpu swiftshader_indirect \
  -grpc-use-token
```

Use only `adb -s emulator-5554` from the VM. Wait for
`sys.boot_completed=1`, then record emulator, SDK, image, kernel, acceleration,
screen size, locale, free storage, and package inventory. Confirm both
`dev.supermega.supermega_shop` and `.qa` are absent before installation.

### 6. Transfer, verify, and install the retained QA artifact

Copy the already hash-verified APK through IAP, hash it again on the VM, inspect
its package/application identity, ABIs, signing certificate classification,
and debuggable flag, then install it. Require:

- package exactly `dev.supermega.supermega_shop.qa`;
- artifact hash exactly the retained hash above;
- x86_64 support present;
- debug signing reported honestly; never call it production-signed;
- production package remains absent.

Any mismatch stops the run before launch.

### 7. Run the synthetic native acceptance journey

Use only the visible `SYNTHETIC QA — NOT CUSTOMER DATA` profile and fictional
records. Capture before/after database-independent evidence where possible:

1. first launch and QA identity/banner;
2. create or load the synthetic store and fictional product;
3. scan its leading-zero barcode using `adb shell input` as keyboard/scanner
   simulation, then verify search and intentional repeated scan behavior;
4. add to cart, reject insufficient cash, enter cash, complete exactly one sale,
   and show calculated change;
5. capture saved-sale, payment-recorded, and simulated print status separately;
6. simulate printer failure, reprint the same receipt ID, and verify there is
   still exactly one sale/payment/stock effect;
7. close the shift and capture expected versus counted totals;
8. force-stop and relaunch the app; verify the sale, stock, shift, and immutable
   receipt survive;
9. export the encrypted QA backup only through the scoped synthetic-evidence
   path, restore into a fresh matching QA profile, and verify matching totals
   and no duplicate effect;
10. switch EN/MY without losing the active cart and capture long Burmese, large
    MMK, and simulated 58/80 mm receipt output.

Record command timestamps, screenshots, receipt images, package/data-root
identity, app-visible counts and redacted logs. Do not use names, phones,
emails, real wallet identifiers, customer data, network printers, external
providers, or correction/refund authority. Mark scanner and receipt results as
simulated, not physical hardware evidence.

### 8. Update/isolation check

Reinstall the same exact QA APK without uninstalling and verify the QA data
survives. Confirm again that the production package ID is absent. This proves a
same-artifact QA update boundary only; it is not an upgrade from newer source
and not production migration evidence.

### 9. Export evidence and stop the provider resources

Copy out only the redacted manifest, hashes, screenshots, simulated receipts,
test log, and failure summary. Verify their hashes on the controller before
changing resource state. Then:

1. stop emulator/ADB;
2. stop the VM explicitly if the six-hour provider stop has not already run;
3. verify the VM is `TERMINATED` and cannot be restarted by an automatic-
   restart policy;
4. enumerate the stopped VM, boot disk, external IP, firewall, subnet and
   network, recording which resources still incur charges;
5. record actual elapsed time, estimated compute cost, estimated retained-
   resource cost per day, and the 24-hour deletion-review deadline without
   claiming final invoiced cost;
6. request the specific deletion decision for the exact VM, disk, IP and
   dedicated network resources. Do not treat the pilot budget as deletion
   authority.

Until that decision, do not create a snapshot or image, restart the VM, reserve
an ephemeral IP, or copy new data onto the disk. If deletion is specifically
authorized, first confirm the exported evidence hashes, then delete only the
listed pilot resources and read back an empty label-scoped resource inventory.
If retention is chosen, record its owner, purpose, daily estimated cost and new
expiry/review time. A stopped VM is not a completed cleanup state.

## Completion and stop conditions

The test run is complete only when the retained artifact identity, VM identity,
KVM acceleration, private ADB boundary, installed package, synthetic journey,
restart, same-artifact update, encrypted export/restore, evidence hashes, VM
stop and remaining-resource cost inventory are recorded. Resource lifecycle is
closed only after a separately authorized deletion or an explicit bounded
retention decision is recorded.

Stop without retrying or widening access when any of these occurs:

- account/project/billing ownership or permission is ambiguous;
- estimated or observed compute plus retained-resource usage can exceed US$15;
- nested KVM, quota, required official package, or disk/RAM minimum is absent;
- a command requires a new IAM grant, service account, credential, billing
  link, API purchase, legal acceptance, public ADB/UI, or production data;
- artifact/source/package/signing identity differs;
- the QA banner/profile, scoped export path, or production-package absence
  cannot be proven;
- business-state duplication, restore mismatch, unexplained crash, or evidence
  redaction failure occurs.

Failure evidence is retained and reported; the run is not silently retried.

## Official references

- [Enable nested virtualization](https://cloud.google.com/compute/docs/instances/nested-virtualization/enabling)
- [Limit the run time of a VM](https://cloud.google.com/compute/docs/instances/limit-vm-runtime)
- [Android Emulator hardware acceleration](https://developer.android.com/studio/run/emulator-acceleration)
- [Start the Android Emulator from the command line](https://developer.android.com/studio/run/emulator-commandline)
- [Google Cloud budgets and alerts](https://cloud.google.com/billing/docs/how-to/budgets)
