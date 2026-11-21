import 'dart:convert';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_cloud_feed_http.dart';
import 'package:supermega_shop/shop_connected_cloud_feed_proof.dart';
import 'package:supermega_shop/shop_connected_site_cloud_feed_contract.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_connected_site_reconciliation.dart';

class _Executor implements ConnectedSiteAuthenticatedRequestExecutor {
  _Executor(this.status, {this.redirect = false, this.responseJson = '{}'});
  final int status;
  final bool redirect;
  final String responseJson;
  int calls = 0;

  @override
  Future<ConnectedSiteAuthenticatedHttpResponse> execute({
    required Uri uri,
    required String method,
    required Map<String, String> headers,
    required List<int> body,
    required int maxResponseBytes,
  }) async {
    calls++;
    expect(
      uri.toString(),
      'https://example.test/api/connected-site/v1/event-feed',
    );
    expect(method, 'POST');
    expect(utf8.decode(body), '{"signed":"request"}');
    expect(headers, containsPair('content-type', 'application/json'));
    return ConnectedSiteAuthenticatedHttpResponse(
      statusCode: status,
      contentType: 'application/json',
      body: utf8.encode(responseJson),
      effectiveUri: redirect ? Uri.parse('https://other.test/') : uri,
    );
  }
}

void main() {
  const requestJson = '{"signed":"request"}';
  const nonce =
      'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
  final expectation = ConnectedSiteRetailFeedExpectation(
    workspaceId: 'tenant',
    siteId: 'site',
    actorId: 'actor',
    deviceId: 'device',
    authorityGeneration: 1,
    revocationGeneration: 0,
    authorityPayloadDigest: 'a' * 64,
    leaseDigest: 'b' * 64,
    requestDigest: connectedSiteSha256(jsonDecode(requestJson)),
    afterSequence: 0,
    priorEventDigest: null,
    limit: 1,
  );
  final verifier = ConnectedCloudFeedPinnedIssuerVerifier({
    'fixture': List.filled(32, 1),
  });

  Future<void> read(
    ConnectedCloudFeedHttpReader reader, {
    ConnectedSiteRetailFeedExpectation? expected,
    ConnectedCloudFeedPinnedIssuerVerifier? pinnedVerifier,
  }) => reader
      .read(
        signedRequestJson: requestJson,
        expected: expected ?? expectation,
        requestNonce: nonce,
        actorRole: 'manager',
        trustedNowMillis: 1500,
        issuerVerifier: pinnedVerifier ?? verifier,
      )
      .then((_) {});

  test('default-off and malformed origin never reach transport', () async {
    final transport = _Executor(200);
    await expectLater(
      read(
        ConnectedCloudFeedHttpReader(
          baseUri: Uri.parse('https://example.test'),
          executor: transport,
        ),
      ),
      throwsA(isA<ConnectedSiteReconciliationException>()),
    );
    expect(transport.calls, 0);
    expect(
      () => ConnectedCloudFeedHttpReader(
        baseUri: Uri.parse('http://example.test'),
        executor: transport,
      ),
      throwsFormatException,
    );
  });

  test('request digest mismatch is rejected before transport', () async {
    final transport = _Executor(200);
    final mismatched = ConnectedSiteRetailFeedExpectation(
      workspaceId: 'tenant',
      siteId: 'site',
      actorId: 'actor',
      deviceId: 'device',
      authorityGeneration: 1,
      revocationGeneration: 0,
      authorityPayloadDigest: 'a' * 64,
      leaseDigest: 'b' * 64,
      requestDigest: 'c' * 64,
      afterSequence: 0,
      priorEventDigest: null,
      limit: 1,
    );
    await expectLater(
      read(
        ConnectedCloudFeedHttpReader(
          baseUri: Uri.parse('https://example.test'),
          executor: transport,
          runtimeEnabled: true,
        ),
        expected: mismatched,
      ),
      throwsFormatException,
    );
    expect(transport.calls, 0);
  });

  test('HTTP denial and redirect cannot become a page', () async {
    for (final transport in [_Executor(403), _Executor(200, redirect: true)]) {
      await expectLater(
        read(
          ConnectedCloudFeedHttpReader(
            baseUri: Uri.parse('https://example.test'),
            executor: transport,
            runtimeEnabled: true,
          ),
        ),
        throwsA(isA<ConnectedSiteReconciliationException>()),
      );
      expect(transport.calls, 1);
    }
  });

  test('unproved response is rejected without durable apply', () async {
    final transport = _Executor(200);
    await expectLater(
      read(
        ConnectedCloudFeedHttpReader(
          baseUri: Uri.parse('https://example.test'),
          executor: transport,
          runtimeEnabled: true,
        ),
      ),
      throwsFormatException,
    );
  });

  test('pinned signed receipt succeeds; substituted page or proof fails', () async {
    final unsignedPage = <String, Object?>{
      'contract': 'supermega.connected-site-retail-feed.v1',
      'protocolVersion': 1,
      'workspaceId': expectation.workspaceId,
      'siteId': expectation.siteId,
      'actorId': expectation.actorId,
      'deviceId': expectation.deviceId,
      'authorityGeneration': expectation.authorityGeneration,
      'revocationGeneration': expectation.revocationGeneration,
      'authorityPayloadDigest': expectation.authorityPayloadDigest,
      'leaseDigest': expectation.leaseDigest,
      'requestDigest': expectation.requestDigest,
      'afterSequence': 0,
      'priorEventDigest': null,
      'headers': <Object>[],
      'projections': <Object>[],
      'nextSequence': 0,
      'nextEventDigest': null,
      'hasMore': false,
    };
    final pageJson = canonicalConnectedSiteJson({
      ...unsignedPage,
      'pageDigest': connectedSiteSha256(unsignedPage),
    });
    final page = ConnectedSiteRetailFeedPageV1.parse(
      canonicalBytes: pageJson,
      expected: expectation,
    );
    final unsignedProof = <String, Object?>{
      'contract': 'supermega.connected-cloud-feed-proof.v1',
      'protocolVersion': 1,
      'issuerKeyId': 'fixture',
      'issuedAtMillis': 1000,
      'expiresAtMillis': 2000,
      'workspaceId': expectation.workspaceId,
      'siteId': expectation.siteId,
      'actorId': expectation.actorId,
      'actorRole': 'manager',
      'deviceId': expectation.deviceId,
      'authorityGeneration': expectation.authorityGeneration,
      'revocationGeneration': expectation.revocationGeneration,
      'authorityPayloadDigest': expectation.authorityPayloadDigest,
      'leaseDigest': expectation.leaseDigest,
      'requestDigest': expectation.requestDigest,
      'requestNonce': nonce,
      'afterSequence': 0,
      'priorEventDigest': null,
      'nextSequence': page.nextSequence,
      'nextEventDigest': page.nextEventDigest,
      'pageDigest': page.pageDigest,
    };
    final keyPair = await Ed25519().newKeyPairFromSeed(List.filled(32, 1));
    final publicKey = await keyPair.extractPublicKey();
    final signature = await Ed25519().sign(
      utf8.encode(canonicalConnectedSiteJson(unsignedProof)),
      keyPair: keyPair,
    );
    final proofJson = canonicalConnectedSiteJson({
      ...unsignedProof,
      'signature': base64Url.encode(signature.bytes).replaceAll('=', ''),
    });
    final signatureText = base64Url.encode(signature.bytes).replaceAll('=', '');
    String response(String pageBytes, String proofBytes) =>
        canonicalConnectedSiteJson({
          'requestJson': requestJson,
          'pageJson': pageBytes,
          'proofJson': proofBytes,
        });
    final good = ConnectedCloudFeedHttpReader(
      baseUri: Uri.parse('https://example.test'),
      runtimeEnabled: true,
      executor: _Executor(200, responseJson: response(pageJson, proofJson)),
    );
    final receipt = await good.read(
      signedRequestJson: requestJson,
      expected: expectation,
      requestNonce: nonce,
      actorRole: 'manager',
      trustedNowMillis: 1500,
      issuerVerifier: ConnectedCloudFeedPinnedIssuerVerifier({
        'fixture': publicKey.bytes,
      }),
    );
    expect(receipt.pageJson, pageJson);
    expect(receipt.proofJson, proofJson);

    for (final altered in [
      response(pageJson.replaceFirst('"tenant"', '"other"'), proofJson),
      response(pageJson, proofJson.replaceFirst('"manager"', '"cashier"')),
      response(
        pageJson,
        proofJson.replaceFirst(
          signatureText,
          '${signatureText[0] == 'A' ? 'B' : 'A'}${signatureText.substring(1)}',
        ),
      ),
    ]) {
      await expectLater(
        read(
          ConnectedCloudFeedHttpReader(
            baseUri: Uri.parse('https://example.test'),
            runtimeEnabled: true,
            executor: _Executor(200, responseJson: altered),
          ),
          pinnedVerifier: ConnectedCloudFeedPinnedIssuerVerifier({
            'fixture': publicKey.bytes,
          }),
        ),
        throwsFormatException,
      );
    }
  });
}
