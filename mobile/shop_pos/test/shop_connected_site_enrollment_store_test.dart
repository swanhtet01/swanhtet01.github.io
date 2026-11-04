import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:cryptography/cryptography.dart';
import 'package:drift/drift.dart' show Variable;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:pointycastle/pointycastle.dart';
import 'package:sqlite3/sqlite3.dart' as sqlite;
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_connected_site_enrollment_store.dart';
import 'package:supermega_shop/shop_connected_site_v42_enrollment_verifier.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_site_coordinator.dart';

import 'historical_shop_fixture_support.dart';

const _now = 2000000000000;
const _tenant = 'tenant-enrollment';
const _site = 'site-enrollment';
const _coordinator = 'counter-enrollment';
const _device = 'device-enrollment';
const _nonce = 'pairing_nonce_enrollment_0001';

String _signV2PairingClaim(String claim) {
  final domain = ECDomainParameters('secp256r1');
  final signer = Signer('SHA-256/DET-ECDSA')
    ..init(true, PrivateKeyParameter(ECPrivateKey(BigInt.one, domain)));
  final signature = signer.generateSignature(
    Uint8List.fromList(utf8.encode(claim)),
  ) as ECSignature;
  final lowS = signature.s > domain.n ~/ BigInt.two
      ? domain.n - signature.s
      : signature.s;
  List<int> fixed(BigInt value) {
    final hex = value.toRadixString(16).padLeft(64, '0');
    return [
      for (var i = 0; i < 64; i += 2)
        int.parse(hex.substring(i, i + 2), radix: 16),
    ];
  }

  return base64Url
      .encode([...fixed(signature.r), ...fixed(lowS)])
      .replaceAll('=', '');
}

