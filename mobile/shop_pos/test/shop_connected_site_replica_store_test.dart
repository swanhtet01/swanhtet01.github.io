import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart' as sqlite;
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_connected_site_replica_store.dart';
import 'package:supermega_shop/shop_database.dart';

void main() {
  late ShopDatabase database;
  const client =
      'a6f50a0df1317f12b89d4e1282347b7e2280b75a70e91f5453693d11f3065777';
  const certificate =
      'bb91aec1fe8ac06cf6724b612195d2272eef5ca5d0aa3dabaa4cd290c7e48a8b';

  setUp(() => database = ShopDatabase(NativeDatabase.memory()));
  tearDown(() => database.close());

  test(
    'replica remains default-off and rejects substituted bindings',
    () async {
      await expectLater(
        ShopConnectedSiteReplicaStore(
          database: database,
          localWorkspaceId: 'workspace_1',
          localSiteId: 'site_1',
          localClientFingerprint: client,
        ).applySnapshot(
          snapshot: _snapshot(),
          clientFingerprint: client,
          certificateSha256: certificate,
          observedAtMillis: 1,
        ),
        throwsStateError,
      );
      final store = ShopConnectedSiteReplicaStore(
        database: database,
        localWorkspaceId: 'workspace_1',
        localSiteId: 'site_1',
        localClientFingerprint: client,
        runtimeEnabled: true,
      );
      await store.applySnapshot(
        snapshot: _snapshot(),
        clientFingerprint: client,
        certificateSha256: certificate,
        observedAtMillis: 1,
      );
      await expectLater(
        store.markCoordinatorUnavailable(
          workspaceId: 'workspace_1',
          siteId: 'site_1',
          clientFingerprint: client,
          certificateSha256: 'c' * 64,
          observedAtMillis: 2,
        ),
        throwsStateError,
      );
      await expectLater(
        store.applySnapshot(
          snapshot: _snapshot(),
          clientFingerprint: 'f' * 64,
          certificateSha256: certificate,
          observedAtMillis: 2,
        ),
        throwsStateError,
      );
      await expectLater(
        store.applySnapshot(
          snapshot: _snapshot(workspaceId: 'workspace_other'),
          clientFingerprint: client,
          certificateSha256: certificate,
          observedAtMillis: 2,
        ),
        throwsStateError,
      );
    },
  );

  test(
    'snapshot and ordered delta persist atomically and replay exactly',
    () async {
      final store = ShopConnectedSiteReplicaStore(
        database: database,
        localWorkspaceId: 'workspace_1',
        localSiteId: 'site_1',
        localClientFingerprint: client,
        runtimeEnabled: true,
      );
      await store.applySnapshot(
        snapshot: _snapshot(),
        clientFingerprint: client,
        certificateSha256: certificate,
        observedAtMillis: 1,
      );
      final delta = _delta();
      await store.applyDelta(
        delta: delta,
        clientFingerprint: client,
        certificateSha256: certificate,
        observedAtMillis: 2,
      );
      await store.applyDelta(
        delta: delta,
        clientFingerprint: client,
        certificateSha256: certificate,
        observedAtMillis: 3,
      );
      final rows = await store.readProjections(
        workspaceId: 'workspace_1',
        siteId: 'site_1',
        clientFingerprint: client,
      );
      expect(rows, hasLength(3));
      await store.applySnapshot(
        snapshot: _snapshotAfterDelta(),
        clientFingerprint: client,
        certificateSha256: certificate,
        observedAtMillis: 4,
      );
      expect(
        await store.readProjections(
          workspaceId: 'workspace_1',
          siteId: 'site_1',
          clientFingerprint: client,
        ),
        hasLength(rows.length),
      );
      final refreshed = await store.readProjections(
        workspaceId: 'workspace_1',
        siteId: 'site_1',
        clientFingerprint: client,
      );
      Map<String, Object?> content(Map<String, Object?> row) =>
          Map<String, Object?>.from(row)..remove('last_cursor');
      expect(refreshed.map(content), rows.map(content));
      expect(
        await database
            .customSelect('SELECT COUNT(*) AS n FROM shop_sales')
            .getSingle()
            .then((row) => row.read<int>('n')),
        0,
      );
      expect(
        await database
            .customSelect('SELECT COUNT(*) AS n FROM shop_stock_movements')
            .getSingle()
            .then((row) => row.read<int>('n')),
        0,
      );
    },
  );

  test('missing delta and tampered immutable evidence fail closed', () async {
    final store = ShopConnectedSiteReplicaStore(
      database: database,
      localWorkspaceId: 'workspace_1',
      localSiteId: 'site_1',
      localClientFingerprint: client,
      runtimeEnabled: true,
    );
    await store.applySnapshot(
      snapshot: _snapshot(),
      clientFingerprint: client,
      certificateSha256: certificate,
      observedAtMillis: 1,
    );
    final missing = SiteDeltaV1(
      workspaceId: 'workspace_1',
      siteId: 'site_1',
      afterCursor: 1,
      nextCursor: 2,
      events: [_entry(2)],
    );
    await expectLater(
      store.applyDelta(
        delta: missing,
        clientFingerprint: client,
        certificateSha256: certificate,
        observedAtMillis: 2,
      ),
      throwsStateError,
    );
    await store.applyDelta(
      delta: _delta(),
      clientFingerprint: client,
      certificateSha256: certificate,
      observedAtMillis: 2,
    );
    await database.customStatement(
      'DROP TRIGGER shop_connected_replica_events_no_update',
    );
    await database.customStatement(
      "UPDATE shop_connected_replica_events SET event_digest = ? WHERE cursor = 1",
      ['d' * 64],
    );
    await expectLater(
      database.verifyConnectedReplicaEvidence(),
      throwsStateError,
    );
  });

  test(
    'crash between event work and cursor commit leaves no partial evidence',
    () async {
      final store = ShopConnectedSiteReplicaStore(
        database: database,
        localWorkspaceId: 'workspace_1',
        localSiteId: 'site_1',
        localClientFingerprint: client,
        runtimeEnabled: true,
      );
      await store.applySnapshot(
        snapshot: _snapshot(),
        clientFingerprint: client,
        certificateSha256: certificate,
        observedAtMillis: 1,
      );
      await database.customStatement('''
      CREATE TRIGGER replica_test_abort_head BEFORE UPDATE ON shop_connected_replica_heads
      BEGIN SELECT RAISE(ABORT, 'simulated_cursor_crash'); END
    ''');
      await expectLater(
        store.applyDelta(
          delta: _delta(),
          clientFingerprint: client,
          certificateSha256: certificate,
          observedAtMillis: 2,
        ),
        throwsA(anything),
      );
      await database.customStatement('DROP TRIGGER replica_test_abort_head');
      expect(
        await database
            .customSelect(
              'SELECT COUNT(*) AS n FROM shop_connected_replica_events',
            )
            .getSingle()
            .then((row) => row.read<int>('n')),
        0,
      );
      await database.verifyConnectedReplicaEvidence();
    },
  );

  test('restart snapshot survives verified SQLite backup and coordinator loss is read-only', () async {
    final store = ShopConnectedSiteReplicaStore(
      database: database,
      localWorkspaceId: 'workspace_1',
      localSiteId: 'site_1',
      localClientFingerprint: client,
      runtimeEnabled: true,
    );
    await store.applySnapshot(
      snapshot: _snapshot(),
      clientFingerprint: client,
      certificateSha256: certificate,
      observedAtMillis: 1,
    );
    await store.markCoordinatorUnavailable(
      workspaceId: 'workspace_1',
      siteId: 'site_1',
      clientFingerprint: client,
      certificateSha256: certificate,
      observedAtMillis: 2,
    );
    expect(
      await store.readProjections(
        workspaceId: 'workspace_1',
        siteId: 'site_1',
        clientFingerprint: client,
      ),
      hasLength(3),
    );
    expect(
      await database
          .customSelect(
            'SELECT writes_paused FROM shop_connected_replica_heads',
          )
          .getSingle()
          .then((row) => row.read<int>('writes_paused')),
      1,
    );
    expect(
      await store.sharedWritesPaused(
        workspaceId: 'workspace_1',
        siteId: 'site_1',
        clientFingerprint: client,
      ),
      isTrue,
    );
    final directory = await Directory.systemTemp.createTemp('replica-v32-');
    final file = File('${directory.path}/snapshot.sqlite');
    addTearDown(() => directory.delete(recursive: true));
    await database.exportVerifiedLocalSnapshot(file);
    final restored = ShopDatabase(NativeDatabase(file));
    addTearDown(restored.close);
    await restored.verifyConnectedReplicaEvidence();
  });

  test('v31 live database migrates to empty verified replica schema', () async {
    final directory = await Directory.systemTemp.createTemp('replica-v31-');
    addTearDown(() => directory.delete(recursive: true));
    final file = File('${directory.path}/shop.sqlite');
    final source = ShopDatabase(NativeDatabase(file));
    await source.verifyReadyForUse();
    await source.close();
    final raw = sqlite.sqlite3.open(file.path);
    try {
      for (final definition
          in shopConnectedReplicaSchemaDefinitionsV32().entries
              .toList()
              .reversed) {
        final type = shopSchemaObjectTypeForDefinition(definition.value);
        raw.execute(
          'DROP ${type == 'table'
              ? 'TABLE'
              : type == 'index'
              ? 'INDEX'
              : 'TRIGGER'} IF EXISTS ${definition.key}',
        );
      }
      raw.execute('PRAGMA user_version = 31');
    } finally {
      raw.close();
    }
    final migrated = ShopDatabase(NativeDatabase(file));
    addTearDown(migrated.close);
    await migrated.verifyReadyForUse();
    expect(migrated.schemaVersion, 32);
    await migrated.verifyConnectedReplicaEvidence();
  });
}

