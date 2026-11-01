import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:cryptography/cryptography.dart';
import 'package:drift/drift.dart' show Variable;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart' as sqlite;
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_cafe_kitchen_entitlement.dart';
import 'package:supermega_shop/shop_cafe_order_contract.dart';
import 'package:supermega_shop/shop_cafe_order_store.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_connected_site_database_adapter.dart';
import 'package:supermega_shop/shop_connected_stock_reservation.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_site_coordinator.dart';
import 'package:supermega_shop/shop_staff_authorization.dart';

const _now = 2000000000000;
const _workspace = 'workspace-adapter';
const _site = 'site-adapter';
const _actor = 'actor-adapter';
const _device = 'device-adapter';
final _fingerprint = _digest('adapter-device-key');
const _adapterCapabilities = <String>[
  'cafeKitchenStatus',
  'cafeOrderWrite',
  'counterSale',
];
final _leaseDigest = connectedSiteSha256(
  _adapterLeaseUnsigned(_adapterCapabilities),
);

Map<String, Object> _adapterLeaseUnsigned(List<String> capabilities) => {
  'protocolVersion': connectedSiteProtocolVersion,
  'leaseId': 'adapter-lease',
  'workspaceId': _workspace,
  'siteId': _site,
  'actorId': _actor,
  'role': 'cashierCounter',
  'capabilities': capabilities,
  'deviceId': _device,
  'sessionGeneration': 1,
  'revocationGeneration': 1,
  'issuedAt': DateTime.fromMillisecondsSinceEpoch(
    _now - 1000,
    isUtc: true,
  ).toIso8601String(),
  'expiresAt': DateTime.fromMillisecondsSinceEpoch(
    _now + 60000,
    isUtc: true,
  ).toIso8601String(),
  'issuerKeyId': 'test-key',
};

OfflineStaffLeaseV1 _adapterLease(List<String> capabilities) =>
    OfflineStaffLeaseV1(
      leaseId: 'adapter-lease',
      workspaceId: _workspace,
      siteId: _site,
      actorId: _actor,
      role: 'cashierCounter',
      capabilities: capabilities,
      deviceId: _device,
      sessionGeneration: 1,
      revocationGeneration: 1,
      issuedAt: _adapterLeaseUnsigned(capabilities)['issuedAt']! as String,
      expiresAt: _adapterLeaseUnsigned(capabilities)['expiresAt']! as String,
      issuerKeyId: 'test-key',
      payloadDigest: connectedSiteSha256(_adapterLeaseUnsigned(capabilities)),
      signature: List.filled(64, 's').join(),
    );

