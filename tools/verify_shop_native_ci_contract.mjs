import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const WORKFLOW_PATH = '.github/workflows/shop-native-ci.yml'
const GRADLE_WRAPPER_PATH = 'mobile/shop_pos/android/gradle/wrapper/gradle-wrapper.properties'
const FLUTTER_VERSION = '3.47.8'
const GRADLE_DISTRIBUTION = 'gradle-9.3.1-bin.zip'
const GRADLE_DISTRIBUTION_SHA256 = 'b266d5ff6b90eada6dc3b20cb090e3731302e553a27c5d3e4df1f0d76beaff06'
const PUBLIC_GALLERY_CAPTURE_PATHS = Object.freeze([
  'mobile/shop_pos/test/goldens/shop_checkout_1200_en.png',
  'mobile/shop_pos/test/goldens/shop_checkout_1200_my.png',
  'mobile/shop_pos/test/goldens/shop_checkout_390_en.png',
  'mobile/shop_pos/test/goldens/shop_checkout_390_my.png',
  'mobile/shop_pos/test/goldens/shop_checkout_820_en.png',
  'mobile/shop_pos/test/goldens/shop_checkout_820_my.png',
  'mobile/shop_pos/test/goldens/shop_sell_390_en.png',
  'mobile/shop_pos/test/goldens/shop_sell_390_my.png',
  'mobile/shop_pos/test/goldens/shop_stock_1200_en.png',
  'mobile/shop_pos/test/goldens/shop_stock_390_en.png',
  'mobile/shop_pos/test/goldens/shop_stock_390_my.png',
  'mobile/shop_pos/test/goldens/shop_stock_820_en.png',
  'mobile/shop_pos/test/goldens/shop_stock_820_my.png',
  'mobile/shop_pos/test/goldens/shop_today_1200_en.png',
  'mobile/shop_pos/test/goldens/shop_today_390_en.png',
  'mobile/shop_pos/test/goldens/shop_today_390_my.png',
  'mobile/shop_pos/test/goldens/shop_today_820_en.png',
  'mobile/shop_pos/test/goldens/shop_today_820_my.png',
])
const QA_DART_FORMAT_PATHS = Object.freeze([
  'lib/camera_barcode_scanner.dart',
  'lib/connected_orders_screen.dart',
  'lib/connected_orders_service.dart',
  'lib/main.dart',
  'lib/menu_import_screen.dart',
  'lib/menu_import_service.dart',
  'lib/printer_services.dart',
  'lib/printer_setup_screen.dart',
  'lib/recent_sales_screen.dart',
  'lib/shop_backup.dart',
  'lib/shop_backup_export_screen.dart',
  'lib/shop_build_identity.g.dart',
  'lib/shop_cafe_kitchen_entitlement.dart',
  'lib/shop_cafe_order_contract.dart',
  'lib/shop_cafe_order_screen.dart',
  'lib/shop_cafe_order_store.dart',
  'lib/shop_cash_movement_dialog.dart',
  'lib/shop_cash_shift_screen.dart',
  'lib/shop_catalog_search.dart',
  'lib/shop_connected_onboarding.dart',
  'lib/shop_connected_platform_security.dart',
  'lib/shop_connected_runtime.dart',
  'lib/shop_connected_site_contracts.dart',
  'lib/shop_connected_site_reconciliation.dart',
  'lib/shop_connected_site_replica_store.dart',
  'lib/shop_copy.dart',
  'lib/shop_correction_authorization_service.dart',
  'lib/shop_correction_consumption.dart',
  'lib/shop_correction_receipt.dart',
  'lib/shop_database.dart',
  'lib/shop_offline_staff_lease.dart',
  'lib/shop_qa_evidence_store.dart',
  'lib/shop_runtime_profile.dart',
  'lib/shop_runtime_scope.dart',
  'lib/shop_sale_correction_dialog.dart',
  'lib/shop_site_coordinator.dart',
  'lib/shop_staff_authorization.dart',
  'lib/shop_startup.dart',
  'lib/shop_today_screen.dart',
  'lib/stock_screen.dart',
  'test/shop_add_product_test.dart',
  'test/shop_backup_test.dart',
  'test/shop_cafe_kitchen_entitlement_test.dart',
  'test/shop_cafe_order_contract_test.dart',
  'test/shop_cafe_order_screen_test.dart',
  'test/shop_cafe_order_store_test.dart',
  'test/shop_cafe_table_kitchen_test.dart',
  'test/shop_cash_movement_authorized_flow_test.dart',
  'test/shop_cash_movement_test.dart',
  'test/shop_catalog_search_test.dart',
  'test/shop_connected_application_boundary_test.dart',
  'test/shop_connected_coordinator_host_test.dart',
  'test/shop_connected_onboarding_test.dart',
  'test/shop_connected_platform_security_test.dart',
  'test/shop_connected_runtime_test.dart',
  'test/shop_connected_site_contracts_test.dart',
  'test/shop_connected_site_persistence_test.dart',
  'test/shop_connected_site_reconciliation_test.dart',
  'test/shop_connected_site_replica_store_test.dart',
  'test/shop_core_internal_acceptance_test.dart',
  'test/shop_correction_authorization_service_test.dart',
  'test/shop_foundation_test.dart',
  'test/shop_mmk_input_test.dart',
  'test/shop_offline_staff_lease_test.dart',
  'test/shop_pending_cash_checkout_test.dart',
  'test/shop_process_interrupt_worker_test.dart',
  'test/shop_qa_evidence_store_test.dart',
  'test/shop_responsiveness_test.dart',
  'test/shop_runtime_profile_test.dart',
  'test/shop_runtime_scope_test.dart',
  'test/shop_startup_cleanup_test.dart',
  'test/shop_site_coordinator_test.dart',
  'test/shop_sqlite_full_recovery_test.dart',
  'test/shop_staff_authorization_test.dart',
  'test/visual_capture_test.dart',
  'test/widget_checkout_test.dart',
  'test/widget_shell_test.dart',
  'test/widget_test_support.dart',
])
const CONNECTED_SUCCESSOR_DART_FORMAT_PATHS = Object.freeze([
  'lib/shop_connected_composition.dart',
  'lib/shop_connected_coordinator_health.dart',
  'lib/shop_connected_site_client_composition.dart',
  'lib/shop_connected_site_device_signer.dart',
  'lib/shop_connected_trusted_time_authority.dart',
  'lib/shop_connected_trusted_time_client_schema.dart',
  'lib/shop_connected_trusted_time_client_store.dart',
  'lib/shop_connected_trusted_time_composition.dart',
  'lib/shop_connected_trusted_time_contract.dart',
  'lib/shop_connected_trusted_time_exchange.dart',
  'lib/shop_connected_trusted_time_head.dart',
  'lib/shop_connected_trusted_time_issuer_store.dart',
  'lib/shop_connected_trusted_time_platform_clock.dart',
  'lib/shop_connected_trusted_time_store.dart',
  'lib/shop_connected_trusted_time_stream.dart',
  'lib/shop_connected_trusted_time_stream_acceptance.dart',
  'lib/shop_connected_trusted_time_verifier.dart',
  'test/historical_shop_fixture_support.dart',
  'test/shop_connected_composition_test.dart',
  'test/shop_connected_coordinator_health_test.dart',
  'test/shop_connected_site_client_composition_test.dart',
  'test/shop_connected_site_device_signer_test.dart',
  'test/shop_connected_trusted_time_authority_test.dart',
  'test/shop_connected_trusted_time_client_store_test.dart',
  'test/shop_connected_trusted_time_composition_test.dart',
  'test/shop_connected_trusted_time_contract_test.dart',
  'test/shop_connected_trusted_time_head_test.dart',
  'test/shop_connected_trusted_time_issuer_store_test.dart',
  'test/shop_connected_trusted_time_platform_clock_test.dart',
  'test/shop_connected_trusted_time_store_test.dart',
  'test/shop_connected_trusted_time_stream_acceptance_test.dart',
  'test/shop_connected_trusted_time_stream_test.dart',
  'test/shop_connected_trusted_time_verifier_test.dart',
])

