import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;
import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_cloud_feed_production_trust.dart';
import 'package:supermega_shop/shop_connected_platform_security.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';

class _Platform extends UnavailableConnectedPlatformSecurity {
  _Platform(this.identity, this.keyPair, {this.wrongSigner = false});
  final ConnectedPlatformIdentity identity;
  final SimpleKeyPair keyPair;
  final bool wrongSigner;
  int loads = 0;
  int signs = 0;

  @override
  Future<ConnectedPlatformIdentity> loadIdentity({
    required String alias,
  }) async {
    loads++;
    return identity;
  }

  @override
  Future<Uint8List> sign({
    required String alias,
    required Uint8List payload,
  }) async {
    signs++;
    final signer = wrongSigner
        ? await Ed25519().newKeyPairFromSeed(List.filled(32, 2))
        : keyPair;
    return Uint8List.fromList(
      (await Ed25519().sign(payload, keyPair: signer)).bytes,
    );
  }
}

void main() {
  test('default-off and missing reviewed issuer pins reject before platform access', () async {
    final source = ConnectedCloudFeedProductionTrustSource();
    await expectLater(
      source.load(
        alias: 'device-1',
        expectedSigningKeyId: 'key-1',
        expectedFingerprintSha256: 'a' * 64,
      ),
      throwsStateError,
    );
    await expectLater(
      ConnectedCloudFeedProductionTrustSource(runtimeEnabled: true).load(
        alias: 'device-1',
        expectedSigningKeyId: 'key-1',
        expectedFingerprintSha256: 'a' * 64,
      ),
      throwsStateError,
    );
  });

  test('platform key possession and reviewed pins are bound, not response supplied', () async {
    final pair = await Ed25519().newKeyPairFromSeed(List.filled(32, 1));
    final public = await pair.extractPublicKey();
    final fingerprint = crypto.sha256.convert(public.bytes).toString();
    final identity = ConnectedPlatformIdentity(
      alias: 'device-1',
      keyId: 'key-1',
      algorithm: 'ed25519',
      publicKeyBase64: base64.encode(public.bytes),
      publicKeyFingerprintSha256: fingerprint,
      tlsCertificateFingerprintSha256: 'b' * 64,
      sealedTlsMaterialId: 'tls-1',
    );
    final platform = _Platform(identity, pair);
    await expectLater(
      ConnectedCloudFeedProductionTrustSource(
        platformSecurity: platform,
        runtimeEnabled: true,
      ).load(
        alias: 'device-1',
        expectedSigningKeyId: 'key-1',
        expectedFingerprintSha256: fingerprint,
      ),
      throwsStateError,
    );
    expect(platform.loads, 0);
    final source =
        ConnectedCloudFeedProductionTrustSource.testOnlyWithIssuerKeys(
          platformSecurity: platform,
          issuerKeys: {'issuer-1': List.filled(32, 3)},
        );
    final trust = await source.load(
      alias: 'device-1',
      expectedSigningKeyId: 'key-1',
      expectedFingerprintSha256: fingerprint,
    );
    expect(trust.publicKeyFingerprintSha256, fingerprint);
    expect(trust.feedIssuerKeys['issuer-1'], hasLength(32));
    expect(platform.loads, 1);
    expect(platform.signs, 1);
    await expectLater(
      source.load(
        alias: 'device-1',
        expectedSigningKeyId: 'other',
        expectedFingerprintSha256: fingerprint,
      ),
      throwsStateError,
    );
    await expectLater(
      source.load(
        alias: 'device-1',
        expectedSigningKeyId: 'key-1',
        expectedFingerprintSha256: 'a' * 64,
      ),
      throwsStateError,
    );
    await expectLater(
      source.load(
        alias: 'device-2',
        expectedSigningKeyId: 'key-1',
        expectedFingerprintSha256: fingerprint,
      ),
      throwsStateError,
    );
    final wrong =
        ConnectedCloudFeedProductionTrustSource.testOnlyWithIssuerKeys(
          platformSecurity: _Platform(identity, pair, wrongSigner: true),
          issuerKeys: {'issuer-1': List.filled(32, 3)},
        );
    await expectLater(
      wrong.load(
        alias: 'device-1',
        expectedSigningKeyId: 'key-1',
        expectedFingerprintSha256: fingerprint,
      ),
      throwsStateError,
    );
  });

  test(
    'signed owner enrollment binds platform fingerprint and exact site',
    () async {
      final devicePair = await Ed25519().newKeyPairFromSeed(List.filled(32, 1));
      final devicePublic = await devicePair.extractPublicKey();
      final fingerprint = crypto.sha256.convert(devicePublic.bytes).toString();
      final identity = ConnectedPlatformIdentity(
        alias: 'device-1',
        keyId: 'key-1',
        algorithm: 'ed25519',
        publicKeyBase64: base64.encode(devicePublic.bytes),
        publicKeyFingerprintSha256: fingerprint,
        tlsCertificateFingerprintSha256: 'b' * 64,
        sealedTlsMaterialId: 'tls-1',
      );
      final ownerPair = await Ed25519().newKeyPairFromSeed(List.filled(32, 4));
      final ownerPublic = await ownerPair.extractPublicKey();
      final payload = <String, Object>{
        'schema': 'supermega.shop.owner-enrollment-evidence.v1',
        'action': 'approve',
        'tenantId': 'tenant-1',
        'siteId': 'site-1',
        'coordinatorDeviceId': 'coordinator-1',
        'deviceId': 'device-1',
        'clientFingerprint': fingerprint,
        'sessionGeneration': 1,
        'observedAtMillis': 1000,
        'authorityKeyId': 'owner-1',
      };
      final signature = await Ed25519().sign(
        utf8.encode(canonicalConnectedSiteJson(payload)),
        keyPair: ownerPair,
      );
      final evidence = canonicalConnectedSiteJson({
        ...payload,
        'signature': base64Url.encode(signature.bytes).replaceAll('=', ''),
        'evidenceDigest': connectedSiteSha256(payload),
      });
      final source =
          ConnectedCloudFeedProductionTrustSource.testOnlyWithIssuerKeys(
            platformSecurity: _Platform(identity, devicePair),
            issuerKeys: {'feed-1': List.filled(32, 3)},
            ownerIssuerKeys: {'owner-1': ownerPublic.bytes},
          );
      Future<ConnectedCloudFeedEnrolledDeviceTrust> enrolled({
        String site = 'site-1',
        String? json,
        int sessionGeneration = 1,
        int trustedAtMillis = 1500,
      }) => source.loadEnrolled(
        alias: 'device-1',
        expectedSigningKeyId: 'key-1',
        expectedFingerprintSha256: fingerprint,
        canonicalEnrollmentJson: json ?? evidence,
        enrollmentEvidenceDigest: connectedSiteSha256(payload),
        tenantId: 'tenant-1',
        siteId: site,
        coordinatorDeviceId: 'coordinator-1',
        deviceId: 'device-1',
        sessionGeneration: sessionGeneration,
        trustedAtMillis: trustedAtMillis,
      );
      final bound = await enrolled();
      expect(bound.siteId, 'site-1');
      expect(bound.deviceTrust.publicKeyFingerprintSha256, fingerprint);
      await expectLater(enrolled(site: 'site-2'), throwsFormatException);
      await expectLater(
        enrolled(json: evidence.replaceFirst('"device-1"', '"device-2"')),
        throwsFormatException,
      );
      await expectLater(enrolled(sessionGeneration: 2), throwsFormatException);
      await expectLater(enrolled(trustedAtMillis: 999), throwsFormatException);
      final wrongOwner =
          ConnectedCloudFeedProductionTrustSource.testOnlyWithIssuerKeys(
            platformSecurity: _Platform(identity, devicePair),
            issuerKeys: {'feed-1': List.filled(32, 3)},
            ownerIssuerKeys: {'owner-1': List.filled(32, 7)},
          );
      await expectLater(
        wrongOwner.loadEnrolled(
          alias: 'device-1',
          expectedSigningKeyId: 'key-1',
          expectedFingerprintSha256: fingerprint,
          canonicalEnrollmentJson: evidence,
          enrollmentEvidenceDigest: connectedSiteSha256(payload),
          tenantId: 'tenant-1',
          siteId: 'site-1',
          coordinatorDeviceId: 'coordinator-1',
          deviceId: 'device-1',
          sessionGeneration: 1,
          trustedAtMillis: 1500,
        ),
        throwsFormatException,
      );
    },
  );
}