void main() {
  test('resolver exposes only the reviewed connected command vocabulary', () {
    const resolver = ShopConnectedSiteDatabaseCapabilityResolver();
    expect(
      resolver.requiredCapability(_reserveCommand('retail-resolve')),
      ShopStaffCapability.counterSale,
    );
    expect(
      resolver.requiredCapability(_reserveCommand('cafe-resolve', cafe: true)),
      ShopStaffCapability.cafeOrderWrite,
    );
    expect(
      resolver.requiredCapability(_cafePutCommand('cafe-put-resolve')),
      ShopStaffCapability.cafeOrderWrite,
    );
    expect(
      resolver.requiredCapability(
        _cafeKitchenCommand('cafe-kitchen-resolve', expectedVersion: 1),
      ),
      ShopStaffCapability.cafeKitchenStatus,
    );
    expect(
      resolver.requiredCapability(
        _reserveCommand(
          'unknown-resolve',
          commandType: 'future.stock.reserve.v2',
        ),
      ),
      isNull,
    );
  });

  test('handler stays disabled and rejects an unbound client', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _seed(database);
      final disabled = ShopConnectedSiteDatabaseCommandHandler(
        database: database,
        timeAuthority: const _FixedTime(_now),
      );
      await expectLater(
        disabled.handle(_fingerprint, _reserveCommand('disabled')),
        throwsStateError,
      );
      final enabled = ShopConnectedSiteDatabaseCommandHandler(
        database: database,
        timeAuthority: const _FixedTime(_now),
        connectedSiteEnabled: true,
      );
      await expectLater(
        enabled.handle(_digest('another-device'), _reserveCommand('wrong-key')),
        throwsStateError,
      );
      await expectLater(
        enabled.handle(_fingerprint, _cafePutCommand('missing-projector')),
        throwsStateError,
      );
      expect(await database.countSales(), 0);
      expect(
        (await database
                .customSelect(
                  'SELECT COUNT(*) AS total FROM shop_site_commands',
                )
                .getSingle())
            .read<int>('total'),
        0,
      );
    } finally {
      await database.close();
    }
  });

  test('cafe put rejects missing foreign and expired reservations', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _seed(database);
      final store = ShopCafeOrderStore(
        database,
        clock: () => DateTime.fromMillisecondsSinceEpoch(_now, isUtc: true),
        kitchenEntitlement: const _AllowKitchenEntitlement(),
      );
      var handler = ShopConnectedSiteDatabaseCommandHandler(
        database: database,
        timeAuthority: const _FixedTime(_now),
        cafeStore: store,
        connectedSiteEnabled: true,
      );
      final missing = await handler.handle(
        _fingerprint,
        _cafePutCommand('missing-reservation', expectedVersion: 0),
      );
      expect(missing.state, SiteCommandAckState.conflict);
      expect(missing.reason, 'reservation_not_acknowledged');

      final foreignReserve = _cafeReserveCommand(
        'foreign-reserve',
        subjectId: 'another-cafe-ticket',
      );
      expect(
        (await handler.handle(_fingerprint, foreignReserve)).state,
        SiteCommandAckState.accepted,
      );
      final foreign = await handler.handle(
        _fingerprint,
        _cafePutCommand(
          'foreign-reservation',
          expectedVersion: 0,
          reservationBinding: _cafeReservationBinding(foreignReserve),
        ),
      );
      expect(foreign.state, SiteCommandAckState.conflict);
      expect(foreign.reason, 'reservation_not_acknowledged');
      expect(
        (await handler.handle(
          _fingerprint,
          _releaseCommand(
            'foreign-release',
            foreignReserve,
            commandType: shopCafeStockReleaseCommandType,
          ),
        )).state,
        SiteCommandAckState.accepted,
      );

      final staleReserve = _cafeReserveCommand('stale-reserve');
      expect(
        (await handler.handle(_fingerprint, staleReserve)).state,
        SiteCommandAckState.accepted,
      );
      handler = ShopConnectedSiteDatabaseCommandHandler(
        database: database,
        timeAuthority: const _FixedTime(_now + 31000),
        cafeStore: store,
        connectedSiteEnabled: true,
      );
      final stale = await handler.handle(
        _fingerprint,
        _cafePutCommand(
          'stale-reservation',
          reservationBinding: _cafeReservationBinding(staleReserve),
        ),
      );
      expect(stale.state, SiteCommandAckState.conflict);
      expect(stale.reason, 'reservation_time_invalid');
      expect(await store.read('connected-cafe-ticket'), isNull);
      expect(await database.countSales(), 0);
      expect(
        (await database
                .customSelect(
                  'SELECT COUNT(*) AS total FROM shop_site_events '
                  "WHERE aggregate_id = 'connected-cafe-ticket' "
                  "AND event_type = 'shop.cafe_order.put.v1'",
                )
                .getSingle())
            .read<int>('total'),
        0,
      );
    } finally {
      await database.close();
    }
  });

  test(
    'adapter commits, replays, replicates and survives restart exactly once',
    () async {
      final root = await Directory.systemTemp.createTemp(
        'shop-connected-adapter-',
      );
      final file = File('${root.path}/shop.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      try {
        await _seed(database);
        final reserve = _reserveCommand('adapter-reserve');
        var handler = ShopConnectedSiteDatabaseCommandHandler(
          database: database,
          timeAuthority: const _FixedTime(_now),
          connectedSiteEnabled: true,
        );
        final accepted = await handler.handle(_fingerprint, reserve);
        expect(accepted.state, SiteCommandAckState.accepted);
        expect(accepted.canonicalVersion, 1);
        expect(accepted.eventDigest, isNotNull);
        expect(
          (await handler.handle(_fingerprint, reserve)).state,
          SiteCommandAckState.replayed,
        );
        var reader = ShopConnectedSiteDatabaseReplicationReader(
          database: database,
          workspaceId: _workspace,
          siteId: _site,
        );
        final delta = await reader.readDelta(_fingerprint, 0);
        expect(delta.nextCursor, 1);
        expect(delta.events, hasLength(1));
        expect(
          (delta.events.single['event']! as Map)['eventType'],
          'shop.connected_replica.state.v1',
        );
        expect(
          ((delta.events.single['event']! as Map)['payload']!
              as Map)['contract'],
          'supermega.shop.connected-site-replica-state.v1',
        );
        final snapshot = await reader.readSnapshot(_fingerprint);
        expect(snapshot.continuationCursor, 1);
        expect(
          snapshot.projections['schema'],
          'supermega.shop.connected-site-projections.v2',
        );
        await expectLater(
          reader.readDelta(_digest('wrong-reader'), 0),
          throwsStateError,
        );

        await database.close();
        database = ShopDatabase(NativeDatabase(file));
        await database.verifyReadyForUse();
        handler = ShopConnectedSiteDatabaseCommandHandler(
          database: database,
          timeAuthority: const _FixedTime(_now + 1000),
          connectedSiteEnabled: true,
        );
        reader = ShopConnectedSiteDatabaseReplicationReader(
          database: database,
          workspaceId: _workspace,
          siteId: _site,
        );
        expect(
          (await handler.handle(_fingerprint, reserve)).state,
          SiteCommandAckState.replayed,
        );
        expect((await reader.readDelta(_fingerprint, 0)).events, hasLength(1));

        for (final forged in [
          _releaseCommand('release-wrong-actor', reserve, actorId: 'other'),
          _releaseCommand('release-wrong-device', reserve, deviceId: 'other'),
          _releaseCommand(
            'release-wrong-subject',
            reserve,
            aggregateId: 'other',
          ),
          _releaseCommand(
            'release-wrong-workflow-capability',
            reserve,
            aggregateType: ConnectedStockWorkflowType.cafeOrder.name,
            commandType: shopCafeStockReleaseCommandType,
          ),
        ]) {
          await expectLater(
            handler.handle(_fingerprint, forged),
            throwsStateError,
          );
        }
        final release = _releaseCommand('adapter-release', reserve);
        final released = await handler.handle(_fingerprint, release);
        expect(released.state, SiteCommandAckState.accepted);
        expect(released.canonicalVersion, 2);
        expect((await reader.readDelta(_fingerprint, 1)).events, hasLength(1));
        expect(await database.readReservedStockQuantity('adapter-item'), 0);
        expect(
          (await database
                  .customSelect(
                    'SELECT COUNT(*) AS total FROM shop_site_commands',
                  )
                  .getSingle())
              .read<int>('total'),
          2,
        );
      } finally {
        await database.close();
        await root.delete(recursive: true);
      }
    },
  );

  test(
    'wrong workflow, changed replay and competing hold fail closed',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await _seed(database);
        final handler = ShopConnectedSiteDatabaseCommandHandler(
          database: database,
          timeAuthority: const _FixedTime(_now),
          connectedSiteEnabled: true,
        );
        await expectLater(
          handler.handle(
            _fingerprint,
            _reserveCommand(
              'wrong-workflow',
              cafe: true,
              forceRetailType: true,
            ),
          ),
          throwsStateError,
        );
        await expectLater(
          handler.handle(
            _fingerprint,
            _reserveCommand(
              'substituted-reservation-actor',
              reservationActorId: 'other-actor',
            ),
          ),
          throwsStateError,
        );
        final accepted = _reserveCommand('last-unit');
        expect(
          (await handler.handle(_fingerprint, accepted)).state,
          SiteCommandAckState.accepted,
        );
        final conflict = await handler.handle(
          _fingerprint,
          _reserveCommand('competing-unit'),
        );
        expect(conflict.state, SiteCommandAckState.conflict);
        expect(conflict.reason, 'stock_reservation_unavailable');
        await expectLater(
          handler.handle(
            _fingerprint,
            _reserveCommand('last-unit', quantity: 2),
          ),
          throwsStateError,
        );
        expect(await database.readReservedStockQuantity('adapter-item'), 1);
      } finally {
        await database.close();
      }
    },
  );

  test(
    'snapshot excludes unmanaged and foreign-site café projections',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await _seed(database);
        final store = ShopCafeOrderStore(
          database,
          clock: () => DateTime.fromMillisecondsSinceEpoch(_now, isUtc: true),
        );
        for (final entry in const [
          ('local-only-put', 'local-only-cafe-ticket', 'local-only-line'),
          ('foreign-site-put', 'foreign-site-cafe-ticket', 'foreign-site-line'),
        ]) {
          await store.applyCommand(
            CafeOrderCommand(
              id: entry.$1,
              ticketId: entry.$2,
              expectedVersion: 0,
              lines: [
                CafeOrderLine.local(
                  id: entry.$3,
                  productId: 'adapter-item',
                  quantity: 1,
                  baseUnitPriceMmk: 1000,
                  remark: '',
                  modifiers: const [],
                ),
              ],
            ),
            const {},
          );
        }
        await _seedForeignAcceptedCafeMarker(
          database,
          orderId: 'foreign-site-cafe-ticket',
        );
        await database.customStatement(
          'INSERT INTO shop_sync_outbox '
          '(operation_id, event_type, payload_json, state, created_at_millis) '
          "VALUES (?, ?, ?, 'pending', ?)",
          [
            'local-only-kitchen-status',
            cafeKitchenStatusEventType,
            canonicalConnectedSiteJson({
              'orderId': 'local-only-cafe-ticket',
              'lineId': 'local-only-line',
              'status': 'preparing_local',
            }),
            _now,
          ],
        );
        final snapshot = await ShopConnectedSiteDatabaseReplicationReader(
          database: database,
          workspaceId: _workspace,
          siteId: _site,
        ).readSnapshot(_fingerprint);
        expect(snapshot.projections['cafeOrders'], isEmpty);
        expect(
          canonicalConnectedSiteJson(snapshot.projections),
          isNot(contains('local-only-cafe-ticket')),
        );
        expect(
          canonicalConnectedSiteJson(snapshot.projections),
          isNot(contains('foreign-site-cafe-ticket')),
        );
      } finally {
        await database.close();
      }
    },
  );

  test('backup validator binds replica envelope scope and sequence', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    final root = await Directory.systemTemp.createTemp('replica-envelope-');
    addTearDown(() => root.delete(recursive: true));
    try {
      await _seed(database, openingStock: 2);
      final handler = ShopConnectedSiteDatabaseCommandHandler(
        database: database,
        timeAuthority: const _FixedTime(_now),
        connectedSiteEnabled: true,
      );
      await handler.handle(_fingerprint, _reserveCommand('envelope-one'));
      await handler.handle(_fingerprint, _reserveCommand('envelope-two'));
      final scopeTampered = File('${root.path}/scope.sqlite');
      final gapTampered = File('${root.path}/gap.sqlite');
      await database.exportVerifiedLocalSnapshot(scopeTampered);
      await scopeTampered.copy(gapTampered.path);
      var raw = sqlite.sqlite3.open(scopeTampered.path);
      try {
        raw.execute('DROP TRIGGER shop_site_replica_event_envelopes_no_update');
        raw.execute(
          "UPDATE shop_site_replica_event_envelopes SET tenant_id = 'foreign-workspace' "
          'WHERE replica_sequence = 1',
        );
      } finally {
        raw.close();
      }
      expect(
        () =>
            ShopBackup.verifySnapshot(scopeTampered, expectedSchemaVersion: 34),
        throwsFormatException,
      );
      raw = sqlite.sqlite3.open(gapTampered.path);
      try {
        raw.execute('DROP TRIGGER shop_site_replica_event_envelopes_no_delete');
        raw.execute(
          'DELETE FROM shop_site_replica_event_envelopes WHERE replica_sequence = 1',
        );
      } finally {
        raw.close();
      }
      expect(
        () => ShopBackup.verifySnapshot(gapTampered, expectedSchemaVersion: 34),
        throwsFormatException,
      );
    } finally {
      await database.close();
    }
  });

  test('connected cafe commands atomically project order kitchen state and cancellation', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _seed(database);
      final store = ShopCafeOrderStore(
        database,
        clock: () => DateTime.fromMillisecondsSinceEpoch(_now, isUtc: true),
        kitchenEntitlement: const _AllowKitchenEntitlement(),
      );
      final handler = ShopConnectedSiteDatabaseCommandHandler(
        database: database,
        timeAuthority: const _FixedTime(_now),
        cafeStore: store,
        connectedSiteEnabled: true,
      );
      final reader = ShopConnectedSiteDatabaseReplicationReader(
        database: database,
        workspaceId: _workspace,
        siteId: _site,
      );
      final initialSnapshot = await reader.readSnapshot(_fingerprint);
      expect(initialSnapshot.continuationCursor, 0);
      final reserve = _cafeReserveCommand('cafe-reserve');
      expect(
        (await handler.handle(_fingerprint, reserve)).state,
        SiteCommandAckState.accepted,
      );
      final reservationBinding = _cafeReservationBinding(reserve);
      final put = _cafePutCommand(
        'cafe-put',
        reservationBinding: reservationBinding,
      );
      final putAck = await handler.handle(_fingerprint, put);
      expect(putAck.state, SiteCommandAckState.accepted);
      expect(putAck.canonicalVersion, 2);
      var order = await store.read('connected-cafe-ticket');
      expect(order, isNotNull);
      expect(order!.state, 'open');
      expect(order.ticket.version, 1);
      expect(order.kitchenStatusByLine['connected-cafe-line'], 'pending_local');
      expect(await database.countSales(), 0);

      final state = _cafeStateCommand('cafe-hold', expectedVersion: 2);
      expect(
        (await handler.handle(_fingerprint, state)).state,
        SiteCommandAckState.accepted,
      );
      order = await store.read('connected-cafe-ticket');
      expect(order!.state, 'held');
      expect(order.stateRevision, 1);

      final kitchen = _cafeKitchenCommand('cafe-kitchen', expectedVersion: 3);
      expect(
        (await handler.handle(_fingerprint, kitchen)).state,
        SiteCommandAckState.accepted,
      );
      order = await store.read('connected-cafe-ticket');
      expect(
        order!.kitchenStatusByLine['connected-cafe-line'],
        'preparing_local',
      );

      final cancel = _cafeCancelCommand(
        'cafe-cancel',
        expectedVersion: 4,
        reservationBinding: reservationBinding,
      );
      expect(
        (await handler.handle(_fingerprint, cancel)).state,
        SiteCommandAckState.accepted,
      );
      order = await store.read('connected-cafe-ticket');
      expect(order!.state, 'cancelled');
      expect(
        order.kitchenStatusByLine['connected-cafe-line'],
        'preparing_local',
      );
      expect(await database.countSales(), 0);
      expect(
        (await database
                .customSelect(
                  'SELECT to_state FROM '
                  'shop_connected_stock_reservation_transitions '
                  'WHERE reservation_id = ?',
                  variables: [
                    Variable<String>(
                      reservationBinding['reservationId']! as String,
                    ),
                  ],
                )
                .getSingle())
            .read<String>('to_state'),
        'released',
      );
      final cancellationIntent = await database
          .customSelect(
            'SELECT state FROM shop_sync_outbox '
            "WHERE event_type = 'shop.cafe_order.cancelled.v1'",
          )
          .getSingle();
      expect(cancellationIntent.read<String>('state'), 'pending');
      final audit = await database
          .customSelect(
            'SELECT actor_id, action FROM shop_site_audit ORDER BY rowid',
          )
          .get();
      expect(audit.map((row) => row.read<String>('actor_id')).toSet(), {
        _actor,
      });
      expect(audit.map((row) => row.read<String>('action')).toList(), [
        'shop.connected_stock.reserve',
        'shop.cafe_order.put',
        'shop.cafe_order.state',
        'shop.cafe_kitchen.status',
        'shop.cafe_order.cancel',
      ]);
      for (final table in const [
        'shop_site_commands',
        'shop_site_events',
        'shop_site_command_acks',
        'shop_site_audit',
      ]) {
        expect(
          (await database
                  .customSelect('SELECT COUNT(*) AS total FROM $table')
                  .getSingle())
              .read<int>('total'),
          5,
          reason: table,
        );
      }
      expect(
        (await handler.handle(_fingerprint, cancel)).state,
        SiteCommandAckState.replayed,
      );
      final alteredCancelPayload = Map<String, Object?>.from(cancel.payload)
        ..['unexpected'] = true;
      await expectLater(
        handler.handle(
          _fingerprint,
          _cafeSiteCommand(
            id: cancel.commandId,
            expectedVersion: cancel.expectedVersion,
            commandType: cancel.commandType,
            payload: alteredCancelPayload,
          ),
        ),
        throwsStateError,
      );
      final changedReplayPayload = Map<String, Object?>.from(cancel.payload)
        ..['expectedStateRevision'] = 2;
      await expectLater(
        handler.handle(
          _fingerprint,
          _cafeSiteCommand(
            id: cancel.commandId,
            expectedVersion: cancel.expectedVersion,
            commandType: cancel.commandType,
            payload: changedReplayPayload,
          ),
        ),
        throwsStateError,
      );
      expect(await _siteCommandCount(database), 5);
      expect(await database.countSales(), 0);

      final conflict = await handler.handle(
        _fingerprint,
        _cafeStateCommand('replica-conflict', expectedVersion: 0),
      );
      expect(conflict.state, SiteCommandAckState.conflict);
      final delta = await reader.readDelta(
        _fingerprint,
        initialSnapshot.continuationCursor,
      );
      final finalSnapshot = await reader.readSnapshot(_fingerprint);
      expect(delta.nextCursor, finalSnapshot.continuationCursor);
      expect(delta.events, hasLength(6));
      final lastEvent = (delta.events.last['event']! as Map)
          .cast<String, Object?>();
      final lastPayload = (lastEvent['payload']! as Map)
          .cast<String, Object?>();
      expect(
        canonicalConnectedSiteJson(lastPayload['projections']),
        canonicalConnectedSiteJson(finalSnapshot.projections),
      );
      final projections = (lastPayload['projections']! as Map)
          .cast<String, Object?>();
      expect(projections['cafeOrders'], isNotEmpty);
      expect(projections['stockReservations'], isNotEmpty);
      expect(projections['conflicts'], isNotEmpty);
    } finally {
      await database.close();
    }
  });

  test('lost cafe cancellation reply replays after restart without a second release', () async {
    final root = await Directory.systemTemp.createTemp('cafe-cancel-restart-');
    final file = File('${root.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    try {
      await _seed(database);
      var store = ShopCafeOrderStore(
        database,
        clock: () => DateTime.fromMillisecondsSinceEpoch(_now, isUtc: true),
        kitchenEntitlement: const _AllowKitchenEntitlement(),
      );
      var handler = ShopConnectedSiteDatabaseCommandHandler(
        database: database,
        timeAuthority: const _FixedTime(_now),
        cafeStore: store,
        connectedSiteEnabled: true,
      );
      final reserve = _cafeReserveCommand('restart-reserve');
      await handler.handle(_fingerprint, reserve);
      final reservationBinding = _cafeReservationBinding(reserve);
      await handler.handle(
        _fingerprint,
        _cafePutCommand('restart-put', reservationBinding: reservationBinding),
      );
      final cancel = _cafeCancelCommand(
        'restart-cancel',
        expectedVersion: 2,
        expectedStateRevision: 0,
        reservationBinding: reservationBinding,
      );
      expect(
        (await handler.handle(_fingerprint, cancel)).state,
        SiteCommandAckState.accepted,
      );
      await database.close();

      database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      store = ShopCafeOrderStore(database);
      handler = ShopConnectedSiteDatabaseCommandHandler(
        database: database,
        timeAuthority: const _FixedTime(_now),
        cafeStore: store,
        connectedSiteEnabled: true,
      );
      expect(
        (await handler.handle(_fingerprint, cancel)).state,
        SiteCommandAckState.replayed,
      );
      expect((await store.read('connected-cafe-ticket'))!.state, 'cancelled');
      expect(
        (await database
                .customSelect(
                  'SELECT COUNT(*) AS total FROM '
                  'shop_connected_stock_reservation_transitions '
                  'WHERE reservation_id = ?',
                  variables: [
                    Variable<String>(
                      reservationBinding['reservationId']! as String,
                    ),
                  ],
                )
                .getSingle())
            .read<int>('total'),
        1,
      );
      expect(await database.countSales(), 0);
    } finally {
      await database.close();
      if (await root.exists()) await root.delete(recursive: true);
    }
  });

  test('cafe state version conflict is durable and replayable', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _seed(database);
      final store = ShopCafeOrderStore(
        database,
        clock: () => DateTime.fromMillisecondsSinceEpoch(_now, isUtc: true),
        kitchenEntitlement: const _AllowKitchenEntitlement(),
      );
      final handler = ShopConnectedSiteDatabaseCommandHandler(
        database: database,
        timeAuthority: const _FixedTime(_now),
        cafeStore: store,
        connectedSiteEnabled: true,
      );
      final reserve = _cafeReserveCommand('version-reserve');
      await handler.handle(_fingerprint, reserve);
      await handler.handle(
        _fingerprint,
        _cafePutCommand(
          'version-put',
          reservationBinding: _cafeReservationBinding(reserve),
        ),
      );
      final conflictCommand = _cafeStateCommand(
        'version-state-conflict',
        expectedVersion: 2,
        expectedStateRevision: 9,
      );
      final first = await handler.handle(_fingerprint, conflictCommand);
      final replay = await handler.handle(_fingerprint, conflictCommand);
      expect(first.state, SiteCommandAckState.conflict);
      expect(first.reason, 'cafe_order_state_version_conflict');
      expect(replay.state, SiteCommandAckState.conflict);
      expect(replay.reason, first.reason);
      expect(replay.canonicalVersion, 2);
      expect((await store.read('connected-cafe-ticket'))!.state, 'open');
      expect(
        (await database
                .customSelect(
                  'SELECT COUNT(*) AS total FROM shop_site_conflicts '
                  "WHERE state = 'pending' AND reason_code = ?",
                  variables: [
                    const Variable<String>('cafe_order_state_version_conflict'),
                  ],
                )
                .getSingle())
            .read<int>('total'),
        1,
      );
      expect(await database.countSales(), 0);
    } finally {
      await database.close();
    }
  });

  test(
    'repriced cafe product records a durable conflict and replays after reopen',
    () async {
      final root = await Directory.systemTemp.createTemp(
        'cafe-product-conflict-',
      );
      final file = File('${root.path}/shop.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      try {
        await _seed(database);
        var store = ShopCafeOrderStore(
          database,
          clock: () => DateTime.fromMillisecondsSinceEpoch(_now, isUtc: true),
          kitchenEntitlement: const _AllowKitchenEntitlement(),
        );
        var handler = ShopConnectedSiteDatabaseCommandHandler(
          database: database,
          timeAuthority: const _FixedTime(_now),
          cafeStore: store,
          connectedSiteEnabled: true,
        );
        final reserve = _cafeReserveCommand('repriced-reserve');
        await handler.handle(_fingerprint, reserve);
        await database.customUpdate(
          'UPDATE shop_products SET price_mmk = 1100 WHERE id = ?',
          variables: [const Variable<String>('adapter-item')],
        );
        final put = _cafePutCommand(
          'repriced-put',
          reservationBinding: _cafeReservationBinding(reserve),
        );
        final first = await handler.handle(_fingerprint, put);
        expect(first.state, SiteCommandAckState.conflict);
        expect(first.reason, 'cafe_product_repriced');
        expect(await store.read('connected-cafe-ticket'), isNull);
        expect(await database.countSales(), 0);
        await database.close();

        database = ShopDatabase(NativeDatabase(file));
        await database.verifyReadyForUse();
        store = ShopCafeOrderStore(database);
        handler = ShopConnectedSiteDatabaseCommandHandler(
          database: database,
          timeAuthority: const _FixedTime(_now),
          cafeStore: store,
          connectedSiteEnabled: true,
        );
        final replay = await handler.handle(_fingerprint, put);
        expect(replay.state, SiteCommandAckState.conflict);
        expect(replay.reason, 'cafe_product_repriced');
        expect(
          (await database
                  .customSelect(
                    'SELECT COUNT(*) AS total FROM shop_site_conflicts '
                    "WHERE reason_code = 'cafe_product_repriced'",
                  )
                  .getSingle())
              .read<int>('total'),
          1,
        );
        expect(await store.read('connected-cafe-ticket'), isNull);
        expect(await database.readReservedStockQuantity('adapter-item'), 1);
        expect(await database.countSales(), 0);
      } finally {
        await database.close();
        if (await root.exists()) await root.delete(recursive: true);
      }
    },
  );

  test(
    'archived cafe product records a terminal conflict without projection',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await _seed(database);
        final store = ShopCafeOrderStore(
          database,
          clock: () => DateTime.fromMillisecondsSinceEpoch(_now, isUtc: true),
          kitchenEntitlement: const _AllowKitchenEntitlement(),
        );
        final handler = ShopConnectedSiteDatabaseCommandHandler(
          database: database,
          timeAuthority: const _FixedTime(_now),
          cafeStore: store,
          connectedSiteEnabled: true,
        );
        final reserve = _cafeReserveCommand('archived-reserve');
        await handler.handle(_fingerprint, reserve);
        await database.customUpdate(
          'UPDATE shop_products SET archived = 1 WHERE id = ?',
          variables: [const Variable<String>('adapter-item')],
        );
        final put = _cafePutCommand(
          'archived-put',
          reservationBinding: _cafeReservationBinding(reserve),
        );
        final first = await handler.handle(_fingerprint, put);
        final replay = await handler.handle(_fingerprint, put);
        expect(first.state, SiteCommandAckState.conflict);
        expect(first.reason, 'cafe_product_archived');
        expect(replay.state, SiteCommandAckState.conflict);
        expect(replay.reason, first.reason);
        expect(await store.read('connected-cafe-ticket'), isNull);
        expect(await database.readReservedStockQuantity('adapter-item'), 1);
        expect(await database.countSales(), 0);
      } finally {
        await database.close();
      }
    },
  );

  test('legacy cafe route conflict is quarantined without a partial update', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _seed(database);
      final store = ShopCafeOrderStore(
        database,
        clock: () => DateTime.fromMillisecondsSinceEpoch(_now, isUtc: true),
        kitchenEntitlement: const _AllowKitchenEntitlement(),
      );
      final handler = ShopConnectedSiteDatabaseCommandHandler(
        database: database,
        timeAuthority: const _FixedTime(_now),
        cafeStore: store,
        connectedSiteEnabled: true,
      );
      final reserve = _cafeReserveCommand('route-reserve');
      final binding = _cafeReservationBinding(reserve);
      await handler.handle(_fingerprint, reserve);
      await handler.handle(
        _fingerprint,
        _cafePutCommand('route-put', reservationBinding: binding),
      );
      final conflictingTicket = applyCafeOrderCommand(
        null,
        CafeOrderCommand(
          id: 'conflicting-route-command',
          ticketId: 'connected-cafe-ticket',
          expectedVersion: 0,
          lines: [
            CafeOrderLine(
              id: 'connected-cafe-line',
              productId: 'adapter-item',
              productName: 'Adapter item',
              quantity: 1,
              baseUnitPriceMmk: 1000,
              remark: '',
              modifiers: const [],
              preparationStation: 'bar',
            ),
          ],
        ),
        const {},
      );
      final conflictingPayload = cafeKitchenDispatchPayload(conflictingTicket, [
        CafeKitchenDispatchLine(
          lineId: 'connected-cafe-line',
          ticketId: cafeKitchenTicketId(
            'connected-cafe-ticket',
            'connected-cafe-line',
          ),
          sequence: 1,
          preparationStation: 'bar',
        ),
      ], 1);
      await database.customInsert(
        'INSERT INTO shop_sync_outbox '
        '(operation_id, event_type, payload_json, state, created_at_millis) '
        "VALUES (?, 'shop.cafe_kitchen_dispatch.recorded.v1', ?, 'pending', ?)",
        variables: [
          const Variable<String>('conflicting-route-history'),
          Variable<String>(jsonEncode(conflictingPayload)),
          const Variable<int>(_now),
        ],
      );
      final update = _cafePutCommand(
        'route-update',
        expectedVersion: 2,
        ticketExpectedVersion: 1,
        remark: 'safe update',
        reservationBinding: binding,
      );
      final first = await handler.handle(_fingerprint, update);
      final replay = await handler.handle(_fingerprint, update);
      expect(first.state, SiteCommandAckState.conflict);
      expect(first.reason, 'cafe_kitchen_route_conflict');
      expect(replay.state, SiteCommandAckState.conflict);
      expect(replay.reason, first.reason);
      final order = await database
          .customSelect(
            'SELECT ticket_version, ticket_json FROM shop_cafe_orders WHERE id = ?',
            variables: [const Variable<String>('connected-cafe-ticket')],
          )
          .getSingle();
      expect(order.read<int>('ticket_version'), 1);
      expect(
        CafeOrderTicket.fromJson(jsonDecode(order.read<String>('ticket_json')))
            .lines
            .single
            .remark,
        isEmpty,
      );
      expect(await database.countSales(), 0);
    } finally {
      await database.close();
    }
  });

  test(
    'cafe reservation acknowledgement and basket digests fail closed',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await _seed(database);
        final store = ShopCafeOrderStore(
          database,
          clock: () => DateTime.fromMillisecondsSinceEpoch(_now, isUtc: true),
          kitchenEntitlement: const _AllowKitchenEntitlement(),
        );
        final handler = ShopConnectedSiteDatabaseCommandHandler(
          database: database,
          timeAuthority: const _FixedTime(_now),
          cafeStore: store,
          connectedSiteEnabled: true,
        );
        final reserve = _cafeReserveCommand('digest-reserve');
        await handler.handle(_fingerprint, reserve);
        final wrongAck = Map<String, Object?>.from(
          _cafeReservationBinding(reserve),
        )..['reservationAckDigest'] = _digest('altered-reservation-ack');
        final ackConflict = await handler.handle(
          _fingerprint,
          _cafePutCommand('digest-ack-put', reservationBinding: wrongAck),
        );
        expect(ackConflict.state, SiteCommandAckState.conflict);
        expect(ackConflict.reason, 'reservation_not_acknowledged');

        final wrongBasket = Map<String, Object?>.from(
          _cafeReservationBinding(reserve),
        )..['basketDigest'] = _digest('altered-reservation-basket');
        await expectLater(
          handler.handle(
            _fingerprint,
            _cafePutCommand(
              'digest-basket-put',
              reservationBinding: wrongBasket,
            ),
          ),
          throwsStateError,
        );
        expect(await _siteCommandCount(database), 2);
        expect(await store.read('connected-cafe-ticket'), isNull);
        expect(await database.readReservedStockQuantity('adapter-item'), 1);
        expect(await database.countSales(), 0);
      } finally {
        await database.close();
      }
    },
  );

  test(
    'cafe cancellation cannot substitute a later reservation binding',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await _seed(database, openingStock: 2);
        final store = ShopCafeOrderStore(
          database,
          clock: () => DateTime.fromMillisecondsSinceEpoch(_now, isUtc: true),
          kitchenEntitlement: const _AllowKitchenEntitlement(),
        );
        final handler = ShopConnectedSiteDatabaseCommandHandler(
          database: database,
          timeAuthority: const _FixedTime(_now),
          cafeStore: store,
          connectedSiteEnabled: true,
        );
        final firstReserve = _cafeReserveCommand('cancel-first-reserve');
        await handler.handle(_fingerprint, firstReserve);
        await handler.handle(
          _fingerprint,
          _cafePutCommand(
            'cancel-bound-put',
            reservationBinding: _cafeReservationBinding(firstReserve),
          ),
        );
        final laterReserve = _cafeReserveCommand(
          'cancel-later-reserve',
          expectedVersion: 2,
        );
        expect(
          (await handler.handle(_fingerprint, laterReserve)).state,
          SiteCommandAckState.accepted,
        );
        final cancel = _cafeCancelCommand(
          'cancel-substituted-binding',
          expectedVersion: 3,
          expectedStateRevision: 0,
          reservationBinding: _cafeReservationBinding(laterReserve),
        );
        final conflict = await handler.handle(_fingerprint, cancel);
        expect(conflict.state, SiteCommandAckState.conflict);
        expect(conflict.reason, 'reservation_order_binding_mismatch');
        expect((await store.read('connected-cafe-ticket'))!.state, 'open');
        expect(await database.readReservedStockQuantity('adapter-item'), 2);
        expect(await database.countSales(), 0);
      } finally {
        await database.close();
      }
    },
  );

  test('accepted put authority cannot authorize another cafe action', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _seed(database);
      final store = ShopCafeOrderStore(
        database,
        clock: () => DateTime.fromMillisecondsSinceEpoch(_now, isUtc: true),
        kitchenEntitlement: const _AllowKitchenEntitlement(),
      );
      final handler = ShopConnectedSiteDatabaseCommandHandler(
        database: database,
        timeAuthority: const _FixedTime(_now),
        cafeStore: store,
        connectedSiteEnabled: true,
      );
      final reserve = _cafeReserveCommand('action-reserve');
      await handler.handle(_fingerprint, reserve);
      final put = _cafePutCommand(
        'action-put',
        reservationBinding: _cafeReservationBinding(reserve),
      );
      await handler.handle(_fingerprint, put);
      await expectLater(
        store.transitionConnected(
          orderId: 'connected-cafe-ticket',
          operationId: put.commandId,
          expectedStateRevision: 0,
          fromState: 'open',
          toState: 'held',
          context: ShopConnectedCafeProjectionContext(
            commandId: put.commandId,
            tenantId: _workspace,
            siteId: _site,
            actorId: _actor,
            deviceId: _device,
            aggregateId: 'connected-cafe-ticket',
            capability: ShopStaffCapability.cafeOrderWrite,
            commandType: shopCafeOrderStateCommandType,
            eventType: 'shop.cafe_order.state.v1',
            auditAction: 'shop.cafe_order.state',
            commandDigest: put.commandDigest,
          ),
        ),
        throwsStateError,
      );
      final order = await store.read('connected-cafe-ticket');
      expect(order!.state, 'open');
      expect(order.stateRevision, 0);
      expect(await database.countSales(), 0);
    } finally {
      await database.close();
    }
  });

  test(
    'unexpected cafe projector error rolls back without conflict evidence',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await _seed(database);
        final store = _ExplodingCafeStore(database);
        final handler = ShopConnectedSiteDatabaseCommandHandler(
          database: database,
          timeAuthority: const _FixedTime(_now),
          cafeStore: store,
          connectedSiteEnabled: true,
        );
        final reserve = _cafeReserveCommand('explode-reserve');
        await handler.handle(_fingerprint, reserve);
        await expectLater(
          handler.handle(
            _fingerprint,
            _cafePutCommand(
              'explode-put',
              reservationBinding: _cafeReservationBinding(reserve),
            ),
          ),
          throwsStateError,
        );
        expect(await _siteCommandCount(database), 1);
        expect(
          (await database
                  .customSelect(
                    'SELECT COUNT(*) AS total FROM shop_site_conflicts',
                  )
                  .getSingle())
              .read<int>('total'),
          0,
        );
        expect(await store.read('connected-cafe-ticket'), isNull);
        expect(await database.countSales(), 0);
      } finally {
        await database.close();
      }
    },
  );

  test(
    'started-line conflict is quarantined without partial projection effects',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await _seed(database);
        final store = ShopCafeOrderStore(
          database,
          clock: () => DateTime.fromMillisecondsSinceEpoch(_now, isUtc: true),
          kitchenEntitlement: const _AllowKitchenEntitlement(),
        );
        final handler = ShopConnectedSiteDatabaseCommandHandler(
          database: database,
          timeAuthority: const _FixedTime(_now),
          cafeStore: store,
          connectedSiteEnabled: true,
        );
        final reserve = _cafeReserveCommand('rollback-reserve');
        await handler.handle(_fingerprint, reserve);
        final reservationBinding = _cafeReservationBinding(reserve);
        await handler.handle(
          _fingerprint,
          _cafePutCommand(
            'rollback-put',
            reservationBinding: reservationBinding,
          ),
        );
        await handler.handle(
          _fingerprint,
          _cafeKitchenCommand('rollback-kitchen', expectedVersion: 2),
        );
        final beforeCommands = await _siteCommandCount(database);
        final beforeEvents =
            (await database
                    .customSelect(
                      'SELECT COUNT(*) AS total FROM shop_site_events',
                    )
                    .getSingle())
                .read<int>('total');
        final startedLineConflict = _cafePutCommand(
          'rollback-change',
          expectedVersion: 3,
          ticketExpectedVersion: 1,
          remark: 'changed after preparation',
          reservationBinding: reservationBinding,
        );
        await expectLater(
          handler.handle(_fingerprint, startedLineConflict),
          completion(
            isA<SiteCommandAckV1>()
                .having(
                  (ack) => ack.state,
                  'state',
                  SiteCommandAckState.conflict,
                )
                .having(
                  (ack) => ack.reason,
                  'reason',
                  'cafe_started_line_immutable',
                ),
          ),
        );
        final replay = await handler.handle(_fingerprint, startedLineConflict);
        expect(replay.state, SiteCommandAckState.conflict);
        expect(replay.reason, 'cafe_started_line_immutable');
        expect(await _siteCommandCount(database), beforeCommands + 1);
        expect(
          (await database
                  .customSelect(
                    'SELECT COUNT(*) AS total FROM shop_site_conflicts '
                    "WHERE reason_code = 'cafe_started_line_immutable' "
                    "AND state = 'pending'",
                  )
                  .getSingle())
              .read<int>('total'),
          1,
        );
        expect(
          (await database
                  .customSelect(
                    'SELECT COUNT(*) AS total FROM shop_site_events',
                  )
                  .getSingle())
              .read<int>('total'),
          beforeEvents,
        );
        final order = await store.read('connected-cafe-ticket');
        expect(order!.ticket.lines.single.quantity, 1);
        expect(
          order.kitchenStatusByLine['connected-cafe-line'],
          'preparing_local',
        );
        expect(await database.countSales(), 0);
      } finally {
        await database.close();
      }
    },
  );

  test('connected kitchen command requires its lease capability', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _seed(database, includeKitchenCapability: false);
      final store = ShopCafeOrderStore(
        database,
        clock: () => DateTime.fromMillisecondsSinceEpoch(_now, isUtc: true),
        kitchenEntitlement: const _AllowKitchenEntitlement(),
      );
      final handler = ShopConnectedSiteDatabaseCommandHandler(
        database: database,
        timeAuthority: const _FixedTime(_now),
        cafeStore: store,
        connectedSiteEnabled: true,
      );
      final limitedLeaseDigest = _adapterLease(const [
        'cafeOrderWrite',
        'counterSale',
      ]).payloadDigest;
      final reserve = _cafeReserveCommand(
        'capability-reserve',
        leaseDigest: limitedLeaseDigest,
      );
      await handler.handle(_fingerprint, reserve);
      await handler.handle(
        _fingerprint,
        _cafePutCommand(
          'capability-put',
          reservationBinding: _cafeReservationBinding(reserve),
          leaseDigest: limitedLeaseDigest,
        ),
      );
      await expectLater(
        handler.handle(
          _fingerprint,
          _cafeKitchenCommand(
            'capability-kitchen',
            expectedVersion: 2,
            leaseDigest: limitedLeaseDigest,
          ),
        ),
        throwsStateError,
      );
      expect(await _siteCommandCount(database), 2);
      expect(await database.countSales(), 0);
    } finally {
      await database.close();
    }
  });

  test('connected order modifiers require an independent catalog', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _seed(database);
      const modifier = CafeModifierSnapshot(
        id: 'invented',
        version: 1,
        labelEn: 'Invented',
        labelMy: 'မရှိပါ',
        priceDeltaMmk: 500,
      );
      final store = ShopCafeOrderStore(
        database,
        clock: () => DateTime.fromMillisecondsSinceEpoch(_now, isUtc: true),
        kitchenEntitlement: const _AllowKitchenEntitlement(),
      );
      final handler = ShopConnectedSiteDatabaseCommandHandler(
        database: database,
        timeAuthority: const _FixedTime(_now),
        cafeStore: store,
        connectedSiteEnabled: true,
      );
      final reserve = _cafeReserveCommand('modifier-reserve');
      await handler.handle(_fingerprint, reserve);
      final reservationBinding = _cafeReservationBinding(reserve);
      final untrusted = await handler.handle(
        _fingerprint,
        _cafePutCommand(
          'untrusted-modifier',
          modifiers: const [modifier],
          reservationBinding: reservationBinding,
        ),
      );
      expect(untrusted.state, SiteCommandAckState.conflict);
      expect(untrusted.reason, 'cafe_order_version_or_payload_conflict');
      expect(await _siteCommandCount(database), 2);
      expect(await store.read('connected-cafe-ticket'), isNull);
      expect(await database.countSales(), 0);
      final catalogBoundHandler = ShopConnectedSiteDatabaseCommandHandler(
        database: database,
        timeAuthority: const _FixedTime(_now),
        cafeStore: store,
        cafeModifierCatalog: const {'invented@1': modifier},
        connectedSiteEnabled: true,
      );
      expect(
        (await catalogBoundHandler.handle(
          _fingerprint,
          _cafePutCommand(
            'catalog-modifier',
            modifiers: const [modifier],
            reservationBinding: reservationBinding,
          ),
        )).state,
        SiteCommandAckState.accepted,
      );
      expect(
        (await store.read('connected-cafe-ticket'))!
            .ticket
            .lines
            .single
            .modifiers
            .single,
        isA<CafeModifierSnapshot>()
            .having((value) => value.key, 'key', modifier.key)
            .having(
              (value) => value.priceDeltaMmk,
              'priceDeltaMmk',
              modifier.priceDeltaMmk,
            ),
      );
      expect(await database.countSales(), 0);
    } finally {
      await database.close();
    }
  });

  test(
    'real signed coordinator requests authorize before database mutation',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        final keyPair = await Ed25519().newKeyPairFromSeed(
          List<int>.generate(32, (index) => index + 1),
        );
        final publicKey = await keyPair.extractPublicKey();
        final clientFingerprint = sha256.convert(publicKey.bytes).toString();
        await _seed(database, clientFingerprint: clientFingerprint);
        final clientKeys = _AdapterClientKeyStore(
          publicKey: publicKey,
          fingerprint: clientFingerprint,
        );
        final enrollment = _AdapterEnrollmentAuthorizer();
        final authorization = _AdapterSiteAuthorizer();
        final coordinator = SiteCoordinatorServer(
          runtimeEnabled: true,
          pairing: const _AdapterPairingNonceStore(),
          requestAuthenticator: Ed25519CoordinatorRequestAuthenticator(
            clients: clientKeys,
            nonces: _AdapterRequestNonceStore(),
            now: () => DateTime.fromMillisecondsSinceEpoch(_now, isUtc: true),
          ),
          commands: ShopConnectedSiteDatabaseCommandHandler(
            database: database,
            timeAuthority: const _FixedTime(_now),
            connectedSiteEnabled: true,
          ),
          commandSignatureVerifier: Ed25519SiteCommandSignatureVerifier(
            clients: clientKeys,
            coordinatorDeviceId: 'adapter-counter',
          ),
          deviceEnrollment: enrollment,
          siteAuthorization: authorization,
          commandCapabilities:
              const ShopConnectedSiteDatabaseCapabilityResolver(),
          replication: ShopConnectedSiteDatabaseReplicationReader(
            database: database,
            workspaceId: _workspace,
            siteId: _site,
          ),
          health: const _AdapterHealthProvider(),
          pairingResponse: _adapterPairing(),
          now: () => DateTime.fromMillisecondsSinceEpoch(_now, isUtc: true),
        );
        final reserve = await _signCommand(
          _reserveCommand('coordinator-reserve'),
          keyPair,
        );

        enrollment.state = CoordinatorDeviceEnrollmentState.pending;
        final pending = await coordinator.dispatch(
          await _signedAdapterJsonRequest(
            'POST',
            connectedSiteCommandsPath,
            reserve.toJson(),
            nonce: 'request_nonce_adapter_pending_01',
            fingerprint: clientFingerprint,
            keyPair: keyPair,
          ),
        );
        expect(pending.statusCode, HttpStatus.forbidden);
        expect(pending.body['error'], 'client_not_authorized');
        await _expectNoConnectedMutation(database);
        expect(authorization.calls, 0);

        enrollment.state = CoordinatorDeviceEnrollmentState.revoked;
        final revoked = await coordinator.dispatch(
          await _signedAdapterJsonRequest(
            'POST',
            connectedSiteCommandsPath,
            reserve.toJson(),
            nonce: 'request_nonce_adapter_revoked_01',
            fingerprint: clientFingerprint,
            keyPair: keyPair,
          ),
        );
        expect(revoked.statusCode, HttpStatus.forbidden);
        expect(revoked.body['error'], 'client_not_authorized');
        await _expectNoConnectedMutation(database);
        expect(authorization.calls, 0);

        enrollment.state = CoordinatorDeviceEnrollmentState.approved;
        authorization.allowed = false;
        final unauthorized = await coordinator.dispatch(
          await _signedAdapterJsonRequest(
            'POST',
            connectedSiteCommandsPath,
            reserve.toJson(),
            nonce: 'request_nonce_adapter_denied_01',
            fingerprint: clientFingerprint,
            keyPair: keyPair,
          ),
        );
        expect(unauthorized.statusCode, HttpStatus.forbidden);
        expect(unauthorized.body['error'], 'site_authorization_denied');
        await _expectNoConnectedMutation(database);
        expect(authorization.calls, 1);

        authorization.allowed = true;
        final acceptedRequest = await _signedAdapterJsonRequest(
          'POST',
          connectedSiteCommandsPath,
          reserve.toJson(),
          nonce: 'request_nonce_adapter_accepted_01',
          fingerprint: clientFingerprint,
          keyPair: keyPair,
        );
        final accepted = await coordinator.dispatch(acceptedRequest);
        expect(accepted.statusCode, HttpStatus.ok);
        expect(accepted.body['state'], SiteCommandAckState.accepted.name);
        expect(await _siteCommandCount(database), 1);
        expect(await database.readReservedStockQuantity('adapter-item'), 1);

        final requestReplay = await coordinator.dispatch(acceptedRequest);
        expect(requestReplay.statusCode, HttpStatus.forbidden);
        expect(requestReplay.body['error'], 'client_not_authorized');
        expect(await _siteCommandCount(database), 1);

        final replayed = await coordinator.dispatch(
          await _signedAdapterJsonRequest(
            'POST',
            connectedSiteCommandsPath,
            reserve.toJson(),
            nonce: 'request_nonce_adapter_replay_01',
            fingerprint: clientFingerprint,
            keyPair: keyPair,
          ),
        );
        expect(replayed.statusCode, HttpStatus.ok);
        expect(replayed.body['state'], SiteCommandAckState.replayed.name);
        expect(await _siteCommandCount(database), 1);

        final altered = await _signCommand(
          _reserveCommand('coordinator-reserve', quantity: 2),
          keyPair,
        );
        final alteredReplay = await coordinator.dispatch(
          await _signedAdapterJsonRequest(
            'POST',
            connectedSiteCommandsPath,
            altered.toJson(),
            nonce: 'request_nonce_adapter_altered_01',
            fingerprint: clientFingerprint,
            keyPair: keyPair,
          ),
        );
        expect(alteredReplay.statusCode, HttpStatus.internalServerError);
        expect(alteredReplay.body['error'], 'coordinator_failure');
        expect(await _siteCommandCount(database), 1);
        expect(await database.readReservedStockQuantity('adapter-item'), 1);

        final delta = await coordinator.dispatch(
          await _signedAdapterRequest(
            'GET',
            '$connectedSiteDeltaPath?after=0',
            nonce: 'request_nonce_adapter_delta_01',
            fingerprint: clientFingerprint,
            keyPair: keyPair,
          ),
        );
        expect(delta.statusCode, HttpStatus.ok);
        expect(delta.body['siteId'], _site);
        expect(delta.body['nextCursor'], 1);
        expect(delta.body['events'], hasLength(1));

        final snapshot = await coordinator.dispatch(
          await _signedAdapterRequest(
            'GET',
            connectedSiteSnapshotPath,
            nonce: 'request_nonce_adapter_snapshot_01',
            fingerprint: clientFingerprint,
            keyPair: keyPair,
          ),
        );
        expect(snapshot.statusCode, HttpStatus.ok);
        expect(snapshot.body['siteId'], _site);
        expect(snapshot.body['continuationCursor'], 1);
      } finally {
        await database.close();
      }
    },
  );
}

