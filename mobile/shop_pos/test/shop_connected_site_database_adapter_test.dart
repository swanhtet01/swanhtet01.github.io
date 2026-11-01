import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:cryptography/cryptography.dart';
import 'package:drift/drift.dart' show Variable;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
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
final _leaseDigest = _digest('adapter-lease');

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
          shopConnectedStockReservedEventType,
        );
        final snapshot = await reader.readSnapshot(_fingerprint);
        expect(snapshot.continuationCursor, 1);
        expect(
          snapshot.projections['schema'],
          'supermega.shop.connected-site-projections.v1',
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
      final put = _cafePutCommand('cafe-put');
      final putAck = await handler.handle(_fingerprint, put);
      expect(putAck.state, SiteCommandAckState.accepted);
      expect(putAck.canonicalVersion, 1);
      var order = await store.read('connected-cafe-ticket');
      expect(order, isNotNull);
      expect(order!.state, 'open');
      expect(order.ticket.version, 1);
      expect(order.kitchenStatusByLine['connected-cafe-line'], 'pending_local');
      expect(await database.countSales(), 0);

      final state = _cafeStateCommand('cafe-hold', expectedVersion: 1);
      expect(
        (await handler.handle(_fingerprint, state)).state,
        SiteCommandAckState.accepted,
      );
      order = await store.read('connected-cafe-ticket');
      expect(order!.state, 'held');
      expect(order.stateRevision, 1);

      final kitchen = _cafeKitchenCommand('cafe-kitchen', expectedVersion: 2);
      expect(
        (await handler.handle(_fingerprint, kitchen)).state,
        SiteCommandAckState.accepted,
      );
      order = await store.read('connected-cafe-ticket');
      expect(
        order!.kitchenStatusByLine['connected-cafe-line'],
        'preparing_local',
      );

      final cancel = _cafeCancelCommand('cafe-cancel', expectedVersion: 3);
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
          4,
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
      expect(await _siteCommandCount(database), 4);
      expect(await database.countSales(), 0);
    } finally {
      await database.close();
    }
  });

  test(
    'connected cafe projection failure rolls back every outer write',
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
        await handler.handle(_fingerprint, _cafePutCommand('rollback-put'));
        await handler.handle(
          _fingerprint,
          _cafeKitchenCommand('rollback-kitchen', expectedVersion: 1),
        );
        final beforeCommands = await _siteCommandCount(database);
        final beforeEvents =
            (await database
                    .customSelect(
                      'SELECT COUNT(*) AS total FROM shop_site_events',
                    )
                    .getSingle())
                .read<int>('total');
        await expectLater(
          handler.handle(
            _fingerprint,
            _cafePutCommand(
              'rollback-change',
              expectedVersion: 2,
              ticketExpectedVersion: 1,
              quantity: 2,
            ),
          ),
          throwsA(isA<ShopCafeStartedKitchenLineException>()),
        );
        expect(await _siteCommandCount(database), beforeCommands);
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
      await handler.handle(_fingerprint, _cafePutCommand('capability-put'));
      await expectLater(
        handler.handle(
          _fingerprint,
          _cafeKitchenCommand('capability-kitchen', expectedVersion: 1),
        ),
        throwsStateError,
      );
      expect(await _siteCommandCount(database), 1);
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

Future<void> _seed(
  ShopDatabase database, {
  String? clientFingerprint,
  bool includeKitchenCapability = true,
}) async {
  await database.addProduct(
    id: 'adapter-item',
    name: 'Adapter item',
    priceMmk: 1000,
    openingStock: 1,
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
      Variable<String>(
        jsonEncode([
          'counterSale',
          'cafeOrderWrite',
          if (includeKitchenCapability) 'cafeKitchenStatus',
        ]),
      ),
      const Variable<String>(_device),
      const Variable<int>(_now - 1000),
      const Variable<int>(_now + 60000),
      Variable<String>(_leaseDigest),
      Variable<String>(List.filled(64, 's').join()),
    ],
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
  int expectedVersion = 0,
  int ticketExpectedVersion = 0,
  int quantity = 1,
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
        remark: '',
        modifiers: const [],
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
    },
  );
}

SiteCommandV1 _cafeStateCommand(String id, {required int expectedVersion}) =>
    _cafeSiteCommand(
      id: id,
      expectedVersion: expectedVersion,
      commandType: shopCafeOrderStateCommandType,
      payload: {
        'contract': 'supermega.shop.connected-cafe-order-state.v1',
        'orderId': 'connected-cafe-ticket',
        'operationId': id,
        'expectedStateRevision': 0,
        'fromState': 'open',
        'toState': 'held',
      },
    );

SiteCommandV1 _cafeKitchenCommand(String id, {required int expectedVersion}) =>
    _cafeSiteCommand(
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
    );

SiteCommandV1 _cafeCancelCommand(String id, {required int expectedVersion}) =>
    _cafeSiteCommand(
      id: id,
      expectedVersion: expectedVersion,
      commandType: shopCafeOrderCancelCommandType,
      payload: {
        'contract': 'supermega.shop.connected-cafe-order-cancel.v1',
        'orderId': 'connected-cafe-ticket',
        'operationId': id,
        'expectedStateRevision': 1,
      },
    );

SiteCommandV1 _cafeSiteCommand({
  required String id,
  required int expectedVersion,
  required String commandType,
  required Map<String, Object?> payload,
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
  leaseDigest: _leaseDigest,
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
