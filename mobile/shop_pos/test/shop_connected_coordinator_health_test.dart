import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_coordinator_health.dart';
import 'package:supermega_shop/shop_connected_runtime.dart';
import 'package:supermega_shop/shop_database.dart';

void main() {
  late ShopDatabase database;
  late ShopConnectedSharedWriteGate writes;

  setUp(() async {
    database = ShopDatabase(NativeDatabase.memory());
    writes = ShopConnectedSharedWriteGate();
    await database.verifyReadyForUse();
  });

  tearDown(() => database.close());

  test(
    'fresh health is paused and external observations fail closed',
    () async {
      final result = await _provider(
        database,
        writes,
        const ShopConnectedCoordinatorHealthSignalsUnavailable(),
      ).readHealth();

      expect(result.sharedWritesAvailable, isFalse);
      expect(result.internetAvailable, isFalse);
      expect(result.cloudSyncHealthy, isFalse);
      expect(result.backupCurrent, isFalse);
      expect(result.pendingConflictCount, 0);
      expect(result.leaseExpiresAt, isNull);
    },
  );

  test(
    'tracks the exact shared-write gate and scoped pending conflicts',
    () async {
      await _insertConflict(
        database,
        commandId: 'command-local',
        conflictId: 'conflict-local',
        tenantId: 'workspace-1',
        siteId: 'site-1',
        state: 'pending',
      );
      await _insertConflict(
        database,
        commandId: 'command-foreign',
        conflictId: 'conflict-foreign',
        tenantId: 'workspace-2',
        siteId: 'site-2',
        state: 'pending',
      );
      await _insertConflict(
        database,
        commandId: 'command-resolved',
        conflictId: 'conflict-resolved',
        tenantId: 'workspace-1',
        siteId: 'site-1',
        state: 'resolved',
      );
      final health = _provider(
        database,
        writes,
        const ShopConnectedCoordinatorHealthSignalsUnavailable(),
      );

      expect((await health.readHealth()).pendingConflictCount, 1);
      expect((await health.readHealth()).sharedWritesAvailable, isFalse);
      await writes.resume();
      expect((await health.readHealth()).sharedWritesAvailable, isTrue);
      await writes.pause('test_pause');
      expect((await health.readHealth()).sharedWritesAvailable, isFalse);
    },
  );

  test('accepts only exact-scope explicit observations', () async {
    final result = await _provider(
      database,
      writes,
      const _Signals(
        ShopConnectedCoordinatorHealthSignals(
          workspaceId: 'workspace-1',
          siteId: 'site-1',
          coordinatorDeviceId: 'coordinator-1',
          internetAvailable: true,
          cloudSyncHealthy: true,
          backupCurrent: true,
        ),
      ),
    ).readHealth();

    expect(result.internetAvailable, isTrue);
    expect(result.cloudSyncHealthy, isTrue);
    expect(result.backupCurrent, isTrue);
  });

  test('unreadable observations fail closed', () async {
    final result = await _provider(
      database,
      writes,
      const _ThrowingSignals(),
    ).readHealth();

    expect(result.internetAvailable, isFalse);
    expect(result.cloudSyncHealthy, isFalse);
    expect(result.backupCurrent, isFalse);
  });

  test('cloud sync cannot report healthy without observed internet', () async {
    final result = await _provider(
      database,
      writes,
      const _Signals(
        ShopConnectedCoordinatorHealthSignals(
          workspaceId: 'workspace-1',
          siteId: 'site-1',
          coordinatorDeviceId: 'coordinator-1',
          internetAvailable: false,
          cloudSyncHealthy: true,
          backupCurrent: false,
        ),
      ),
    ).readHealth();

    expect(result.internetAvailable, isFalse);
    expect(result.cloudSyncHealthy, isFalse);
  });

  test('rejects substituted observation scope', () async {
    final health = _provider(
      database,
      writes,
      const _Signals(
        ShopConnectedCoordinatorHealthSignals(
          workspaceId: 'workspace-2',
          siteId: 'site-1',
          coordinatorDeviceId: 'coordinator-1',
          internetAvailable: true,
          cloudSyncHealthy: true,
          backupCurrent: true,
        ),
      ),
    );

    await expectLater(
      health.readHealth(),
      throwsA(
        isA<StateError>().having(
          (error) => error.message,
          'message',
          'connected_coordinator_health_scope_mismatch',
        ),
      ),
    );
  });
}

