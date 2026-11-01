import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:drift/drift.dart' show Variable;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_connected_site_attempt_store.dart';
import 'package:supermega_shop/shop_connected_site_reconciliation.dart';
import 'package:supermega_shop/shop_connected_site_reconciliation_store.dart';
import 'package:supermega_shop/shop_database.dart';

const _now = 2000000000000;
const _workspace = 'workspace-cloud-store';
const _site = 'site-cloud-store';
const _device = 'device-cloud-store';
const _actor = 'actor-cloud-store';
final _cloudStorePublicKey = List<int>.generate(32, (index) => index + 31);
final _cloudStoreFingerprint = sha256.convert(_cloudStorePublicKey).toString();
Map<String, Object> get _enrollmentPayload => {
  'schema': 'supermega.shop.owner-enrollment-evidence.v1',
  'action': 'approve',
  'tenantId': _workspace,
  'siteId': _site,
  'coordinatorDeviceId': 'coordinator-cloud-store',
  'deviceId': _device,
  'clientFingerprint': _cloudStoreFingerprint,
  'sessionGeneration': 1,
  'observedAtMillis': _now - 1000,
  'authorityKeyId': 'owner-test',
};
String get _enrollmentEvidenceDigest => connectedSiteSha256(_enrollmentPayload);
ConnectedCoordinatorApprovalV1 get _cloudStoreApproval =>
    ConnectedCoordinatorApprovalV1(
      workspaceId: _workspace,
      siteId: _site,
      coordinatorDeviceId: 'coordinator-cloud-store',
      pairingDigest: _digest('pairing-cloud-store'),
      enrollmentEvidenceDigest: _enrollmentEvidenceDigest,
      clientDeviceId: _device,
      clientFingerprint: _cloudStoreFingerprint,
      clientSigningKeyId: 'device-key',
      address: '192.168.50.2',
      port: 9443,
      certificateSha256: _digest('certificate-cloud-store'),
      approvalGeneration: 1,
      issuedAtMillis: _now - 900,
      expiresAtMillis: _now + 60000,
      authorityKeyId: 'owner-test',
      authoritySignature: 's' * 64,
    );
