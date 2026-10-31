import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:drift/drift.dart' show Variable;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_connected_site_database_adapter.dart';
import 'package:supermega_shop/shop_connected_stock_reservation.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_staff_authorization.dart';

const _now = 2000000000000;
const _workspace = 'workspace-adapter';
const _site = 'site-adapter';
const _actor = 'actor-adapter';
const _device = 'device-adapter';
final _fingerprint = _digest('adapter-device-key');
final _leaseDigest = _digest('adapter-lease');

void main() {
  test('resolver exposes only the reviewed stock command vocabulary', () {
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
}

Future<void> _seed(ShopDatabase database) async {
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
      Variable<String>(_fingerprint),
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
      Variable<String>(jsonEncode(const ['counterSale', 'cafeOrderWrite'])),
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
    actorId: _actor,
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

SiteCommandV1 _releaseCommand(String id, SiteCommandV1 reserve) {
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
    actorId: _actor,
    deviceId: _device,
    aggregateType: reservation.workflowType.name,
    aggregateId: reservation.subjectId,
    expectedVersion: 1,
    commandType: shopRetailStockReleaseCommandType,
    payload: payload,
    payloadDigest: connectedSiteSha256(payload),
    leaseDigest: _leaseDigest,
    issuedAt: '2033-05-18T03:33:21.000Z',
    signingKeyId: 'test-key',
    signatureAlgorithm: 'ed25519',
    signature: List.filled(64, 's').join(),
  );
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

String _digest(String value) => sha256.convert(utf8.encode(value)).toString();