ShopConnectedCoordinatorHealthProvider _provider(
  ShopDatabase database,
  ShopConnectedSharedWriteGate writes,
  ShopConnectedCoordinatorHealthSignalSource signals,
) => ShopConnectedCoordinatorHealthProvider(
  database: database,
  sharedWrites: writes,
  workspaceId: 'workspace-1',
  siteId: 'site-1',
  coordinatorDeviceId: 'coordinator-1',
  signals: signals,
);

Future<void> _insertConflict(
  ShopDatabase database, {
  required String commandId,
  required String conflictId,
  required String tenantId,
  required String siteId,
  required String state,
}) async {
  final suffix = commandId.replaceAll('command-', '');
  final deviceId = 'device-$suffix';
  final leaseDigest = suffix.padRight(64, 'a').substring(0, 64);
  final deviceFingerprint = suffix.padRight(64, 'b').substring(0, 64);
  await database.customStatement(
    'INSERT INTO shop_site_devices '
    '(device_id, tenant_id, site_id, public_key_fingerprint, session_generation, state, enrolled_at_millis) '
    "VALUES (?, ?, ?, ?, 1, 'active', 1)",
    [deviceId, tenantId, siteId, deviceFingerprint],
  );
  await database.customStatement(
    'INSERT OR IGNORE INTO shop_site_revocation_observations '
    '(tenant_id, site_id, generation, observed_at_millis, source_digest) '
    'VALUES (?, ?, 1, 1, ?)',
    [tenantId, siteId, 'c' * 64],
  );
  await database.customStatement(
    'INSERT INTO shop_site_offline_leases '
    '(lease_id, tenant_id, site_id, actor_id, actor_role, capabilities_json, device_id, '
    'session_generation, revocation_generation, issued_at_millis, expires_at_millis, key_id, payload_digest, signature) '
    "VALUES (?, ?, ?, ?, 'cashierCounter', '[\"sale.create\"]', ?, 1, 1, 1, 1000, ?, ?, ?)",
    [
      'lease-$suffix',
      tenantId,
      siteId,
      'actor-$suffix',
      deviceId,
      'key-$suffix',
      leaseDigest,
      's' * 32,
    ],
  );
  await database.customStatement(
    'INSERT INTO shop_site_commands '
    '(command_id, tenant_id, site_id, actor_id, device_id, aggregate_type, aggregate_id, capability, '
    'expected_version, payload_digest, lease_digest, command_digest, state, received_at_millis) '
    "VALUES (?, ?, ?, ?, ?, 'sale', ?, 'sale.create', 0, ?, ?, ?, 'conflict', 2)",
    [
      commandId,
      tenantId,
      siteId,
      'actor-$suffix',
      deviceId,
      'sale-$suffix',
      'd' * 64,
      leaseDigest,
      'e' * 64,
    ],
  );
  await database.customStatement(
    'INSERT INTO shop_site_conflicts '
    '(conflict_id, command_id, reason_code, detail_digest, state, created_at_millis, resolved_at_millis) '
    'VALUES (?, ?, ?, ?, ?, 2, ?)',
    [
      conflictId,
      commandId,
      'version_conflict',
      'f' * 64,
      state,
      state == 'pending' ? null : 3,
    ],
  );
}

class _Signals implements ShopConnectedCoordinatorHealthSignalSource {
  const _Signals(this.value);

  final ShopConnectedCoordinatorHealthSignals value;

  @override
  Future<ShopConnectedCoordinatorHealthSignals?> read({
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
  }) async => value;
}

class _ThrowingSignals implements ShopConnectedCoordinatorHealthSignalSource {
  const _ThrowingSignals();

  @override
  Future<ShopConnectedCoordinatorHealthSignals?> read({
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
  }) => throw StateError('observer_unreadable');
}