final _leaseUnsigned = <String, Object>{
  'protocolVersion': connectedSiteProtocolVersion,
  'leaseId': 'cloud-store-lease',
  'workspaceId': _workspace,
  'siteId': _site,
  'actorId': _actor,
  'role': 'cashierCounter',
  'capabilities': const ['counterSale'],
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
final _leaseDigest = connectedSiteSha256(_leaseUnsigned);

OfflineStaffLeaseV1 _lease() => OfflineStaffLeaseV1(
  leaseId: 'cloud-store-lease',
  workspaceId: _workspace,
  siteId: _site,
  actorId: _actor,
  role: 'cashierCounter',
  capabilities: const ['counterSale'],
  deviceId: _device,
  sessionGeneration: 1,
  revocationGeneration: 1,
  issuedAt: _leaseUnsigned['issuedAt']! as String,
  expiresAt: _leaseUnsigned['expiresAt']! as String,
  issuerKeyId: 'test-key',
  payloadDigest: _leaseDigest,
  signature: 's' * 64,
);

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

  test('stored proof binds exact command lease and scope bytes', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _seedAuthority(database);
      await _appendEvent(database, 'command-proof', 'aggregate-proof');
      final store = ShopConnectedSiteReconciliationStore(
        database: database,
        nowMillis: () => _now + 1000,
      );
      final scope = ConnectedSiteScope(
        workspaceId: _workspace,
        siteId: _site,
        deviceId: _device,
      );
      final pending = await store.pendingEvents(
        scope,
        afterCursor: 0,
        limit: 10,
      );
      expect(pending.single.cloudProof.proofKind, 'signedClientCommand');
      expect(pending.single.cloudProof.workspaceId, _workspace);
      expect(pending.single.cloudProof.siteId, _site);
      expect(pending.single.cloudProof.leaseDigest, _leaseDigest);

      final retainedProof = pending.single.cloudProof;
      final proof = retainedProof.toJson();
      (proof['command']! as Map<String, Object?>)['siteId'] = 'site-mutated';
      expect(retainedProof.siteId, _site);
      final cleanProof = retainedProof.toJson();
      final alteredLease = Map<String, Object?>.from(
        cleanProof['lease']! as Map,
      )..['actorId'] = 'actor-foreign';
      final altered = Map<String, Object?>.from(cleanProof)
        ..['lease'] = alteredLease;
      expect(
        () => ConnectedSiteCloudProofV1.fromJson(altered),
        throwsFormatException,
      );
      final foreign = Map<String, Object?>.from(cleanProof);
      final command = Map<String, Object?>.from(foreign['command']! as Map)
        ..['siteId'] = 'site-foreign';
      foreign['command'] = command;
      expect(
        () => ConnectedSiteCloudProofV1.fromJson(foreign),
        throwsFormatException,
      );
    } finally {
      await database.close();
    }
  });

  test('restart rejects recomputed event and authority proof substitution', () async {
    final root = await Directory.systemTemp.createTemp(
      'cloud-proof-substitute-',
    );
    final file = File('${root.path}/substituted.sqlite');
    final database = ShopDatabase(NativeDatabase(file));
    try {
      await _seedAuthority(database);
      await _appendEvent(
        database,
        'command-substitute',
        'aggregate-substitute',
      );
      final row = await database
          .customSelect(
            "SELECT proof_json FROM shop_site_cloud_proofs WHERE command_id = 'command-substitute'",
          )
          .getSingle();
      final proof = Map<String, Object?>.from(
        jsonDecode(row.read<String>('proof_json')) as Map,
      );
      final binding = Map<String, Object?>.from(proof['eventBinding']! as Map)
        ..['eventType'] = 'retail.substituted.v1';
      proof['eventBinding'] = binding;
      proof['eventBindingDigest'] = connectedSiteSha256(binding);
      proof['enrollmentEvidenceDigest'] = _digest('foreign-enrollment');
      final encoded = canonicalConnectedSiteJson(proof);
      await database.customStatement(
        'DROP TRIGGER shop_site_cloud_proofs_no_update',
      );
      await database.customUpdate(
        'UPDATE shop_site_cloud_proofs SET proof_json = ?, proof_digest = ? '
        "WHERE command_id = 'command-substitute'",
        variables: [
          Variable<String>(encoded),
          Variable<String>(connectedSiteSha256(proof)),
        ],
      );
      await database.customStatement(
        shopConnectedCloudProofSchemaDefinitionsV34()['shop_site_cloud_proofs_no_update']!,
      );
      await expectLater(
        database.readConnectedSitePendingEvents(
          tenantId: _workspace,
          siteId: _site,
          afterSequence: 0,
        ),
        throwsStateError,
      );
      await expectLater(database.verifyReadyForUse(), throwsStateError);
      await database.close();
      expect(
        () => ShopBackup.verifySnapshot(file, expectedSchemaVersion: 35),
        throwsA(anything),
      );
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test(
    'v34 proof rows migrate as local-only without inventing issuer evidence',
    () async {
      final root = await Directory.systemTemp.createTemp('cloud-proof-v34-');
      final file = File('${root.path}/legacy.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      try {
        await _seedAuthority(database);
        await _appendEvent(database, 'v34-command', 'v34-aggregate');
        await database.customStatement(
          'DROP TRIGGER shop_site_cloud_proof_legacy_boundary_no_update',
        );
        await database.customStatement(
          'DROP TRIGGER shop_site_cloud_proof_legacy_boundary_no_delete',
        );
        await database.customStatement(
          'DROP TABLE shop_site_cloud_proof_legacy_boundary',
        );
        await database.customStatement(
          'DROP TRIGGER shop_site_lease_issuer_evidence_no_update',
        );
        await database.customStatement(
          'DROP TRIGGER shop_site_lease_issuer_evidence_no_delete',
        );
        await database.customStatement(
          'DROP TABLE shop_site_lease_issuer_evidence',
        );
        await database.customStatement('PRAGMA user_version = 34');
        await database.close();

        database = ShopDatabase(NativeDatabase(file));
        await database.verifyReadyForUse();
        final retained = await database
            .customSelect(
              'SELECT command.command_id, requirement.proof_state, '
              'boundary.command_id AS boundary_command_id, '
              'proof.command_id AS proof_command_id '
              'FROM shop_site_commands command '
              'JOIN shop_site_cloud_proof_requirements requirement '
              'ON requirement.command_id = command.command_id '
              'LEFT JOIN shop_site_cloud_proof_legacy_boundary boundary '
              'ON boundary.command_id = command.command_id '
              'LEFT JOIN shop_site_cloud_proofs proof '
              'ON proof.command_id = command.command_id '
              "WHERE command.command_id = 'v34-command'",
            )
            .getSingle();
        expect(retained.read<String>('proof_state'), 'legacyUnverifiable');
        expect(retained.read<String>('boundary_command_id'), 'v34-command');
        expect(retained.readNullable<String>('proof_command_id'), isNull);
        await expectLater(
          database.customUpdate(
            "UPDATE shop_site_cloud_proof_requirements SET proof_state = 'proofRequired' "
            "WHERE command_id = 'v34-command'",
          ),
          throwsA(anything),
        );
        await expectLater(
          database.customUpdate(
            "DELETE FROM shop_site_cloud_proof_legacy_boundary WHERE command_id = 'v34-command'",
          ),
          throwsA(anything),
        );
        expect(
          (await database
                  .customSelect('SELECT COUNT(*) AS n FROM shop_site_events')
                  .getSingle())
              .read<int>('n'),
          1,
        );
        await expectLater(
          ShopConnectedSiteReconciliationStore(
            database: database,
            nowMillis: () => _now + 1000,
          ).pendingEvents(
            ConnectedSiteScope(
              workspaceId: _workspace,
              siteId: _site,
              deviceId: _device,
            ),
            afterCursor: 0,
            limit: 10,
          ),
          throwsStateError,
        );
      } finally {
        await database.close();
        await root.delete(recursive: true);
      }
    },
  );

  test(
    'revoked current authority blocks upload without corrupting history',
    () async {
      final root = await Directory.systemTemp.createTemp(
        'cloud-proof-revoked-',
      );
      final file = File('${root.path}/revoked.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      try {
        await _seedAuthority(database);
        await _appendEvent(database, 'revoked-command', 'revoked-aggregate');
        final scope = ConnectedSiteScope(
          workspaceId: _workspace,
          siteId: _site,
          deviceId: _device,
        );
        final store = ShopConnectedSiteReconciliationStore(
          database: database,
          nowMillis: () => _now + 1000,
        );
        expect(
          await store.pendingEvents(scope, afterCursor: 0, limit: 10),
          hasLength(1),
        );
        await ShopConnectedSiteAttemptStore(
          database: database,
          approvalVerifier: const _AllowApprovalVerifier(),
          runtimeEnabled: true,
          now: () => DateTime.fromMillisecondsSinceEpoch(_now, isUtc: true),
        ).revoke(
          ConnectedCoordinatorRevocationV1(
            targetBindingDigest: _cloudStoreApproval.bindingDigest,
            workspaceId: _workspace,
            siteId: _site,
            clientDeviceId: _device,
            approvalGeneration: 2,
            issuedAtMillis: _now - 100,
            authorityKeyId: 'owner-test',
            authoritySignature: 'r' * 64,
          ),
        );
        await expectLater(
          store.pendingEvents(scope, afterCursor: 0, limit: 10),
          throwsStateError,
        );
        await ShopConnectedSiteAttemptStore(
          database: database,
          approvalVerifier: const _AllowApprovalVerifier(),
          runtimeEnabled: true,
          now: () => DateTime.fromMillisecondsSinceEpoch(_now, isUtc: true),
        ).importApproval(
          ConnectedCoordinatorApprovalV1(
            workspaceId: _workspace,
            siteId: _site,
            coordinatorDeviceId: 'coordinator-cloud-store',
            pairingDigest: _digest('replacement-pairing-cloud-store'),
            enrollmentEvidenceDigest: _enrollmentEvidenceDigest,
            clientDeviceId: _device,
            clientFingerprint: _cloudStoreFingerprint,
            clientSigningKeyId: 'device-key',
            address: '192.168.50.3',
            port: 9443,
            certificateSha256: _digest('replacement-certificate-cloud-store'),
            approvalGeneration: 3,
            issuedAtMillis: _now - 50,
            expiresAtMillis: _now + 60000,
            authorityKeyId: 'owner-test',
            authoritySignature: 'n' * 64,
          ),
        );
        await expectLater(
          store.pendingEvents(scope, afterCursor: 0, limit: 10),
          throwsStateError,
        );
        await database.verifyReadyForUse();
        await database.close();

        database = ShopDatabase(NativeDatabase(file));
        await database.verifyReadyForUse();
        final snapshot = File('${root.path}/revoked-snapshot.sqlite');
        await database.exportVerifiedLocalSnapshot(snapshot);
        ShopBackup.verifySnapshot(snapshot, expectedSchemaVersion: 35);
        await expectLater(
          ShopConnectedSiteReconciliationStore(
            database: database,
            nowMillis: () => _now + 1000,
          ).pendingEvents(scope, afterCursor: 0, limit: 10),
          throwsStateError,
        );
      } finally {
        await database.close();
        await root.delete(recursive: true);
      }
    },
  );

  test(
    'v33 events remain local and refuse cloud upload after v35 migration',
    () async {
      final root = await Directory.systemTemp.createTemp('cloud-proof-v33-');
      final file = File('${root.path}/legacy.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      try {
        await _seedAuthority(database);
        await _appendEvent(database, 'legacy-command', 'legacy-aggregate');
        await database.customStatement(
          'DROP TRIGGER shop_site_cloud_proofs_no_update',
        );
        await database.customStatement(
          'DROP TRIGGER shop_site_cloud_proofs_no_delete',
        );
        await database.customStatement(
          'DROP TRIGGER shop_site_offline_lease_payloads_no_update',
        );
        await database.customStatement(
          'DROP TRIGGER shop_site_offline_lease_payloads_no_delete',
        );
        await database.customStatement(
          'DROP TRIGGER shop_site_cloud_proof_requirements_no_update',
        );
        await database.customStatement(
          'DROP TRIGGER shop_site_cloud_proof_requirements_no_delete',
        );
        await database.customStatement(
          'DROP TRIGGER shop_site_cloud_proof_legacy_boundary_no_update',
        );
        await database.customStatement(
          'DROP TRIGGER shop_site_cloud_proof_legacy_boundary_no_delete',
        );
        await database.customStatement(
          'DROP TABLE shop_site_cloud_proof_legacy_boundary',
        );
        await database.customStatement(
          'DROP TRIGGER shop_site_lease_issuer_evidence_no_update',
        );
        await database.customStatement(
          'DROP TRIGGER shop_site_lease_issuer_evidence_no_delete',
        );
        await database.customStatement(
          'DROP TABLE shop_site_lease_issuer_evidence',
        );
        await database.customStatement(
          'DROP TABLE shop_site_cloud_proof_requirements',
        );
        await database.customStatement('DROP TABLE shop_site_cloud_proofs');
        await database.customStatement(
          'DROP TABLE shop_site_offline_lease_payloads',
        );
        await database.customStatement('PRAGMA user_version = 33');
        await database.close();

        database = ShopDatabase(NativeDatabase(file));
        await database.verifyReadyForUse();
        expect(await database.countSales(), 0);
        final store = ShopConnectedSiteReconciliationStore(
          database: database,
          nowMillis: () => _now + 1000,
        );
        final scope = ConnectedSiteScope(
          workspaceId: _workspace,
          siteId: _site,
          deviceId: _device,
        );
        await expectLater(
          store.pendingEvents(scope, afterCursor: 0, limit: 10),
          throwsStateError,
        );
        expect(
          (await database
                  .customSelect('SELECT COUNT(*) AS n FROM shop_site_events')
                  .getSingle())
              .read<int>('n'),
          1,
        );
      } finally {
        await database.close();
        await root.delete(recursive: true);
      }
    },
  );
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
      Variable<String>(_cloudStoreFingerprint),
      const Variable<int>(_now - 1000),
    ],
  );
  await database.customInsert(
    'INSERT INTO shop_site_pairing_nonces '
    '(nonce, tenant_id, site_id, coordinator_device_id, issued_at_millis, '
    'expires_at_millis, consumed_at_millis) VALUES (?, ?, ?, ?, ?, ?, ?)',
    variables: [
      const Variable<String>('cloud-store-pairing-nonce'),
      const Variable<String>(_workspace),
      const Variable<String>(_site),
      const Variable<String>('coordinator-cloud-store'),
      const Variable<int>(_now - 2000),
      const Variable<int>(_now + 60000),
      const Variable<int>(_now - 1000),
    ],
  );
  await database.customInsert(
    'INSERT INTO shop_site_pending_enrollments '
    '(client_fingerprint, nonce, tenant_id, site_id, coordinator_device_id, '
    "public_key, key_algorithm, observed_at_millis) VALUES (?, ?, ?, ?, ?, ?, 'ed25519', ?)",
    variables: [
      Variable<String>(_cloudStoreFingerprint),
      const Variable<String>('cloud-store-pairing-nonce'),
      const Variable<String>(_workspace),
      const Variable<String>(_site),
      const Variable<String>('coordinator-cloud-store'),
      Variable<Uint8List>(Uint8List.fromList(_cloudStorePublicKey)),
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
  await database.retainConnectedLeasePayloadV34(
    _lease(),
    retainedAtMillis: _now - 500,
    issuerEvidenceDigest: connectedSiteSha256(const {
      'contract': 'supermega.test.lease-issuer-evidence.v1',
      'issuer': 'cloud-store',
    }),
    issuerEvidenceJson: canonicalConnectedSiteJson(const {
      'contract': 'supermega.test.lease-issuer-evidence.v1',
      'issuer': 'cloud-store',
    }),
  );
  final enrollmentDigest = _enrollmentEvidenceDigest;
  final enrollmentEvidence = {
    ..._enrollmentPayload,
    'signature': 's' * 64,
    'evidenceDigest': enrollmentDigest,
  };
  await database.customInsert(
    'INSERT INTO shop_site_enrollment_evidence '
    '(evidence_digest, action, tenant_id, site_id, coordinator_device_id, '
    'device_id, client_fingerprint, session_generation, observed_at_millis, '
    "authority_key_id, evidence_json) VALUES (?, 'approve', ?, ?, ?, ?, ?, 1, ?, ?, ?)",
    variables: [
      Variable<String>(enrollmentDigest),
      const Variable<String>(_workspace),
      const Variable<String>(_site),
      const Variable<String>('coordinator-cloud-store'),
      const Variable<String>(_device),
      Variable<String>(_cloudStoreFingerprint),
      const Variable<int>(_now - 1000),
      const Variable<String>('owner-test'),
      Variable<String>(canonicalConnectedSiteJson(enrollmentEvidence)),
    ],
  );
  final approval = _cloudStoreApproval;
  await ShopConnectedSiteAttemptStore(
    database: database,
    approvalVerifier: const _AllowApprovalVerifier(),
    runtimeEnabled: true,
    now: () => DateTime.fromMillisecondsSinceEpoch(_now, isUtc: true),
  ).importApproval(approval);
}

class _AllowApprovalVerifier implements ConnectedCoordinatorApprovalVerifier {
  const _AllowApprovalVerifier();
  @override
  Future<bool> verify({
    required String authorityKeyId,
    required String canonicalEvidence,
    required String signature,
  }) async => true;
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
  final command = SiteCommandV1(
    commandId: commandId,
    workspaceId: _workspace,
    siteId: _site,
    actorId: _actor,
    deviceId: _device,
    aggregateType: 'retailCart',
    aggregateId: aggregateId,
    expectedVersion: 0,
    commandType: 'retail.synthetic.accept.v1',
    payload: payload,
    payloadDigest: connectedSiteSha256(payload),
    leaseDigest: _leaseDigest,
    issuedAt: occurredAt,
    signingKeyId: 'device-key',
    signatureAlgorithm: 'ed25519',
    signature: 's' * 64,
  );
  final proof = ConnectedSiteCloudProofV1.signed(
    command: command,
    lease: _lease(),
    clientFingerprint: _cloudStoreFingerprint,
    enrollmentEvidenceDigest: _enrollmentEvidenceDigest,
    coordinatorBindingDigest: _cloudStoreApproval.bindingDigest,
    authorityPayloadDigest: connectedSiteSha256(const {
      'contract': 'supermega.test.lease-issuer-evidence.v1',
      'issuer': 'cloud-store',
    }),
    eventBinding: {
      'eventId': 'event:$commandId',
      'eventType': 'retail.synthetic.accepted.v1',
      'eventDigest': connectedSiteSha256(event),
      'capability': 'counterSale',
      'auditAction': 'shop.connected.synthetic',
      'commandType': command.commandType,
    },
  );
  final commandDigest = command.commandDigest;
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
      cloudProofJson: canonicalConnectedSiteJson(proof.toJson()),
      cloudProofDigest: proof.proofDigest,
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