Future<int> _siteCommandCount(ShopDatabase database) async =>
    (await database
            .customSelect('SELECT COUNT(*) AS total FROM shop_site_commands')
            .getSingle())
        .read<int>('total');

Future<void> _expectNoConnectedMutation(ShopDatabase database) async {
  for (final table in const [
    'shop_site_commands',
    'shop_site_events',
    'shop_site_command_acks',
    'shop_site_audit',
    'shop_site_aggregate_versions',
    'shop_connected_stock_reservation_headers',
    'shop_connected_stock_reservation_lines',
    'shop_connected_stock_reservation_transitions',
    'shop_connected_trusted_time',
    'shop_site_cloud_proofs',
  ]) {
    final count =
        (await database
                .customSelect('SELECT COUNT(*) AS total FROM $table')
                .getSingle())
            .read<int>('total');
    expect(count, 0, reason: table);
  }
  expect(await database.readReservedStockQuantity('adapter-item'), 0);
}

Future<void> _seedForeignAcceptedCafeMarker(
  ShopDatabase database, {
  required String orderId,
}) async {
  const foreignSite = 'site-foreign';
  const foreignDevice = 'device-foreign';
  const foreignActor = 'actor-foreign';
  final fingerprint = _digest('foreign-device-key');
  final leaseDigest = _digest('foreign-lease');
  await database.customStatement(
    'INSERT INTO shop_site_devices (device_id, tenant_id, site_id, '
    'public_key_fingerprint, session_generation, state, enrolled_at_millis) '
    "VALUES (?, ?, ?, ?, 1, 'active', ?)",
    [foreignDevice, _workspace, foreignSite, fingerprint, _now - 1000],
  );
  await database.customStatement(
    'INSERT INTO shop_site_revocation_observations '
    '(tenant_id, site_id, generation, observed_at_millis, source_digest) '
    'VALUES (?, ?, 1, ?, ?)',
    [_workspace, foreignSite, _now - 1000, _digest('foreign-revocation')],
  );
  await database.customStatement(
    'INSERT INTO shop_site_offline_leases '
    '(lease_id, tenant_id, site_id, actor_id, actor_role, capabilities_json, '
    'device_id, session_generation, revocation_generation, issued_at_millis, '
    'expires_at_millis, key_id, payload_digest, signature) '
    "VALUES (?, ?, ?, ?, 'cafeWaiter', ?, ?, 1, 1, ?, ?, 'foreign-key', ?, ?)",
    [
      'foreign-lease',
      _workspace,
      foreignSite,
      foreignActor,
      jsonEncode(['cafeOrderWrite']),
      foreignDevice,
      _now - 1000,
      _now + 60000,
      leaseDigest,
      List.filled(64, 's').join(),
    ],
  );
  final payload = <String, Object?>{'contract': 'foreign-cafe-marker.v1'};
  final event = <String, Object?>{
    'eventId': 'foreign-cafe-event',
    'workspaceId': _workspace,
    'siteId': foreignSite,
    'aggregateType': 'cafeOrder',
    'aggregateId': orderId,
    'aggregateVersion': 1,
    'eventType': 'shop.cafe_order.put.v1',
    'occurredAt': DateTime.fromMillisecondsSinceEpoch(
      _now,
      isUtc: true,
    ).toIso8601String(),
    'payload': payload,
  };
  await database.transaction(() async {
    await database.customStatement(
      'INSERT INTO shop_site_commands '
      '(command_id, tenant_id, site_id, actor_id, device_id, aggregate_id, '
      'aggregate_type, capability, expected_version, payload_digest, lease_digest, '
      "command_digest, state, received_at_millis) VALUES (?, ?, ?, ?, ?, ?, 'cafeOrder', "
      "'cafeOrderWrite', 0, ?, ?, ?, 'accepted', ?)",
      [
        'foreign-cafe-command',
        _workspace,
        foreignSite,
        foreignActor,
        foreignDevice,
        orderId,
        connectedSiteSha256(payload),
        leaseDigest,
        _digest('foreign-command'),
        _now,
      ],
    );
    final eventRowId = await database.customInsert(
      'INSERT INTO shop_site_events '
      '(site_sequence, event_id, command_id, tenant_id, site_id, aggregate_type, '
      'aggregate_id, aggregate_version, event_type, payload_json, event_digest, created_at_millis) '
      "VALUES (1, ?, 'foreign-cafe-command', ?, ?, 'cafeOrder', ?, 1, "
      "'shop.cafe_order.put.v1', ?, ?, ?)",
      variables: [
        const Variable('foreign-cafe-event'),
        const Variable(_workspace),
        const Variable(foreignSite),
        Variable(orderId),
        Variable(canonicalConnectedSiteJson(payload)),
        Variable(connectedSiteSha256(event)),
        const Variable(_now),
      ],
    );
    await database.customStatement(
      'INSERT INTO shop_site_aggregate_versions '
      '(tenant_id, site_id, aggregate_type, aggregate_id, version, last_event_row_id, '
      "last_site_sequence, updated_at_millis) VALUES (?, ?, 'cafeOrder', ?, 1, ?, 1, ?)",
      [_workspace, foreignSite, orderId, eventRowId, _now],
    );
    await database.customStatement(
      'INSERT INTO shop_site_command_acks '
      '(command_id, status, event_row_id, site_sequence, canonical_version, ack_digest, created_at_millis) '
      "VALUES ('foreign-cafe-command', 'accepted', ?, 1, 1, ?, ?)",
      [eventRowId, _digest('foreign-ack'), _now],
    );
    await database.customStatement(
      'INSERT INTO shop_site_audit '
      '(audit_id, command_id, actor_id, action, metadata_digest, created_at_millis) '
      "VALUES ('foreign-cafe-audit', 'foreign-cafe-command', ?, 'shop.cafe_order.put', ?, ?)",
      [foreignActor, _digest('foreign-audit'), _now],
    );
  });
}

