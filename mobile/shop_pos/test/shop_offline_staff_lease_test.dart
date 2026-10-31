import 'dart:convert';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_offline_staff_lease.dart';
import 'package:supermega_shop/shop_staff_authorization.dart';

const _now = 1800000000000;
const _keyId = 'test-lease-1';

void main() {
  late SimpleKeyPair keyPair;
  late List<int> publicKey;

  setUpAll(() async {
    keyPair = await Ed25519().newKeyPairFromSeed(
      List<int>.generate(32, (index) => index + 1),
    );
    publicKey = (await keyPair.extractPublicKey()).bytes;
  });

  ShopOfflineStaffLeaseVerifier verifier() => ShopOfflineStaffLeaseVerifier(
    signatureVerifier: PinnedEd25519ShopOfflineStaffLeaseSignatureVerifier(
      publicKeys: {_keyId: publicKey},
    ),
  );

  const expected = ShopOfflineStaffLeaseExpectedBinding(
    tenantId: 'workspace-1',
    siteId: 'site-1',
    deviceId: 'device-1',
    sessionGeneration: 4,
    revocationGeneration: 9,
    requiredCapability: ShopStaffCapability.counterSale,
  );

  test('valid seven-day signed lease verifies exact device binding', () async {
    final lease = await _signedLease(keyPair: keyPair);

    final verified = await verifier().verify(
      lease: lease,
      expected: expected,
      nowMillis: _now,
    );

    expect(verified.actorId, 'actor-1');
    expect(verified.role, ShopStaffRole.cashierCounter);
    expect(verified.capabilities, {ShopStaffCapability.counterSale});
    expect(verified.payloadDigest, lease.payloadDigest);
  });

  test('default verifier remains fail closed without a trusted key', () async {
    final lease = await _signedLease(keyPair: keyPair);

    await expectLater(
      const ShopOfflineStaffLeaseVerifier().verify(
        lease: lease,
        expected: expected,
        nowMillis: _now,
      ),
      _denied('shop_offline_staff_lease_signature_invalid'),
    );
  });

  test(
    'rejects payload tampering and command capability substitution',
    () async {
      final lease = await _signedLease(keyPair: keyPair);
      expect(
        () => _copy(lease, actorId: 'actor-2'),
        throwsA(isA<FormatException>()),
      );
      final tamperedCapability = await _signedLease(
        keyPair: keyPair,
        capabilities: const ['cashShiftManage'],
      );
      await expectLater(
        verifier().verify(
          lease: tamperedCapability,
          expected: expected,
          nowMillis: _now,
        ),
        _denied('shop_offline_staff_lease_capability_denied'),
      );
    },
  );

  test('rejects invalid signature and unknown issuer key', () async {
    final lease = await _signedLease(keyPair: keyPair);
    final badSignature = _copy(
      lease,
      signature:
          '${lease.signature.substring(0, lease.signature.length - 1)}'
          '${lease.signature.endsWith('A') ? 'Q' : 'A'}',
    );
    final unknownKey = await _signedLease(
      keyPair: keyPair,
      keyId: 'unknown-key',
    );

    await expectLater(
      verifier().verify(
        lease: badSignature,
        expected: expected,
        nowMillis: _now,
      ),
      _denied('shop_offline_staff_lease_signature_invalid'),
    );
    await expectLater(
      verifier().verify(lease: unknownKey, expected: expected, nowMillis: _now),
      _denied('shop_offline_staff_lease_signature_invalid'),
    );
  });

  test(
    'rejects expired, future, inverted, and over-seven-day leases',
    () async {
      final expired = await _signedLease(
        keyPair: keyPair,
        issuedAtMillis: _now - 1000,
        expiresAtMillis: _now,
      );
      final future = await _signedLease(
        keyPair: keyPair,
        issuedAtMillis: _now + const Duration(minutes: 6).inMilliseconds,
        expiresAtMillis: _now + const Duration(days: 1).inMilliseconds,
      );
      await expectLater(
        verifier().verify(lease: expired, expected: expected, nowMillis: _now),
        _denied('shop_offline_staff_lease_expired'),
      );
      await expectLater(
        verifier().verify(lease: future, expected: expected, nowMillis: _now),
        _denied('shop_offline_staff_lease_not_yet_valid'),
      );
      await expectLater(
        _signedLease(
          keyPair: keyPair,
          issuedAtMillis: _now,
          expiresAtMillis: _now - 1,
        ),
        throwsA(isA<FormatException>()),
      );
      await expectLater(
        _signedLease(
          keyPair: keyPair,
          issuedAtMillis: _now,
          expiresAtMillis: _now + const Duration(days: 7).inMilliseconds + 1,
        ),
        throwsA(isA<FormatException>()),
      );
    },
  );

  test(
    'rejects tenant, site, device, session, and revocation mismatch',
    () async {
      final lease = await _signedLease(keyPair: keyPair);
      final cases = <ShopOfflineStaffLeaseExpectedBinding>[
        const ShopOfflineStaffLeaseExpectedBinding(
          tenantId: 'workspace-2',
          siteId: 'site-1',
          deviceId: 'device-1',
          sessionGeneration: 4,
          revocationGeneration: 9,
          requiredCapability: ShopStaffCapability.counterSale,
        ),
        const ShopOfflineStaffLeaseExpectedBinding(
          tenantId: 'workspace-1',
          siteId: 'site-2',
          deviceId: 'device-1',
          sessionGeneration: 4,
          revocationGeneration: 9,
          requiredCapability: ShopStaffCapability.counterSale,
        ),
        const ShopOfflineStaffLeaseExpectedBinding(
          tenantId: 'workspace-1',
          siteId: 'site-1',
          deviceId: 'device-2',
          sessionGeneration: 4,
          revocationGeneration: 9,
          requiredCapability: ShopStaffCapability.counterSale,
        ),
      ];
      for (final binding in cases) {
        await expectLater(
          verifier().verify(lease: lease, expected: binding, nowMillis: _now),
          _denied('shop_offline_staff_lease_binding_mismatch'),
        );
      }

      await expectLater(
        verifier().verify(
          lease: lease,
          expected: const ShopOfflineStaffLeaseExpectedBinding(
            tenantId: 'workspace-1',
            siteId: 'site-1',
            deviceId: 'device-1',
            sessionGeneration: 5,
            revocationGeneration: 9,
            requiredCapability: ShopStaffCapability.counterSale,
          ),
          nowMillis: _now,
        ),
        _denied('shop_offline_staff_lease_session_generation_mismatch'),
      );
      await expectLater(
        verifier().verify(
          lease: lease,
          expected: const ShopOfflineStaffLeaseExpectedBinding(
            tenantId: 'workspace-1',
            siteId: 'site-1',
            deviceId: 'device-1',
            sessionGeneration: 4,
            revocationGeneration: 10,
            requiredCapability: ShopStaffCapability.counterSale,
          ),
          nowMillis: _now,
        ),
        _denied('shop_offline_staff_lease_revocation_generation_mismatch'),
      );
    },
  );

  test('rejects role escalation and non-canonical capabilities', () async {
    final escalated = await _signedLease(
      keyPair: keyPair,
      role: ShopStaffRole.cafeWaiter.name,
      capabilities: const ['counterSale'],
    );
    await expectLater(
      verifier().verify(lease: escalated, expected: expected, nowMillis: _now),
      _denied('shop_offline_staff_lease_role_capability_mismatch'),
    );
    await expectLater(
      _signedLease(
        keyPair: keyPair,
        role: ShopStaffRole.owner.name,
        capabilities: const ['stockChange', 'counterSale'],
        preserveCapabilityOrder: true,
      ),
      throwsA(isA<FormatException>()),
    );
    await expectLater(
      _signedLease(
        keyPair: keyPair,
        capabilities: const ['counterSale', 'counterSale'],
        preserveCapabilityOrder: true,
      ),
      throwsA(isA<FormatException>()),
    );
  });
}

