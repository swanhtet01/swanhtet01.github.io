import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:drift/drift.dart' show Variable;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_connected_site_reconciliation.dart';
import 'package:supermega_shop/shop_connected_site_reconciliation_store.dart';
import 'package:supermega_shop/shop_database.dart';

const _now = 2000000000000;
const _workspace = 'workspace-cloud-store';
const _site = 'site-cloud-store';
const _device = 'device-cloud-store';
const _actor = 'actor-cloud-store';
final _leaseDigest = _digest('cloud-store-lease');

void main() {
  test('cloud dispositions are durable, ordered and idempotent', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _seedAuthority(database);
      final first = await _appendEvent(
        database,
        'command-one',
        'aggregate-one',
      );
      final second = await _appendEvent(
        database,
        'command-two',
        'aggregate-two',
      );
      final scope = ConnectedSiteScope(
        workspaceId: _workspace,
        siteId: _site,
        deviceId: _device,
      );
      final store = ShopConnectedSiteReconciliationStore(
        database: database,
        nowMillis: () => _now + 1000,
      );
      expect(await store.uploadCursor(scope), 0);
      expect(
        (await store.pendingEvents(
          scope,
          afterCursor: 0,
          limit: 10,
        )).map((event) => event.commandId),
        ['command-one', 'command-two'],
      );
      final outcome = ConnectedSiteCloudOutcome(
        afterCursor: 0,
        nextCursor: 2,
        acknowledgements: [
          SiteCommandAckV1(
            commandId: first.commandId,
            commandDigest: first.commandDigest,
            state: SiteCommandAckState.accepted,
            canonicalVersion: 1,
            eventDigest: first.eventDigest,
          ),
        ],
        conflicts: [
          SiteConflictV1(
            workspaceId: _workspace,
            siteId: _site,
            conflictId: 'cloud-conflict-two',
            commandId: second.commandId,
            commandDigest: second.commandDigest,
            aggregateType: 'retailCart',
            aggregateId: 'aggregate-two',
            expectedVersion: 0,
            actualVersion: 1,
            reason: 'cloud_version_conflict',
            createdAt: '2033-05-18T03:33:21.000Z',
            state: SiteConflictState.quarantined,
          ),
        ],
      );
      final persisted = await store.persistCloudOutcome(scope, outcome);
      expect(persisted.newAcknowledgementCount, 1);
      expect(persisted.newConflictCount, 1);
      expect(await store.uploadCursor(scope), 2);
      expect(
        await store.pendingEvents(scope, afterCursor: 2, limit: 10),
        isEmpty,
      );

      final replayed = await store.persistCloudOutcome(scope, outcome);
      expect(replayed.newAcknowledgementCount, 0);
      expect(replayed.newConflictCount, 0);
      expect(
        (await database
                .customSelect(
                  'SELECT COUNT(*) AS total FROM shop_site_cloud_acks',
                )
                .getSingle())
            .read<int>('total'),
        2,
      );
      expect(
        (await database
                .customSelect(
                  "SELECT COUNT(*) AS total FROM shop_site_conflicts WHERE state = 'quarantined'",
                )
                .getSingle())
            .read<int>('total'),
        1,
      );
      await expectLater(
        database.customUpdate(
          "UPDATE shop_site_conflicts SET reason_code = 'changed' "
          "WHERE command_id = 'command-two'",
        ),
        throwsA(anything),
      );
      await expectLater(
        database.customStatement(
          "DELETE FROM shop_site_conflicts WHERE command_id = 'command-two'",
        ),
        throwsA(anything),
      );
    } finally {
      await database.close();
    }
  });

  test(
    'changed replay, partial outcome and foreign scope fail closed',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await _seedAuthority(database);
        final event = await _appendEvent(
          database,
          'command-one',
          'aggregate-one',
        );
        final scope = ConnectedSiteScope(
          workspaceId: _workspace,
          siteId: _site,
          deviceId: _device,
        );
        final store = ShopConnectedSiteReconciliationStore(
          database: database,
          nowMillis: () => _now + 1000,
        );
        await expectLater(
          store.persistCloudOutcome(
            scope,
            ConnectedSiteCloudOutcome(
              afterCursor: 0,
              nextCursor: 1,
              acknowledgements: [],
              conflicts: [],
            ),
          ),
          throwsA(isA<ConnectedSiteReconciliationException>()),
        );
        final accepted = ConnectedSiteCloudOutcome(
          afterCursor: 0,
          nextCursor: 1,
          acknowledgements: [
            SiteCommandAckV1(
              commandId: event.commandId,
              commandDigest: event.commandDigest,
              state: SiteCommandAckState.accepted,
              canonicalVersion: 1,
              eventDigest: event.eventDigest,
            ),
          ],
          conflicts: const [],
        );
        await store.persistCloudOutcome(scope, accepted);
        await expectLater(
          store.persistCloudOutcome(
            scope,
            ConnectedSiteCloudOutcome(
              afterCursor: 0,
              nextCursor: 1,
              acknowledgements: [
                SiteCommandAckV1(
                  commandId: event.commandId,
                  commandDigest: event.commandDigest,
                  state: SiteCommandAckState.replayed,
                  canonicalVersion: 1,
                  eventDigest: event.eventDigest,
                ),
              ],
              conflicts: const [],
            ),
          ),
          throwsA(isA<ConnectedSiteReconciliationException>()),
        );
        await expectLater(
          store.uploadCursor(
            ConnectedSiteScope(
              workspaceId: 'workspace-other',
              siteId: _site,
              deviceId: _device,
            ),
          ),
          throwsA(isA<ConnectedSiteReconciliationException>()),
        );
      } finally {
        await database.close();
      }
    },
  );

  test(
    'cloud upload position survives encrypted fresh-target restore',
    () async {
      final root = await Directory.systemTemp.createTemp(
        'shop-connected-cloud-restore-',
      );
      final source = File('${root.path}/source.sqlite');
      final archive = File('${root.path}/backup.smshop');
      final target = File('${root.path}/restored.sqlite');
      var database = ShopDatabase(NativeDatabase(source));
      try {
        await _seedAuthority(database);
        final event = await _appendEvent(
          database,
          'command-one',
          'aggregate-one',
        );
        final scope = ConnectedSiteScope(
          workspaceId: _workspace,
          siteId: _site,
          deviceId: _device,
        );
        var store = ShopConnectedSiteReconciliationStore(
          database: database,
          nowMillis: () => _now + 1000,
        );
        await store.persistCloudOutcome(
          scope,
          ConnectedSiteCloudOutcome(
            afterCursor: 0,
            nextCursor: 1,
            acknowledgements: [
              SiteCommandAckV1(
                commandId: event.commandId,
                commandDigest: event.commandDigest,
                state: SiteCommandAckState.accepted,
                canonicalVersion: 1,
                eventDigest: event.eventDigest,
              ),
            ],
            conflicts: const [],
          ),
        );
        await ShopBackup.exportEncrypted(
          database: database,
          archive: archive,
          password: 'connected-cloud-restore-passphrase',
          scratchRoot: root,
        );
        await database.close();
        await ShopBackup.restoreIntoEmptyDatabase(
          archive: archive,
          target: target,
          password: 'connected-cloud-restore-passphrase',
        );
        database = ShopDatabase(NativeDatabase(target));
        await database.verifyReadyForUse();
        store = ShopConnectedSiteReconciliationStore(
          database: database,
          nowMillis: () => _now + 2000,
        );
        expect(await store.uploadCursor(scope), 1);
        expect(
          await store.pendingEvents(scope, afterCursor: 1, limit: 10),
          isEmpty,
        );
      } finally {
        await database.close();
        await root.delete(recursive: true);
      }
    },
  );

  test('orphan cloud evidence cannot advance or pass live/backup verification', () async {
    final root = await Directory.systemTemp.createTemp(
      'shop-connected-cloud-forgery-',
    );
    final file = File('${root.path}/forged.sqlite');
    final database = ShopDatabase(NativeDatabase(file));
    try {
      await _seedAuthority(database);
      await _appendEvent(database, 'command-one', 'aggregate-one');
      final eventRow = await database
          .customSelect(
            "SELECT event_row_id FROM shop_site_events WHERE command_id = 'command-one'",
          )
          .getSingle();
      await database.customInsert(
        'INSERT INTO shop_site_cloud_acks '
        '(event_row_id, cloud_event_id, acknowledgement_digest, '
        'acknowledged_at_millis) VALUES (?, ?, ?, ?)',
        variables: [
          Variable<int>(eventRow.read<int>('event_row_id')),
          const Variable<String>(
            'ack:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
          ),
          const Variable<String>(
            'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
          ),
          const Variable<int>(_now + 1000),
        ],
      );
      final scope = ConnectedSiteScope(
        workspaceId: _workspace,
        siteId: _site,
        deviceId: _device,
      );
      final store = ShopConnectedSiteReconciliationStore(
        database: database,
        nowMillis: () => _now + 1000,
      );
      await expectLater(store.uploadCursor(scope), throwsStateError);
      await expectLater(database.verifyReadyForUse(), throwsStateError);
      await database.close();
      expect(
        () => ShopBackup.verifySnapshot(file, expectedSchemaVersion: 27),
        throwsA(anything),
      );
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });
}

