import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:cryptography/cryptography.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_connected_site_enrollment_store.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_site_coordinator.dart';

const _now = 2000000000000;
const _tenant = 'tenant-enrollment';
const _site = 'site-enrollment';
const _coordinator = 'counter-enrollment';
const _device = 'device-enrollment';
const _nonce = 'pairing_nonce_enrollment_0001';

void main() {
  test(
    'v25 semantic validator rejects altered authority-chain bytes',
    () async {
      final keyPair = await Ed25519().newKeyPairFromSeed(
        List<int>.generate(32, (index) => 200 - index),
      );
      final publicKey = await keyPair.extractPublicKey();
      final fingerprint = sha256.convert(publicKey.bytes).toString();
      final approval = _evidence(
        action: ShopOwnerEnrollmentAction.approve,
        fingerprint: fingerprint,
        observedAtMillis: _now + 100,
        sessionGeneration: 1,
      );
      expect(
        () => ShopOwnerEnrollmentEvidenceV1(
          action: approval.action,
          tenantId: approval.tenantId,
          siteId: approval.siteId,
          coordinatorDeviceId: approval.coordinatorDeviceId,
          deviceId: approval.deviceId,
          clientFingerprint: approval.clientFingerprint,
          sessionGeneration: approval.sessionGeneration,
          observedAtMillis: approval.observedAtMillis,
          authorityKeyId: approval.authorityKeyId,
          signature: 'too-short',
          evidenceDigest: approval.evidenceDigest,
        ),
        throwsFormatException,
      );
      final fixture = _semanticFixture(
        publicKey: publicKey.bytes,
        fingerprint: fingerprint,
        approval: approval,
      );
      bool valid(Map<String, List<Map<String, Object?>>> value) =>
          shopConnectedEnrollmentRowsValidV25(
            pairingNonces: value['nonces']!,
            pendingEnrollments: value['pending']!,
            enrollmentEvidence: value['evidence']!,
            devices: value['devices']!,
            requestNonces: value['requests']!,
          );
      expect(valid(fixture), isTrue);

      final alteredKey = _copyFixture(fixture);
      alteredKey['pending']!.single['public_key'] = Uint8List.fromList(
        List<int>.filled(32, 7),
      );
      expect(valid(alteredKey), isFalse);

      final alteredEvidence = _copyFixture(fixture);
      final decoded = jsonDecode(
        alteredEvidence['evidence']!.single['evidence_json']! as String,
      ) as Map<String, dynamic>;
      decoded['authorityKeyId'] = 'substituted-owner-key';
      alteredEvidence['evidence']!.single['evidence_json'] =
          canonicalConnectedSiteJson(decoded);
      expect(valid(alteredEvidence), isFalse);

      final alteredScope = _copyFixture(fixture);
      alteredScope['pending']!.single['coordinator_device_id'] =
          'counter-substituted';
      expect(valid(alteredScope), isFalse);

      final invalidRequestTime = _copyFixture(fixture);
      invalidRequestTime['requests']!.single['consumed_at_millis'] =
          invalidRequestTime['requests']!.single['expires_at_millis'];
      expect(valid(invalidRequestTime), isFalse);
    },
  );

  test('v24 migrates through v25 authority into fail-closed v26', () async {
    final root = await Directory.systemTemp.createTemp('shop-enrollment-v24-');
    final file = File('${root.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    try {
      await database.verifyReadyForUse();
      for (final entry
          in shopConnectedCloudDispositionSchemaDefinitionsV26().entries
              .toList()
              .reversed) {
        final type = shopSchemaObjectTypeForDefinition(entry.value);
        await database.customStatement(
          'DROP ${type.toUpperCase()} IF EXISTS ${entry.key}',
        );
      }
      for (final entry
          in shopConnectedEnrollmentSchemaDefinitionsV25().entries
              .toList()
              .reversed) {
        final type = shopSchemaObjectTypeForDefinition(entry.value);
        await database.customStatement(
          'DROP ${type.toUpperCase()} IF EXISTS ${entry.key}',
        );
      }
      await database.customStatement('PRAGMA user_version = 24');
      await database.close();

      database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      expect(database.schemaVersion, 26);
      for (final table in const [
        'shop_site_pairing_nonces',
        'shop_site_pending_enrollments',
        'shop_site_enrollment_evidence',
        'shop_site_request_nonces',
      ]) {
        final row = await database
            .customSelect('SELECT COUNT(*) AS total FROM $table')
            .getSingle();
        expect(row.read<int>('total'), 0, reason: table);
      }
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test('materialized v25 authority survives direct v26 migration', () async {
    final root = await Directory.systemTemp.createTemp('shop-enrollment-v25-');
    final file = File('${root.path}/shop.sqlite');
    final keyPair = await Ed25519().newKeyPairFromSeed(
      List<int>.generate(32, (index) => 200 - index),
    );
    final publicKey = await keyPair.extractPublicKey();
    final publicKeyEncoded = base64Url
        .encode(publicKey.bytes)
        .replaceAll('=', '');
    final fingerprint = sha256.convert(publicKey.bytes).toString();
    var database = ShopDatabase(NativeDatabase(file));
    try {
      final store = ShopConnectedSiteEnrollmentStore(
        database: database,
        nowMillis: () => _now,
      );
      await store.registerPairingNonce(
        tenantId: _tenant,
        siteId: _site,
        coordinatorDeviceId: _coordinator,
        nonce: _nonce,
        issuedAtMillis: _now - 1000,
        expiresAtMillis: _now + 60000,
      );
      final claim = PairingNonceClaim(
        workspaceId: _tenant,
        siteId: _site,
        coordinatorDeviceId: _coordinator,
        nonce: _nonce,
        clientFingerprint: fingerprint,
        clientPublicKey: publicKeyEncoded,
        keyAlgorithm: 'ed25519',
        observedAt: DateTime.fromMillisecondsSinceEpoch(_now, isUtc: true),
        expiresAt: DateTime.fromMillisecondsSinceEpoch(
          _now + 60000,
          isUtc: true,
        ),
      );
      expect(await store.consumeAndCreatePending(claim), isTrue);
      await store.importOwnerEvidence(
        _evidence(
          action: ShopOwnerEnrollmentAction.approve,
          fingerprint: fingerprint,
          observedAtMillis: _now + 100,
          sessionGeneration: 1,
        ),
        verifier: const _EvidenceVerifier(true),
      );
      for (final entry
          in shopConnectedCloudDispositionSchemaDefinitionsV26().entries
              .toList()
              .reversed) {
        final type = shopSchemaObjectTypeForDefinition(entry.value);
        await database.customStatement(
          'DROP ${type.toUpperCase()} IF EXISTS ${entry.key}',
        );
      }
      await database.customStatement('PRAGMA user_version = 25');
      await database.close();

      database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      final migrated = ShopConnectedSiteEnrollmentStore(
        database: database,
        nowMillis: () => _now + 200,
      );
      expect(
        await migrated.stateFor(
          workspaceId: _tenant,
          siteId: _site,
          coordinatorDeviceId: _coordinator,
          deviceId: _device,
          clientFingerprint: fingerprint,
        ),
        CoordinatorDeviceEnrollmentState.approved,
      );
      final dispositions = await database
          .customSelect(
            'SELECT COUNT(*) AS total FROM shop_site_cloud_dispositions',
          )
          .getSingle();
      expect(dispositions.read<int>('total'), 0);
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test(
    'pairing, owner approval, nonce replay and revocation survive restart',
    () async {
      final root = await Directory.systemTemp.createTemp(
        'shop-enrollment-store-',
      );
      final file = File('${root.path}/shop.sqlite');
      final archive = File('${root.path}/enrollment.smbak');
      final restoredFile = File('${root.path}/restored/shop.sqlite');
      final revokedArchive = File('${root.path}/revoked-enrollment.smbak');
      final revokedRestoredFile = File(
        '${root.path}/revoked-restored/shop.sqlite',
      );
      final keyPair = await Ed25519().newKeyPairFromSeed(
        List<int>.generate(32, (index) => 200 - index),
      );
      final publicKey = await keyPair.extractPublicKey();
      final publicKeyEncoded = base64Url
          .encode(publicKey.bytes)
          .replaceAll('=', '');
      final fingerprint = sha256.convert(publicKey.bytes).toString();
      var currentTime = _now;
      var database = ShopDatabase(NativeDatabase(file));
      try {
        var store = ShopConnectedSiteEnrollmentStore(
          database: database,
          nowMillis: () => currentTime,
        );
        await store.registerPairingNonce(
          tenantId: _tenant,
          siteId: _site,
          coordinatorDeviceId: _coordinator,
          nonce: _nonce,
          issuedAtMillis: _now - 1000,
          expiresAtMillis: _now + 60000,
        );
        final claim = PairingNonceClaim(
          workspaceId: _tenant,
          siteId: _site,
          coordinatorDeviceId: _coordinator,
          nonce: _nonce,
          clientFingerprint: fingerprint,
          clientPublicKey: publicKeyEncoded,
          keyAlgorithm: 'ed25519',
          observedAt: DateTime.fromMillisecondsSinceEpoch(_now, isUtc: true),
          expiresAt: DateTime.fromMillisecondsSinceEpoch(
            _now + 60000,
            isUtc: true,
          ),
        );
        expect(await store.consumeAndCreatePending(claim), isTrue);
        expect(
          await store.consumeAndCreatePending(claim),
          isTrue,
          reason: 'an identical retry can recover a lost pending ack',
        );
        final substitutedKey = List<int>.generate(32, (index) => 255 - index);
        expect(
          await store.consumeAndCreatePending(
            PairingNonceClaim(
              workspaceId: claim.workspaceId,
              siteId: claim.siteId,
              coordinatorDeviceId: claim.coordinatorDeviceId,
              nonce: claim.nonce,
              clientFingerprint: claim.clientFingerprint,
              clientPublicKey: base64Url
                  .encode(substitutedKey)
                  .replaceAll('=', ''),
              keyAlgorithm: claim.keyAlgorithm,
              observedAt: claim.observedAt,
              expiresAt: claim.expiresAt,
            ),
          ),
          isFalse,
          reason: 'a consumed nonce cannot be rebound to another key',
        );
        expect(
          await store.stateFor(
            workspaceId: _tenant,
            siteId: _site,
            coordinatorDeviceId: _coordinator,
            deviceId: _device,
            clientFingerprint: fingerprint,
          ),
          CoordinatorDeviceEnrollmentState.pending,
        );

        final approval = _evidence(
          action: ShopOwnerEnrollmentAction.approve,
          fingerprint: fingerprint,
          observedAtMillis: _now + 100,
          sessionGeneration: 1,
        );
        await expectLater(
          store.importOwnerEvidence(
            approval,
            verifier: const _EvidenceVerifier(false),
          ),
          throwsStateError,
        );
        await expectLater(
          store.importOwnerEvidence(
            _evidence(
              action: ShopOwnerEnrollmentAction.approve,
              fingerprint: fingerprint,
              observedAtMillis: _now + 100,
              sessionGeneration: 1,
              siteId: 'site-other',
            ),
            verifier: const _EvidenceVerifier(true),
          ),
          throwsStateError,
        );
        await expectLater(
          store.importOwnerEvidence(
            _evidence(
              action: ShopOwnerEnrollmentAction.approve,
              fingerprint: fingerprint,
              observedAtMillis: currentTime + 1001,
              sessionGeneration: 1,
            ),
            verifier: const _EvidenceVerifier(true),
          ),
          throwsStateError,
        );
        expect(
          (await database
                  .customSelect(
                    'SELECT COUNT(*) AS total FROM shop_site_devices',
                  )
                  .getSingle())
              .read<int>('total'),
          0,
        );
        await store.importOwnerEvidence(
          approval,
          verifier: const _EvidenceVerifier(true),
        );
        expect(
          await store.consumeAndCreatePending(claim),
          isFalse,
          reason: 'pairing retries stop once the pending key is bound',
        );
        await expectLater(
          store.importOwnerEvidence(
            _evidence(
              action: ShopOwnerEnrollmentAction.approve,
              fingerprint: fingerprint,
              observedAtMillis: _now + 101,
              sessionGeneration: 1,
              deviceId: 'device-enrollment-other',
            ),
            verifier: const _EvidenceVerifier(true),
          ),
          throwsStateError,
        );
        await store.importOwnerEvidence(
          approval,
          verifier: const _EvidenceVerifier(true),
        );
        expect(
          await store.stateFor(
            workspaceId: _tenant,
            siteId: _site,
            coordinatorDeviceId: _coordinator,
            deviceId: _device,
            clientFingerprint: fingerprint,
          ),
          CoordinatorDeviceEnrollmentState.approved,
        );
        final enrolled = await store.find(
          workspaceId: _tenant,
          siteId: _site,
          coordinatorDeviceId: _coordinator,
          deviceId: _device,
          fingerprint: fingerprint,
        );
        expect(enrolled, isNotNull);
        expect(enrolled!.publicKey.bytes, publicKey.bytes);
        expect(enrolled.signingKeyId, fingerprint);
        expect(
          await store.consume(
            clientFingerprint: fingerprint,
            nonce: 'request_nonce_enrollment_0001',
            expiresAt: DateTime.fromMillisecondsSinceEpoch(
              _now + 60000,
              isUtc: true,
            ),
          ),
          isTrue,
        );
        expect(
          await store.consume(
            clientFingerprint: fingerprint,
            nonce: 'request_nonce_enrollment_0001',
            expiresAt: DateTime.fromMillisecondsSinceEpoch(
              _now + 60000,
              isUtc: true,
            ),
          ),
          isFalse,
        );
        expect(
          await store.consume(
            clientFingerprint: fingerprint,
            nonce: 'request_nonce_enrollment_expired',
            expiresAt: DateTime.fromMillisecondsSinceEpoch(
              currentTime,
              isUtc: true,
            ),
          ),
          isFalse,
        );

        await ShopBackup.exportEncrypted(
          database: database,
          archive: archive,
          password: 'enrollment-restore-passphrase',
          scratchRoot: root,
        );
        await database.close();
        await restoredFile.parent.create(recursive: true);
        await ShopBackup.restoreIntoEmptyDatabase(
          archive: archive,
          target: restoredFile,
          password: 'enrollment-restore-passphrase',
        );
        database = ShopDatabase(NativeDatabase(restoredFile));
        await database.verifyReadyForUse();
        store = ShopConnectedSiteEnrollmentStore(
          database: database,
          nowMillis: () => currentTime,
        );
        expect(
          await store.stateFor(
            workspaceId: _tenant,
            siteId: _site,
            coordinatorDeviceId: _coordinator,
            deviceId: _device,
            clientFingerprint: fingerprint,
          ),
          CoordinatorDeviceEnrollmentState.approved,
        );
        expect(
          await store.consume(
            clientFingerprint: fingerprint,
            nonce: 'request_nonce_enrollment_0001',
            expiresAt: DateTime.fromMillisecondsSinceEpoch(
              _now + 60000,
              isUtc: true,
            ),
          ),
          isFalse,
        );

        currentTime = _now + 500;
        final revocation = _evidence(
          action: ShopOwnerEnrollmentAction.revoke,
          fingerprint: fingerprint,
          observedAtMillis: currentTime,
          sessionGeneration: 2,
        );
        await store.importOwnerEvidence(
          revocation,
          verifier: const _EvidenceVerifier(true),
        );
        expect(
          await store.stateFor(
            workspaceId: _tenant,
            siteId: _site,
            coordinatorDeviceId: _coordinator,
            deviceId: _device,
            clientFingerprint: fingerprint,
          ),
          CoordinatorDeviceEnrollmentState.revoked,
        );
        expect(
          (await store.find(
            workspaceId: _tenant,
            siteId: _site,
            coordinatorDeviceId: _coordinator,
            deviceId: _device,
            fingerprint: fingerprint,
          ))?.active,
          isFalse,
        );
        expect(
          await store.consume(
            clientFingerprint: fingerprint,
            nonce: 'request_nonce_enrollment_0002',
            expiresAt: DateTime.fromMillisecondsSinceEpoch(
              currentTime + 60000,
              isUtc: true,
            ),
          ),
          isFalse,
        );
        await database.verifyReadyForUse();
        await ShopBackup.exportEncrypted(
          database: database,
          archive: revokedArchive,
          password: 'revoked-enrollment-restore-passphrase',
          scratchRoot: root,
        );
        await database.close();
        await revokedRestoredFile.parent.create(recursive: true);
        await ShopBackup.restoreIntoEmptyDatabase(
          archive: revokedArchive,
          target: revokedRestoredFile,
          password: 'revoked-enrollment-restore-passphrase',
        );
        database = ShopDatabase(NativeDatabase(revokedRestoredFile));
        await database.verifyReadyForUse();
        store = ShopConnectedSiteEnrollmentStore(
          database: database,
          nowMillis: () => currentTime,
        );
        expect(
          await store.stateFor(
            workspaceId: _tenant,
            siteId: _site,
            coordinatorDeviceId: _coordinator,
            deviceId: _device,
            clientFingerprint: fingerprint,
          ),
          CoordinatorDeviceEnrollmentState.revoked,
        );
      } finally {
        await database.close();
        await root.delete(recursive: true);
      }
    },
  );
}

Map<String, List<Map<String, Object?>>> _semanticFixture({
  required List<int> publicKey,
  required String fingerprint,
  required ShopOwnerEnrollmentEvidenceV1 approval,
}) => {
  'nonces': [
    {
      'nonce': _nonce,
      'tenant_id': _tenant,
      'site_id': _site,
      'coordinator_device_id': _coordinator,
      'issued_at_millis': _now - 1000,
      'expires_at_millis': _now + 60000,
      'consumed_at_millis': _now,
    },
  ],
  'pending': [
    {
      'client_fingerprint': fingerprint,
      'nonce': _nonce,
      'tenant_id': _tenant,
      'site_id': _site,
      'coordinator_device_id': _coordinator,
      'public_key': Uint8List.fromList(publicKey),
      'key_algorithm': 'ed25519',
      'observed_at_millis': _now,
    },
  ],
  'evidence': [
    {
      'evidence_digest': approval.evidenceDigest,
      'action': approval.action.name,
      'tenant_id': approval.tenantId,
      'site_id': approval.siteId,
      'coordinator_device_id': approval.coordinatorDeviceId,
      'device_id': approval.deviceId,
      'client_fingerprint': approval.clientFingerprint,
      'session_generation': approval.sessionGeneration,
      'observed_at_millis': approval.observedAtMillis,
      'authority_key_id': approval.authorityKeyId,
      'evidence_json': canonicalConnectedSiteJson(approval.toJson()),
    },
  ],
  'devices': [
    {
      'device_id': _device,
      'tenant_id': _tenant,
      'site_id': _site,
      'public_key_fingerprint': fingerprint,
      'session_generation': 1,
      'state': 'active',
      'enrolled_at_millis': _now + 100,
      'revoked_at_millis': null,
    },
  ],
  'requests': [
    {
      'client_fingerprint': fingerprint,
      'nonce': 'request_nonce_enrollment_0001',
      'expires_at_millis': _now + 60000,
      'consumed_at_millis': _now + 200,
    },
  ],
};

Map<String, List<Map<String, Object?>>> _copyFixture(
  Map<String, List<Map<String, Object?>>> source,
) => {
  for (final entry in source.entries)
    entry.key: entry.value
        .map((row) => Map<String, Object?>.from(row))
        .toList(growable: false),
};

ShopOwnerEnrollmentEvidenceV1 _evidence({
  required ShopOwnerEnrollmentAction action,
  required String fingerprint,
  required int observedAtMillis,
  required int sessionGeneration,
  String siteId = _site,
  String deviceId = _device,
}) {
  final payload = <String, Object>{
    'schema': 'supermega.shop.owner-enrollment-evidence.v1',
    'action': action.name,
    'tenantId': _tenant,
    'siteId': siteId,
    'coordinatorDeviceId': _coordinator,
    'deviceId': deviceId,
    'clientFingerprint': fingerprint,
    'sessionGeneration': sessionGeneration,
    'observedAtMillis': observedAtMillis,
    'authorityKeyId': 'owner-key-1',
  };
  return ShopOwnerEnrollmentEvidenceV1(
    action: action,
    tenantId: _tenant,
    siteId: siteId,
    coordinatorDeviceId: _coordinator,
    deviceId: deviceId,
    clientFingerprint: fingerprint,
    sessionGeneration: sessionGeneration,
    observedAtMillis: observedAtMillis,
    authorityKeyId: 'owner-key-1',
    signature: List.filled(86, 'A').join(),
    evidenceDigest: connectedSiteSha256(payload),
  );
}

class _EvidenceVerifier implements ShopOwnerEnrollmentEvidenceVerifier {
  const _EvidenceVerifier(this.result);

  final bool result;

  @override
  Future<bool> verify(ShopOwnerEnrollmentEvidenceV1 evidence) async => result;
}
