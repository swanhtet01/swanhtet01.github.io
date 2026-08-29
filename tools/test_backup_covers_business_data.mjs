// Guard: resettable implies portable, or an explicit decision.
//
// restoreCompanyBackup builds its target from the UNION of every resettable key on the device and
// every key in the snapshot, then writes `incoming.get(key) ?? null` -- and null means removeItem
// (company-backup.ts). So a key that "Reset this device" would clear, but that the backup never
// captured, is DELETED when an owner restores. Not stale. Gone.
//
// This was not hypothetical. Backing up a device and restoring that same backup destroyed four of
// six records, including supermega.shop.service-schedule.v1 -- the appointment book, which for a
// spa, salon or clinic is the entire business -- and supermega.website.leads.v1, customers who had
// asked to be contacted.
//
// The failure mode is silent and additive: every new localStorage key defaults to "deleted on
// restore" unless someone remembers a second list. So the invariant is enforced here rather than
// remembered, and a new key must be classified deliberately.
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

if (!globalThis.crypto) globalThis.crypto = webcrypto

const requireFromShowroom = createRequire(pathToFileURL('showroom/package.json').href)
const { build } = await import(pathToFileURL(requireFromShowroom.resolve('esbuild')).href)

const bundle = await build({
  stdin: {
    contents: `
      export { localWorkspaceExactKeys, localWorkspaceKeyPrefixes, isLocalWorkspaceKey } from './local-workspace-storage.ts'
      export {
        isPortableCompanyStorageKey, isResettableCompanyStorageKey,
        deliberatelyNotPortableKeys, deliberatelyNotPortablePrefixes,
        createEncryptedCompanyBackup, inspectEncryptedCompanyBackup, restoreCompanyBackup,
        planCompanyRestore,
      } from './company-backup.ts'
    `,
    resolveDir: 'showroom/src/core',
    sourcefile: 'showroom/src/core/backup-coverage-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'error',
})

const {
  localWorkspaceExactKeys, localWorkspaceKeyPrefixes,
  isPortableCompanyStorageKey, isResettableCompanyStorageKey,
  deliberatelyNotPortableKeys, deliberatelyNotPortablePrefixes,
  createEncryptedCompanyBackup, inspectEncryptedCompanyBackup, restoreCompanyBackup,
  planCompanyRestore,
} = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].contents).toString('base64')}`)

let checks = 0
function check(condition, label) {
  checks += 1
  assert.ok(condition, label)
}

const excluded = new Set(deliberatelyNotPortableKeys)
const excludedPrefixes = new Set(deliberatelyNotPortablePrefixes)

// --- every resettable exact key is portable, or deliberately excluded ---------------
for (const key of localWorkspaceExactKeys) {
  check(
    isPortableCompanyStorageKey(key) || excluded.has(key),
    `${key}: is cleared by reset but NOT captured by backup and NOT listed as deliberately excluded -- restoring a backup would DELETE it`,
  )
  check(
    !(isPortableCompanyStorageKey(key) && excluded.has(key)),
    `${key}: cannot be both portable and deliberately excluded -- the two lists contradict`,
  )
}

// --- same for the prefixed families -------------------------------------------------
for (const prefix of localWorkspaceKeyPrefixes) {
  const sample = `${prefix}sample`
  check(
    isPortableCompanyStorageKey(sample) || excludedPrefixes.has(prefix),
    `${prefix}: keys under this prefix are cleared by reset but not captured, and the prefix is not listed as deliberately excluded`,
  )
}

// --- no dead entries in the exclusion lists ------------------------------------------
// An excluded key that is no longer resettable is a stale decision, and stale decisions are how the
// lists drift apart again.
for (const key of deliberatelyNotPortableKeys) {
  check(
    isResettableCompanyStorageKey(key),
    `${key}: listed as deliberately not portable but is not a workspace key at all -- remove the stale entry`,
  )
}
for (const prefix of deliberatelyNotPortablePrefixes) {
  check(
    localWorkspaceKeyPrefixes.includes(prefix),
    `${prefix}: listed as a deliberately excluded prefix but is not a workspace prefix -- remove the stale entry`,
  )
}

// --- the end-to-end property, which is what actually matters --------------------------
// Back up a device carrying a record under every resettable key, restore that same backup onto the
// same device, and assert nothing vanished except what was deliberately excluded.
function makeStorage(seed) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)) },
    removeItem: (key) => { map.delete(key) },
    key: (index) => [...map.keys()][index] ?? null,
    get length() { return map.size },
  }
}

const seed = {}
for (const key of localWorkspaceExactKeys) seed[key] = JSON.stringify({ key })
for (const prefix of localWorkspaceKeyPrefixes) seed[`${prefix}sample`] = JSON.stringify({ prefix })
const storage = makeStorage(seed)
const seededKeys = Object.keys(seed)

const { json } = await createEncryptedCompanyBackup(storage, 'guard-passphrase-0123456789', new Date('2026-08-11T03:00:00.000Z'))
const inspection = await inspectEncryptedCompanyBackup(json, 'guard-passphrase-0123456789')
await restoreCompanyBackup(storage, inspection)

const destroyed = seededKeys.filter((key) => storage.getItem(key) === null)
const unexpected = destroyed.filter((key) => (
  !excluded.has(key) && ![...excludedPrefixes].some((prefix) => key.startsWith(prefix))
))
check(
  unexpected.length === 0,
  `RESTORING A BACKUP OF THE SAME DEVICE DESTROYED RECORDS NOBODY CHOSE TO DROP: ${unexpected.join(', ')}`,
)

// And the exclusions really are dropped -- otherwise the list above is decorative and the guard
// would keep passing after someone made everything portable "to be safe".
const survivingExclusions = [...excluded].filter((key) => seededKeys.includes(key) && storage.getItem(key) !== null)
check(
  survivingExclusions.length === 0,
  `keys listed as deliberately not portable survived the restore, so the list is not what drives behaviour: ${survivingExclusions.join(', ')}`,
)

// Irrecoverable operating records are named explicitly rather than relying only on the general
// rule: appointments, contact requests, and the owner's reviewed Batch Profit Control lineage.
for (const key of [
  'supermega.shop.service-schedule.v1',
  'supermega.website.leads.v1',
  'supermega.shop.batch-profit-control.local-workspace.v1',
]) {
  check(isPortableCompanyStorageKey(key), `${key}: must survive a backup and restore`)
  check(storage.getItem(key) !== null, `${key}: survived an end-to-end backup and restore`)
}

// --- Inspection property checks -----------------------------------------------
check(inspection.recordCount === inspection.snapshot.records.length,
  'inspect: recordCount matches snapshot.records.length')
check(typeof inspection.snapshotDigest === 'string' && inspection.snapshotDigest.startsWith('sha256:'),
  'inspect: snapshotDigest has sha256: prefix')
check(inspection.categories.reduce((total, c) => total + c.count, 0) === inspection.recordCount,
  'inspect: categories sum equals recordCount')
check(inspection.authRecordsIncluded === false,
  'inspect: authRecordsIncluded is explicitly false')

// --- Error-path checks (corrupt-header / wrong-passphrase) -------------------
let threw

threw = false
try { await inspectEncryptedCompanyBackup(json, 'wrong-passphrase-is-obvious') } catch { threw = true }
check(threw, 'corrupt: wrong passphrase throws on inspect')

threw = false
try { await inspectEncryptedCompanyBackup('not valid json at all', 'guard-passphrase-0123456789') } catch { threw = true }
check(threw, 'corrupt: non-JSON input throws on inspect')

threw = false
try {
  const tampered = JSON.parse(json)
  tampered.contract = 'supermega.not-a-backup.v1'
  await inspectEncryptedCompanyBackup(JSON.stringify(tampered), 'guard-passphrase-0123456789')
} catch { threw = true }
check(threw, 'corrupt: wrong contract field throws on inspect')

threw = false
try {
  const tampered = JSON.parse(json)
  const digest = tampered.snapshotDigest
  tampered.snapshotDigest = digest.slice(0, -2) + (digest.endsWith('00') ? 'ff' : '00')
  await inspectEncryptedCompanyBackup(JSON.stringify(tampered), 'guard-passphrase-0123456789')
} catch { threw = true }
check(threw, 'corrupt: tampered snapshotDigest fails integrity check')

threw = false
try { await createEncryptedCompanyBackup(storage, 'short', new Date('2026-08-11T03:00:00.000Z')) } catch { threw = true }
check(threw, 'short passphrase: createEncryptedCompanyBackup throws')

threw = false
try { await createEncryptedCompanyBackup(makeStorage({}), 'guard-passphrase-0123456789', new Date('2026-08-11T03:00:00.000Z')) } catch { threw = true }
check(threw, 'empty storage: createEncryptedCompanyBackup throws')

// --- Restore-in-place checks --------------------------------------------------
// Back up a device with one record, add a second resettable record after the backup is taken,
// then restore the backup. The post-backup record must be removed; the backup record must survive.
const rip = makeStorage({ 'supermega.commerce.workspace.v2': JSON.stringify({ order: 'rip-test' }) })
const { json: ripJson } = await createEncryptedCompanyBackup(rip, 'guard-passphrase-0123456789', new Date('2026-08-11T03:00:00.000Z'))
rip.setItem('supermega.production.workspace.v2', JSON.stringify({ plant: 'added-after-backup' }))
check(rip.getItem('supermega.production.workspace.v2') !== null, 'restore-in-place setup: resettable key added after backup is present')
const ripInspection = await inspectEncryptedCompanyBackup(ripJson, 'guard-passphrase-0123456789')
const ripResult = await restoreCompanyBackup(rip, ripInspection)
check(rip.getItem('supermega.production.workspace.v2') === null, 'restore-in-place: key added after backup is removed by restore')
check(rip.getItem('supermega.commerce.workspace.v2') === JSON.stringify({ order: 'rip-test' }), 'restore-in-place: key present in backup is restored correctly')
check(ripResult.restoredCount === 1, 'restore-in-place result: restoredCount equals backup record count')
check(ripResult.removedCount === 1, 'restore-in-place result: removedCount equals keys removed by restore')

// --- the deletion preview, on INSTANCE keys the class invariant cannot see -------------
// Everything above proves a CLASS invariant: each registry key is portable, or deliberately not.
// That invariant is blind to the case that actually bites. The prefix families are portable as a
// class, so the guard is satisfied -- but a backup taken at 09:00 does not CONTAIN the order draft
// created at 14:00. On restore that key is in the union, resolves to undefined -> null, and is
// deleted. Nothing above fails, and the owner learns the count afterwards.
//
// planCompanyRestore has to name each of those keys BEFORE the write, because that is the only
// moment the owner can still do something about it.
function keysOf(storage) {
  return Array.from({ length: storage.length }, (_, index) => storage.key(index))
}

const portableFamilies = localWorkspaceKeyPrefixes.filter((prefix) => isPortableCompanyStorageKey(`${prefix}probe`))
check(portableFamilies.length >= 4, 'plan: the portable-by-prefix families must exist to be probed')
const instanceKeys = portableFamilies.flatMap((prefix) => [`${prefix}morning`, `${prefix}afternoon`])

const later = makeStorage({
  'supermega.commerce.workspace.v2': JSON.stringify({ taken: '09:00' }),
  'supermega.shop.service-schedule.v1': JSON.stringify({ appointments: 3 }),
})
const laterPassphrase = 'guard-passphrase-0123456789'
const { json: laterJson } = await createEncryptedCompanyBackup(later, laterPassphrase, new Date('2026-08-11T03:00:00.000Z'))
const laterInspection = await inspectEncryptedCompanyBackup(laterJson, laterPassphrase)

// The working day that happened after the backup was taken.
for (const key of instanceKeys) later.setItem(key, JSON.stringify({ createdAfterBackup: key }))
later.setItem('supermega.website.leads.v1', JSON.stringify({ waitingForContact: 2 }))
const savedAfterBackup = [...instanceKeys, 'supermega.website.leads.v1'].sort()

const laterPlan = planCompanyRestore(later, laterInspection)
check(
  JSON.stringify([...laterPlan.deleting].sort()) === JSON.stringify(savedAfterBackup),
  `plan.deleting must name EXACTLY the records saved after this backup -- expected [${savedAfterBackup.join(', ')}], got [${[...laterPlan.deleting].sort().join(', ')}]`,
)
check(
  !laterPlan.deleting.includes('supermega.shop.service-schedule.v1'),
  'plan: the appointment book is inside this backup, so it must never be listed for deletion',
)
check(
  laterPlan.unchanged.includes('supermega.commerce.workspace.v2') && laterPlan.unchanged.includes('supermega.shop.service-schedule.v1'),
  'plan: records the backup carries unchanged are reported as unchanged, not as a rewrite',
)

// --- the plan and the write are one set, not two that happen to agree -------------------
// A preview that can disagree with the write is worse than none: it is a promise the write breaks.
// Compare what the write actually destroyed against what the plan showed, in both directions.
const presentBeforeRestore = keysOf(later)
const laterResult = await restoreCompanyBackup(later, laterInspection)
const destroyedByWrite = presentBeforeRestore.filter((key) => later.getItem(key) === null).sort()
check(
  JSON.stringify(destroyedByWrite) === JSON.stringify([...laterPlan.deleting].sort()),
  `THE WRITE DESTROYED A DIFFERENT SET THAN THE PREVIEW SHOWED -- preview: [${[...laterPlan.deleting].sort().join(', ')}], write: [${destroyedByWrite.join(', ')}]`,
)
check(laterResult.removedCount === laterPlan.deleting.length, 'write: removedCount equals the previewed deletion count')
check(
  laterResult.restoredCount === laterPlan.replacing.length + laterPlan.adding.length + laterPlan.unchanged.length,
  'write: restoredCount equals the previewed write set',
)
check(
  laterPlan.deleting.every((key) => later.getItem(key) === null),
  'write: every key the preview listed for deletion is actually gone',
)
check(
  later.getItem('supermega.shop.service-schedule.v1') === JSON.stringify({ appointments: 3 }),
  'write: the appointment book carried by the backup survived the restore intact',
)

// ---- the deletion warning must not cry wolf ---------------------------------------------
//
// A restore always clears the deliberately-not-portable keys, because a backup can never carry
// them. Counting those as "records you saved after this backup" makes the acknowledgement fire on
// EVERY restore -- including one taken seconds earlier -- and an alarm that always sounds is one
// the owner learns to click past. That would defeat the guard on the one restore that really does
// cost them a day of appointments.
//
// This became live rather than theoretical when local metrics began persisting: the metrics key is
// non-portable, so after any use of the app it is always present and always removed.
{
  const device = makeStorage({})
  device.setItem('supermega.commerce.workspace.v2', JSON.stringify({ catalog: 'real' }))
  const made = await createEncryptedCompanyBackup(device, 'a-good-passphrase-1')

  // Nothing of the owner's changes. Only device-local scaffolding appears, exactly as normal use
  // of the app produces it.
  device.setItem('supermega.hq.local-metrics.v1', JSON.stringify({ schema: 'supermega.local_metrics.v1', version: 1, events: [] }))
  const quiet = planCompanyRestore(device, await inspectEncryptedCompanyBackup(made.json, 'a-good-passphrase-1'))

  check(quiet.deleting.includes('supermega.hq.local-metrics.v1'), 'the write still clears the non-portable key')
  check(quiet.clearedByDesign.includes('supermega.hq.local-metrics.v1'), 'and names it as cleared by design')
  check(quiet.losingOwnerWork.length === 0, 'a restore that costs the owner NOTHING raises no warning')

  // Now something the owner really would lose: work saved after the backup was taken.
  device.setItem('supermega.shop.service-schedule.v1', JSON.stringify({ appointments: 'booked after the backup' }))
  const loud = planCompanyRestore(device, await inspectEncryptedCompanyBackup(made.json, 'a-good-passphrase-1'))

  check(loud.losingOwnerWork.includes('supermega.shop.service-schedule.v1'), 'real newer work IS named as a loss')
  check(!loud.losingOwnerWork.includes('supermega.hq.local-metrics.v1'), 'and the scaffolding is not padded into that count')
  check(
    loud.deleting.length === loud.clearedByDesign.length + loud.losingOwnerWork.length,
    'every deleted key is accounted for in exactly one of the two buckets -- the write set is never narrowed',
  )
  check(
    loud.clearedByDesign.every((key) => deliberatelyNotPortableKeys.includes(key) || key.includes('.v1.')),
    'nothing lands in cleared-by-design unless it is genuinely non-portable',
  )
}

console.log(`backup covers business data contract: ${checks} checks passed`)