Future<void> _seed(
  ShopDatabase database, {
  String? clientFingerprint,
  bool includeKitchenCapability = true,
  int openingStock = 1,
}) async {
  final capabilities = <String>[
    if (includeKitchenCapability) 'cafeKitchenStatus',
    'cafeOrderWrite',
    'counterSale',
  ];
  final lease = _adapterLease(capabilities);
  await database.addProduct(
    id: 'adapter-item',
    name: 'Adapter item',
    priceMmk: 1000,
    openingStock: openingStock,
  );
  await database.customInsert(
    'INSERT INTO shop_site_devices '
    '(device_id, tenant_id, site_id, public_key_fingerprint, '
    'session_generation, state, enrolled_at_millis) '
    "VALUES (?, ?, ?, ?, 1, 'active', ?)",
    variables: [
      const Variable<String>(_device),
      const Variable<String>(_workspace),
      const Variable<String>(_site),
      Variable<String>(clientFingerprint ?? _fingerprint),
      const Variable<int>(_now - 1000),
    ],
  );
  await database.customInsert(
    'INSERT INTO shop_site_revocation_observations '
    '(tenant_id, site_id, generation, observed_at_millis, source_digest) '
    'VALUES (?, ?, 1, ?, ?)',
    variables: [
      const Variable<String>(_workspace),
      const Variable<String>(_site),
      const Variable<int>(_now - 1000),
      Variable<String>(_digest('adapter-revocation')),
    ],
  );
  await database.customInsert(
    'INSERT INTO shop_site_offline_leases '
    '(lease_id, tenant_id, site_id, actor_id, actor_role, capabilities_json, '
    'device_id, session_generation, revocation_generation, issued_at_millis, '
    'expires_at_millis, key_id, payload_digest, signature) '
    "VALUES ('adapter-lease', ?, ?, ?, 'cashierCounter', ?, ?, 1, 1, ?, ?, "
    "'test-key', ?, ?)",
    variables: [
      const Variable<String>(_workspace),
      const Variable<String>(_site),
      const Variable<String>(_actor),
      Variable<String>(jsonEncode(capabilities)),
      const Variable<String>(_device),
      const Variable<int>(_now - 1000),
      const Variable<int>(_now + 60000),
      Variable<String>(lease.payloadDigest),
      Variable<String>(List.filled(64, 's').join()),
    ],
  );
  await database.retainConnectedLeasePayloadV34(
    lease,
    retainedAtMillis: _now - 500,
    issuerEvidenceDigest: _digest('adapter-issuer-evidence'),
  );
  await database.bindConnectedStockScopeForEnrollment(
    tenantId: _workspace,
    siteId: _site,
    enrollmentEvidenceDigest: _digest('adapter-enrollment'),
    boundAtMillis: _now - 500,
    connectedSiteEnabled: true,
  );
}