Matcher _denied(String code) => throwsA(
  isA<ShopOfflineStaffLeaseException>().having(
    (error) => error.code,
    'code',
    code,
  ),
);

Future<OfflineStaffLeaseV1> _signedLease({
  required SimpleKeyPair keyPair,
  String leaseId = 'lease-1',
  String tenantId = 'workspace-1',
  String siteId = 'site-1',
  String actorId = 'actor-1',
  String role = 'cashierCounter',
  List<String> capabilities = const ['counterSale'],
  String deviceId = 'device-1',
  int sessionGeneration = 4,
  int revocationGeneration = 9,
  int issuedAtMillis = _now - 1000,
  int expiresAtMillis = _now + Duration.millisecondsPerDay,
  String keyId = _keyId,
  bool preserveCapabilityOrder = false,
}) async {
  final normalizedCapabilities = [...capabilities];
  if (!preserveCapabilityOrder) normalizedCapabilities.sort();
  final issuedAt = DateTime.fromMillisecondsSinceEpoch(
    issuedAtMillis,
    isUtc: true,
  ).toIso8601String();
  final expiresAt = DateTime.fromMillisecondsSinceEpoch(
    expiresAtMillis,
    isUtc: true,
  ).toIso8601String();
  final unsignedPayload = <String, Object>{
    'protocolVersion': connectedSiteProtocolVersion,
    'leaseId': leaseId,
    'workspaceId': tenantId,
    'siteId': siteId,
    'actorId': actorId,
    'role': role,
    'capabilities': normalizedCapabilities,
    'deviceId': deviceId,
    'sessionGeneration': sessionGeneration,
    'revocationGeneration': revocationGeneration,
    'issuedAt': issuedAt,
    'expiresAt': expiresAt,
    'issuerKeyId': keyId,
  };
  final digest = connectedSiteSha256(unsignedPayload);
  final signed = await Ed25519().sign(
    utf8.encode(
      shopOfflineStaffLeaseSignatureMessage(
        keyId: keyId,
        payloadDigest: digest,
      ),
    ),
    keyPair: keyPair,
  );
  return OfflineStaffLeaseV1(
    leaseId: leaseId,
    workspaceId: tenantId,
    siteId: siteId,
    actorId: actorId,
    role: role,
    capabilities: normalizedCapabilities,
    deviceId: deviceId,
    sessionGeneration: sessionGeneration,
    revocationGeneration: revocationGeneration,
    issuedAt: issuedAt,
    expiresAt: expiresAt,
    issuerKeyId: keyId,
    payloadDigest: digest,
    signature: base64Url.encode(signed.bytes).replaceAll('=', ''),
  );
}

