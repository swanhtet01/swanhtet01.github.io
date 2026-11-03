import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart' as crypto;
import 'package:cryptography/cryptography.dart';
import 'package:drift/drift.dart' show Variable;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart' as sqlite;
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_connected_site_attempt_store.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_connected_site_replica_store.dart';
import 'package:supermega_shop/shop_connected_stock_reservation.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_staff_authorization.dart';

import 'historical_shop_fixture_support.dart';

void main() {
  late ShopDatabase database;
  late String client;
  late String approvedBindingDigest;
  late ShopConnectedSiteAttemptStore bindingResolver;
  const certificate =
      '4444444444444444444444444444444444444444444444444444444444444444';
  final clock = DateTime.utc(2026, 11, 1, 12);
  late final observed = clock.millisecondsSinceEpoch;

  setUp(() async {
    database = ShopDatabase(NativeDatabase.memory());
    final approval = await _seedApprovedBinding(database, clock);
    client = approval.$1;
    approvedBindingDigest = approval.$2;
    bindingResolver = approval.$3;
  });
  tearDown(() => database.close());

  test(
    'replica remains default-off and rejects substituted bindings',
    () async {
      await expectLater(
        ShopConnectedSiteReplicaStore(
          database: database,
          localWorkspaceId: 'workspace_1',
          localSiteId: 'site_1',
          localClientDeviceId: 'device_1',
          localClientFingerprint: client,
          localClientSigningKeyId: 'key_1',
          approvedBindingDigest: approvedBindingDigest,
          bindingResolver: bindingResolver,
        ).applySnapshot(
          snapshot: _snapshot(),
          clientFingerprint: client,
          certificateSha256: certificate,
          observedAtMillis: observed,
        ),
        throwsStateError,
      );
      final store = ShopConnectedSiteReplicaStore(
        database: database,
        localWorkspaceId: 'workspace_1',
        localSiteId: 'site_1',
        localClientDeviceId: 'device_1',
        localClientFingerprint: client,
        localClientSigningKeyId: 'key_1',
        approvedBindingDigest: approvedBindingDigest,
        bindingResolver: bindingResolver,
        runtimeEnabled: true,
      );
      await expectLater(
        store.applySnapshot(
          snapshot: _snapshot(),
          clientFingerprint: client,
          certificateSha256: 'c' * 64,
          observedAtMillis: observed,
        ),
        throwsStateError,
      );
      expect(
        await database
            .customSelect(
              'SELECT COUNT(*) AS n FROM shop_connected_replica_heads',
            )
            .getSingle()
            .then((row) => row.read<int>('n')),
        0,
      );
      await expectLater(
        store.applySnapshot(
          snapshot: _snapshot(reservationWorkspaceId: 'workspace_other'),
          clientFingerprint: client,
          certificateSha256: certificate,
          observedAtMillis: observed,
        ),
        throwsFormatException,
      );
      await store.applySnapshot(
        snapshot: _snapshot(),
        clientFingerprint: client,
        certificateSha256: certificate,
        observedAtMillis: observed,
      );
      await expectLater(
        store.markCoordinatorUnavailable(
          workspaceId: 'workspace_1',
          siteId: 'site_1',
          clientFingerprint: client,
          certificateSha256: 'c' * 64,
          observedAtMillis: observed + 1,
        ),
        throwsStateError,
      );
      await expectLater(
        store.applySnapshot(
          snapshot: _snapshot(),
          clientFingerprint: 'f' * 64,
          certificateSha256: certificate,
          observedAtMillis: observed + 1,
        ),
        throwsStateError,
      );
      await expectLater(
        store.applySnapshot(
          snapshot: _snapshot(workspaceId: 'workspace_other'),
          clientFingerprint: client,
          certificateSha256: certificate,
          observedAtMillis: observed + 1,
        ),
        throwsStateError,
      );
    },
  );

  test(
    'terminal sale proof is retained but cannot create a local sale',
    () async {
      final store = ShopConnectedSiteReplicaStore(
        database: database,
        localWorkspaceId: 'workspace_1',
        localSiteId: 'site_1',
        localClientDeviceId: 'device_1',
        localClientFingerprint: client,
        localClientSigningKeyId: 'key_1',
        approvedBindingDigest: approvedBindingDigest,
        bindingResolver: bindingResolver,
        runtimeEnabled: true,
      );
      final committed = _committedStockProjection();
      await expectLater(
        store.applySnapshot(
          snapshot: _snapshot(
            stockProjection: Map<String, Object?>.from(committed)
              ..remove('terminalTransition'),
          ),
          clientFingerprint: client,
          certificateSha256: certificate,
          observedAtMillis: observed,
        ),
        throwsFormatException,
      );
      final changed = Map<String, Object?>.from(committed);
      final transition = Map<String, Object?>.from(
        changed['terminalTransition']! as Map,
      );
      transition['saleBinding'] = {
        ...(transition['saleBinding']! as Map).cast<String, Object?>(),
        'saleId': 'substituted-sale',
      };
      changed['terminalTransition'] = transition;
      await expectLater(
        store.applySnapshot(
          snapshot: _snapshot(stockProjection: changed),
          clientFingerprint: client,
          certificateSha256: certificate,
          observedAtMillis: observed,
        ),
        throwsFormatException,
      );
      await store.applySnapshot(
        snapshot: _snapshot(stockProjection: committed),
        clientFingerprint: client,
        certificateSha256: certificate,
        observedAtMillis: observed,
      );
      final projections = await store.readProjections(
        workspaceId: 'workspace_1',
        siteId: 'site_1',
        clientFingerprint: client,
      );
      expect(projections, hasLength(3));
      expect(
        projections.any((row) => row.containsKey('payload_json')),
        isFalse,
      );
      expect(
        canonicalConnectedSiteJson(projections),
        isNot(contains('sale_1')),
      );
      expect(await database.countSales(), 0);
      expect(await database.readReservedStockQuantity('product_1'), 0);
    },
  );

  test('binding signature and observation freshness are reverified', () async {
    final rejectedResolver = ShopConnectedSiteAttemptStore(
      database: database,
      approvalVerifier: const _RejectApprovalVerifier(),
      runtimeEnabled: true,
      now: () => clock,
    );
    final rejected = ShopConnectedSiteReplicaStore(
      database: database,
      localWorkspaceId: 'workspace_1',
      localSiteId: 'site_1',
      localClientDeviceId: 'device_1',
      localClientFingerprint: client,
      localClientSigningKeyId: 'key_1',
      approvedBindingDigest: approvedBindingDigest,
      bindingResolver: rejectedResolver,
      runtimeEnabled: true,
    );
    await expectLater(
      rejected.applySnapshot(
        snapshot: _snapshot(),
        clientFingerprint: client,
        certificateSha256: certificate,
        observedAtMillis: observed,
      ),
      throwsStateError,
    );
    final valid = ShopConnectedSiteReplicaStore(
      database: database,
      localWorkspaceId: 'workspace_1',
      localSiteId: 'site_1',
      localClientDeviceId: 'device_1',
      localClientFingerprint: client,
      localClientSigningKeyId: 'key_1',
      approvedBindingDigest: approvedBindingDigest,
      bindingResolver: bindingResolver,
      runtimeEnabled: true,
    );
    await expectLater(
      valid.applySnapshot(
        snapshot: _snapshot(),
        clientFingerprint: client,
        certificateSha256: certificate,
        observedAtMillis: clock
            .subtract(const Duration(minutes: 2))
            .millisecondsSinceEpoch,
      ),
      throwsStateError,
    );
    await bindingResolver.revoke(
      ConnectedCoordinatorRevocationV1(
        targetBindingDigest: approvedBindingDigest,
        workspaceId: 'workspace_1',
        siteId: 'site_1',
        clientDeviceId: 'device_1',
        approvalGeneration: 2,
        issuedAtMillis: observed,
        authorityKeyId: 'authority_1',
        authoritySignature: 'A' * 86,
      ),
    );
    await expectLater(
      valid.applySnapshot(
        snapshot: _snapshot(),
        clientFingerprint: client,
        certificateSha256: certificate,
        observedAtMillis: observed + 1,
      ),
      throwsStateError,
    );
  });

  test(
    'snapshot and ordered delta persist atomically and replay exactly',
    () async {
      final store = ShopConnectedSiteReplicaStore(
        database: database,
        localWorkspaceId: 'workspace_1',
        localSiteId: 'site_1',
        localClientDeviceId: 'device_1',
        localClientFingerprint: client,
        localClientSigningKeyId: 'key_1',
        approvedBindingDigest: approvedBindingDigest,
        bindingResolver: bindingResolver,
        runtimeEnabled: true,
      );
      await store.applySnapshot(
        snapshot: _snapshot(),
        clientFingerprint: client,
        certificateSha256: certificate,
        observedAtMillis: observed,
      );
      expect(
        await store.sharedWritesPaused(
          workspaceId: 'workspace_1',
          siteId: 'site_1',
          clientFingerprint: client,
        ),
        isTrue,
      );
      final delta = _delta();
      await store.applyDelta(
        delta: delta,
        clientFingerprint: client,
        certificateSha256: certificate,
        observedAtMillis: observed + 1,
      );
      await store.applyDelta(
        delta: delta,
        clientFingerprint: client,
        certificateSha256: certificate,
        observedAtMillis: observed + 2,
      );
      expect(
        await store.sharedWritesPaused(
          workspaceId: 'workspace_1',
          siteId: 'site_1',
          clientFingerprint: client,
        ),
        isTrue,
      );
      await store.applyDelta(
        delta: SiteDeltaV1(
          workspaceId: 'workspace_1',
          siteId: 'site_1',
          afterCursor: 1,
          nextCursor: 1,
          events: const [],
        ),
        clientFingerprint: client,
        certificateSha256: certificate,
        observedAtMillis: observed + 3,
      );
      expect(
        await store.sharedWritesPaused(
          workspaceId: 'workspace_1',
          siteId: 'site_1',
          clientFingerprint: client,
        ),
        isFalse,
      );
      final rows = await store.readProjections(
        workspaceId: 'workspace_1',
        siteId: 'site_1',
        clientFingerprint: client,
      );
      expect(rows, hasLength(3));
      Future<List<Map<String, Object?>>> retainedRows() async =>
          (await database
                  .customSelect(
                    'SELECT projection_kind, aggregate_id, aggregate_version, '
                    'last_cursor, payload_json, payload_digest '
                    'FROM shop_connected_replica_projections '
                    'WHERE workspace_id = ? AND site_id = ? AND client_fingerprint = ? '
                    'ORDER BY projection_kind, aggregate_id',
                    variables: [
                      const Variable('workspace_1'),
                      const Variable('site_1'),
                      Variable(client),
                    ],
                  )
                  .get())
              .map((row) => Map<String, Object?>.from(row.data))
              .toList();
      final retainedBefore = await retainedRows();
      await store.applySnapshot(
        snapshot: _snapshotAfterDelta(),
        clientFingerprint: client,
        certificateSha256: certificate,
        observedAtMillis: observed + 4,
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
      expect((await retainedRows()).map(content), retainedBefore.map(content));
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
      localClientDeviceId: 'device_1',
      localClientFingerprint: client,
      localClientSigningKeyId: 'key_1',
      approvedBindingDigest: approvedBindingDigest,
      bindingResolver: bindingResolver,
      runtimeEnabled: true,
    );
    await store.applySnapshot(
      snapshot: _snapshot(),
      clientFingerprint: client,
      certificateSha256: certificate,
      observedAtMillis: observed,
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
        observedAtMillis: observed + 1,
      ),
      throwsStateError,
    );
    await store.applyDelta(
      delta: _delta(),
      clientFingerprint: client,
      certificateSha256: certificate,
      observedAtMillis: observed + 1,
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
    await expectLater(
      store.applyDelta(
        delta: SiteDeltaV1(
          workspaceId: 'workspace_1',
          siteId: 'site_1',
          afterCursor: 1,
          nextCursor: 1,
          events: const [],
        ),
        clientFingerprint: client,
        certificateSha256: certificate,
        observedAtMillis: observed + 2,
      ),
      throwsStateError,
    );
  });

  test('terminal sale proof is required for delta and exact replay', () async {
    final store = ShopConnectedSiteReplicaStore(
      database: database,
      localWorkspaceId: 'workspace_1',
      localSiteId: 'site_1',
      localClientDeviceId: 'device_1',
      localClientFingerprint: client,
      localClientSigningKeyId: 'key_1',
      approvedBindingDigest: approvedBindingDigest,
      bindingResolver: bindingResolver,
      runtimeEnabled: true,
    );
    await store.applySnapshot(
      snapshot: _snapshot(),
      clientFingerprint: client,
      certificateSha256: certificate,
      observedAtMillis: observed,
    );
    final committed = _committedStockProjection();
    final withoutProof = Map<String, Object?>.from(committed)
      ..remove('terminalTransition');
    SiteDeltaV1 delivery(Map<String, Object?> projection) => SiteDeltaV1(
      workspaceId: 'workspace_1',
      siteId: 'site_1',
      afterCursor: 0,
      nextCursor: 1,
      events: [_entry(1, stockProjection: projection)],
    );
    await expectLater(
      store.applyDelta(
        delta: delivery(withoutProof),
        clientFingerprint: client,
        certificateSha256: certificate,
        observedAtMillis: observed + 1,
      ),
      throwsFormatException,
    );
    expect(
      await database
          .customSelect(
            'SELECT COUNT(*) AS n FROM shop_connected_replica_events',
          )
          .getSingle()
          .then((row) => row.read<int>('n')),
      0,
    );
    final accepted = delivery(committed);
    await store.applyDelta(
      delta: accepted,
      clientFingerprint: client,
      certificateSha256: certificate,
      observedAtMillis: observed + 2,
    );
    await store.applyDelta(
      delta: accepted,
      clientFingerprint: client,
      certificateSha256: certificate,
      observedAtMillis: observed + 3,
    );
    expect(await database.countSales(), 0);
    expect(
      await database
          .customSelect(
            'SELECT COUNT(*) AS n FROM shop_connected_replica_events',
          )
          .getSingle()
          .then((row) => row.read<int>('n')),
      1,
    );
  });

  test('legacy terminal replica reboots only under revoked old and new key', () async {
    final oldStore = ShopConnectedSiteReplicaStore(
      database: database,
      localWorkspaceId: 'workspace_1',
      localSiteId: 'site_1',
      localClientDeviceId: 'device_1',
      localClientFingerprint: client,
      localClientSigningKeyId: 'key_1',
      approvedBindingDigest: approvedBindingDigest,
      bindingResolver: bindingResolver,
      runtimeEnabled: true,
    );
    await oldStore.applySnapshot(
      snapshot: _snapshot(),
      clientFingerprint: client,
      certificateSha256: certificate,
      observedAtMillis: observed,
    );
    final legacy = Map<String, Object?>.from(_committedStockProjection())
      ..remove('terminalTransition');
    final oldSnapshot = _snapshot(stockProjection: legacy);
    final oldBytes = canonicalConnectedSiteJson(legacy);
    await database.transaction(() async {
      await database.customStatement(
        'UPDATE shop_connected_replica_heads SET snapshot_json = ?, '
        'checkpoint_digest = ? WHERE client_fingerprint = ?',
        [
          canonicalConnectedSiteJson(oldSnapshot.unsignedPayload),
          oldSnapshot.checkpointDigest,
          client,
        ],
      );
      await database.customStatement(
        'UPDATE shop_connected_replica_projections SET aggregate_version = 2, '
        'payload_json = ?, payload_digest = ? WHERE client_fingerprint = ? '
        "AND projection_kind = 'stockReservation'",
        [oldBytes, connectedSiteSha256(legacy), client],
      );
    });
    await database.verifyConnectedReplicaEvidence();
    expect(
      await oldStore.sharedWritesPaused(
        workspaceId: 'workspace_1',
        siteId: 'site_1',
        clientFingerprint: client,
      ),
      isTrue,
    );
    await expectLater(
      oldStore.applyDelta(
        delta: _delta(),
        clientFingerprint: client,
        certificateSha256: certificate,
        observedAtMillis: observed + 1,
      ),
      throwsStateError,
    );
    await expectLater(
      oldStore.applySnapshot(
        snapshot: _snapshot(stockProjection: _committedStockProjection()),
        clientFingerprint: client,
        certificateSha256: certificate,
        observedAtMillis: observed + 1,
      ),
      throwsStateError,
    );
    await expectLater(
      oldStore.rebootstrapIncompleteTerminalReplica(
        successor: oldStore,
        freshSnapshot: _snapshot(stockProjection: _committedStockProjection()),
        certificateSha256: certificate,
        observedAtMillis: observed + 1,
      ),
      throwsStateError,
    );
    final successorApproval = await _seedApprovedBinding(
      database,
      clock,
      keyOffset: 33,
      deviceId: 'device_2',
      signingKeyId: 'key_2',
      pairingNonce: 'pairing_nonce_successor_abcdefghijkl',
    );
    final successor = ShopConnectedSiteReplicaStore(
      database: database,
      localWorkspaceId: 'workspace_1',
      localSiteId: 'site_1',
      localClientDeviceId: 'device_2',
      localClientFingerprint: successorApproval.$1,
      localClientSigningKeyId: 'key_2',
      approvedBindingDigest: successorApproval.$2,
      bindingResolver: successorApproval.$3,
      runtimeEnabled: true,
    );
    await expectLater(
      oldStore.rebootstrapIncompleteTerminalReplica(
        successor: successor,
        freshSnapshot: _snapshot(stockProjection: _committedStockProjection()),
        certificateSha256: certificate,
        observedAtMillis: observed + 1,
      ),
      throwsStateError,
    );
    await bindingResolver.revoke(
      ConnectedCoordinatorRevocationV1(
        targetBindingDigest: approvedBindingDigest,
        workspaceId: 'workspace_1',
        siteId: 'site_1',
        clientDeviceId: 'device_1',
        approvalGeneration: 2,
        issuedAtMillis: observed,
        authorityKeyId: 'authority_1',
        authoritySignature: 'A' * 86,
      ),
    );
    await expectLater(
      oldStore.rebootstrapIncompleteTerminalReplica(
        successor: successor,
        freshSnapshot: _snapshot(stockProjection: legacy),
        certificateSha256: certificate,
        observedAtMillis: observed + 1,
      ),
      throwsFormatException,
    );
    expect(
      await oldStore.sharedWritesPaused(
        workspaceId: 'workspace_1',
        siteId: 'site_1',
        clientFingerprint: client,
      ),
      isTrue,
    );
    expect(
      await successor.continuationCursor(
        workspaceId: 'workspace_1',
        siteId: 'site_1',
        clientFingerprint: successorApproval.$1,
      ),
      isNull,
    );
    await oldStore.rebootstrapIncompleteTerminalReplica(
      successor: successor,
      freshSnapshot: _snapshot(stockProjection: _committedStockProjection()),
      certificateSha256: certificate,
      observedAtMillis: observed + 1,
    );
    expect(
      await oldStore.sharedWritesPaused(
        workspaceId: 'workspace_1',
        siteId: 'site_1',
        clientFingerprint: client,
      ),
      isTrue,
    );
    expect(
      await successor.continuationCursor(
        workspaceId: 'workspace_1',
        siteId: 'site_1',
        clientFingerprint: successorApproval.$1,
      ),
      0,
    );
    final oldProjection = await database
        .customSelect(
          'SELECT payload_json FROM shop_connected_replica_projections '
          "WHERE client_fingerprint = ? AND projection_kind = 'stockReservation'",
          variables: [Variable(client)],
        )
        .getSingle();
    expect(oldProjection.read<String>('payload_json'), oldBytes);
    final successorProjection = await database
        .customSelect(
          'SELECT payload_json FROM shop_connected_replica_projections '
          "WHERE client_fingerprint = ? AND projection_kind = 'stockReservation'",
          variables: [Variable(successorApproval.$1)],
        )
        .getSingle();
    final successorProof = ConnectedStockReservationProjectionV1.fromJson(
      jsonDecode(successorProjection.read<String>('payload_json')),
    );
    expect(successorProof.terminalTransition?.saleBinding?.saleId, 'sale_1');
    final oldHead = await database
        .customSelect(
          'SELECT snapshot_json FROM shop_connected_replica_heads '
          'WHERE client_fingerprint = ?',
          variables: [Variable(client)],
        )
        .getSingle();
    expect(
      oldHead.read<String>('snapshot_json'),
      canonicalConnectedSiteJson(oldSnapshot.unsignedPayload),
    );
    expect(
      await database
          .customSelect(
            'SELECT COUNT(*) AS n FROM shop_connected_replica_events '
            'WHERE client_fingerprint = ?',
            variables: [Variable(client)],
          )
          .getSingle()
          .then((row) => row.read<int>('n')),
      0,
    );
    expect(await database.countSales(), 0);
    await database.verifyConnectedReplicaEvidence();
  });

  test('exact replay rejects a tail subset of an accepted delivery', () async {
    final store = ShopConnectedSiteReplicaStore(
      database: database,
      localWorkspaceId: 'workspace_1',
      localSiteId: 'site_1',
      localClientDeviceId: 'device_1',
      localClientFingerprint: client,
      localClientSigningKeyId: 'key_1',
      approvedBindingDigest: approvedBindingDigest,
      bindingResolver: bindingResolver,
      runtimeEnabled: true,
    );
    await store.applySnapshot(
      snapshot: _snapshot(),
      clientFingerprint: client,
      certificateSha256: certificate,
      observedAtMillis: observed,
    );
    final full = SiteDeltaV1(
      workspaceId: 'workspace_1',
      siteId: 'site_1',
      afterCursor: 0,
      nextCursor: 2,
      events: [_entry(1), _entry(2)],
    );
    await store.applyDelta(
      delta: full,
      clientFingerprint: client,
      certificateSha256: certificate,
      observedAtMillis: observed + 1,
    );
    await expectLater(
      store.applyDelta(
        delta: SiteDeltaV1(
          workspaceId: 'workspace_1',
          siteId: 'site_1',
          afterCursor: 1,
          nextCursor: 2,
          events: [_entry(2)],
        ),
        clientFingerprint: client,
        certificateSha256: certificate,
        observedAtMillis: observed + 2,
      ),
      throwsStateError,
    );
  });

  test(
    'recomputed projection digest cannot hide projection tampering',
    () async {
      final store = ShopConnectedSiteReplicaStore(
        database: database,
        localWorkspaceId: 'workspace_1',
        localSiteId: 'site_1',
        localClientDeviceId: 'device_1',
        localClientFingerprint: client,
        localClientSigningKeyId: 'key_1',
        approvedBindingDigest: approvedBindingDigest,
        bindingResolver: bindingResolver,
        runtimeEnabled: true,
      );
      await store.applySnapshot(
        snapshot: _snapshot(),
        clientFingerprint: client,
        certificateSha256: certificate,
        observedAtMillis: observed,
      );
      final tampered = <String, Object?>{
        'orderId': 'order_1',
        'ticketVersion': 1,
        'state': 'paid',
        'stateRevision': 99,
        'ticket': <String, Object?>{},
      };
      await database.customStatement(
        'UPDATE shop_connected_replica_projections SET payload_json = ?, payload_digest = ? '
        "WHERE projection_kind = 'cafeOrder' AND aggregate_id = 'order_1'",
        [canonicalConnectedSiteJson(tampered), connectedSiteSha256(tampered)],
      );
      await expectLater(
        database.verifyConnectedReplicaEvidence(),
        throwsStateError,
      );
    },
  );

  test('backup validator binds delivery scope and cursor columns', () async {
    final store = ShopConnectedSiteReplicaStore(
      database: database,
      localWorkspaceId: 'workspace_1',
      localSiteId: 'site_1',
      localClientDeviceId: 'device_1',
      localClientFingerprint: client,
      localClientSigningKeyId: 'key_1',
      approvedBindingDigest: approvedBindingDigest,
      bindingResolver: bindingResolver,
      runtimeEnabled: true,
    );
    await store.applySnapshot(
      snapshot: _snapshot(),
      clientFingerprint: client,
      certificateSha256: certificate,
      observedAtMillis: observed,
    );
    await store.applyDelta(
      delta: _delta(),
      clientFingerprint: client,
      certificateSha256: certificate,
      observedAtMillis: observed + 1,
    );
    final directory = await Directory.systemTemp.createTemp(
      'replica-delivery-',
    );
    addTearDown(() => directory.delete(recursive: true));
    final file = File('${directory.path}/tampered.sqlite');
    await database.exportVerifiedLocalSnapshot(file);
    final raw = sqlite.sqlite3.open(file.path);
    try {
      raw.execute('DROP TRIGGER shop_connected_replica_deliveries_no_update');
      raw.execute(
        "UPDATE shop_connected_replica_deliveries SET workspace_id = 'foreign-workspace'",
      );
    } finally {
      raw.close();
    }
    expect(
      () => ShopBackup.verifySnapshot(file, expectedSchemaVersion: 40),
      throwsFormatException,
    );
  });

  test(
    'crash between event work and cursor commit leaves no partial evidence',
    () async {
      final store = ShopConnectedSiteReplicaStore(
        database: database,
        localWorkspaceId: 'workspace_1',
        localSiteId: 'site_1',
        localClientDeviceId: 'device_1',
        localClientFingerprint: client,
        localClientSigningKeyId: 'key_1',
        approvedBindingDigest: approvedBindingDigest,
        bindingResolver: bindingResolver,
        runtimeEnabled: true,
      );
      await store.applySnapshot(
        snapshot: _snapshot(),
        clientFingerprint: client,
        certificateSha256: certificate,
        observedAtMillis: observed,
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
          observedAtMillis: observed + 1,
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
      localClientDeviceId: 'device_1',
      localClientFingerprint: client,
      localClientSigningKeyId: 'key_1',
      approvedBindingDigest: approvedBindingDigest,
      bindingResolver: bindingResolver,
      runtimeEnabled: true,
    );
    await store.applySnapshot(
      snapshot: _snapshot(stockProjection: _committedStockProjection()),
      clientFingerprint: client,
      certificateSha256: certificate,
      observedAtMillis: observed,
    );
    await store.markCoordinatorUnavailable(
      workspaceId: 'workspace_1',
      siteId: 'site_1',
      clientFingerprint: client,
      certificateSha256: certificate,
      observedAtMillis: observed + 1,
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
    final directory = await Directory.systemTemp.createTemp('replica-v33-');
    final archive = File('${directory.path}/replica.smbackup');
    final file = File('${directory.path}/restored/shop.sqlite');
    addTearDown(() => directory.delete(recursive: true));
    await ShopBackup.exportEncrypted(
      database: database,
      archive: archive,
      password: 'replica-backup-passphrase',
      scratchRoot: directory,
    );
    await file.parent.create(recursive: true);
    await ShopBackup.restoreIntoEmptyDatabase(
      archive: archive,
      target: file,
      password: 'replica-backup-passphrase',
    );
    final restored = ShopDatabase(NativeDatabase(file));
    addTearDown(restored.close);
    await restored.verifyConnectedReplicaEvidence();
    final retained = await restored
        .customSelect(
          'SELECT payload_json FROM shop_connected_replica_projections '
          "WHERE projection_kind = 'stockReservation'",
        )
        .getSingle();
    final proof = ConnectedStockReservationProjectionV1.fromJson(
      jsonDecode(retained.read<String>('payload_json')),
    );
    expect(proof.reservation.state, ConnectedStockReservationState.committed);
    expect(proof.terminalTransition?.saleBinding?.saleId, 'sale_1');
    expect(await restored.countSales(), 0);
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
      dropHistoricalShopSchemaDefinitionGroup(
        raw,
        shopConnectedTrustedTimeIssuerSchemaDefinitionsV38(),
      );
      for (final definition
          in shopConnectedTrustedTimeSchemaDefinitionsV37().entries
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
      for (final definition
          in shopConnectedAuthorityCheckpointSchemaDefinitionsV36().entries
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
      for (final definition
          in shopConnectedCloudProofSchemaDefinitionsV35().entries
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
      for (final definition
          in shopConnectedReplicaSchemaDefinitionsV33().entries
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
    expect(migrated.schemaVersion, 40);
    await migrated.verifyConnectedReplicaEvidence();
  });

  test('populated v32 replica rebases empty and encrypted restore preserves local authority', () async {
    final directory = await Directory.systemTemp.createTemp('replica-v32-');
    addTearDown(() => directory.delete(recursive: true));
    final file = File('${directory.path}/shop.sqlite');
    final source = ShopDatabase(NativeDatabase(file));
    final seeded = await _seedApprovedBinding(source, clock);
    await source.addProduct(
      id: 'local-authoritative-product',
      name: 'Local authoritative product',
      priceMmk: 2500,
      openingStock: 7,
    );
    final store = ShopConnectedSiteReplicaStore(
      database: source,
      localWorkspaceId: 'workspace_1',
      localSiteId: 'site_1',
      localClientDeviceId: 'device_1',
      localClientFingerprint: seeded.$1,
      localClientSigningKeyId: 'key_1',
      approvedBindingDigest: seeded.$2,
      bindingResolver: seeded.$3,
      runtimeEnabled: true,
    );
    await store.applySnapshot(
      snapshot: _snapshot(),
      clientFingerprint: seeded.$1,
      certificateSha256: certificate,
      observedAtMillis: observed,
    );
    await store.applyDelta(
      delta: _delta(),
      clientFingerprint: seeded.$1,
      certificateSha256: certificate,
      observedAtMillis: observed + 1,
    );
    await source.close();
    final raw = sqlite.sqlite3.open(file.path);
    try {
      dropHistoricalShopSchemaDefinitionGroup(
        raw,
        shopConnectedTrustedTimeIssuerSchemaDefinitionsV38(),
      );
      for (final definition
          in shopConnectedTrustedTimeSchemaDefinitionsV37().entries
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
      for (final definition
          in shopConnectedAuthorityCheckpointSchemaDefinitionsV36().entries
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
      for (final definition
          in shopConnectedCloudProofSchemaDefinitionsV35().entries
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
      for (final definition
          in shopConnectedReplicaSchemaDefinitionsV33().entries
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
      final legacyEvent = <String, Object?>{
        'eventId': 'event_1',
        'workspaceId': 'workspace_1',
        'siteId': 'site_1',
        'aggregateType': 'cafeOrder',
        'aggregateId': 'order_1',
        'aggregateVersion': 2,
        'eventType': 'shop.cafe_order.updated.v1',
        'occurredAt': '2026-11-01T00:00:00.000Z',
        'payload': {'orderId': 'order_1', 'state': 'held'},
      };
      raw.execute('DROP TRIGGER shop_connected_replica_events_no_update');
      raw.execute(
        'UPDATE shop_connected_replica_events SET event_json = ?, event_digest = ? '
        'WHERE cursor = 1',
        [
          canonicalConnectedSiteJson(legacyEvent),
          connectedSiteSha256(legacyEvent),
        ],
      );
      raw.execute(
        shopConnectedReplicaSchemaDefinitionsV32()['shop_connected_replica_events_no_update']!,
      );
      raw.execute('PRAGMA user_version = 32');
    } finally {
      raw.close();
    }
    final archive = File('${directory.path}/v32.smbak');
    await _writeAuthenticatedArchive(
      archive,
      await file.readAsBytes(),
      schemaVersion: 32,
    );
    final migrated = ShopDatabase(NativeDatabase(file));
    addTearDown(migrated.close);
    await migrated.verifyReadyForUse();
    expect(migrated.schemaVersion, 40);
    expect(
      await migrated
          .customSelect(
            "SELECT COUNT(*) AS n FROM shop_products WHERE id = 'local-authoritative-product' AND on_hand = 7",
          )
          .getSingle()
          .then((row) => row.read<int>('n')),
      1,
    );
    expect(
      await migrated
          .customSelect(
            'SELECT COUNT(*) AS n FROM shop_site_coordinator_bindings WHERE binding_digest = ?',
            variables: [Variable(seeded.$2)],
          )
          .getSingle()
          .then((row) => row.read<int>('n')),
      1,
    );
    for (final table in const [
      'shop_connected_replica_heads',
      'shop_connected_replica_events',
      'shop_connected_replica_projections',
      'shop_connected_replica_deliveries',
      'shop_site_replica_event_envelopes',
    ]) {
      expect(
        await migrated
            .customSelect('SELECT COUNT(*) AS n FROM $table')
            .getSingle()
            .then((row) => row.read<int>('n')),
        0,
        reason: '$table must not relabel lossy v32 evidence',
      );
    }
    await migrated.verifyConnectedReplicaEvidence();
    final migratedResolver = ShopConnectedSiteAttemptStore(
      database: migrated,
      approvalVerifier: const _ReplicaApprovalVerifier(),
      runtimeEnabled: true,
      now: () => clock,
    );
    final migratedStore = ShopConnectedSiteReplicaStore(
      database: migrated,
      localWorkspaceId: 'workspace_1',
      localSiteId: 'site_1',
      localClientDeviceId: 'device_1',
      localClientFingerprint: seeded.$1,
      localClientSigningKeyId: 'key_1',
      approvedBindingDigest: seeded.$2,
      bindingResolver: migratedResolver,
      runtimeEnabled: true,
    );
    expect(
      await migratedStore.sharedWritesPaused(
        workspaceId: 'workspace_1',
        siteId: 'site_1',
        clientFingerprint: seeded.$1,
      ),
      isTrue,
    );
    expect(
      await migratedStore.readProjections(
        workspaceId: 'workspace_1',
        siteId: 'site_1',
        clientFingerprint: seeded.$1,
      ),
      isEmpty,
    );
    await expectLater(
      migratedStore.applyDelta(
        delta: _delta(),
        clientFingerprint: seeded.$1,
        certificateSha256: certificate,
        observedAtMillis: observed + 2,
      ),
      throwsStateError,
    );

    final restoredFile = File('${directory.path}/restored/shop.sqlite');
    await restoredFile.parent.create(recursive: true);
    await ShopBackup.restoreIntoEmptyDatabase(
      archive: archive,
      target: restoredFile,
      password: 'replica-backup-passphrase',
    );
    final restored = ShopDatabase(NativeDatabase(restoredFile));
    addTearDown(restored.close);
    await restored.verifyConnectedReplicaEvidence();
    expect(
      await restored
          .customSelect(
            "SELECT COUNT(*) AS n FROM shop_products WHERE id = 'local-authoritative-product' AND on_hand = 7",
          )
          .getSingle()
          .then((row) => row.read<int>('n')),
      1,
    );
    expect(
      await restored
          .customSelect(
            'SELECT COUNT(*) AS n FROM shop_connected_replica_heads',
          )
          .getSingle()
          .then((row) => row.read<int>('n')),
      0,
    );

    await migratedStore.applySnapshot(
      snapshot: _snapshot(),
      clientFingerprint: seeded.$1,
      certificateSha256: certificate,
      observedAtMillis: observed + 3,
    );
    expect(
      await migratedStore.readProjections(
        workspaceId: 'workspace_1',
        siteId: 'site_1',
        clientFingerprint: seeded.$1,
      ),
      hasLength(3),
    );
  });
}

Future<void> _writeAuthenticatedArchive(
  File target,
  List<int> cleartext, {
  required int schemaVersion,
}) async {
  final salt = List<int>.generate(16, (index) => index + 10);
  final nonce = List<int>.generate(12, (index) => index + 30);
  final header = [
    ...ascii.encode('SMBK'),
    ShopBackup.formatVersion,
    schemaVersion,
    ...salt,
    ...nonce,
  ];
  final key = await Argon2id(
    memory: 19 * 1024,
    parallelism: 1,
    iterations: 2,
    hashLength: 32,
  ).deriveKeyFromPassword(password: 'replica-backup-passphrase', nonce: salt);
  final box = await AesGcm.with256bits().encrypt(
    cleartext,
    secretKey: key,
    nonce: nonce,
    aad: header,
  );
  await target.writeAsBytes([...header, ...box.cipherText, ...box.mac.bytes]);
}

SiteSnapshotV1 _snapshot({
  String workspaceId = 'workspace_1',
  String? reservationWorkspaceId,
  Map<String, Object?>? stockProjection,
}) {
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
      stockProjection ??
          _stockReservation(reservationWorkspaceId ?? workspaceId),
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

Map<String, Object?> _entry(
  int cursor, {
  Map<String, Object?>? stockProjection,
}) {
  final projections = Map<String, Object?>.from(_projectionsAfterDelta());
  if (stockProjection != null) {
    projections['stockReservations'] = [stockProjection];
  }
  final event = <String, Object?>{
    'eventId': 'event_$cursor',
    'workspaceId': 'workspace_1',
    'siteId': 'site_1',
    'aggregateType': 'cafeOrder',
    'aggregateId': 'order_1',
    'aggregateVersion': 2,
    'eventType': 'shop.connected_replica.state.v1',
    'occurredAt': '2026-11-01T00:00:00.000Z',
    'payload': {
      'contract': 'supermega.shop.connected-site-replica-state.v1',
      'projections': projections,
    },
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
  final projections = _projectionsAfterDelta();
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

Map<String, Object?> _projectionsAfterDelta() => <String, Object?>{
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
      'state': 'held',
      'stateRevision': 1,
      'ticket': <String, Object?>{},
    },
  ],
  'stockReservations': [_stockReservation('workspace_1')],
  'conflicts': <Object?>[],
};

Map<String, Object> _stockReservation(String workspaceId) =>
    ConnectedStockReservationV1.held(
      reservationId: 'reservation_1',
      workspaceId: workspaceId,
      siteId: 'site_1',
      actorId: 'actor_1',
      deviceId: 'device_1',
      workflowType: ConnectedStockWorkflowType.retailCart,
      subjectId: 'cart_1',
      capability: ShopStaffCapability.counterSale,
      lines: [
        ConnectedStockReservationLineV1(productId: 'product_1', quantity: 1),
      ],
      issuedAt: '2026-11-01T12:00:00.000Z',
      expiresAt: '2026-11-01T13:00:00.000Z',
    ).toJson();

Map<String, Object?> _committedStockProjection() {
  final held = ConnectedStockReservationV1.fromJson(
    _stockReservation('workspace_1'),
  );
  const committedAt = '2026-11-01T12:05:00.000Z';
  final binding = ConnectedStockSaleBindingV1.create(
    reservation: held,
    saleId: 'sale_1',
    saleCommandId: 'sale-command_1',
    saleCommandDigest: 'a' * 64,
    committedAt: committedAt,
  );
  final transition = transitionConnectedStockReservation(
    reservation: held,
    expectedReservationDigest: held.reservationDigest,
    targetState: ConnectedStockReservationState.committed,
    transitionedAt: committedAt,
    reason: 'sale_committed',
    saleBinding: binding,
  );
  return ConnectedStockReservationProjectionV1(
    reservation: transition.after,
    terminalTransition: transition,
  ).toJson();
}

Future<(String, String, ShopConnectedSiteAttemptStore)> _seedApprovedBinding(
  ShopDatabase database,
  DateTime now, {
  int keyOffset = 1,
  String deviceId = 'device_1',
  String signingKeyId = 'key_1',
  String pairingNonce = 'pairing_nonce_abcdefghijklmnop',
}) async {
  final publicKey = List<int>.generate(32, (index) => index + keyOffset);
  final fingerprint = crypto.sha256.convert(publicKey).toString();
  final observed = now
      .subtract(const Duration(minutes: 2))
      .millisecondsSinceEpoch;
  final payload = <String, Object>{
    'schema': 'supermega.shop.owner-enrollment-evidence.v1',
    'action': 'approve',
    'tenantId': 'workspace_1',
    'siteId': 'site_1',
    'coordinatorDeviceId': 'coordinator_1',
    'deviceId': deviceId,
    'clientFingerprint': fingerprint,
    'sessionGeneration': 1,
    'observedAtMillis': observed,
    'authorityKeyId': 'owner_authority_1',
  };
  final evidenceDigest = connectedSiteSha256(payload);
  final evidence = {
    ...payload,
    'signature': 'E' * 86,
    'evidenceDigest': evidenceDigest,
  };
  await database.transaction(() async {
    await database.customStatement(
      'INSERT INTO shop_site_pairing_nonces (nonce, tenant_id, site_id, '
      'coordinator_device_id, issued_at_millis, expires_at_millis, consumed_at_millis) '
      'VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        pairingNonce,
        'workspace_1',
        'site_1',
        'coordinator_1',
        observed - 1000,
        observed + 60000,
        observed,
      ],
    );
    await database.customStatement(
      'INSERT INTO shop_site_pending_enrollments (client_fingerprint, nonce, tenant_id, site_id, '
      'coordinator_device_id, public_key, key_algorithm, observed_at_millis) '
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        fingerprint,
        pairingNonce,
        'workspace_1',
        'site_1',
        'coordinator_1',
        publicKey,
        'ed25519',
        observed,
      ],
    );
    await database.customStatement(
      'INSERT INTO shop_site_devices (device_id, tenant_id, site_id, public_key_fingerprint, '
      "session_generation, state, enrolled_at_millis) VALUES (?, ?, ?, ?, ?, 'active', ?)",
      [deviceId, 'workspace_1', 'site_1', fingerprint, 1, observed],
    );
    await database.customStatement(
      'INSERT INTO shop_site_enrollment_evidence (evidence_digest, action, tenant_id, site_id, '
      'coordinator_device_id, device_id, client_fingerprint, session_generation, observed_at_millis, '
      'authority_key_id, evidence_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        evidenceDigest,
        'approve',
        'workspace_1',
        'site_1',
        'coordinator_1',
        deviceId,
        fingerprint,
        1,
        observed,
        'owner_authority_1',
        canonicalConnectedSiteJson(evidence),
      ],
    );
  });
  final approval = ConnectedCoordinatorApprovalV1(
    workspaceId: 'workspace_1',
    siteId: 'site_1',
    coordinatorDeviceId: 'coordinator_1',
    pairingDigest: '1' * 64,
    enrollmentEvidenceDigest: evidenceDigest,
    clientDeviceId: deviceId,
    clientFingerprint: fingerprint,
    clientSigningKeyId: signingKeyId,
    address: '192.168.1.2',
    port: 9443,
    certificateSha256: '4' * 64,
    approvalGeneration: 1,
    issuedAtMillis: now
        .subtract(const Duration(minutes: 1))
        .millisecondsSinceEpoch,
    expiresAtMillis: now.add(const Duration(days: 6)).millisecondsSinceEpoch,
    authorityKeyId: 'authority_1',
    authoritySignature: 'A' * 86,
  );
  final store = ShopConnectedSiteAttemptStore(
    database: database,
    approvalVerifier: const _ReplicaApprovalVerifier(),
    runtimeEnabled: true,
    now: () => now,
  );
  return (fingerprint, await store.importApproval(approval), store);
}

class _ReplicaApprovalVerifier implements ConnectedCoordinatorApprovalVerifier {
  const _ReplicaApprovalVerifier();

  @override
  Future<bool> verify({
    required String authorityKeyId,
    required String canonicalEvidence,
    required String signature,
  }) async =>
      authorityKeyId == 'authority_1' &&
      signature == 'A' * 86 &&
      crypto.sha256.convert(utf8.encode(canonicalEvidence)).bytes.isNotEmpty;
}

class _RejectApprovalVerifier implements ConnectedCoordinatorApprovalVerifier {
  const _RejectApprovalVerifier();

  @override
  Future<bool> verify({
    required String authorityKeyId,
    required String canonicalEvidence,
    required String signature,
  }) async => false;
}