SiteCommandV1 _reserveCommand(
  String id, {
  bool cafe = false,
  bool forceRetailType = false,
  int quantity = 1,
  String? commandType,
  String reservationActorId = _actor,
}) {
  final workflow = cafe
      ? ConnectedStockWorkflowType.cafeOrder
      : ConnectedStockWorkflowType.retailCart;
  final capability = cafe
      ? ShopStaffCapability.cafeOrderWrite
      : ShopStaffCapability.counterSale;
  final reservation = ConnectedStockReservationV1.held(
    reservationId: 'reservation:$id',
    workspaceId: _workspace,
    siteId: _site,
    actorId: reservationActorId,
    deviceId: _device,
    workflowType: workflow,
    subjectId: id,
    capability: capability,
    lines: [
      ConnectedStockReservationLineV1(
        productId: 'adapter-item',
        quantity: quantity,
      ),
    ],
    issuedAt: '2033-05-18T03:33:20.000Z',
    expiresAt: '2033-05-18T03:33:50.000Z',
  );
  final payload = <String, Object?>{
    'contract': 'supermega.shop.connected-stock-reserve.v1',
    'reservation': reservation.toJson(),
  };
  return SiteCommandV1(
    commandId: id,
    workspaceId: _workspace,
    siteId: _site,
    actorId: _actor,
    deviceId: _device,
    aggregateType: forceRetailType
        ? ConnectedStockWorkflowType.retailCart.name
        : workflow.name,
    aggregateId: id,
    expectedVersion: 0,
    commandType:
        commandType ??
        (cafe
            ? shopCafeStockReserveCommandType
            : shopRetailStockReserveCommandType),
    payload: payload,
    payloadDigest: connectedSiteSha256(payload),
    leaseDigest: _leaseDigest,
    issuedAt: '2033-05-18T03:33:20.000Z',
    signingKeyId: 'test-key',
    signatureAlgorithm: 'ed25519',
    signature: List.filled(64, 's').join(),
  );
}

