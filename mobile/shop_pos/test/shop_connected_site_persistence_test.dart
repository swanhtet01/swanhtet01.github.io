import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:drift/drift.dart' show Variable;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_database.dart';

const _now = 2000000000000;
const _tenant = 'tenant-1';
const _site = 'site-1';
const _actor = 'actor-1';
const _device = 'device-1';
final _leaseDigest = _digest('lease:$_tenant:$_site:$_device');

void main() {
  test('connected-site persistence is default-off and schema is v23', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      expect(database.schemaVersion, 23);
      final tables =
          (await database
                  .customSelect(
                    "SELECT name FROM sqlite_master WHERE type = 'table' "
                    "AND name LIKE 'shop_site_%'",
                  )
                  .get())
              .map((row) => row.read<String>('name'))
              .toSet();
      expect(
        tables,
        containsAll(const {
          'shop_site_devices',
          'shop_site_offline_leases',
          'shop_site_commands',
          'shop_site_events',
          'shop_site_aggregate_versions',
          'shop_site_command_acks',
          'shop_site_client_cursors',
          'shop_site_cloud_acks',
          'shop_site_conflicts',
          'shop_site_recovery_checkpoints',
          'shop_site_stock_reservations',
          'shop_site_audit',
        }),
      );
      await expectLater(
        database.applyConnectedSiteCommand(
          _command('disabled-command'),
          connectedSiteEnabled: false,
        ),
        throwsStateError,
      );
    } finally {
      await database.close();
    }
  });

  test(
    'command, event, reservation, audit and ack commit exactly once',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await _seedAuthority(database);
        await database.addProduct(
          id: 'rice',
          name: 'Rice',
          priceMmk: 1000,
          openingStock: 1,
        );
        final command = _command('reserve-rice', reservationProductId: 'rice');
        final accepted = await database.applyConnectedSiteCommand(
          command,
          connectedSiteEnabled: true,
        );
        expect(accepted.status, ShopConnectedSiteCommandStatus.accepted);
        expect(accepted.canonicalVersion, 1);
        expect(accepted.eventSequence, isNotNull);

        final pending = await database.readConnectedSitePendingEvents(
          tenantId: _tenant,
          siteId: _site,
          afterSequence: 0,
        );
        expect(pending, hasLength(1));
        expect(pending.single.cursor, accepted.eventSequence);
        expect(pending.single.commandId, command.commandId);
        expect(pending.single.commandDigest, command.commandDigest);
        expect(pending.single.eventDigest, command.eventDigest);
        expect(pending.single.event, {
          'aggregateId': command.aggregateId,
          'aggregateType': command.aggregateType,
          'aggregateVersion': 1,
          'eventId': command.eventId,
          'eventType': command.eventType,
          'occurredAt': '2033-05-18T03:33:20.000Z',
          'payload': {'commandId': command.commandId},
          'siteId': _site,
          'workspaceId': _tenant,
        });
        expect(connectedSiteSha256(pending.single.event), command.eventDigest);
        final storedPayload = await database
            .customSelect(
              'SELECT payload_json FROM shop_site_events WHERE event_id = ?',
              variables: [Variable<String>(command.eventId)],
            )
            .getSingle();
        expect(jsonDecode(storedPayload.read<String>('payload_json')), {
          'commandId': command.commandId,
        });

        final replayed = await database.applyConnectedSiteCommand(
          command,
          connectedSiteEnabled: true,
        );
        expect(replayed.status, ShopConnectedSiteCommandStatus.replayed);
        expect(replayed.eventSequence, accepted.eventSequence);
        expect(replayed.ackDigest, accepted.ackDigest);

        for (final table in const [
          'shop_site_commands',
          'shop_site_events',
          'shop_site_command_acks',
          'shop_site_audit',
          'shop_site_stock_reservations',
        ]) {
          final count = await database
              .customSelect('SELECT COUNT(*) AS count FROM $table')
              .getSingle();
          expect(count.read<int>('count'), 1, reason: table);
        }
        await expectLater(
          database.applyConnectedSiteCommand(
            _command(
              'reserve-rice',
              commandDigest: _digest('different-command'),
              reservationProductId: 'rice',
            ),
            connectedSiteEnabled: true,
          ),
          throwsStateError,
        );
        await expectLater(
          database.applyConnectedSiteCommand(
            _command(
              'invalid-event-digest',
              aggregateId: 'stock:invalid-digest',
              eventDigest: _digest('payload-only'),
            ),
            connectedSiteEnabled: true,
          ),
          throwsStateError,
        );
      } finally {
        await database.close();
      }
    },
  );

  test(
    'version and stock conflicts are durable without side effects',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await _seedAuthority(database);
        await database.addProduct(
          id: 'last-item',
          name: 'Last item',
          priceMmk: 1000,
          openingStock: 1,
        );
        final first = await database.applyConnectedSiteCommand(
          _command('first', reservationProductId: 'last-item'),
          connectedSiteEnabled: true,
        );
        expect(first.status, ShopConnectedSiteCommandStatus.accepted);

        final otherAggregateType = await database.applyConnectedSiteCommand(
          _command('same-id-different-type', aggregateType: 'cafeOrder'),
          connectedSiteEnabled: true,
        );
        expect(
          otherAggregateType.status,
          ShopConnectedSiteCommandStatus.accepted,
        );
        expect(otherAggregateType.canonicalVersion, 1);

        final versionConflict = await database.applyConnectedSiteCommand(
          _command('stale-version', expectedVersion: 0),
          connectedSiteEnabled: true,
        );
        expect(versionConflict.status, ShopConnectedSiteCommandStatus.conflict);
        expect(versionConflict.canonicalVersion, 1);
        expect(versionConflict.eventSequence, isNull);

        final stockConflict = await database.applyConnectedSiteCommand(
          _command(
            'second-reservation',
            aggregateId: 'stock:last-item:second',
            reservationProductId: 'last-item',
          ),
          connectedSiteEnabled: true,
        );
        expect(stockConflict.status, ShopConnectedSiteCommandStatus.conflict);
        expect(await database.countSales(), 0);
        expect((await database.readActiveProducts()).single.onHand, 1);
        final events = await database
            .customSelect('SELECT COUNT(*) AS count FROM shop_site_events')
            .getSingle();
        final conflicts = await database
            .customSelect('SELECT COUNT(*) AS count FROM shop_site_conflicts')
            .getSingle();
        expect(events.read<int>('count'), 2);
        expect(conflicts.read<int>('count'), 2);
      } finally {
        await database.close();
      }
    },
  );

  test(
    'site sequences and recovery identities stay tenant-site scoped',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await _seedAuthority(database);
        final secondSiteLease = await _seedAuthority(
          database,
          siteId: 'site-2',
          deviceId: 'device-2',
        );
        final secondTenantLease = await _seedAuthority(
          database,
          tenantId: 'tenant-2',
          actorId: 'actor-2',
          deviceId: 'device-3',
        );

        final first = await database.applyConnectedSiteCommand(
          _command('site-1-first', aggregateId: 'one'),
          connectedSiteEnabled: true,
        );
        final second = await database.applyConnectedSiteCommand(
          _command('site-1-second', aggregateId: 'two'),
          connectedSiteEnabled: true,
        );
        final otherSite = await database.applyConnectedSiteCommand(
          _command(
            'site-2-first',
            aggregateId: 'one',
            siteId: 'site-2',
            deviceId: 'device-2',
            leaseDigest: secondSiteLease,
          ),
          connectedSiteEnabled: true,
        );
        final otherTenant = await database.applyConnectedSiteCommand(
          _command(
            'tenant-2-site-1-first',
            aggregateId: 'one',
            tenantId: 'tenant-2',
            actorId: 'actor-2',
            deviceId: 'device-3',
            leaseDigest: secondTenantLease,
          ),
          connectedSiteEnabled: true,
        );
        expect(first.eventSequence, 1);
        expect(second.eventSequence, 2);
        expect(otherSite.eventSequence, 1);
        expect(otherTenant.eventSequence, 1);

        for (final values in [
          (_tenant, _device, 2, _digest('tenant-1-checkpoint')),
          ('tenant-2', 'device-3', 1, _digest('tenant-2-checkpoint')),
        ]) {
          await database.customInsert(
            'INSERT INTO shop_site_recovery_checkpoints '
            '(tenant_id, site_id, coordinator_id, event_sequence, '
            'snapshot_digest, created_at_millis) VALUES (?, ?, ?, ?, ?, ?)',
            variables: [
              Variable<String>(values.$1),
              Variable<String>(_site),
              Variable<String>(values.$2),
              Variable<int>(values.$3),
              Variable<String>(values.$4),
              const Variable<int>(_now),
            ],
          );
        }
        final checkpoints = await database
            .customSelect(
              'SELECT COUNT(*) AS count FROM shop_site_recovery_checkpoints '
              'WHERE site_id = ?',
              variables: [Variable<String>(_site)],
            )
            .getSingle();
        expect(checkpoints.read<int>('count'), 2);
      } finally {
        await database.close();
      }
    },
  );

  test(
    'v22 migrates to v23 and encrypted-backup snapshot remains valid',
    () async {
      final root = await Directory.systemTemp.createTemp('shop-site-v23-');
      final file = File('${root.path}/shop.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      try {
        await database.verifyReadyForUse();
        for (final entry
            in shopConnectedSiteSchemaDefinitionsV23().entries
                .toList()
                .reversed) {
          final type = shopSchemaObjectTypeForDefinition(entry.value);
          await database.customStatement(
            'DROP ${type == 'table'
                ? 'TABLE'
                : type == 'index'
                ? 'INDEX'
                : 'TRIGGER'} IF EXISTS ${entry.key}',
          );
        }
        await database.customStatement('PRAGMA user_version = 22');
        await database.close();

        database = ShopDatabase(NativeDatabase(file));
        await database.verifyReadyForUse();
        expect(database.schemaVersion, 23);
        final snapshot = File('${root.path}/snapshot.sqlite');
        await database.exportVerifiedLocalSnapshot(snapshot);
        expect(
          () => ShopBackup.verifySnapshot(
            snapshot,
            expectedSchemaVersion: ShopBackup.supportedSchemaVersion,
          ),
          returnsNormally,
        );
      } finally {
        await database.close();
        await root.delete(recursive: true);
      }
    },
  );
}