SiteSnapshotV1 _snapshot({String workspaceId = 'workspace_1'}) {
  final projections = <String, Object?>{
    'schema': 'supermega.shop.connected-site-projections.v2',
    'aggregates': [
      {
        'aggregateType': 'cafeOrder',
        'aggregateId': 'order_1',
        'version': 1,
        'lastSiteSequence': 0,
      },
    ],
    'cafeOrders': [
      {
        'orderId': 'order_1',
        'ticketVersion': 1,
        'state': 'open',
        'stateRevision': 0,
        'ticket': <String, Object?>{},
      },
    ],
    'stockReservations': [
      {'reservationId': 'reservation_1', 'stateVersion': 1, 'state': 'held'},
    ],
    'conflicts': <Object?>[],
  };
  final unsigned = <String, Object?>{
    'protocolVersion': connectedSiteProtocolVersion,
    'workspaceId': workspaceId,
    'siteId': 'site_1',
    'version': 2,
    'continuationCursor': 0,
    'projections': projections,
  };
  return SiteSnapshotV1(
    workspaceId: workspaceId,
    siteId: 'site_1',
    version: 2,
    continuationCursor: 0,
    projections: projections,
    checkpointDigest: connectedSiteSha256(unsigned),
  );
}

Map<String, Object?> _entry(int cursor) {
  final event = <String, Object?>{
    'eventId': 'event_$cursor',
    'workspaceId': 'workspace_1',
    'siteId': 'site_1',
    'aggregateType': 'cafeOrder',
    'aggregateId': 'order_1',
    'aggregateVersion': 2,
    'eventType': 'shop.cafe_order.updated',
    'occurredAt': '2026-11-01T00:00:00.000Z',
    'payload': {'state': 'held'},
  };
  return {
    'cursor': cursor,
    'event': event,
    'eventDigest': connectedSiteSha256(event),
  };
}