SiteCommandV1 _releaseCommand(
  String id,
  SiteCommandV1 reserve, {
  String actorId = _actor,
  String deviceId = _device,
  String? aggregateType,
  String? aggregateId,
  String commandType = shopRetailStockReleaseCommandType,
}) {
  final reservation = ConnectedStockReservationV1.fromJson(
    reserve.payload['reservation'],
  );
  final payload = <String, Object?>{
    'contract': 'supermega.shop.connected-stock-release.v1',
    'reservationId': reservation.reservationId,
    'expectedReservationDigest': reservation.reservationDigest,
    'targetState': 'released',
    'reason': 'operator_cancelled',
  };
  return SiteCommandV1(
    commandId: id,
    workspaceId: _workspace,
    siteId: _site,
    actorId: actorId,
    deviceId: deviceId,
    aggregateType: aggregateType ?? reservation.workflowType.name,
    aggregateId: aggregateId ?? reservation.subjectId,
    expectedVersion: 1,
    commandType: commandType,
    payload: payload,
    payloadDigest: connectedSiteSha256(payload),
    leaseDigest: _leaseDigest,
    issuedAt: '2033-05-18T03:33:21.000Z',
    signingKeyId: 'test-key',
    signatureAlgorithm: 'ed25519',
    signature: List.filled(64, 's').join(),
  );
}