Future<void> _seedAuthority(ShopDatabase database) async {
  await database.customInsert(
    'INSERT INTO shop_site_devices '
    '(device_id, tenant_id, site_id, public_key_fingerprint, '
    'session_generation, state, enrolled_at_millis) '
    "VALUES (?, ?, ?, ?, 1, 'active', ?)",
    variables: [
      const Variable<String>(_device),
      const Variable<String>(_workspace),
      const Variable<String>(_site),
      Variable<String>(_digest('cloud-store-device')),
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
      Variable<String>(_digest('cloud-store-revocation')),
    ],
  );
  await database.customInsert(
    'INSERT INTO shop_site_offline_leases '
    '(lease_id, tenant_id, site_id, actor_id, actor_role, capabilities_json, '
    'device_id, session_generation, revocation_generation, issued_at_millis, '
    'expires_at_millis, key_id, payload_digest, signature) '
    "VALUES ('cloud-store-lease', ?, ?, ?, 'cashierCounter', ?, ?, 1, 1, ?, ?, "
    "'test-key', ?, ?)",
    variables: [
      const Variable<String>(_workspace),
      const Variable<String>(_site),
      const Variable<String>(_actor),
      Variable<String>(jsonEncode(const ['counterSale'])),
      const Variable<String>(_device),
      const Variable<int>(_now - 1000),
      const Variable<int>(_now + 60000),
      Variable<String>(_leaseDigest),
      Variable<String>('s' * 64),
    ],
  );
}

