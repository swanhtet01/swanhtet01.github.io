import 'dart:convert';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_cloud_feed_proof.dart';
import 'package:supermega_shop/shop_connected_site_cloud_feed_contract.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';

const _digestA =
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const _digestB =
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const _nonce =
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

const _expected = ConnectedSiteRetailFeedExpectation(
  workspaceId: 'workspace-a',
  siteId: 'site-a',
  actorId: 'actor-a',
  deviceId: 'device-a',
  authorityGeneration: 2,
  revocationGeneration: 3,
  authorityPayloadDigest: _digestA,
  leaseDigest: _digestB,
  requestDigest: _digestA,
  afterSequence: 0,
  priorEventDigest: null,
  limit: 64,
);

Map<String, Object?> _pagePayload() => {
  'contract': 'supermega.connected-site-retail-feed.v1',
  'protocolVersion': 1,
  'workspaceId': _expected.workspaceId,
  'siteId': _expected.siteId,
  'actorId': _expected.actorId,
  'deviceId': _expected.deviceId,
  'authorityGeneration': _expected.authorityGeneration,
  'revocationGeneration': _expected.revocationGeneration,
  'authorityPayloadDigest': _expected.authorityPayloadDigest,
  'leaseDigest': _expected.leaseDigest,
  'requestDigest': _expected.requestDigest,
  'afterSequence': 0,
  'priorEventDigest': null,
  'headers': <Object>[],
  'projections': <Object>[],
  'nextSequence': 0,
  'nextEventDigest': null,
  'hasMore': false,
};

ConnectedSiteRetailFeedPageV1 _page() {
  final payload = _pagePayload();
  return ConnectedSiteRetailFeedPageV1.parse(
    canonicalBytes: canonicalConnectedSiteJson({
      ...payload,
      'pageDigest': connectedSiteSha256(payload),
    }),
    expected: _expected,
  );
}

Map<String, Object?> _unsignedProof(ConnectedSiteRetailFeedPageV1 page) => {
  'contract': 'supermega.connected-cloud-feed-proof.v1',
  'protocolVersion': 1,
  'issuerKeyId': 'issuer-1',
  'issuedAtMillis': 1000,
  'expiresAtMillis': 2000,
  'workspaceId': _expected.workspaceId,
  'siteId': _expected.siteId,
  'actorId': _expected.actorId,
  'actorRole': 'manager',
  'deviceId': _expected.deviceId,
  'authorityGeneration': _expected.authorityGeneration,
  'revocationGeneration': _expected.revocationGeneration,
  'authorityPayloadDigest': _expected.authorityPayloadDigest,
  'leaseDigest': _expected.leaseDigest,
  'requestDigest': _expected.requestDigest,
  'requestNonce': _nonce,
  'afterSequence': 0,
  'priorEventDigest': null,
  'nextSequence': page.nextSequence,
  'nextEventDigest': page.nextEventDigest,
  'pageDigest': page.pageDigest,
};

Future<String> _signed(
  Map<String, Object?> unsigned,
  SimpleKeyPair keyPair,
) async {
  final signature = await Ed25519().sign(
    utf8.encode(canonicalConnectedSiteJson(unsigned)),
    keyPair: keyPair,
  );
  return canonicalConnectedSiteJson({
    ...unsigned,
    'signature': base64Url.encode(signature.bytes).replaceAll('=', ''),
  });
}

void main() {
  test('pinned issuer authenticates exact empty page and request', () async {
    final keyPair = await Ed25519().newKeyPairFromSeed(List.filled(32, 1));
    final publicKey = await keyPair.extractPublicKey();
    final page = _page();
    final proof = ConnectedCloudFeedProofV1.parse(
      canonicalBytes: await _signed(_unsignedProof(page), keyPair),
      page: page,
      expected: _expected,
      requestNonce: _nonce,
      actorRole: 'manager',
      trustedNowMillis: 1500,
    );
    await ConnectedCloudFeedPinnedIssuerVerifier({'issuer-1': publicKey.bytes})
        .verify(proof);
    expect(proof.proofDigest, hasLength(64));
  });

  test(
    'scope, nonce, role, digest and trusted time reject substitution',
    () async {
      final keyPair = await Ed25519().newKeyPairFromSeed(List.filled(32, 2));
      final page = _page();
      for (final mutation in <void Function(Map<String, Object?>)>[
        (value) => value['workspaceId'] = 'other',
        (value) => value['actorRole'] = 'cashier',
        (value) => value['requestNonce'] = _digestA,
        (value) => value['pageDigest'] = _digestB,
        (value) => value['requestDigest'] = _digestB,
        (value) => value['nextSequence'] = 1,
        (value) => value['expiresAtMillis'] = 'later',
      ]) {
        final unsigned = _unsignedProof(page);
        mutation(unsigned);
        expect(
          () async => ConnectedCloudFeedProofV1.parse(
            canonicalBytes: await _signed(unsigned, keyPair),
            page: page,
            expected: _expected,
            requestNonce: _nonce,
            actorRole: 'manager',
            trustedNowMillis: 1500,
          ),
          throwsFormatException,
        );
      }
      final signed = await _signed(_unsignedProof(page), keyPair);
      expect(
        () => ConnectedCloudFeedProofV1.parse(
          canonicalBytes: signed,
          page: page,
          expected: _expected,
          requestNonce: _nonce,
          actorRole: 'manager',
          trustedNowMillis: 2001,
        ),
        throwsFormatException,
      );
    },
  );

  test('unknown or substituted signing key fails closed', () async {
    final keyPair = await Ed25519().newKeyPairFromSeed(List.filled(32, 3));
    final otherPair = await Ed25519().newKeyPairFromSeed(List.filled(32, 4));
    final otherPublic = await otherPair.extractPublicKey();
    final page = _page();
    final proof = ConnectedCloudFeedProofV1.parse(
      canonicalBytes: await _signed(_unsignedProof(page), keyPair),
      page: page,
      expected: _expected,
      requestNonce: _nonce,
      actorRole: 'manager',
      trustedNowMillis: 1500,
    );
    await expectLater(
      ConnectedCloudFeedPinnedIssuerVerifier({}).verify(proof),
      throwsStateError,
    );
    await expectLater(
      ConnectedCloudFeedPinnedIssuerVerifier({'issuer-1': otherPublic.bytes})
          .verify(proof),
      throwsFormatException,
    );
  });
}