SiteDeltaV1 _delta() => SiteDeltaV1(
  workspaceId: 'workspace_1',
  siteId: 'site_1',
  afterCursor: 0,
  nextCursor: 1,
  events: [_entry(1)],
);

SiteSnapshotV1 _snapshotAfterDelta() {
  final projections = <String, Object?>{
    'schema': 'supermega.shop.connected-site-projections.v2',
    'aggregates': [
      {
        'aggregateType': 'cafeOrder',
        'aggregateId': 'order_1',
        'version': 1,
        'lastSiteSequence': 0,
      },
    ],
    'cafeOrders': [
      {
        'orderId': 'order_1',
        'ticketVersion': 2,
        'eventType': 'shop.cafe_order.updated',
        'payload': {'state': 'held'},
      },
    ],
    'stockReservations': [
      {'reservationId': 'reservation_1', 'stateVersion': 1, 'state': 'held'},
    ],
    'conflicts': <Object?>[],
  };
  final unsigned = <String, Object?>{
    'protocolVersion': connectedSiteProtocolVersion,
    'workspaceId': 'workspace_1',
    'siteId': 'site_1',
    'version': 2,
    'continuationCursor': 1,
    'projections': projections,
  };
  return SiteSnapshotV1(
    workspaceId: 'workspace_1',
    siteId: 'site_1',
    version: 2,
    continuationCursor: 1,
    projections: projections,
    checkpointDigest: connectedSiteSha256(unsigned),
  );
}