Future<String> _seedAuthority(
  ShopDatabase database, {
  String tenantId = _tenant,
  String siteId = _site,
  String actorId = _actor,
  String deviceId = _device,
}) async {
  final leaseDigest = _digest('lease:$tenantId:$siteId:$deviceId');
  await database.customInsert(
    'INSERT INTO shop_site_devices '
    '(device_id, tenant_id, site_id, public_key_fingerprint, '
    'session_generation, state, enrolled_at_millis) '
    "VALUES (?, ?, ?, ?, 1, 'active', ?)",
    variables: [
      Variable<String>(deviceId),
      Variable<String>(tenantId),
      Variable<String>(siteId),
      Variable<String>(_digest('device-key:$deviceId')),
      Variable<int>(_now - 1000),
    ],
  );
  await database.customInsert(
    'INSERT INTO shop_site_revocation_observations '
    '(tenant_id, site_id, generation, observed_at_millis, source_digest) '
    'VALUES (?, ?, 3, ?, ?)',
    variables: [
      Variable<String>(tenantId),
      Variable<String>(siteId),
      Variable<int>(_now - 1000),
      Variable<String>(_digest('revocation-observation')),
    ],
  );
  await database.customInsert(
    'INSERT INTO shop_site_offline_leases '
    '(lease_id, tenant_id, site_id, actor_id, actor_role, capabilities_json, '
    'device_id, session_generation, revocation_generation, issued_at_millis, '
    'expires_at_millis, key_id, payload_digest, signature) '
    "VALUES (?, ?, ?, ?, 'cashierCounter', ?, ?, 1, 3, ?, ?, 'test-key', ?, ?)",
    variables: [
      Variable<String>('lease:$tenantId:$siteId:$deviceId'),
      Variable<String>(tenantId),
      Variable<String>(siteId),
      Variable<String>(actorId),
      Variable<String>(jsonEncode(const ['shop.stock.reserve'])),
      Variable<String>(deviceId),
      Variable<int>(_now - 1000),
      Variable<int>(_now + 60000),
      Variable<String>(leaseDigest),
      Variable<String>(List.filled(64, 's').join()),
    ],
  );
  return leaseDigest;
}