void main() {
  test('v2 owner signature binds P-256 profile, key and tenant', () async {
    const pointHex =
        '046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c2'
        '964fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5';
    final point = [
      for (var i = 0; i < pointHex.length; i += 2)
        int.parse(pointHex.substring(i, i + 2), radix: 16),
    ];
    final publicKey = base64Url.encode(point).replaceAll('=', '');
    final fingerprint = sha256.convert(point).toString();
    final owner = await Ed25519().newKeyPairFromSeed(List<int>.filled(32, 14));
    final ownerPublic = (await owner.extractPublicKey()).bytes;
    ShopOwnerEnrollmentEvidenceV2 evidence(
      String signature, {
      ShopOwnerEnrollmentAction action = ShopOwnerEnrollmentAction.approve,
      int generation = 1,
      int observedAtMillis = _now - 100,
    }) {
      final payload = <String, Object>{
        'schema': 'supermega.shop.owner-enrollment-evidence.v2',
        'action': action.name,
        'tenantId': _tenant,
        'siteId': _site,
        'coordinatorDeviceId': _coordinator,
        'deviceId': _device,
        'signingProfile': 'p256-sha256-v2',
        'signingKeyId': 'key-v2',
        'publicKeyBase64Url': publicKey,
        'clientFingerprint': fingerprint,
        'sessionGeneration': generation,
        'observedAtMillis': observedAtMillis,
        'authorityKeyId': 'owner-key-1',
      };
      return ShopOwnerEnrollmentEvidenceV2(
        action: action,
        tenantId: _tenant,
        siteId: _site,
        coordinatorDeviceId: _coordinator,
        deviceId: _device,
        signingKeyId: 'key-v2',
        publicKeyBase64Url: publicKey,
        clientFingerprint: fingerprint,
        sessionGeneration: generation,
        observedAtMillis: observedAtMillis,
        authorityKeyId: 'owner-key-1',
        signature: signature,
        evidenceDigest: connectedSiteSha256(payload),
      );
    }

    final unsigned = evidence('A' * 86);
    final signature = base64Url
        .encode(
          (await Ed25519().sign(
            utf8.encode(canonicalConnectedSiteJson(unsigned.signingPayload)),
            keyPair: owner,
          )).bytes,
        )
        .replaceAll('=', '');
    final signed = evidence(signature);
    final unsignedRevoke = evidence(
      'A' * 86,
      action: ShopOwnerEnrollmentAction.revoke,
      generation: 2,
      observedAtMillis: _now - 50,
    );
    final revokeSignature = base64Url
        .encode(
          (await Ed25519().sign(
            utf8.encode(
              canonicalConnectedSiteJson(unsignedRevoke.signingPayload),
            ),
            keyPair: owner,
          )).bytes,
        )
        .replaceAll('=', '');
    final signedRevoke = evidence(
      revokeSignature,
      action: ShopOwnerEnrollmentAction.revoke,
      generation: 2,
      observedAtMillis: _now - 50,
    );
    final bytes = canonicalConnectedSiteJson(signed.toJson());
    ShopOwnerEnrollmentEvidenceV2 verify({
      String? json,
      ShopOwnerEnrollmentAction action = ShopOwnerEnrollmentAction.approve,
      String tenant = _tenant,
      String keyId = 'key-v2',
      String? expectedPoint,
      String? expectedFingerprint,
      Map<String, List<int>>? pins,
    }) => verifyRetainedOwnerEnrollmentV2Sync(
      expectedAction: action,
      canonicalEvidenceJson: json ?? bytes,
      expectedEvidenceDigest: action == ShopOwnerEnrollmentAction.approve
          ? signed.evidenceDigest
          : signedRevoke.evidenceDigest,
      tenantId: tenant,
      siteId: _site,
      coordinatorDeviceId: _coordinator,
      deviceId: _device,
      signingKeyId: keyId,
      publicKeyBase64Url: expectedPoint ?? publicKey,
      clientFingerprint: expectedFingerprint ?? fingerprint,
      sessionGeneration: action == ShopOwnerEnrollmentAction.approve ? 1 : 2,
      trustedAtMillis: _now,
      pinnedOwnerIssuerKeys: pins ?? {'owner-key-1': ownerPublic},
    );
    expect(verify().signingKeyId, 'key-v2');
    expect(
      verify(
        json: canonicalConnectedSiteJson(signedRevoke.toJson()),
        action: ShopOwnerEnrollmentAction.revoke,
      ).action,
      ShopOwnerEnrollmentAction.revoke,
    );
    expect(
      () => verify(json: canonicalConnectedSiteJson(signedRevoke.toJson())),
      throwsFormatException,
    );
    final pairing = <String, Object?>{
      'nonce': _nonce,
      'tenant_id': _tenant,
      'site_id': _site,
      'coordinator_device_id': _coordinator,
      'consumed_at_millis': _now - 200,
      'expires_at_millis': _now + 1000,
    };
    final pairingClaim = canonicalConnectedSiteJson({
      'schema': 'supermega.shop.pairing-claim.v2',
      'tenantId': _tenant,
      'siteId': _site,
      'coordinatorDeviceId': _coordinator,
      'nonce': _nonce,
      'expiresAtMillis': _now + 1000,
      'observedAtMillis': _now - 200,
      'signingProfile': 'p256-sha256-v2',
      'signingKeyId': 'key-v2',
      'publicKeyBase64Url': publicKey,
      'clientFingerprint': fingerprint,
    });
    final pending = <String, Object?>{
      'client_fingerprint': fingerprint,
      'nonce': _nonce,
      'tenant_id': _tenant,
      'site_id': _site,
      'coordinator_device_id': _coordinator,
      'signing_profile': 'p256-sha256-v2',
      'signing_key_id': 'key-v2',
      'public_key': Uint8List.fromList(point),
      'claim_json': pairingClaim,
      'possession_signature': _signV2PairingClaim(pairingClaim),
      'observed_at_millis': _now - 200,
    };
    final approval = <String, Object?>{
      'evidence_digest': signed.evidenceDigest,
      'action': 'approve',
      'tenant_id': _tenant,
      'site_id': _site,
      'coordinator_device_id': _coordinator,
      'device_id': _device,
      'client_fingerprint': fingerprint,
      'signing_profile': 'p256-sha256-v2',
      'signing_key_id': 'key-v2',
      'public_key': Uint8List.fromList(point),
      'session_generation': 1,
      'observed_at_millis': _now - 100,
      'authority_key_id': 'owner-key-1',
      'evidence_json': canonicalConnectedSiteJson(signed.toJson()),
    };
    final profile = <String, Object?>{
      'device_id': _device,
      'tenant_id': _tenant,
      'site_id': _site,
      'client_fingerprint': fingerprint,
      'signing_profile': 'p256-sha256-v2',
      'signing_key_id': 'key-v2',
      'public_key': Uint8List.fromList(point),
      'approval_digest': signed.evidenceDigest,
    };
    final device = <String, Object?>{
      'device_id': _device,
      'tenant_id': _tenant,
      'site_id': _site,
      'public_key_fingerprint': fingerprint,
      'session_generation': 1,
      'state': 'active',
      'enrolled_at_millis': _now - 100,
      'revoked_at_millis': null,
    };
    final revoke = <String, Object?>{
      ...approval,
      'evidence_digest': signedRevoke.evidenceDigest,
      'action': 'revoke',
      'session_generation': 2,
      'observed_at_millis': _now - 50,
      'evidence_json': canonicalConnectedSiteJson(signedRevoke.toJson()),
    };
    bool rowsValid({
      Map<String, Object?>? changedPending,
      Map<String, Object?>? changedApproval,
      Map<String, Object?>? changedProfile,
      Map<String, Object?>? changedDevice,
      Map<String, Object?>? changedRevoke,
      Map<String, List<int>>? pins,
    }) => shopConnectedEnrollmentRowsValidV42(
      pairingNonces: [pairing],
      v1Pending: const [],
      v1Evidence: const [],
      v2Pending: [changedPending ?? pending],
      v2Evidence: [changedApproval ?? approval, ?changedRevoke],
      deviceProfiles: [changedProfile ?? profile],
      devices: [changedDevice ?? device],
      pinnedOwnerIssuerKeys: pins ?? {'owner-key-1': ownerPublic},
    );
    expect(rowsValid(), isTrue);
    expect(rowsValid(pins: const {}), isFalse);
    expect(
      rowsValid(changedPending: {...pending, 'site_id': 'other'}),
      isFalse,
    );
    expect(
      rowsValid(changedProfile: {...profile, 'signing_key_id': 'other'}),
      isFalse,
    );
    expect(
      rowsValid(changedApproval: {...approval, 'evidence_json': '{}'}),
      isFalse,
    );
    expect(rowsValid(changedDevice: {...device, 'state': 'revoked'}), isFalse);
    final revokedDevice = {
      ...device,
      'state': 'revoked',
      'session_generation': 2,
      'revoked_at_millis': _now - 50,
    };
    expect(
      rowsValid(changedRevoke: revoke, changedDevice: revokedDevice),
      isTrue,
    );
    expect(
      rowsValid(
        changedRevoke: {...revoke, 'session_generation': 1},
        changedDevice: revokedDevice,
      ),
      isFalse,
    );
    expect(rowsValid(changedRevoke: revoke, changedDevice: device), isFalse);
    expect(() => verify(tenant: 'other'), throwsFormatException);
    expect(() => verify(keyId: 'other'), throwsFormatException);
    expect(
      () => verify(expectedPoint: 'A' * publicKey.length),
      throwsFormatException,
    );
    expect(() => verify(expectedFingerprint: '0' * 64), throwsFormatException);
    expect(() => verify(pins: const {}), throwsFormatException);
    for (final altered in [
      {...signed.toJson(), 'signingProfile': 'ed25519'},
      {...signed.toJson(), 'signature': 'A' * 86},
      {...signed.toJson(), 'action': 'revoke'},
    ]) {
      expect(
        () => verify(json: canonicalConnectedSiteJson(altered)),
        throwsFormatException,
      );
    }
  });

  test('signed v2 rows reopen and restore only with pinned owner', () async {
    const pointHex =
        '046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c2'
        '964fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5';
    final point = Uint8List.fromList([
      for (var i = 0; i < pointHex.length; i += 2)
        int.parse(pointHex.substring(i, i + 2), radix: 16),
    ]);
    final fingerprint = sha256.convert(point).toString();
    final owner = await Ed25519().newKeyPairFromSeed(List<int>.filled(32, 14));
    final trust = ShopV42EnrollmentTrustSource.testOnly({
      'owner-key-1': (await owner.extractPublicKey()).bytes,
    });
    final payload = <String, Object>{
      'schema': 'supermega.shop.owner-enrollment-evidence.v2',
      'action': 'approve',
      'tenantId': _tenant,
      'siteId': _site,
      'coordinatorDeviceId': _coordinator,
      'deviceId': _device,
      'signingProfile': 'p256-sha256-v2',
      'signingKeyId': 'key-v2',
      'publicKeyBase64Url': base64Url.encode(point).replaceAll('=', ''),
      'clientFingerprint': fingerprint,
      'sessionGeneration': 1,
      'observedAtMillis': _now - 100,
      'authorityKeyId': 'owner-key-1',
    };
    final digest = connectedSiteSha256(payload);
    final signature = base64Url
        .encode(
          (await Ed25519().sign(
            utf8.encode(canonicalConnectedSiteJson(payload)),
            keyPair: owner,
          )).bytes,
        )
        .replaceAll('=', '');
    final evidenceJson = canonicalConnectedSiteJson({
      ...payload,
      'signature': signature,
      'evidenceDigest': digest,
    });
    final pairingClaim = canonicalConnectedSiteJson({
      'schema': 'supermega.shop.pairing-claim.v2',
      'tenantId': _tenant,
      'siteId': _site,
      'coordinatorDeviceId': _coordinator,
      'nonce': _nonce,
      'expiresAtMillis': _now + 1000,
      'observedAtMillis': _now - 200,
      'signingProfile': 'p256-sha256-v2',
      'signingKeyId': 'key-v2',
      'publicKeyBase64Url': base64Url.encode(point).replaceAll('=', ''),
      'clientFingerprint': fingerprint,
    });
    final root = await Directory.systemTemp.createTemp('shop-v42-signed-');
    final source = File('${root.path}/source.sqlite');
    final archive = File('${root.path}/source.smbackup');
    final restored = File('${root.path}/fresh/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(source), trust);
    try {
      await database.verifyReadyForUse();
      await database.transaction(() async {
        await database.customStatement(
          'INSERT INTO shop_site_pairing_nonces '
          '(nonce, tenant_id, site_id, coordinator_device_id, '
          'issued_at_millis, expires_at_millis, consumed_at_millis) '
          'VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            _nonce,
            _tenant,
            _site,
            _coordinator,
            _now - 1000,
            _now + 1000,
            _now - 200,
          ],
        );
        await database.customStatement(
          'INSERT INTO shop_site_v2_pending_enrollments '
          '(client_fingerprint, nonce, tenant_id, site_id, '
          'coordinator_device_id, signing_profile, signing_key_id, '
          'public_key, claim_json, possession_signature, observed_at_millis) '
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            fingerprint,
            _nonce,
            _tenant,
            _site,
            _coordinator,
            'p256-sha256-v2',
            'key-v2',
            point,
            pairingClaim,
            _signV2PairingClaim(pairingClaim),
            _now - 200,
          ],
        );
        await database.customStatement(
          'INSERT INTO shop_site_devices '
          '(device_id, tenant_id, site_id, public_key_fingerprint, '
          'session_generation, state, enrolled_at_millis) '
          "VALUES (?, ?, ?, ?, 1, 'active', ?)",
          [_device, _tenant, _site, fingerprint, _now - 100],
        );
        await database.customStatement(
          'INSERT INTO shop_site_v2_enrollment_evidence '
          '(evidence_digest, action, tenant_id, site_id, '
          'coordinator_device_id, device_id, client_fingerprint, '
          'signing_profile, signing_key_id, public_key, session_generation, '
          'observed_at_millis, authority_key_id, evidence_json) '
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            digest,
            'approve',
            _tenant,
            _site,
            _coordinator,
            _device,
            fingerprint,
            'p256-sha256-v2',
            'key-v2',
            point,
            1,
            _now - 100,
            'owner-key-1',
            evidenceJson,
          ],
        );
        await database.customStatement(
          'INSERT INTO shop_site_device_profiles_v42 '
          '(device_id, tenant_id, site_id, client_fingerprint, '
          'signing_profile, signing_key_id, public_key, approval_digest) '
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            _device,
            _tenant,
            _site,
            fingerprint,
            'p256-sha256-v2',
            'key-v2',
            point,
            digest,
          ],
        );
      });
      await database.verifyReadyForUse();
      expect(
        () => ShopBackup.verifySnapshot(source, expectedSchemaVersion: 42),
        throwsFormatException,
      );
      ShopBackup.verifySnapshot(
        source,
        expectedSchemaVersion: 42,
        v42EnrollmentTrustSource: trust,
      );
      await ShopBackup.exportEncrypted(
        database: database,
        archive: archive,
        password: 'signed-v42-source',
        scratchRoot: root,
        v42EnrollmentTrustSource: trust,
      );
      await database.close();
      database = ShopDatabase(NativeDatabase(source), trust);
      await database.verifyReadyForUse();
      await database.close();
      await restored.parent.create(recursive: true);
      await ShopBackup.restoreIntoEmptyDatabase(
        archive: archive,
        target: restored,
        password: 'signed-v42-source',
        v42EnrollmentTrustSource: trust,
      );
      database = ShopDatabase(NativeDatabase(restored), trust);
      await database.verifyReadyForUse();
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test('v2 possession and owner approval commit without partial replay', () async {
    const pointHex =
        '046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c2'
        '964fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5';
    final point = Uint8List.fromList([
      for (var i = 0; i < pointHex.length; i += 2)
        int.parse(pointHex.substring(i, i + 2), radix: 16),
    ]);
    final publicKey = base64Url.encode(point).replaceAll('=', '');
    final fingerprint = sha256.convert(point).toString();
    final owner = await Ed25519().newKeyPairFromSeed(List<int>.filled(32, 14));
    final trust = ShopV42EnrollmentTrustSource.testOnly({
      'owner-key-1': (await owner.extractPublicKey()).bytes,
    });
    final root = await Directory.systemTemp.createTemp('shop-v42-writer-');
    final file = File('${root.path}/shop.sqlite');
    final database = ShopDatabase(NativeDatabase(file), trust);
    try {
      await database.verifyReadyForUse();
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
        expiresAtMillis: _now + 1000,
      );
      final claim = canonicalConnectedSiteJson({
        'schema': 'supermega.shop.pairing-claim.v2',
        'tenantId': _tenant,
        'siteId': _site,
        'coordinatorDeviceId': _coordinator,
        'nonce': _nonce,
        'expiresAtMillis': _now + 1000,
        'observedAtMillis': _now - 100,
        'signingProfile': 'p256-sha256-v2',
        'signingKeyId': 'key-v2',
        'publicKeyBase64Url': publicKey,
        'clientFingerprint': fingerprint,
      });
      final domain = ECDomainParameters('secp256r1');
      final signer = Signer('SHA-256/DET-ECDSA')
        ..init(true, PrivateKeyParameter(ECPrivateKey(BigInt.one, domain)));
      final signature = signer.generateSignature(
        Uint8List.fromList(utf8.encode(claim)),
      ) as ECSignature;
      final order = domain.n;
      final lowS = signature.s > order ~/ BigInt.two
          ? order - signature.s
          : signature.s;
      List<int> fixed(BigInt value) {
        final hex = value.toRadixString(16).padLeft(64, '0');
        return [
          for (var i = 0; i < 64; i += 2)
            int.parse(hex.substring(i, i + 2), radix: 16),
        ];
      }

      final possession = base64Url
          .encode([...fixed(signature.r), ...fixed(lowS)])
          .replaceAll('=', '');
      Future<bool> pair({String site = _site}) =>
          store.consumeAndCreatePendingV2(
            tenantId: _tenant,
            siteId: site,
            coordinatorDeviceId: _coordinator,
            nonce: _nonce,
            expiresAtMillis: _now + 1000,
            observedAtMillis: _now - 100,
            signingKeyId: 'key-v2',
            publicKeyBase64Url: publicKey,
            clientFingerprint: fingerprint,
            possessionSignatureBase64Url: possession,
          );
      expect(await pair(site: 'wrong-site'), isFalse);
      expect(await pair(), isTrue);
      expect(await pair(), isFalse);
      final payload = <String, Object>{
        'schema': 'supermega.shop.owner-enrollment-evidence.v2',
        'action': 'approve',
        'tenantId': _tenant,
        'siteId': _site,
        'coordinatorDeviceId': _coordinator,
        'deviceId': _device,
        'signingProfile': 'p256-sha256-v2',
        'signingKeyId': 'key-v2',
        'publicKeyBase64Url': publicKey,
        'clientFingerprint': fingerprint,
        'sessionGeneration': 1,
        'observedAtMillis': _now - 50,
        'authorityKeyId': 'owner-key-1',
      };
      final ownerSignature = base64Url
          .encode(
            (await Ed25519().sign(
              utf8.encode(canonicalConnectedSiteJson(payload)),
              keyPair: owner,
            )).bytes,
          )
          .replaceAll('=', '');
      final approval = ShopOwnerEnrollmentEvidenceV2(
        action: ShopOwnerEnrollmentAction.approve,
        tenantId: _tenant,
        siteId: _site,
        coordinatorDeviceId: _coordinator,
        deviceId: _device,
        signingKeyId: 'key-v2',
        publicKeyBase64Url: publicKey,
        clientFingerprint: fingerprint,
        sessionGeneration: 1,
        observedAtMillis: _now - 50,
        authorityKeyId: 'owner-key-1',
        signature: ownerSignature,
        evidenceDigest: connectedSiteSha256(payload),
      );
      await store.importOwnerEvidenceV2(approval, trust: trust);
      await database.verifyReadyForUse();
      await expectLater(
        store.importOwnerEvidenceV2(approval, trust: trust),
        throwsStateError,
      );
      expect(
        (await database
                .customSelect(
                  'SELECT COUNT(*) AS n FROM shop_site_v2_enrollment_evidence',
                )
                .getSingle())
            .read<int>('n'),
        1,
      );
      Future<ShopOwnerEnrollmentEvidenceV2> signedRevoke({
        String site = _site,
        int generation = 2,
      }) async {
        final revokePayload = <String, Object>{
          ...payload,
          'action': 'revoke',
          'siteId': site,
          'sessionGeneration': generation,
          'observedAtMillis': _now - 25,
        };
        final revokeSignature = base64Url
            .encode(
              (await Ed25519().sign(
                utf8.encode(canonicalConnectedSiteJson(revokePayload)),
                keyPair: owner,
              )).bytes,
            )
            .replaceAll('=', '');
        return ShopOwnerEnrollmentEvidenceV2(
          action: ShopOwnerEnrollmentAction.revoke,
          tenantId: _tenant,
          siteId: site,
          coordinatorDeviceId: _coordinator,
          deviceId: _device,
          signingKeyId: 'key-v2',
          publicKeyBase64Url: publicKey,
          clientFingerprint: fingerprint,
          sessionGeneration: generation,
          observedAtMillis: _now - 25,
          authorityKeyId: 'owner-key-1',
          signature: revokeSignature,
          evidenceDigest: connectedSiteSha256(revokePayload),
        );
      }

      await expectLater(
        store.importOwnerEvidenceV2(
          await signedRevoke(site: 'other'),
          trust: trust,
        ),
        throwsStateError,
      );
      expect(
        (await database
                .customSelect(
                  'SELECT COUNT(*) AS n FROM shop_site_v2_enrollment_evidence',
                )
                .getSingle())
            .read<int>('n'),
        1,
      );
      await store.importOwnerEvidenceV2(await signedRevoke(), trust: trust);
      await database.verifyReadyForUse();
      expect(
        (await database
                .customSelect(
                  'SELECT state FROM shop_site_devices WHERE device_id = ?',
                  variables: [const Variable<String>(_device)],
                )
                .getSingle())
            .read<String>('state'),
        'revoked',
      );
      await expectLater(
        store.importOwnerEvidenceV2(approval, trust: trust),
        throwsStateError,
      );
      ShopBackup.verifySnapshot(
        file,
        expectedSchemaVersion: 42,
        v42EnrollmentTrustSource: trust,
      );
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test('v2 nonce expired at transaction entry leaves zero writes', () async {
    const pointHex =
        '046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c2'
        '964fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5';
    final point = Uint8List.fromList([
      for (var i = 0; i < pointHex.length; i += 2)
        int.parse(pointHex.substring(i, i + 2), radix: 16),
    ]);
    final publicKey = base64Url.encode(point).replaceAll('=', '');
    final fingerprint = sha256.convert(point).toString();
    final root = await Directory.systemTemp.createTemp('shop-v42-expiry-');
    final database = ShopDatabase(
      NativeDatabase(File('${root.path}/shop.sqlite')),
    );
    try {
      await database.verifyReadyForUse();
      var clockReads = 0;
      final store = ShopConnectedSiteEnrollmentStore(
        database: database,
        nowMillis: () => ++clockReads == 1 ? _now : _now + 1000,
      );
      await store.registerPairingNonce(
        tenantId: _tenant,
        siteId: _site,
        coordinatorDeviceId: _coordinator,
        nonce: _nonce,
        issuedAtMillis: _now - 1000,
        expiresAtMillis: _now + 1000,
      );
      final claim = canonicalConnectedSiteJson({
        'schema': 'supermega.shop.pairing-claim.v2',
        'tenantId': _tenant,
        'siteId': _site,
        'coordinatorDeviceId': _coordinator,
        'nonce': _nonce,
        'expiresAtMillis': _now + 1000,
        'observedAtMillis': _now,
        'signingProfile': 'p256-sha256-v2',
        'signingKeyId': 'key-v2',
        'publicKeyBase64Url': publicKey,
        'clientFingerprint': fingerprint,
      });
      expect(
        await store.consumeAndCreatePendingV2(
          tenantId: _tenant,
          siteId: _site,
          coordinatorDeviceId: _coordinator,
          nonce: _nonce,
          expiresAtMillis: _now + 1000,
          observedAtMillis: _now,
          signingKeyId: 'key-v2',
          publicKeyBase64Url: publicKey,
          clientFingerprint: fingerprint,
          possessionSignatureBase64Url: _signV2PairingClaim(claim),
        ),
        isFalse,
      );
      expect(clockReads, 2);
      expect(
        (await database
                .customSelect(
                  'SELECT consumed_at_millis FROM shop_site_pairing_nonces '
                  'WHERE nonce = ?',
                  variables: [const Variable<String>(_nonce)],
                )
                .getSingle())
            .readNullable<int>('consumed_at_millis'),
        isNull,
      );
      expect(
        (await database
                .customSelect(
                  'SELECT COUNT(*) AS n FROM shop_site_v2_pending_enrollments',
                )
                .getSingle())
            .read<int>('n'),
        0,
      );
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test('second SQLite writer delay cannot consume expired v2 nonce', () async {
    const pointHex =
        '046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c2'
        '964fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5';
    final point = Uint8List.fromList([
      for (var i = 0; i < pointHex.length; i += 2)
        int.parse(pointHex.substring(i, i + 2), radix: 16),
    ]);
    final publicKey = base64Url.encode(point).replaceAll('=', '');
    final fingerprint = sha256.convert(point).toString();
    final root = await Directory.systemTemp.createTemp('shop-v42-lock-');
    final file = File('${root.path}/shop.sqlite');
    final holder = ShopDatabase(NativeDatabase.createInBackground(file));
    final contender = ShopDatabase(
      NativeDatabase.createInBackground(
        file,
        setup: (raw) => raw.execute('PRAGMA busy_timeout = 5000'),
      ),
    );
    final locked = Completer<void>();
    final release = Completer<void>();
    final preflightRead = Completer<void>();
    try {
      await holder.verifyReadyForUse();
      await contender.verifyReadyForUse();
      var reads = 0;
      final store = ShopConnectedSiteEnrollmentStore(
        database: contender,
        nowMillis: () {
          reads += 1;
          if (reads == 1) preflightRead.complete();
          return reads == 1 ? _now : _now + 1000;
        },
      );
      await store.registerPairingNonce(
        tenantId: _tenant,
        siteId: _site,
        coordinatorDeviceId: _coordinator,
        nonce: _nonce,
        issuedAtMillis: _now - 1000,
        expiresAtMillis: _now + 1000,
      );
      final claim = canonicalConnectedSiteJson({
        'schema': 'supermega.shop.pairing-claim.v2',
        'tenantId': _tenant,
        'siteId': _site,
        'coordinatorDeviceId': _coordinator,
        'nonce': _nonce,
        'expiresAtMillis': _now + 1000,
        'observedAtMillis': _now,
        'signingProfile': 'p256-sha256-v2',
        'signingKeyId': 'key-v2',
        'publicKeyBase64Url': publicKey,
        'clientFingerprint': fingerprint,
      });
      final holding = holder.transaction(() async {
        await holder.customStatement(
          'INSERT INTO shop_site_pairing_nonces '
          '(nonce, tenant_id, site_id, coordinator_device_id, '
          'issued_at_millis, expires_at_millis) VALUES (?, ?, ?, ?, ?, ?)',
          [
            'other_pairing_nonce_000000001',
            _tenant,
            _site,
            _coordinator,
            _now - 1000,
            _now + 1000,
          ],
        );
        locked.complete();
        await release.future;
      });
      await locked.future.timeout(const Duration(seconds: 10));
      final pending = store.consumeAndCreatePendingV2(
        tenantId: _tenant,
        siteId: _site,
        coordinatorDeviceId: _coordinator,
        nonce: _nonce,
        expiresAtMillis: _now + 1000,
        observedAtMillis: _now,
        signingKeyId: 'key-v2',
        publicKeyBase64Url: publicKey,
        clientFingerprint: fingerprint,
        possessionSignatureBase64Url: _signV2PairingClaim(claim),
      );
      try {
        await preflightRead.future.timeout(const Duration(seconds: 10));
        await Future<void>.delayed(const Duration(milliseconds: 50));
      } finally {
        release.complete();
        await holding;
      }
      expect(await pending.timeout(const Duration(seconds: 10)), isFalse);
      expect(reads, 2);
      expect(
        (await contender
                .customSelect(
                  'SELECT consumed_at_millis FROM shop_site_pairing_nonces '
                  'WHERE nonce = ?',
                  variables: [const Variable<String>(_nonce)],
                )
                .getSingle())
            .readNullable<int>('consumed_at_millis'),
        isNull,
      );
      expect(
        (await contender
                .customSelect(
                  'SELECT COUNT(*) AS n FROM shop_site_v2_pending_enrollments',
                )
                .getSingle())
            .read<int>('n'),
        0,
      );
    } finally {
      if (!release.isCompleted) release.complete();
      await contender.close();
      await holder.close();
      await root.delete(recursive: true);
    }
  });

  test(
    'empty v41 upgrades to verified v42 and restores on a fresh target',
    () async {
      final root = await Directory.systemTemp.createTemp('shop-v42-profile-');
      final file = File('${root.path}/source.sqlite');
      final archive = File('${root.path}/verified.smbackup');
      final restored = File('${root.path}/fresh/shop.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      try {
        await database.verifyReadyForUse();
        await dropHistoricalShopSchemaDefinitionGroupInDatabase(
          database,
          shopConnectedDeviceProfileSchemaDefinitionsV42(),
        );
        await database.customStatement('PRAGMA user_version = 41');
        await database.close();

        database = ShopDatabase(NativeDatabase(file));
        await database.verifyReadyForUse();
        expect(database.schemaVersion, 42);
        for (final table in const [
          'shop_site_v2_pending_enrollments',
          'shop_site_v2_enrollment_evidence',
          'shop_site_device_profiles_v42',
        ]) {
          expect(
            (await database
                    .customSelect('SELECT COUNT(*) AS total FROM $table')
                    .getSingle())
                .read<int>('total'),
            0,
          );
        }
        await ShopBackup.exportEncrypted(
          database: database,
          archive: archive,
          password: 'v42-profile-fresh-target',
          scratchRoot: root,
        );
        await database.close();
        await restored.parent.create(recursive: true);
        await ShopBackup.restoreIntoEmptyDatabase(
          archive: archive,
          target: restored,
          password: 'v42-profile-fresh-target',
        );
        database = ShopDatabase(NativeDatabase(restored));
        await database.verifyReadyForUse();
        expect(database.schemaVersion, 42);
        ShopBackup.verifySnapshot(restored, expectedSchemaVersion: 42);
      } finally {
        await database.close();
        await root.delete(recursive: true);
      }
    },
  );

  test('legacy bare device survives genuine v41 to v42 upgrade', () async {
    final root = await Directory.systemTemp.createTemp('shop-v42-legacy-');
    final file = File('${root.path}/legacy.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    try {
      await database.verifyReadyForUse();
      await dropHistoricalShopSchemaDefinitionGroupInDatabase(
        database,
        shopConnectedDeviceProfileSchemaDefinitionsV42(),
      );
      await database.customStatement(
        'INSERT INTO shop_site_devices '
        '(device_id, tenant_id, site_id, public_key_fingerprint, '
        'session_generation, state, enrolled_at_millis) '
        "VALUES (?, ?, ?, ?, 1, 'active', ?)",
        [_device, _tenant, _site, 'a' * 64, _now - 1000],
      );
      await database.customStatement('PRAGMA user_version = 41');
      await database.close();
      database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      expect(database.schemaVersion, 42);
      expect(
        (await database
                .customSelect('SELECT COUNT(*) AS n FROM shop_site_devices')
                .getSingle())
            .read<int>('n'),
        1,
      );
      ShopBackup.verifySnapshot(file, expectedSchemaVersion: 42);
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test('v42 rejects orphan v2 enrollment evidence at open and backup', () async {
    final root = await Directory.systemTemp.createTemp('shop-v42-orphan-');
    final file = File('${root.path}/source.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    try {
      await database.verifyReadyForUse();
      await database.customInsert(
        'INSERT INTO shop_site_v2_enrollment_evidence '
        '(evidence_digest, action, tenant_id, site_id, coordinator_device_id, '
        'device_id, client_fingerprint, signing_profile, signing_key_id, '
        'public_key, session_generation, observed_at_millis, authority_key_id, '
        'evidence_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        variables: [
          Variable<String>('a' * 64),
          const Variable<String>('approve'),
          const Variable<String>(_tenant),
          const Variable<String>(_site),
          const Variable<String>(_coordinator),
          const Variable<String>(_device),
          Variable<String>('b' * 64),
          const Variable<String>('p256-sha256-v2'),
          const Variable<String>('key-v2'),
          Variable<Uint8List>(
            Uint8List.fromList([4, ...List<int>.filled(64, 0)]),
          ),
          const Variable<int>(1),
          const Variable<int>(_now),
          const Variable<String>('owner-key-1'),
          const Variable<String>('{}'),
        ],
      );
      await expectLater(database.verifyReadyForUse(), throwsStateError);
      expect(
        () => ShopBackup.verifySnapshot(file, expectedSchemaVersion: 42),
        throwsFormatException,
      );
      await database.close();
      database = ShopDatabase(NativeDatabase(file));
      await expectLater(database.verifyReadyForUse(), throwsStateError);
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test('partial pre-v42 schema rejects upgrade without relabeling source', () async {
    final root = await Directory.systemTemp.createTemp('shop-v42-partial-');
    final file = File('${root.path}/source.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    try {
      await database.verifyReadyForUse();
      await dropHistoricalShopSchemaDefinitionGroupInDatabase(
        database,
        shopConnectedDeviceProfileSchemaDefinitionsV42(),
      );
      await database.customStatement(
        shopConnectedDeviceProfileSchemaDefinitionsV42()['shop_site_v2_pending_enrollments']!,
      );
      await database.customStatement('PRAGMA user_version = 41');
      await database.close();
      database = ShopDatabase(NativeDatabase(file));
      await expectLater(database.verifyReadyForUse(), throwsStateError);
      final raw = sqlite.sqlite3.open(file.path);
      try {
        expect(raw.userVersion, 41);
      } finally {
        raw.close();
      }
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test('retained owner enrollment requires signed exact approval', () async {
    final ownerPair = await Ed25519().newKeyPairFromSeed(
      List<int>.filled(32, 14),
    );
    final clientPair = await Ed25519().newKeyPairFromSeed(
      List<int>.filled(32, 15),
    );
    final ownerPublic = (await ownerPair.extractPublicKey()).bytes;
    final fingerprint = sha256
        .convert((await clientPair.extractPublicKey()).bytes)
        .toString();
    final unsigned = _evidence(
      action: ShopOwnerEnrollmentAction.approve,
      fingerprint: fingerprint,
      observedAtMillis: _now - 100,
      sessionGeneration: 1,
    );
    final signature = base64Url
        .encode(
          (await Ed25519().sign(
            utf8.encode(canonicalConnectedSiteJson(unsigned.signingPayload)),
            keyPair: ownerPair,
          )).bytes,
        )
        .replaceAll('=', '');
    final signed = ShopOwnerEnrollmentEvidenceV1(
      action: unsigned.action,
      tenantId: unsigned.tenantId,
      siteId: unsigned.siteId,
      coordinatorDeviceId: unsigned.coordinatorDeviceId,
      deviceId: unsigned.deviceId,
      clientFingerprint: unsigned.clientFingerprint,
      sessionGeneration: unsigned.sessionGeneration,
      observedAtMillis: unsigned.observedAtMillis,
      authorityKeyId: unsigned.authorityKeyId,
      signature: signature,
      evidenceDigest: unsigned.evidenceDigest,
    );
    final bytes = canonicalConnectedSiteJson(signed.toJson());
    ShopOwnerEnrollmentEvidenceV1 verify({
      String? candidateBytes,
      String site = _site,
      String coordinator = _coordinator,
      String device = _device,
      String? expectedFingerprint,
      String? expectedDigest,
      int generation = 1,
      int time = _now,
      Map<String, List<int>>? pins,
    }) => verifyRetainedEnrollmentApprovalSync(
      canonicalEvidenceJson: candidateBytes ?? bytes,
      expectedEvidenceDigest: expectedDigest ?? signed.evidenceDigest,
      tenantId: _tenant,
      siteId: site,
      coordinatorDeviceId: coordinator,
      deviceId: device,
      clientFingerprint: expectedFingerprint ?? fingerprint,
      sessionGeneration: generation,
      trustedAtMillis: time,
      pinnedOwnerIssuerKeys: pins ?? {'owner-key-1': ownerPublic},
    );
    expect(verify().evidenceDigest, signed.evidenceDigest);
    expect(() => verify(site: 'other'), throwsFormatException);
    expect(() => verify(coordinator: 'other'), throwsFormatException);
    expect(() => verify(device: 'other'), throwsFormatException);
    expect(() => verify(expectedFingerprint: '0' * 64), throwsFormatException);
    expect(() => verify(expectedDigest: '0' * 64), throwsFormatException);
    expect(() => verify(generation: 2), throwsFormatException);
    expect(() => verify(time: _now - 101), throwsFormatException);
    expect(() => verify(pins: const {}), throwsFormatException);
    final revoke = {...signed.toJson(), 'action': 'revoke'};
    expect(
      () => verify(candidateBytes: canonicalConnectedSiteJson(revoke)),
      throwsFormatException,
    );
    final altered = {
      ...signed.toJson(),
      'signature': base64Url
          .encode(List<int>.filled(64, 1))
          .replaceAll('=', ''),
    };
    expect(
      () => verify(candidateBytes: canonicalConnectedSiteJson(altered)),
      throwsFormatException,
    );
  });

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

  test('v24 migrates through v25 authority into fail-closed v27', () async {
    final root = await Directory.systemTemp.createTemp('shop-enrollment-v24-');
    final file = File('${root.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    try {
      await database.verifyReadyForUse();
      await dropHistoricalShopSchemaDefinitionGroupInDatabase(
        database,
        shopConnectedTrustedTimeIssuerSchemaDefinitionsV38(),
      );
      for (final entry
          in shopConnectedAuthoritySchemaDefinitionsV27().entries
              .toList()
              .reversed) {
        final type = shopSchemaObjectTypeForDefinition(entry.value);
        await database.customStatement(
          'DROP ${type.toUpperCase()} IF EXISTS ${entry.key}',
        );
      }
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
      for (final entry
          in shopConnectedAttemptSchemaDefinitionsV28().entries
              .toList()
              .reversed) {
        final type =
            canonicalShopSchemaSql(entry.value).startsWith('create table')
            ? 'TABLE'
            : 'TRIGGER';
        await database.customStatement('DROP $type IF EXISTS ${entry.key}');
      }
      await database.customStatement('PRAGMA user_version = 24');
      await database.close();

      database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      expect(database.schemaVersion, 42);
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

  test('materialized v25 authority survives direct v27 migration', () async {
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
      await dropHistoricalShopSchemaDefinitionGroupInDatabase(
        database,
        shopConnectedTrustedTimeIssuerSchemaDefinitionsV38(),
      );
      for (final entry
          in shopConnectedAuthoritySchemaDefinitionsV27().entries
              .toList()
              .reversed) {
        final type = shopSchemaObjectTypeForDefinition(entry.value);
        await database.customStatement(
          'DROP ${type.toUpperCase()} IF EXISTS ${entry.key}',
        );
      }
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
          in shopConnectedAttemptSchemaDefinitionsV28().entries
              .toList()
              .reversed) {
        final type =
            canonicalShopSchemaSql(entry.value).startsWith('create table')
            ? 'TABLE'
            : 'TRIGGER';
        await database.customStatement('DROP $type IF EXISTS ${entry.key}');
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
