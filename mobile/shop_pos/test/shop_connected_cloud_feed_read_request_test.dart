import 'dart:convert';

import 'package:cryptography/cryptography.dart';
import 'package:crypto/crypto.dart' as crypto;
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_cloud_feed_read_request.dart';
import 'package:supermega_shop/shop_connected_cloud_device_key_approval.dart';
import 'package:supermega_shop/shop_connected_site_cloud_feed_contract.dart';
import 'package:supermega_shop/shop_connected_site_authority_store.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_offline_staff_lease.dart';
import 'package:supermega_shop/shop_staff_authorization.dart';

void main() {
  test(
    'cloud-only device approval rejects LAN, expiry and wrong scope',
    () async {
      final issuer = await Ed25519().newKeyPairFromSeed(
        List<int>.filled(32, 7),
      );
      final device = await Ed25519().newKeyPairFromSeed(
        List<int>.filled(32, 8),
      );
      final issuerPublic = (await issuer.extractPublicKey()).bytes;
      final devicePublic = (await device.extractPublicKey()).bytes;
      final fingerprint = crypto.sha256.convert(devicePublic).toString();
      const enrollmentDigest =
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const now = 1800000000000;
      final unsigned = <String, Object?>{
        'contract': connectedCloudDeviceKeyApprovalContract,
        'purpose': connectedCloudDeviceKeyApprovalPurpose,
        'workspaceId': 'workspace-1',
        'siteId': 'site-1',
        'deviceId': 'device-1',
        'signingKeyId': fingerprint,
        'publicKey': base64Url.encode(devicePublic).replaceAll('=', ''),
        'clientFingerprint': fingerprint,
        'enrollmentEvidenceDigest': enrollmentDigest,
        'sessionGeneration': 1,
        'revocationGeneration': 3,
        'approvalSequence': 1,
        'previousApprovalDigest': null,
        'issuerKeyId': 'cloud-issuer-1',
        'issuerKeyGeneration': 1,
        'issuedAtMillis': now - 1000,
        'expiresAtMillis': now + 60000,
      };
      Future<String> signed(Map<String, Object?> fields) async =>
          canonicalConnectedSiteJson({
            ...fields,
            'signature': await _sign(fields, issuer),
          });
      ConnectedCloudDeviceKeyApprovalV1 verify(
        String bytes, {
        int time = now,
      }) => ConnectedCloudDeviceKeyApprovalV1.parseAndVerifyAt(
        canonicalBytes: bytes,
        pinnedCloudIssuerKeys: {'cloud-issuer-1': issuerPublic},
        workspaceId: 'workspace-1',
        siteId: 'site-1',
        deviceId: 'device-1',
        clientFingerprint: fingerprint,
        enrollmentEvidenceDigest: enrollmentDigest,
        signingKeyId: fingerprint,
        pinnedIssuerKeyGeneration: 1,
        expectedApprovalSequence: 1,
        expectedPreviousApprovalDigest: null,
        sessionGeneration: 1,
        revocationGeneration: 3,
        trustedAtMillis: time,
      );
      final approvedBytes = await signed(unsigned);
      final approved = verify(approvedBytes);
      expect(approved.publicKey, devicePublic);
      expect(approved.approvalDigest, isNotEmpty);
      for (final invalid in [
        await signed({...unsigned, 'purpose': 'lan-pairing.v1'}),
        await signed({...unsigned, 'workspaceId': 'other'}),
        await signed({...unsigned, 'siteId': 'other'}),
        await signed({...unsigned, 'revocationGeneration': 4}),
        await signed({...unsigned, 'issuerKeyGeneration': 2}),
        await signed({
          ...unsigned,
          'approvalSequence': 2,
          'previousApprovalDigest': enrollmentDigest,
        }),
        await signed({
          ...unsigned,
          'publicKey': base64Url.encode(issuerPublic).replaceAll('=', ''),
        }),
      ]) {
        expect(() => verify(invalid), throwsFormatException);
      }
      final altered = jsonDecode(approvedBytes) as Map<String, dynamic>;
      altered['signature'] =
          'A${(altered['signature'] as String).substring(1)}';
      expect(
        () => verify(canonicalConnectedSiteJson(altered)),
        throwsFormatException,
      );
      expect(
        () => verify(approvedBytes, time: now + 60000),
        throwsFormatException,
      );
      expect(
        () => ConnectedCloudDeviceKeyApprovalV1.parseAndVerifyAt(
          canonicalBytes: approved.canonicalBytes,
          pinnedCloudIssuerKeys: const {},
          workspaceId: 'workspace-1',
          siteId: 'site-1',
          deviceId: 'device-1',
          clientFingerprint: fingerprint,
          enrollmentEvidenceDigest: enrollmentDigest,
          signingKeyId: fingerprint,
          pinnedIssuerKeyGeneration: 1,
          expectedApprovalSequence: 1,
          expectedPreviousApprovalDigest: null,
          sessionGeneration: 1,
          revocationGeneration: 3,
          trustedAtMillis: now,
        ),
        throwsFormatException,
      );
    },
  );

  test(
    'signed feed request binds exact manager lease, device and time',
    () async {
      final leaseKey = await Ed25519().newKeyPairFromSeed(
        List<int>.filled(32, 3),
      );
      final deviceKey = await Ed25519().newKeyPairFromSeed(
        List<int>.filled(32, 4),
      );
      final otherKey = await Ed25519().newKeyPairFromSeed(
        List<int>.filled(32, 5),
      );
      final authorityKey = await Ed25519().newKeyPairFromSeed(
        List<int>.filled(32, 6),
      );
      final leasePublic = (await leaseKey.extractPublicKey()).bytes;
      final devicePublic = (await deviceKey.extractPublicKey()).bytes;
      final otherPublic = (await otherKey.extractPublicKey()).bytes;
      final now = DateTime.utc(2026, 11, 3, 11).millisecondsSinceEpoch;
      final issuedAt = DateTime.fromMillisecondsSinceEpoch(
        now - 1000,
        isUtc: true,
      ).toIso8601String();
      const digestA =
          'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const digestB =
          'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      const digestD =
          'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
      final leaseUnsigned = <String, Object>{
        'protocolVersion': connectedSiteProtocolVersion,
        'leaseId': 'lease-1',
        'workspaceId': 'workspace-1',
        'siteId': 'site-1',
        'actorId': 'actor-1',
        'role': 'manager',
        'capabilities': ['managementRead'],
        'deviceId': 'device-1',
        'sessionGeneration': 1,
        'revocationGeneration': 3,
        'issuedAt': DateTime.fromMillisecondsSinceEpoch(
          now - 60000,
          isUtc: true,
        ).toIso8601String(),
        'expiresAt': DateTime.fromMillisecondsSinceEpoch(
          now + 60000,
          isUtc: true,
        ).toIso8601String(),
        'issuerKeyId': 'lease-key',
      };
      final lease = OfflineStaffLeaseV1.fromJson({
        ...leaseUnsigned,
        'payloadDigest': connectedSiteSha256(leaseUnsigned),
        'signature': await _sign(leaseUnsigned, leaseKey),
      });
      Future<String> authorityBytes(List<Map<String, Object?>> members) async {
        final unsigned = <String, Object?>{
          'authorityEventId': 'authority-event-1',
          'authoritySequence': 1,
          'configurationSnapshot': {
            'businessProfile': {
              'schemaId': 'supermega-business-profile',
              'templateId': 'retail',
              'templateVersion': 1,
            },
            'catalogReference': {
              'catalogDigest': connectedSiteSha256('catalog'),
              'catalogVersion': 1,
            },
            'configurationVersion': 1,
          },
          'issuedAtMillis': now - 60000,
          'issuerKeyId': 'authority-key',
          'membershipSnapshot': {'members': members, 'revocationGeneration': 3},
          'previousAuthorityDigest': null,
          'protocolVersion': 1,
          'schemaId': 'ConnectedSiteAuthorityPayloadV1',
          'siteId': 'site-1',
          'workspaceId': 'workspace-1',
        };
        return canonicalConnectedSiteJson({
          ...unsigned,
          'payloadDigest': connectedSiteSha256(unsigned),
        });
      }

      final currentAuthorityBytes = await authorityBytes([
        {
          'actorId': 'actor-1',
          'capabilities': ['managementRead'],
          'role': 'manager',
          'sessionGeneration': 1,
        },
      ]);
      final currentAuthoritySignature = await _sign(
        jsonDecode(currentAuthorityBytes) as Map<String, dynamic>,
        authorityKey,
      );
      final digestC = connectedSiteSha256(jsonDecode(currentAuthorityBytes));
      final authorityVerifier =
          PinnedEd25519ConnectedSiteAuthorityPayloadVerifier(
            publicKeys: {
              'authority-key': (await authorityKey.extractPublicKey()).bytes,
            },
          );
      final verifier = ShopOfflineStaffLeaseVerifier(
        signatureVerifier: PinnedEd25519ShopOfflineStaffLeaseSignatureVerifier(
          publicKeys: {'lease-key': leasePublic},
        ),
      );
      const binding = ShopOfflineStaffLeaseExpectedBinding(
        tenantId: 'workspace-1',
        siteId: 'site-1',
        deviceId: 'device-1',
        sessionGeneration: 1,
        revocationGeneration: 3,
        requiredCapability: ShopStaffCapability.managementRead,
      );
      final unsigned = <String, Object?>{
        'contract': connectedCloudFeedReadRequestContract,
        'workspaceId': 'workspace-1',
        'siteId': 'site-1',
        'actorId': 'actor-1',
        'deviceId': 'device-1',
        'clientFingerprint': digestA,
        'enrollmentEvidenceDigest': digestB,
        'authorityGeneration': 2,
        'authorityPayloadDigest': digestC,
        'revocationGeneration': 3,
        'afterSequence': 0,
        'priorEventDigest': null,
        'limit': 64,
        'leaseDigest': lease.payloadDigest,
        'issuedAt': issuedAt,
        'requestNonce': digestD,
        'signingKeyId': 'device-key',
        'signatureAlgorithm': 'ed25519',
      };
      Future<String> signed(
        Map<String, Object?> fields,
        SimpleKeyPair key,
      ) async => canonicalConnectedSiteJson({
        ...fields,
        'signature': await _sign(fields, key),
      });
      Future<ConnectedCloudFeedReadRequestV1> verify(
        String request, {
        ShopOfflineStaffLeaseExpectedBinding expectedBinding = binding,
        List<int>? key,
        int? trustedNow,
        String? authorityBytes,
        String? authoritySignature,
      }) => ConnectedCloudFeedReadRequestV1.parseAndVerify(
        canonicalBytes: request,
        lease: lease,
        leaseVerifier: verifier,
        leaseBinding: expectedBinding,
        clientFingerprint: digestA,
        enrollmentEvidenceDigest: digestB,
        signingKeyId: 'device-key',
        signingPublicKey: key ?? devicePublic,
        authorityGeneration: 2,
        currentAuthorityBytes: authorityBytes ?? currentAuthorityBytes,
        currentAuthoritySignature:
            authoritySignature ?? currentAuthoritySignature,
        authorityVerifier: authorityVerifier,
        trustedNowMillis: trustedNow ?? now,
      );

      final request = await signed(unsigned, deviceKey);
      final accepted = await verify(request);
      expect(accepted.expected.workspaceId, 'workspace-1');
      expect(
        accepted.expected.requestDigest,
        connectedSiteSha256(jsonDecode(request)),
      );
      expect(accepted.expected.leaseDigest, lease.payloadDigest);
      expect(accepted.actorRole, 'manager');
      expect(accepted.requestNonce, digestD);
      void verifyRetained(
        String bytes, {
        List<int>? publicKey,
        String nonce = digestD,
        int? time,
      }) => verifyRetainedCloudFeedReadRequestSync(
        canonicalBytes: bytes,
        expected: accepted.expected,
        requestNonce: nonce,
        clientFingerprint: digestA,
        enrollmentEvidenceDigest: digestB,
        signingKeyId: 'device-key',
        approvedCloudSigningPublicKey: publicKey ?? devicePublic,
        trustedAtIssueMillis: time ?? now,
      );
      expect(() => verifyRetained(request), returnsNormally);
      expect(
        () => verifyRetained(request, publicKey: otherPublic),
        throwsFormatException,
      );
      expect(
        () => verifyRetained(request, nonce: digestA),
        throwsFormatException,
      );
      expect(
        () => verifyRetained(request, time: now + 30000),
        throwsFormatException,
      );
      expect(
        () => verifyRetained(
          canonicalConnectedSiteJson({
            ...jsonDecode(request),
            'actorId': 'actor-2',
          }),
        ),
        throwsFormatException,
      );
      ConnectedSiteRetailFeedExpectation malformedExpected(
        String bytes, {
        String workspace = 'workspace-1',
        int authorityGeneration = 2,
        int after = 0,
        String? prior,
      }) => ConnectedSiteRetailFeedExpectation(
        workspaceId: workspace,
        siteId: accepted.expected.siteId,
        actorId: accepted.expected.actorId,
        deviceId: accepted.expected.deviceId,
        authorityGeneration: authorityGeneration,
        revocationGeneration: accepted.expected.revocationGeneration,
        authorityPayloadDigest: accepted.expected.authorityPayloadDigest,
        leaseDigest: accepted.expected.leaseDigest,
        requestDigest: connectedSiteSha256(jsonDecode(bytes)),
        afterSequence: after,
        priorEventDigest: prior,
        limit: accepted.expected.limit,
      );
      final badWorkspace = await signed({
        ...unsigned,
        'workspaceId': 'bad workspace',
      }, deviceKey);
      expect(
        () => verifyRetainedCloudFeedReadRequestSync(
          canonicalBytes: badWorkspace,
          expected: malformedExpected(badWorkspace, workspace: 'bad workspace'),
          requestNonce: digestD,
          clientFingerprint: digestA,
          enrollmentEvidenceDigest: digestB,
          signingKeyId: 'device-key',
          approvedCloudSigningPublicKey: devicePublic,
          trustedAtIssueMillis: now,
        ),
        throwsFormatException,
      );
      final negativeGeneration = await signed({
        ...unsigned,
        'authorityGeneration': -1,
      }, deviceKey);
      expect(
        () => verifyRetainedCloudFeedReadRequestSync(
          canonicalBytes: negativeGeneration,
          expected: malformedExpected(
            negativeGeneration,
            authorityGeneration: -1,
          ),
          requestNonce: digestD,
          clientFingerprint: digestA,
          enrollmentEvidenceDigest: digestB,
          signingKeyId: 'device-key',
          approvedCloudSigningPublicKey: devicePublic,
          trustedAtIssueMillis: now,
        ),
        throwsFormatException,
      );

      for (final rejected in [
        canonicalConnectedSiteJson({
          ...jsonDecode(request),
          'actorId': 'actor-2',
        }),
        await signed({...unsigned, 'workspaceId': 'other-tenant'}, deviceKey),
        await signed({
          ...unsigned,
          'issuedAt': DateTime.fromMillisecondsSinceEpoch(
            now - 31000,
            isUtc: true,
          ).toIso8601String(),
        }, deviceKey),
        await signed({
          ...unsigned,
          'afterSequence': 1,
          'priorEventDigest': null,
        }, deviceKey),
        await signed({...unsigned, 'leaseDigest': digestB}, deviceKey),
        await signed({...unsigned, 'requestNonce': 'bad'}, deviceKey),
        await signed(unsigned, otherKey),
      ]) {
        await expectLater(verify(rejected), throwsFormatException);
        expect(() => verifyRetained(rejected), throwsFormatException);
      }
      await expectLater(
        verify(
          request,
          expectedBinding: const ShopOfflineStaffLeaseExpectedBinding(
            tenantId: 'workspace-1',
            siteId: 'site-1',
            deviceId: 'device-1',
            sessionGeneration: 1,
            revocationGeneration: 4,
            requiredCapability: ShopStaffCapability.managementRead,
          ),
        ),
        throwsFormatException,
      );
      await expectLater(
        verify(request, trustedNow: now + 30000),
        throwsFormatException,
      );
      for (final changedMembers in [
        [
          {
            'actorId': 'actor-1',
            'capabilities': ['counterSale'],
            'role': 'cashierCounter',
            'sessionGeneration': 1,
          },
        ],
        [
          {
            'actorId': 'actor-2',
            'capabilities': ['managementRead'],
            'role': 'manager',
            'sessionGeneration': 1,
          },
        ],
      ]) {
        final changedBytes = await authorityBytes(changedMembers);
        final changedRequest = await signed({
          ...unsigned,
          'authorityPayloadDigest': connectedSiteSha256(
            jsonDecode(changedBytes),
          ),
        }, deviceKey);
        await expectLater(
          verify(
            changedRequest,
            authorityBytes: changedBytes,
            authoritySignature: await _sign(
              jsonDecode(changedBytes) as Map<String, dynamic>,
              authorityKey,
            ),
          ),
          throwsFormatException,
        );
      }
    },
  );
}

Future<String> _sign(Map<String, Object?> unsigned, SimpleKeyPair key) async {
  final signature = await Ed25519().sign(
    utf8.encode(canonicalConnectedSiteJson(unsigned)),
    keyPair: key,
  );
  return base64Url.encode(signature.bytes).replaceAll('=', '');
}