ShopConnectedSiteCommandInput _command(
  String id, {
  int expectedVersion = 0,
  String aggregateType = 'stockItem',
  String aggregateId = 'stock:rice',
  String? commandDigest,
  String? eventDigest,
  String? reservationProductId,
  String tenantId = _tenant,
  String siteId = _site,
  String actorId = _actor,
  String deviceId = _device,
  String? leaseDigest,
}) {
  final payload = <String, Object?>{'commandId': id};
  final event = <String, Object?>{
    'eventId': 'event:$id',
    'workspaceId': tenantId,
    'siteId': siteId,
    'aggregateType': aggregateType,
    'aggregateId': aggregateId,
    'aggregateVersion': expectedVersion + 1,
    'eventType': 'shop.stock.reserved.v1',
    'occurredAt': '2033-05-18T03:33:20.000Z',
    'payload': payload,
  };
  return ShopConnectedSiteCommandInput(
    commandId: id,
    tenantId: tenantId,
    siteId: siteId,
    actorId: actorId,
    deviceId: deviceId,
    aggregateType: aggregateType,
    aggregateId: aggregateId,
    capability: 'shop.stock.reserve',
    expectedVersion: expectedVersion,
    payloadDigest: _digest('payload:$id'),
    leaseDigest: leaseDigest ?? _leaseDigest,
    commandDigest: commandDigest ?? _digest('command:$id'),
    eventId: 'event:$id',
    eventType: 'shop.stock.reserved.v1',
    eventPayloadJson: jsonEncode(payload),
    eventDigest: eventDigest ?? connectedSiteSha256(event),
    ackDigest: _digest('ack:$id'),
    auditAction: 'shop.stock.reserve',
    auditMetadataDigest: _digest('audit:$id'),
    createdAtMillis: _now,
    reservationId: reservationProductId == null ? null : 'reservation:$id',
    reservationProductId: reservationProductId,
    reservationQuantity: reservationProductId == null ? null : 1,
    reservationExpiresAtMillis: reservationProductId == null
        ? null
        : _now + 30000,
  );
}

String _digest(String value) => sha256.convert(utf8.encode(value)).toString();
