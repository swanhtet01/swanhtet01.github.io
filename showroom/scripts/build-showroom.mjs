import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const showroomRoot = path.resolve(scriptDir, '..')
const platformRoot = path.resolve(showroomRoot, '..')
const lockDir = path.join(showroomRoot, '.tmp', 'build-showroom.lock')
const lockTimeoutMs = 8 * 60 * 1000
const staleLockMs = 20 * 60 * 1000

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function acquireBuildLock() {
  const startedAt = Date.now()
  mkdirSync(path.dirname(lockDir), { recursive: true })

  while (true) {
    try {
      mkdirSync(lockDir)
      writeFileSync(
        path.join(lockDir, 'owner.json'),
        JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }, null, 2),
      )
      return
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error
      }

      try {
        const ageMs = Date.now() - statSync(lockDir).mtimeMs
        if (ageMs > staleLockMs) {
          rmSync(lockDir, { recursive: true, force: true })
          continue
        }
      } catch {
        rmSync(lockDir, { recursive: true, force: true })
        continue
      }

      if (Date.now() - startedAt > lockTimeoutMs) {
        throw new Error(`Timed out waiting for showroom build lock: ${lockDir}`)
      }
      sleep(500)
    }
  }
}

function releaseBuildLock() {
  rmSync(lockDir, { recursive: true, force: true })
}

function runNodeScript(label, scriptPath, args = [], cwd = showroomRoot) {
  if (!existsSync(scriptPath)) {
    console.warn(`${label} script not found — skipping: ${scriptPath}`)
    return
  }

  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

acquireBuildLock()
try {
  runNodeScript('Product activation kits', path.join(platformRoot, 'tools', 'generate_product_activation_kits.mjs'), [], platformRoot)
  runNodeScript('Product activation kit verification', path.join(platformRoot, 'tools', 'verify_product_activation_kits.mjs'), [], platformRoot)
  runNodeScript('Agency Client Operator install pack', path.join(platformRoot, 'tools', 'generate_agency_client_operator_install_pack.mjs'), [], platformRoot)
  runNodeScript('Agency Client Operator install pack verification', path.join(platformRoot, 'tools', 'verify_agency_client_operator_install_pack.mjs'), [], platformRoot)
  runNodeScript('Agency Client Operator sample intake', path.join(platformRoot, 'tools', 'run_agency_client_operator_sample_intake.mjs'), [], platformRoot)
  runNodeScript('Agency Client Operator sample intake verification', path.join(platformRoot, 'tools', 'verify_agency_client_operator_sample_intake.mjs'), [], platformRoot)
  runNodeScript('Agency Client Operator buyer intake room', path.join(platformRoot, 'tools', 'generate_agency_client_operator_buyer_intake_room.mjs'), [], platformRoot)
  runNodeScript('Agency Client Operator buyer intake room verification', path.join(platformRoot, 'tools', 'verify_agency_client_operator_buyer_intake_room.mjs'), [], platformRoot)
  runNodeScript('Agency Client Operator proof-to-sales handoff', path.join(platformRoot, 'tools', 'generate_agency_client_operator_sales_handoff.mjs'), [], platformRoot)
  runNodeScript('Agency Client Operator proof-to-sales handoff verification', path.join(platformRoot, 'tools', 'verify_agency_client_operator_sales_handoff.mjs'), [], platformRoot)
  runNodeScript('Agency Client Operator revenue activation console', path.join(platformRoot, 'tools', 'generate_agency_client_operator_revenue_activation.mjs'), [], platformRoot)
  runNodeScript('Agency Client Operator revenue activation console verification', path.join(platformRoot, 'tools', 'verify_agency_client_operator_revenue_activation.mjs'), [], platformRoot)
  runNodeScript('Owner-approved sales sprints', path.join(platformRoot, 'tools', 'generate_owner_approved_sales_sprints.mjs'), [], platformRoot)
  runNodeScript('Owner-approved sales sprint verification', path.join(platformRoot, 'tools', 'verify_owner_approved_sales_sprints.mjs'), [], platformRoot)
  runNodeScript('First-wave execution packet', path.join(platformRoot, 'tools', 'generate_first_wave_execution_packet.mjs'), [], platformRoot)
  runNodeScript('First-wave execution packet verification', path.join(platformRoot, 'tools', 'verify_first_wave_execution_packet.mjs'), [], platformRoot)
  runNodeScript('First-wave operator runtime', path.join(platformRoot, 'tools', 'generate_first_wave_operator_runtime.mjs'), [], platformRoot)
  runNodeScript('First-wave operator runtime verification', path.join(platformRoot, 'tools', 'verify_first_wave_operator_runtime.mjs'), [], platformRoot)
  runNodeScript('First-wave prospect seeds', path.join(platformRoot, 'tools', 'generate_first_wave_prospect_seed_pack.mjs'), [], platformRoot)
  runNodeScript('First-wave prospect seed verification', path.join(platformRoot, 'tools', 'verify_first_wave_prospect_seed_pack.mjs'), [], platformRoot)
  runNodeScript('First-wave account briefs', path.join(platformRoot, 'tools', 'generate_first_wave_account_briefs.mjs'), [], platformRoot)
  runNodeScript('First-wave account brief verification', path.join(platformRoot, 'tools', 'verify_first_wave_account_briefs.mjs'), [], platformRoot)
  runNodeScript('First-wave pilot close packet', path.join(platformRoot, 'tools', 'generate_first_wave_pilot_close_packet.mjs'), [], platformRoot)
  runNodeScript('First-wave pilot close packet verification', path.join(platformRoot, 'tools', 'verify_first_wave_pilot_close_packet.mjs'), [], platformRoot)
  runNodeScript('TypeScript build', path.join(showroomRoot, 'node_modules', 'typescript', 'bin', 'tsc'), ['-b', '--force'])
  runNodeScript('Social assets', path.join(showroomRoot, 'scripts', 'generate-social-campaign-assets.mjs'))
  runNodeScript('Contact QR', path.join(showroomRoot, 'scripts', 'generate-contact-qr.mjs'))
  runNodeScript('Vite build', path.join(showroomRoot, 'node_modules', 'vite', 'bin', 'vite.js'), ['build', '--configLoader', 'runner'])
  runNodeScript('Static route export', path.join(showroomRoot, 'scripts', 'prepare-static-routes.mjs'))
} finally {
  releaseBuildLock()
}