Future<({String commandId, String commandDigest, String eventDigest})>
_appendEvent(
  ShopDatabase database,
  String commandId,
  String aggregateId,
) async {
  final payload = <String, Object?>{'kind': 'synthetic'};
  final occurredAt = DateTime.fromMillisecondsSinceEpoch(
    _now,
    isUtc: true,
  ).toIso8601String();
  final event = <String, Object?>{
    'eventId': 'event:$commandId',
    'workspaceId': _workspace,
    'siteId': _site,
    'aggregateType': 'retailCart',
    'aggregateId': aggregateId,
    'aggregateVersion': 1,
    'eventType': 'retail.synthetic.accepted.v1',
    'occurredAt': occurredAt,
    'payload': payload,
  };
  final commandDigest = _digest('command:$commandId');
  final result = await database.applyConnectedSiteCommand(
    ShopConnectedSiteCommandInput(
      commandId: commandId,
      tenantId: _workspace,
      siteId: _site,
      actorId: _actor,
      deviceId: _device,
      aggregateType: 'retailCart',
      aggregateId: aggregateId,
      capability: 'counterSale',
      expectedVersion: 0,
      payloadDigest: connectedSiteSha256(payload),
      leaseDigest: _leaseDigest,
      commandDigest: commandDigest,
      eventId: 'event:$commandId',
      eventType: 'retail.synthetic.accepted.v1',
      eventPayloadJson: canonicalConnectedSiteJson(payload),
      eventDigest: connectedSiteSha256(event),
      ackDigest: _digest('ack:$commandId'),
      auditAction: 'shop.connected.synthetic',
      auditMetadataDigest: _digest('audit:$commandId'),
      createdAtMillis: _now,
    ),
    connectedSiteEnabled: true,
  );
  return (
    commandId: commandId,
    commandDigest: commandDigest,
    eventDigest: result.eventDigest!,
  );
}

String _digest(String value) => sha256.convert(utf8.encode(value)).toString();