function requireToken(source, token, failure, failures) {
  if (!source.includes(token)) failures.push(failure)
}

function requireOrder(source, before, after, failure, failures) {
  const beforeIndex = source.indexOf(before)
  const afterIndex = source.indexOf(after)
  if (beforeIndex < 0 || afterIndex < 0 || beforeIndex >= afterIndex) failures.push(failure)
}

function requirePattern(source, pattern, failure, failures) {
  if (!pattern.test(source)) failures.push(failure)
}

function literalBlockValues(source, key) {
  const lines = source.split(/\r?\n/)
  const matches = []
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(new RegExp(`^(\\s*)${key}:\\s*\\|\\s*$`))
    if (!match) continue
    const indent = match[1].length
    const values = []
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor]
      if (!line.trim()) continue
      const valueIndent = line.match(/^\s*/)[0].length
      if (valueIndent <= indent) break
      values.push(line.trim())
    }
    matches.push(values)
  }
  return matches
}

function declaredTestInventory(source) {
  const match = source.match(
    /cat > \/tmp\/shop-test-files\.expected <<'EOF'\n([\s\S]*?)\n\s+EOF/,
  )
  if (!match) return []
  return match[1]
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^test\/.+_test\.dart$/.test(line))
    .sort()
}

function isolatedShardTestCounts(source) {
  const match = source.match(
    /- name: Run isolated Flutter test shards[\s\S]*?(?=\n      - name:)/,
  )
  if (!match) return new Map()
  const counts = new Map()
  for (const testPath of match[0].match(/test\/[A-Za-z0-9_]+_test\.dart/g) ?? []) {
    counts.set(testPath, (counts.get(testPath) ?? 0) + 1)
  }
  return counts
}

function checkoutSteps(source) {
  const lines = source.split(/\r?\n/)
  const steps = []
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].includes('uses: actions/checkout@')) continue
    const block = [lines[index]]
    for (let next = index + 1; next < lines.length; next += 1) {
      if (/^\s*-\s+name:/.test(lines[next])) break
      block.push(lines[next])
    }
    steps.push(block.join('\n'))
  }
  return steps
}

function checkoutDisablesCredentialPersistence(step) {
  const lines = step.split(/\r?\n/)
  const useIndent = lines[0].match(/^\s*/)?.[0].length ?? -1
  const withLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.trim() === 'with:' && (line.match(/^\s*/)?.[0].length ?? -1) === useIndent)
  const persistenceLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^\s*persist-credentials\s*:/.test(line))
  if (withLines.length !== 1 || persistenceLines.length !== 1) return false

  const withIndex = withLines[0].index
  const nextSiblingIndex = lines.findIndex((line, index) => (
    index > withIndex
      && line.trim() !== ''
      && (line.match(/^\s*/)?.[0].length ?? -1) <= useIndent
  ))
  const withEnd = nextSiblingIndex < 0 ? lines.length : nextSiblingIndex
  const persistence = persistenceLines[0]
  return persistence.index > withIndex
    && persistence.index < withEnd
    && (persistence.line.match(/^\s*/)?.[0].length ?? -1) === useIndent + 2
    && persistence.line.trim() === 'persist-credentials: false'
}