SiteCommandV1 _cafePutCommand(
  String id, {
  int expectedVersion = 1,
  int ticketExpectedVersion = 0,
  int quantity = 1,
  String remark = '',
  List<CafeModifierSnapshot> modifiers = const [],
  Map<String, Object?>? reservationBinding,
  String? leaseDigest,
}) {
  final command = CafeOrderCommand(
    id: id,
    ticketId: 'connected-cafe-ticket',
    expectedVersion: ticketExpectedVersion,
    lines: [
      CafeOrderLine(
        id: 'connected-cafe-line',
        productId: 'adapter-item',
        productName: 'Adapter item',
        quantity: quantity,
        baseUnitPriceMmk: 1000,
        remark: remark,
        modifiers: modifiers,
        preparationStation: 'kitchen',
      ),
    ],
  );
  return _cafeSiteCommand(
    id: id,
    expectedVersion: expectedVersion,
    commandType: shopCafeOrderPutCommandType,
    payload: {
      'contract': 'supermega.shop.connected-cafe-order-put.v1',
      'command': command.toJson(),
      'reservationBinding':
          reservationBinding ?? _fakeCafeReservationBinding(command),
    },
    leaseDigest: leaseDigest,
  );
}

SiteCommandV1 _cafeStateCommand(
  String id, {
  required int expectedVersion,
  int expectedStateRevision = 0,
}) => _cafeSiteCommand(
  id: id,
  expectedVersion: expectedVersion,
  commandType: shopCafeOrderStateCommandType,
  payload: {
    'contract': 'supermega.shop.connected-cafe-order-state.v1',
    'orderId': 'connected-cafe-ticket',
    'operationId': id,
    'expectedStateRevision': expectedStateRevision,
    'fromState': 'open',
    'toState': 'held',
  },
);

SiteCommandV1 _cafeKitchenCommand(
  String id, {
  required int expectedVersion,
  String? leaseDigest,
}) => _cafeSiteCommand(
  id: id,
  expectedVersion: expectedVersion,
  commandType: shopCafeKitchenStatusCommandType,
  payload: {
    'contract': 'supermega.shop.connected-cafe-kitchen-status.v1',
    'orderId': 'connected-cafe-ticket',
    'lineId': 'connected-cafe-line',
    'operationId': id,
    'expectedTicketVersion': 1,
    'expectedStatus': 'pending_local',
  },
  leaseDigest: leaseDigest,
);

SiteCommandV1 _cafeCancelCommand(
  String id, {
  required int expectedVersion,
  required Map<String, Object?> reservationBinding,
  int expectedStateRevision = 1,
}) => _cafeSiteCommand(
  id: id,
  expectedVersion: expectedVersion,
  commandType: shopCafeOrderCancelCommandType,
  payload: {
    'contract': 'supermega.shop.connected-cafe-order-cancel.v1',
    'orderId': 'connected-cafe-ticket',
    'operationId': id,
    'expectedStateRevision': expectedStateRevision,
    'reservationBinding': reservationBinding,
  },
);

SiteCommandV1 _cafeReserveCommand(
  String id, {
  String subjectId = 'connected-cafe-ticket',
  int expectedVersion = 0,
  String? leaseDigest,
}) {
  final reservation = ConnectedStockReservationV1.held(
    reservationId: 'reservation:$id',
    workspaceId: _workspace,
    siteId: _site,
    actorId: _actor,
    deviceId: _device,
    workflowType: ConnectedStockWorkflowType.cafeOrder,
    subjectId: subjectId,
    capability: ShopStaffCapability.cafeOrderWrite,
    lines: [
      ConnectedStockReservationLineV1(productId: 'adapter-item', quantity: 1),
    ],
    issuedAt: '2033-05-18T03:33:20.000Z',
    expiresAt: '2033-05-18T03:33:50.000Z',
  );
  final payload = <String, Object?>{
    'contract': 'supermega.shop.connected-stock-reserve.v1',
    'reservation': reservation.toJson(),
  };
  return SiteCommandV1(
    commandId: id,
    workspaceId: _workspace,
    siteId: _site,
    actorId: _actor,
    deviceId: _device,
    aggregateType: 'cafeOrder',
    aggregateId: subjectId,
    expectedVersion: expectedVersion,
    commandType: shopCafeStockReserveCommandType,
    payload: payload,
    payloadDigest: connectedSiteSha256(payload),
    leaseDigest: leaseDigest ?? _leaseDigest,
    issuedAt: '2033-05-18T03:33:20.000Z',
    signingKeyId: 'test-key',
    signatureAlgorithm: 'ed25519',
    signature: List.filled(64, 's').join(),
  );
}