OfflineStaffLeaseV1 _copy(
  OfflineStaffLeaseV1 source, {
  String? leaseId,
  String? tenantId,
  String? siteId,
  String? actorId,
  String? role,
  List<String>? capabilities,
  String? deviceId,
  int? sessionGeneration,
  int? revocationGeneration,
  int? issuedAtMillis,
  int? expiresAtMillis,
  String? keyId,
  String? payloadDigest,
  String? signature,
}) => OfflineStaffLeaseV1(
  leaseId: leaseId ?? source.leaseId,
  workspaceId: tenantId ?? source.workspaceId,
  siteId: siteId ?? source.siteId,
  actorId: actorId ?? source.actorId,
  role: role ?? source.role,
  capabilities: capabilities ?? source.capabilities,
  deviceId: deviceId ?? source.deviceId,
  sessionGeneration: sessionGeneration ?? source.sessionGeneration,
  revocationGeneration: revocationGeneration ?? source.revocationGeneration,
  issuedAt: issuedAtMillis == null
      ? source.issuedAt
      : DateTime.fromMillisecondsSinceEpoch(
          issuedAtMillis,
          isUtc: true,
        ).toIso8601String(),
  expiresAt: expiresAtMillis == null
      ? source.expiresAt
      : DateTime.fromMillisecondsSinceEpoch(
          expiresAtMillis,
          isUtc: true,
        ).toIso8601String(),
  issuerKeyId: keyId ?? source.keyId,
  payloadDigest: payloadDigest ?? source.payloadDigest,
  signature: signature ?? source.signature,
);