export function verifyShopNativeCiContract(source, gradleWrapperSource = '', actualTestPaths = null) {
  const failures = []

  const flutterVersionPins = source.match(new RegExp(`flutter-version: '${FLUTTER_VERSION.replaceAll('.', '\\.')}'`, 'g')) ?? []
  if (flutterVersionPins.length !== 6) failures.push('flutter_sdk_not_exactly_pinned_for_all_native_jobs')
  if (/^\s*channel:\s*stable\s*$/m.test(source)) failures.push('flutter_sdk_uses_mutable_stable_channel')
  const checkoutBlocks = checkoutSteps(source)
  if (checkoutBlocks.length !== 6) failures.push('native_checkout_step_count_not_exactly_six')
  if (checkoutBlocks.some(block => !checkoutDisablesCredentialPersistence(block))) {
    failures.push('native_checkout_credentials_persisted_or_unspecified')
  }
  const formatLine = source.split(/\r?\n/).filter(line => line.trim().startsWith('dart format ')).join(' ')
  const diffLine = source.split(/\r?\n/).filter(line => line.trim().startsWith('git diff --exit-code -- ')).join(' ')
  for (const path of QA_DART_FORMAT_PATHS) {
    const formatCount = formatLine.split(/\s+/).filter(token => token === path).length
    const diffCount = diffLine.split(/\s+/).filter(token => token === path).length
    if (formatCount === 0 || diffCount === 0) {
      failures.push(`qa_dart_format_gate_missing:${path}`)
    } else if (formatCount !== 1 || diffCount !== 1) {
      failures.push(`qa_dart_format_gate_duplicate:${path}`)
    }
  }
  const successorFormatMatch = source.match(
    /- name: Check connected successor formatting[\s\S]*?(?=\n      - name:)/,
  )
  const successorFormatBlock = successorFormatMatch?.[0] ?? ''
  requireToken(
    successorFormatBlock,
    'dart format --output=none --set-exit-if-changed',
    'connected_successor_format_gate_not_fail_closed',
    failures,
  )
  for (const path of CONNECTED_SUCCESSOR_DART_FORMAT_PATHS) {
    const count = successorFormatBlock.split(/\s+/).filter(token => token.replace(/\\$/, '') === path).length
    if (count === 0) {
      failures.push(`connected_successor_format_gate_missing:${path}`)
    } else if (count !== 1) {
      failures.push(`connected_successor_format_gate_duplicate:${path}`)
    }
  }
  requireToken(
    source,
    'name: Verify pinned native toolchain contract',
    'native_toolchain_contract_not_run_in_ci',
    failures,
  )
  requireToken(
    source,
    'npm run shop:native:ci-contract:verify',
    'native_toolchain_contract_command_missing',
    failures,
  )
  requireOrder(
    source,
    'name: Verify Flutter test shard inventory',
    'name: Run isolated Flutter test shards',
    'native_test_inventory_not_verified_before_shards',
    failures,
  )
  requireToken(
    source,
    "find test -maxdepth 1 -type f -name '*_test.dart'",
    'native_test_inventory_discovery_missing',
    failures,
  )
  requireToken(
    source,
    'diff -u /tmp/shop-test-files.expected /tmp/shop-test-files.actual',
    'native_test_inventory_equality_gate_missing',
    failures,
  )
  if (actualTestPaths !== null) {
    const declared = declaredTestInventory(source)
    const actual = [...actualTestPaths].sort()
    if (JSON.stringify(declared) !== JSON.stringify(actual)) {
      failures.push('native_test_inventory_does_not_match_filesystem')
    }
    const shardCounts = isolatedShardTestCounts(source)
    const externallyExercised = new Set(['test/shop_process_interrupt_worker_test.dart'])
    for (const testPath of actual) {
      const count = shardCounts.get(testPath) ?? 0
      if (externallyExercised.has(testPath)) {
        if (count !== 0) failures.push(`native_test_shard_assignment_duplicate:${testPath}`)
      } else if (count === 0) {
        failures.push(`native_test_shard_assignment_missing:${testPath}`)
      } else if (count !== 1) {
        failures.push(`native_test_shard_assignment_duplicate:${testPath}`)
      }
    }
  }
  requireToken(
    source,
    'timeout-minutes: 120',
    'native_android_job_timeout_not_120_minutes',
    failures,
  )
  requireToken(
    source,
    'SHOP_FLUTTER_TEST_SHARD_BUDGET_SECONDS: "600"',
    'native_test_shard_budget_not_bounded_to_600_seconds',
    failures,
  )
  requireToken(
    source,
    'SHOP_FLUTTER_TEST_TOTAL_BUDGET_SECONDS: "5400"',
    'native_test_total_budget_not_bounded_to_5400_seconds',
    failures,
  )
  requireToken(
    source,
    'overall_started_at="$(date +%s)"',
    'native_test_total_budget_start_missing',
    failures,
  )
  for (const token of [
    'remaining="$(( SHOP_FLUTTER_TEST_TOTAL_BUDGET_SECONDS - elapsed ))"',
    'if [ "$remaining" -le 0 ]; then',
    'if [ "$remaining" -lt "$SHOP_FLUTTER_TEST_SHARD_BUDGET_SECONDS" ]; then',
    'printf \'%s\\n\' "$remaining"',
    'printf \'%s\\n\' "$SHOP_FLUTTER_TEST_SHARD_BUDGET_SECONDS"',
  ]) {
    requireToken(source, token, 'native_test_remaining_total_budget_guard_missing', failures)
  }
  requireToken(
    source,
    'behavior_core_tmp="$(mktemp -d "${RUNNER_TEMP}/shop-behavior-core.XXXXXX")"',
    'native_behavior_core_shard_temp_isolation_missing',
    failures,
  )
  requireToken(
    source,
    'behavior_shell_tmp="$(mktemp -d "${RUNNER_TEMP}/shop-behavior-shell.XXXXXX")"',
    'native_behavior_shell_shard_temp_isolation_missing',
    failures,
  )
  requireToken(
    source,
    'behavior_checkout_tmp="$(mktemp -d "${RUNNER_TEMP}/shop-behavior-checkout.XXXXXX")"',
    'native_behavior_checkout_shard_temp_isolation_missing',
    failures,
  )
  requireToken(
    source,
    'persistence_backup_tmp="$(mktemp -d "${RUNNER_TEMP}/shop-persistence-backup.XXXXXX")"',
    'native_persistence_backup_shard_temp_isolation_missing',
    failures,
  )
  requireToken(
    source,
    'persistence_a_tmp="$(mktemp -d "${RUNNER_TEMP}/shop-persistence-a.XXXXXX")"',
    'native_persistence_a_shard_temp_isolation_missing',
    failures,
  )
  requireToken(
    source,
    'TMPDIR="$persistence_backup_tmp" timeout --signal=TERM --kill-after=10s "${persistence_backup_budget}s" flutter test --no-pub --concurrency=1 --reporter expanded --timeout 2m',
    'native_persistence_backup_shard_not_bounded_or_sequential',
    failures,
  )
  requireToken(
    source,
    'persistence_b_tmp="$(mktemp -d "${RUNNER_TEMP}/shop-persistence-b.XXXXXX")"',
    'native_persistence_b_shard_temp_isolation_missing',
    failures,
  )
  requireToken(
    source,
    'connected_tmp="$(mktemp -d "${RUNNER_TEMP}/shop-connected.XXXXXX")"',
    'native_connected_shard_temp_isolation_missing',
    failures,
  )
  requireToken(
    source,
    'connected_successor_tmp="$(mktemp -d "${RUNNER_TEMP}/shop-connected-successor.XXXXXX")"',
    'native_connected_successor_shard_temp_isolation_missing',
    failures,
  )
  requireToken(
    source,
    'trusted_time_tmp="$(mktemp -d "${RUNNER_TEMP}/shop-trusted-time.XXXXXX")"',
    'native_trusted_time_shard_temp_isolation_missing',
    failures,
  )
  requireToken(
    source,
    'TMPDIR="$behavior_core_tmp" timeout --signal=TERM --kill-after=10s "${behavior_core_budget}s" flutter test --no-pub --concurrency=1 --reporter expanded --timeout 2m',
    'native_behavior_core_shard_not_bounded_or_sequential',
    failures,
  )
  requireToken(
    source,
    'TMPDIR="$behavior_shell_tmp" timeout --signal=TERM --kill-after=10s "${behavior_shell_budget}s" flutter test --no-pub --concurrency=1 --reporter expanded --timeout 2m',
    'native_behavior_shell_shard_not_bounded_or_sequential',
    failures,
  )
  requireToken(
    source,
    'TMPDIR="$behavior_checkout_tmp" timeout --signal=TERM --kill-after=10s "${behavior_checkout_budget}s" flutter test --no-pub --concurrency=1 --reporter expanded --timeout 2m',
    'native_behavior_checkout_shard_not_bounded_or_sequential',
    failures,
  )
  requireToken(
    source,
    'TMPDIR="$persistence_a_tmp" timeout --signal=TERM --kill-after=10s "${persistence_a_budget}s" flutter test --no-pub --concurrency=1 --reporter expanded --timeout 2m',
    'native_persistence_a_shard_not_bounded_or_sequential',
    failures,
  )
  requireToken(
    source,
    'TMPDIR="$persistence_b_tmp" timeout --signal=TERM --kill-after=10s "${persistence_b_budget}s" flutter test --no-pub --concurrency=1 --reporter expanded --timeout 2m',
    'native_persistence_b_shard_not_bounded_or_sequential',
    failures,
  )
  requireToken(
    source,
    'TMPDIR="$connected_tmp" timeout --signal=TERM --kill-after=10s "${connected_budget}s" flutter test --no-pub --concurrency=1 --reporter expanded --timeout 2m',
    'native_connected_shard_not_bounded_or_sequential',
    failures,
  )
  requireToken(
    source,
    'rm -rf -- "$behavior_core_tmp" "$behavior_shell_tmp" "$behavior_checkout_tmp" "$persistence_backup_tmp" "$persistence_a_tmp" "$persistence_b_tmp" "$connected_tmp" "$connected_successor_tmp" "$trusted_time_tmp"',
    'native_test_shard_cleanup_incomplete',
    failures,
  )
  const isolatedShardStart = source.indexOf('name: Run isolated Flutter test shards')
  const isolatedShardEnd = source.indexOf('name: Run real Flutter process-interruption scenarios')
  const isolatedShardBlock = isolatedShardStart >= 0 && isolatedShardEnd > isolatedShardStart
    ? source.slice(isolatedShardStart, isolatedShardEnd)
    : ''
  if (/[ \t]&[ \t]*$/m.test(isolatedShardBlock) || /_pid="\$!"/.test(isolatedShardBlock)) {
    failures.push('native_test_shards_not_strictly_serial')
  }
  const shards = ['behavior_core', 'behavior_shell', 'behavior_checkout', 'persistence_backup', 'persistence_a', 'persistence_b', 'connected', 'connected_successor', 'trusted_time']
  const shardPaths = (start, end) => {
    const startIndex = isolatedShardBlock.indexOf(start)
    const endIndex = isolatedShardBlock.indexOf(end)
    if (startIndex < 0 || endIndex <= startIndex) return []
    return isolatedShardBlock
      .slice(startIndex, endIndex)
      .split(/\r?\n/)
      .map(line => line.trim().replace(/ \\$/, ''))
      .filter(line => /^test\/.+_test\.dart$/.test(line))
  }
  const expectedBehaviorCorePaths = [
    'test/connected_orders_test.dart',
    'test/shop_add_product_test.dart',
    'test/shop_cafe_order_screen_test.dart',
    'test/shop_catalog_search_test.dart',
    'test/shop_correction_authorization_service_test.dart',
    'test/shop_foundation_test.dart',
    'test/shop_operational_export_saver_test.dart',
    'test/shop_operational_export_test.dart',
    'test/shop_operational_export_widget_test.dart',
    'test/shop_responsiveness_test.dart',
    'test/shop_runtime_profile_test.dart',
    'test/shop_runtime_scope_test.dart',
    'test/shop_startup_cleanup_test.dart',
    'test/shop_stock_activity_test.dart',
  ]
  const expectedBehaviorShellPaths = ['test/widget_shell_test.dart']
  const expectedBehaviorCheckoutPaths = ['test/widget_checkout_test.dart']
  const expectedPersistenceBackupPaths = ['test/shop_backup_test.dart']
  const expectedConnectedSuccessorPaths = [
    'test/shop_connected_composition_test.dart',
    'test/shop_connected_coordinator_health_test.dart',
    'test/shop_connected_site_client_composition_test.dart',
    'test/shop_connected_site_device_signer_test.dart',
  ]
  const expectedTrustedTimePaths = [
    'test/shop_connected_trusted_time_authority_test.dart',
    'test/shop_connected_trusted_time_client_store_test.dart',
    'test/shop_connected_trusted_time_composition_test.dart',
    'test/shop_connected_trusted_time_contract_test.dart',
    'test/shop_connected_trusted_time_head_test.dart',
    'test/shop_connected_trusted_time_issuer_store_test.dart',
    'test/shop_connected_trusted_time_platform_clock_test.dart',
    'test/shop_connected_trusted_time_store_test.dart',
    'test/shop_connected_trusted_time_stream_acceptance_test.dart',
    'test/shop_connected_trusted_time_stream_test.dart',
    'test/shop_connected_trusted_time_verifier_test.dart',
  ]
  if (JSON.stringify(shardPaths(
    'behavior_core_started_at="$(date +%s)"',
    'behavior_shell_started_at="$(date +%s)"',
  )) !== JSON.stringify(expectedBehaviorCorePaths)) {
    failures.push('native_behavior_core_shard_inventory_or_order_wrong')
  }
  if (JSON.stringify(shardPaths(
    'behavior_shell_started_at="$(date +%s)"',
    'behavior_checkout_started_at="$(date +%s)"',
  )) !== JSON.stringify(expectedBehaviorShellPaths)) {
    failures.push('native_behavior_shell_shard_inventory_or_order_wrong')
  }
  if (JSON.stringify(shardPaths(
    'behavior_checkout_started_at="$(date +%s)"',
    'persistence_backup_started_at="$(date +%s)"',
  )) !== JSON.stringify(expectedBehaviorCheckoutPaths)) {
    failures.push('native_behavior_checkout_shard_inventory_or_order_wrong')
  }
  if (JSON.stringify(shardPaths(
    'persistence_backup_started_at="$(date +%s)"',
    'persistence_a_started_at="$(date +%s)"',
  )) !== JSON.stringify(expectedPersistenceBackupPaths)) {
    failures.push('native_persistence_backup_shard_inventory_or_order_wrong')
  }
  if (JSON.stringify(shardPaths(
    'connected_successor_started_at="$(date +%s)"',
    'trusted_time_started_at="$(date +%s)"',
  )) !== JSON.stringify(expectedConnectedSuccessorPaths)) {
    failures.push('native_connected_successor_shard_inventory_or_order_wrong')
  }
  if (JSON.stringify(shardPaths(
    'trusted_time_started_at="$(date +%s)"',
    'overall_elapsed="$(( $(date +%s) - overall_started_at ))"',
  )) !== JSON.stringify(expectedTrustedTimePaths)) {
    failures.push('native_trusted_time_shard_inventory_or_order_wrong')
  }
  for (const shard of shards) {
    const command = `TMPDIR="$${shard}_tmp" timeout --signal=TERM --kill-after=10s "\${${shard}_budget}s" flutter test --no-pub --concurrency=1 --reporter expanded --timeout 2m`
    requireToken(
      source,
      `${shard}_budget="$(calculate_shard_budget)" || exit "$?"`,
      `native_${shard}_remaining_total_budget_not_applied`,
      failures,
    )
    requireToken(
      source,
      `${shard}_started_at="$(date +%s)"`,
      `native_${shard}_shard_start_missing`,
      failures,
    )
    requireToken(
      source,
      `${shard}_status="$?"`,
      `native_${shard}_shard_status_capture_missing`,
      failures,
    )
    requireToken(
      source,
      `if [ "$${shard}_status" -eq 124 ]; then`,
      `native_${shard}_timeout_status_not_classified`,
      failures,
    )
    requireToken(
      source,
      `if [ "$${shard}_status" -ne 0 ]; then`,
      `native_${shard}_nonzero_status_not_classified`,
      failures,
    )
    requireToken(
      source,
      `shop_flutter_test_${shard}_failed_status:$${shard}_status`,
      `native_${shard}_nonzero_status_diagnostic_missing`,
      failures,
    )
    requireToken(
      source,
      `test "$${shard}_status" -eq 0`,
      `native_${shard}_shard_status_not_fail_closed`,
      failures,
    )
    requireToken(
      source,
      `${shard}_elapsed="$(( $(date +%s) - ${shard}_started_at ))"`,
      `native_${shard}_shard_elapsed_capture_missing`,
      failures,
    )
    requireToken(
      source,
      `if [ "$${shard}_elapsed" -ge "$${shard}_budget" ]; then`,
      `native_${shard}_shard_elapsed_guard_missing`,
      failures,
    )
    requireToken(
      source,
      `shop_flutter_test_${shard}_budget_exhausted`,
      `native_${shard}_shard_budget_exhaustion_not_fail_closed`,
      failures,
    )
    requireOrder(
      source,
      `${shard}_started_at="$(date +%s)"`,
      command,
      `native_${shard}_shard_command_not_after_start`,
      failures,
    )
    requireOrder(
      source,
      command,
      `${shard}_status="$?"`,
      `native_${shard}_shard_status_captured_before_execution`,
      failures,
    )
    requireOrder(
      source,
      `${shard}_status="$?"`,
      `if [ "$${shard}_status" -eq 124 ]; then`,
      `native_${shard}_timeout_status_checked_before_capture`,
      failures,
    )
    requireOrder(
      source,
      `if [ "$${shard}_status" -eq 124 ]; then`,
      `if [ "$${shard}_status" -ne 0 ]; then`,
      `native_${shard}_nonzero_status_checked_before_timeout_status`,
      failures,
    )
    requireOrder(
      source,
      `if [ "$${shard}_status" -ne 0 ]; then`,
      `${shard}_elapsed="$(( $(date +%s) - ${shard}_started_at ))"`,
      `native_${shard}_elapsed_checked_before_nonzero_status`,
      failures,
    )
    requireOrder(
      source,
      `${shard}_status="$?"`,
      `test "$${shard}_status" -eq 0`,
      `native_${shard}_shard_status_checked_before_capture`,
      failures,
    )
  }
  requireToken(
    source,
    'overall_elapsed="$(( $(date +%s) - overall_started_at ))"',
    'native_test_total_budget_elapsed_capture_missing',
    failures,
  )
  requireToken(
    source,
    'if [ "$overall_elapsed" -ge "$SHOP_FLUTTER_TEST_TOTAL_BUDGET_SECONDS" ]; then',
    'native_test_total_budget_elapsed_guard_missing',
    failures,
  )
  requireToken(
    source,
    'shop_flutter_test_total_budget_exhausted',
    'native_test_total_budget_exhaustion_not_fail_closed',
    failures,
  )
  for (let index = 0; index < shards.length - 1; index += 1) {
    requireOrder(
      source,
      `test "$${shards[index]}_status" -eq 0`,
      `${shards[index + 1]}_started_at="$(date +%s)"`,
      `native_${shards[index + 1]}_shard_started_before_${shards[index]}_passed`,
      failures,
    )
  }
  requireOrder(
    source,
    'test "$trusted_time_status" -eq 0',
    'overall_elapsed="$(( $(date +%s) - overall_started_at ))"',
    'native_test_total_budget_checked_before_all_shards_verified',
    failures,
  )
  requireOrder(
    source,
    'name: Run isolated Flutter test shards',
    'name: Run real Flutter process-interruption scenarios',
    'native_process_interruption_harness_not_run_after_persistence_tests',
    failures,
  )
  requireOrder(
    source,
    'name: Run real Flutter process-interruption scenarios',
    'name: Generate Android production identity',
    'android_production_identity_generated_before_default_profile_tests',
    failures,
  )
  requireToken(
    source,
    'FLUTTER_BIN="$flutter_bin" timeout --signal=TERM --kill-after=10s 300s python3 scripts/test_shop_process_interruption.py',
    'native_process_interruption_harness_not_bounded_or_missing',
    failures,
  )
  requireToken(
    source,
    'flutter_bin="$(readlink -f "$(command -v flutter)")"',
    'native_process_interruption_flutter_not_pinned_to_ci_toolchain',
    failures,
  )
  requireOrder(
    source,
    'name: Generate Android production identity',
    'name: Reject unsigned Android release packaging',
    'android_production_identity_not_generated_before_packaging',
    failures,
  )
  const shardStart = source.indexOf('name: Run isolated Flutter test shards')
  const shardEnd = source.indexOf('name: Generate Android production identity')
  const testShardLines = shardStart >= 0 && shardEnd > shardStart
    ? source.slice(shardStart, shardEnd).split(/\r?\n/).map(line => line.trim())
    : []
  for (const testPath of declaredTestInventory(source).filter(
    path => path !== 'test/shop_process_interrupt_worker_test.dart',
  )) {
    const count = testShardLines.filter(
      line => line === testPath || line === `${testPath} \\`,
    ).length
    if (count === 0) {
      failures.push(`native_test_shard_missing:${testPath}`)
    } else if (count !== 1) {
      failures.push(`native_test_shard_duplicate:${testPath}`)
    }
  }

  requireToken(
    source,
    'SHOP_VISUAL_CAPTURE: "1"',
    'native_visual_capture_opt_in_missing',
    failures,
  )
  requireToken(
    source,
    '180s flutter test test/visual_capture_test.dart --update-goldens',
    'native_visual_capture_test_not_separately_bounded',
    failures,
  )
  const galleryUploadBlock = source.match(
    /- name: Retain Flutter-rendered screens for design review[\s\S]*?retention-days: 14/,
  )?.[0] || ''
  const galleryPathBlocks = literalBlockValues(galleryUploadBlock, 'path')
  const galleryPathKeys = galleryUploadBlock.match(/^\s*path\s*:/gm) || []
  const missingBehaviorKeys = galleryUploadBlock.match(/^\s*if-no-files-found\s*:[^\r\n]*$/gm) || []
  const missingBehaviorValue = missingBehaviorKeys[0]
    ?.replace(/^\s*if-no-files-found\s*:\s*/, '')
    .replace(/\s+#.*$/, '')
    .trim()
  const galleryUploadPaths = galleryPathBlocks[0] || []
  if (galleryPathKeys.length !== 1
    || galleryPathBlocks.length !== 1
    || missingBehaviorKeys.length !== 1
    || missingBehaviorValue !== 'error'
    || galleryUploadPaths.length !== PUBLIC_GALLERY_CAPTURE_PATHS.length
    || galleryUploadPaths.some((path, index) => path !== PUBLIC_GALLERY_CAPTURE_PATHS[index])) {
    failures.push('native_public_gallery_artifact_contract_drift')
  }

  requireToken(
    gradleWrapperSource,
    `distributionUrl=https\\://services.gradle.org/distributions/${GRADLE_DISTRIBUTION}`,
    'gradle_distribution_not_pinned_to_expected_bin_archive',
    failures,
  )
  requireToken(
    gradleWrapperSource,
    `distributionSha256Sum=${GRADLE_DISTRIBUTION_SHA256}`,
    'gradle_distribution_sha256_missing_or_wrong',
    failures,
  )

  for (const [token, failure] of [
    ['name: supermega-shop-android-production-debug-${{ github.sha }}', 'android_artifact_not_explicitly_debug'],
    ['sha256sum app-production-debug.apk > app-production-debug.apk.sha256', 'android_inner_checksum_not_recorded'],
    ['sha256sum --check app-production-debug.apk.sha256', 'android_inner_checksum_not_verified'],
    ['mobile/shop_pos/build/app/outputs/flutter-apk/app-production-debug.apk.sha256', 'android_checksum_not_retained'],
    ['name: Reject unsigned Android release packaging', 'android_release_negative_gate_missing'],
    ["grep -F 'shop_android_release_signing_unavailable'", 'android_release_failure_marker_not_verified'],
    ["./gradlew assembleProductionRelease --console=plain", 'android_aggregate_release_gate_not_tested'],
    ["find build/app/outputs/flutter-apk -maxdepth 1 -name 'app-production-release*.apk'", 'android_release_artifact_absence_not_verified'],
    ["trap 'result=$?; cleanup_release_outputs || result=1; trap - EXIT; exit \"$result\"' EXIT", 'android_release_artifact_cleanup_not_always_run'],
    ['name: supermega-shop-windows-unsigned-${{ github.sha }}', 'windows_artifact_not_explicitly_unsigned'],
    ["Get-FileHash -Algorithm SHA256 -LiteralPath $packagePath", 'windows_inner_checksum_not_recorded'],
    ["if ($recordedChecksum -cne $expectedChecksum)", 'windows_inner_checksum_not_verified'],
    ['supermega-shop-windows-unsigned.zip.sha256', 'windows_checksum_not_retained'],
    ['& .\\windows_overlay\\apply.ps1', 'windows_connected_security_overlay_missing'],
    ['Build iOS app without signing', 'ios_no_codesign_boundary_missing'],
    ['flutter build ios --debug --no-codesign --no-pub', 'ios_no_codesign_command_missing'],
    ['name: synthetic-qa-promotion-ineligible-${{ github.sha }}-sha-256-android', 'android_qa_artifact_not_bound_to_source_or_promotion_state'],
    ['name: synthetic-qa-promotion-ineligible-${{ github.sha }}-sha-256-ios', 'ios_qa_artifact_not_bound_to_source_or_promotion_state'],
    ['name: synthetic-qa-promotion-ineligible-${{ github.sha }}-sha-256-windows', 'windows_qa_artifact_not_bound_to_source_or_promotion_state'],
    ['android_sdk_root="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"', 'android_qa_postbuild_analyzer_not_pinned_to_sdk'],
    ['test "$(readlink -f "$ANDROID_SDK_ROOT")" = "$(readlink -f "$ANDROID_HOME")"', 'android_qa_postbuild_analyzer_not_pinned_to_sdk'],
    ['android_sdk_root="$(readlink -f "$android_sdk_root")"', 'android_qa_postbuild_analyzer_not_pinned_to_sdk'],
    ['analyzer="$android_sdk_root/cmdline-tools/latest/bin/apkanalyzer"', 'android_qa_postbuild_analyzer_not_pinned_to_sdk'],
    ['test -x "$analyzer"', 'android_qa_postbuild_analyzer_not_pinned_to_sdk'],
    ["manifest application-id app-qa-debug.apk)\" = 'dev.supermega.supermega_shop.qa'", 'android_qa_postbuild_identity_not_inspected'],
    ['xml.etree.ElementTree', 'android_qa_postbuild_label_not_structurally_inspected'],
    ['findall("application")', 'android_qa_postbuild_label_not_structurally_inspected'],
    ['apps[0].get(android + "label")', 'android_qa_postbuild_label_not_structurally_inspected'],
    ['raise SystemExit("shop_android_qa_identity_or_capability_mismatch")', 'android_qa_postbuild_label_not_structurally_inspected'],
    ['dev.supermega.shop.qa.capabilityContract', 'android_qa_postbuild_capability_not_structurally_inspected'],
    ['supermega.shop.android-qa-capabilities.v1', 'android_qa_postbuild_capability_not_structurally_inspected'],
    ['dev.supermega.shop.qa.evidenceContract', 'android_qa_postbuild_capability_not_structurally_inspected'],
    ['supermega.shop.synthetic-qa-evidence.v1', 'android_qa_postbuild_capability_not_structurally_inspected'],
    ['dev.supermega.shop.qa.scopedEncryptedRestore', 'android_qa_postbuild_capability_not_structurally_inspected'],
    ['dev.supermega.shop.qa.scopedSyntheticExport', 'android_qa_postbuild_capability_not_structurally_inspected'],
    ['dev.supermega.shop.qa.generalExternalFileAccess', 'android_qa_postbuild_capability_not_structurally_inspected'],
    ['app-qa-debug.apk.identity.json', 'android_qa_canonical_identity_receipt_missing'],
    ['app-qa-debug.apk.signing.json', 'android_qa_canonical_signing_receipt_missing'],
    ['flutter --version --machine > app-qa-debug.apk.toolchain.json', 'android_qa_observed_toolchain_missing'],
    ['apksigner" verify --verbose --print-certs app-qa-debug.apk', 'android_qa_signature_not_verified'],
    ['node tools/write_shop_qa_artifact_manifest.mjs --platform android --artifact app-qa-debug.apk --checksum app-qa-debug.apk.sha256 --toolchain app-qa-debug.apk.toolchain.json --signing app-qa-debug.apk.signing.json --identity app-qa-debug.apk.identity.json --output app-qa-debug.apk.manifest', 'android_qa_canonical_manifest_missing'],
    ['git diff --exit-code', 'android_qa_clean_source_precheck_missing'],
    ['test "$(git rev-parse HEAD)" = "${{ github.sha }}"', 'android_qa_source_head_recheck_missing'],
    ['sha256sum --check "${RUNNER_TEMP}/shop-build-identity.sha256"', 'android_qa_generated_identity_recheck_missing'],
    ['"buildIdentitySha256": os.environ["BUILD_IDENTITY_SHA256"]', 'android_qa_generated_identity_not_bound'],
    ["test -z \"$changed_paths\" || test \"$changed_paths\" = 'mobile/shop_pos/lib/shop_build_identity.g.dart'", 'android_qa_source_drift_recheck_missing'],
    ['test "$untracked_before_manifest" = "$expected_before_manifest"', 'android_qa_untracked_source_drift_recheck_missing'],
    ['test "$untracked_after_manifest" = "$expected_after_manifest"', 'android_qa_untracked_source_drift_recheck_missing'],
    ['re.fullmatch(r"lib/([^/]+)/[^/]+\\.so", line)', 'android_qa_abi_inventory_not_root_anchored'],
    ['apksigner_jar="$android_sdk_root/build-tools/$build_tools_version/lib/apksigner.jar"', 'android_qa_apksigner_jar_not_bound'],
    ['"apksignerJarSha256": os.environ["APKSIGNER_JAR_SHA256"]', 'android_qa_apksigner_jar_not_bound'],
    ["Print :CFBundleIdentifier' \"$info\")\" = 'dev.supermega.supermegaShop.qa'", 'ios_qa_postbuild_identity_not_inspected'],
    ['build/ios/iphoneos/Runner.app "${{ github.workspace }}/Runner.app.zip"', 'ios_qa_runner_bundle_not_staged'],
    ["info='build/ios/iphoneos/Runner.app/Info.plist'", 'ios_qa_runner_bundle_not_inspected'],
    ['codesign -dv --verbose=4', 'ios_qa_signature_not_inspected'],
    ['code object is not signed at all', 'ios_qa_unsigned_result_not_verified'],
    ['flutter --version --machine > Runner.app.zip.toolchain.json', 'ios_qa_observed_toolchain_missing'],
    ['node tools/write_shop_qa_artifact_manifest.mjs --platform ios --artifact Runner.app.zip --checksum Runner.app.zip.sha256 --toolchain Runner.app.zip.toolchain.json --signing Runner.app.zip.signing.json --output Runner.app.zip.manifest', 'ios_qa_canonical_manifest_missing'],
    ["$identity.ProductName -cne 'Shop QA'", 'windows_qa_postbuild_identity_not_inspected'],
    ["Compress-Archive -Path $releaseDirectory -DestinationPath $packagePath", 'windows_qa_full_runtime_not_packaged'],
    ['"$digest  $artifact" | Set-Content -LiteralPath $checksumPath -Encoding ascii -NoNewline', 'windows_qa_canonical_checksum_not_recorded'],
    ["if ($recorded -cne $expected)", 'windows_qa_canonical_checksum_not_verified'],
    ['Get-AuthenticodeSignature -LiteralPath $executable', 'windows_qa_signature_not_inspected'],
    ["$signature.Status -cne 'NotSigned'", 'windows_qa_unsigned_result_not_verified'],
    ['flutter --version --machine | Set-Content -LiteralPath \'supermega-shop-windows-qa.zip.toolchain.json\' -Encoding utf8NoBOM', 'windows_qa_observed_toolchain_missing'],
    ['node tools/write_shop_qa_artifact_manifest.mjs --platform windows --artifact supermega-shop-windows-qa.zip --checksum supermega-shop-windows-qa.zip.sha256 --toolchain supermega-shop-windows-qa.zip.toolchain.json --signing supermega-shop-windows-qa.zip.signing.json --output supermega-shop-windows-qa.zip.manifest', 'windows_qa_canonical_manifest_missing'],
  ]) requireToken(source, token, failure, failures)

  if (source.split('& .\\windows_overlay\\apply.ps1').length - 1 !== 2) {
    failures.push('windows_connected_security_overlay_missing')
  }

  if (source.includes('command -v apkanalyzer')) {
    failures.push('android_qa_analyzer_path_lookup_forbidden')
  }

  for (const property of [
    'SHOP_ANDROID_KEYSTORE_PATH',
    'SHOP_ANDROID_KEY_ALIAS',
    'SHOP_ANDROID_STORE_PASSWORD',
    'SHOP_ANDROID_KEY_PASSWORD',
  ]) {
    requireToken(
      source,
      `unset ORG_GRADLE_PROJECT_${property}`,
      `android_release_ci_may_inherit_signing_credentials:${property}`,
      failures,
    )
    requireToken(
      source,
      `ORG_GRADLE_PROJECT_${property}: ''`,
      `android_qa_ci_may_inherit_signing_credentials:${property}`,
      failures,
    )
  }

  requirePattern(
    source,
    /^\s+mobile\/shop_pos\/build\/app\/outputs\/flutter-apk\/app-production-debug\.apk\s*$/m,
    'android_binary_not_retained',
    failures,
  )
  requirePattern(
    source,
    /^\s+mobile\/shop_pos\/build\/supermega-shop-windows-unsigned\.zip\s*$/m,
    'windows_binary_not_retained',
    failures,
  )

  requireOrder(
    source,
    'sha256sum --check app-production-debug.apk.sha256',
    'name: Retain Android debug APK for device QA',
    'android_checksum_not_verified_before_retention',
    failures,
  )
  requireOrder(
    source,
    'Set-Content -LiteralPath $checksumPath',
    'name: Retain Windows QA package',
    'windows_checksum_not_recorded_before_retention',
    failures,
  )

  const iosStart = source.indexOf('\n  ios:')
  const windowsStart = source.indexOf('\n  windows:')
  if (iosStart < 0 || windowsStart <= iosStart) {
    failures.push('ios_job_boundary_missing')
  } else if (source.slice(iosStart, windowsStart).includes('actions/upload-artifact')) {
    failures.push('unsigned_ios_build_must_not_be_retained_as_installable')
  }
  if (
    /^\s+mobile\/shop_pos\/build\/app\/outputs\/flutter-apk\/app-release\.apk\s*$/m.test(source)
    || /name:\s*supermega-shop-android-release-/.test(source)
  ) {
    failures.push('unauthorized_android_release_artifact_retained')
  }

  const retainedArtifactCount = (source.match(/actions\/upload-artifact@/g) ?? []).length
  const launchWindowRetentionCount = (source.match(/retention-days:\s*14\b/g) ?? []).length
  const qaRetentionCount = (source.match(/retention-days:\s*7\b/g) ?? []).length
  if (
    retainedArtifactCount !== 6 ||
    launchWindowRetentionCount !== 3 ||
    qaRetentionCount !== 3
  ) {
    failures.push('native_artifact_retention_below_launch_window')
  }

  return {
    ok: failures.length === 0,
    contract: 'supermega.shop.native-ci-artifact-identity.v1',
    workflow: WORKFLOW_PATH,
    androidArtifactKind: 'debug',
    androidReleaseArtifactRetained: false,
    windowsArtifactKind: 'unsigned',
    iosArtifactRetained: false,
    innerChecksumsRequired: true,
    minimumRetentionDays: 14,
    flutterVersion: FLUTTER_VERSION,
    gradleDistribution: GRADLE_DISTRIBUTION,
    gradleDistributionSha256: GRADLE_DISTRIBUTION_SHA256,
    failures,
  }
}

async function main() {
  const [source, gradleWrapperSource, testEntries] = await Promise.all([
    readFile(WORKFLOW_PATH, 'utf8'),
    readFile(GRADLE_WRAPPER_PATH, 'utf8'),
    readdir('mobile/shop_pos/test', { withFileTypes: true }),
  ])
  const actualTestPaths = testEntries
    .filter(entry => entry.isFile() && entry.name.endsWith('_test.dart'))
    .map(entry => `test/${entry.name}`)
  const result = verifyShopNativeCiContract(source, gradleWrapperSource, actualTestPaths)
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  if (!result.ok) process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