Map<String, Object?> _cafeReservationBinding(SiteCommandV1 reserve) {
  final reservation = ConnectedStockReservationV1.fromJson(
    reserve.payload['reservation'],
  );
  return {
    'reservationId': reservation.reservationId,
    'reservationDigest': reservation.reservationDigest,
    'reservationCommandId': reserve.commandId,
    'reservationAckDigest': connectedSiteSha256({
      'contract': 'supermega.shop.connected-site-local-ack.v1',
      'commandDigest': reserve.commandDigest,
    }),
    'basketDigest': reservation.basketDigest,
  };
}

Map<String, Object?> _fakeCafeReservationBinding(CafeOrderCommand command) {
  final quantities = <String, int>{};
  for (final line in command.lines) {
    quantities.update(
      line.productId,
      (quantity) => quantity + line.quantity,
      ifAbsent: () => line.quantity,
    );
  }
  final productIds = quantities.keys.toList()..sort();
  return {
    'reservationId': 'reservation:missing',
    'reservationDigest': _digest('missing-reservation'),
    'reservationCommandId': 'missing-reserve-command',
    'reservationAckDigest': _digest('missing-reserve-ack'),
    'basketDigest': connectedSiteSha256({
      'schemaVersion': connectedStockReservationSchemaVersion,
      'lines': [
        for (final productId in productIds)
          {'productId': productId, 'quantity': quantities[productId]!},
      ],
    }),
  };
}

SiteCommandV1 _cafeSiteCommand({
  required String id,
  required int expectedVersion,
  required String commandType,
  required Map<String, Object?> payload,
  String? leaseDigest,
}) => SiteCommandV1(
  commandId: id,
  workspaceId: _workspace,
  siteId: _site,
  actorId: _actor,
  deviceId: _device,
  aggregateType: 'cafeOrder',
  aggregateId: 'connected-cafe-ticket',
  expectedVersion: expectedVersion,
  commandType: commandType,
  payload: payload,
  payloadDigest: connectedSiteSha256(payload),
  leaseDigest: leaseDigest ?? _leaseDigest,
  issuedAt: '2033-05-18T03:33:20.000Z',
  signingKeyId: 'test-key',
  signatureAlgorithm: 'ed25519',
  signature: List.filled(64, 's').join(),
);

class _AllowKitchenEntitlement implements ShopCafeKitchenEntitlement {
  const _AllowKitchenEntitlement();

  @override
  bool get allowsKitchenDispatch => true;

  @override
  void requireKitchenDispatch({
    required String orderId,
    required String commandId,
  }) {}
}

class _ExplodingCafeStore extends ShopCafeOrderStore {
  _ExplodingCafeStore(super.database);

  @override
  Future<StoredCafeOrder> applyConnectedCommandProjection(
    CafeOrderCommand command,
    Map<String, CafeModifierSnapshot> modifierCatalog,
    ShopConnectedCafeProjectionContext context,
  ) => throw StateError('synthetic projector failure');
}

class _FixedTime implements ShopConnectedSiteCoordinatorTimeAuthority {
  const _FixedTime(this.nowMillis);

  final int nowMillis;

  @override
  Future<int> readValidatedNowMillis({
    required String tenantId,
    required String siteId,
  }) async => nowMillis;
}

CoordinatorPairingV1 _adapterPairing() => CoordinatorPairingV1(
  workspaceId: _workspace,
  siteId: _site,
  coordinatorDeviceId: 'adapter-counter',
  certificateSha256: _digest('adapter-certificate'),
  address: '192.168.50.10',
  port: 9443,
  nonce: 'pairing_nonce_adapter_000001',
  issuedAt: '2033-05-18T03:32:20.000Z',
  expiresAt: '2033-05-18T03:34:20.000Z',
);

Future<SiteCommandV1> _signCommand(
  SiteCommandV1 command,
  SimpleKeyPair keyPair,
) async {
  final signed = await Ed25519().sign(
    utf8.encode(canonicalConnectedSiteJson(command.signingPayload)),
    keyPair: keyPair,
  );
  return SiteCommandV1(
    commandId: command.commandId,
    workspaceId: command.workspaceId,
    siteId: command.siteId,
    actorId: command.actorId,
    deviceId: command.deviceId,
    aggregateType: command.aggregateType,
    aggregateId: command.aggregateId,
    expectedVersion: command.expectedVersion,
    commandType: command.commandType,
    payload: command.payload,
    payloadDigest: command.payloadDigest,
    leaseDigest: command.leaseDigest,
    issuedAt: command.issuedAt,
    signingKeyId: command.signingKeyId,
    signatureAlgorithm: command.signatureAlgorithm,
    signature: base64Url.encode(signed.bytes).replaceAll('=', ''),
  );
}

Future<SiteCoordinatorRequest> _signedAdapterJsonRequest(
  String method,
  String path,
  Map<String, Object?> body, {
  required String nonce,
  required String fingerprint,
  required SimpleKeyPair keyPair,
}) => _signedAdapterRequest(
  method,
  path,
  nonce: nonce,
  fingerprint: fingerprint,
  keyPair: keyPair,
  body: utf8.encode(jsonEncode(body)),
  contentType: true,
);

Future<SiteCoordinatorRequest> _signedAdapterRequest(
  String method,
  String path, {
  required String nonce,
  required String fingerprint,
  required SimpleKeyPair keyPair,
  List<int> body = const [],
  bool contentType = false,
}) async {
  final issuedAt = DateTime.fromMillisecondsSinceEpoch(_now, isUtc: true);
  final proof = CoordinatorRequestProof(
    workspaceId: _workspace,
    siteId: _site,
    coordinatorDeviceId: 'adapter-counter',
    clientFingerprint: fingerprint,
    claimedDeviceId: _device,
    issuedAt: issuedAt,
    nonce: nonce,
    method: method,
    canonicalTarget: path,
    bodySha256: sha256.convert(body).toString(),
    signature: '',
  );
  final signature = await Ed25519().sign(proof.signingBytes, keyPair: keyPair);
  return SiteCoordinatorRequest(
    method: method,
    path: path,
    headers: {
      if (contentType) 'content-type': 'application/json; charset=utf-8',
      'x-supermega-client-fingerprint': fingerprint,
      'x-supermega-device-id': _device,
      'x-supermega-issued-at': issuedAt.toIso8601String(),
      'x-supermega-request-nonce': nonce,
      'x-supermega-request-signature': base64Url
          .encode(signature.bytes)
          .replaceAll('=', ''),
    },
    body: Uint8List.fromList(body),
  );
}

class _AdapterEnrollmentAuthorizer
    implements CoordinatorDeviceEnrollmentAuthorizer {
  CoordinatorDeviceEnrollmentState state =
      CoordinatorDeviceEnrollmentState.approved;

  @override
  Future<CoordinatorDeviceEnrollmentState> stateFor({
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required String deviceId,
    required String clientFingerprint,
  }) async => state;
}

class _AdapterSiteAuthorizer implements CoordinatorSiteAuthorizer {
  bool allowed = true;
  int calls = 0;

  @override
  Future<bool> authorize(CoordinatorSiteAuthorizationRequest request) async {
    calls += 1;
    return allowed &&
        request.workspaceId == _workspace &&
        request.siteId == _site &&
        request.deviceId == _device &&
        (request.operation != CoordinatorSiteOperation.command ||
            (request.actorId == _actor && request.leaseDigest == _leaseDigest));
  }
}

class _AdapterClientKeyStore implements CoordinatorClientKeyStore {
  const _AdapterClientKeyStore({
    required this.publicKey,
    required this.fingerprint,
  });

  final SimplePublicKey publicKey;
  final String fingerprint;

  @override
  Future<EnrolledCoordinatorClientV1?> find({
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required String deviceId,
    required String fingerprint,
  }) async =>
      workspaceId == _workspace &&
          siteId == _site &&
          coordinatorDeviceId == 'adapter-counter' &&
          deviceId == _device &&
          fingerprint == this.fingerprint
      ? EnrolledCoordinatorClientV1(
          workspaceId: workspaceId,
          siteId: siteId,
          coordinatorDeviceId: coordinatorDeviceId,
          deviceId: deviceId,
          fingerprint: fingerprint,
          signingKeyId: 'test-key',
          publicKey: publicKey,
          active: true,
        )
      : null;
}

class _AdapterRequestNonceStore implements CoordinatorRequestNonceStore {
  final Set<String> _consumed = {};

  @override
  Future<bool> consume({
    required String clientFingerprint,
    required String nonce,
    required DateTime expiresAt,
  }) async => _consumed.add('$clientFingerprint:$nonce');
}

class _AdapterPairingNonceStore implements PairingNonceStore {
  const _AdapterPairingNonceStore();

  @override
  Future<bool> consumeAndCreatePending(PairingNonceClaim claim) async => false;
}

class _AdapterHealthProvider implements CoordinatorHealthProvider {
  const _AdapterHealthProvider();

  @override
  Future<CoordinatorHealthV1> readHealth() async => CoordinatorHealthV1(
    sharedWritesAvailable: true,
    internetAvailable: false,
    cloudSyncHealthy: false,
    backupCurrent: true,
    pendingConflictCount: 0,
  );
}

String _digest(String value) => sha256.convert(utf8.encode(value)).toString();
