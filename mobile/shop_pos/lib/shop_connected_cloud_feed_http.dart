import 'dart:convert';

import 'shop_connected_cloud_feed_proof.dart';
import 'shop_connected_site_cloud_feed_contract.dart';
import 'shop_connected_site_contracts.dart';
import 'shop_connected_site_reconciliation.dart';

/// Transport only: this receipt is not permission to apply a page. The v41
/// transaction must independently recheck current authority and trusted time.
final class ConnectedCloudFeedHttpReceipt {
  const ConnectedCloudFeedHttpReceipt({
    required this.requestJson,
    required this.pageJson,
    required this.proofJson,
  });

  final String requestJson;
  final String pageJson;
  final String proofJson;
}

/// Uses the same authenticated, origin-bound HTTPS executor as reconciliation.
/// Deliberately disabled by default; no bearer token or issuer key is learned
/// from the response. Callers supply an independently signed request and pins.
final class ConnectedCloudFeedHttpReader {
  ConnectedCloudFeedHttpReader({
    required Uri baseUri,
    this.executor =
        const UnavailableConnectedSiteAuthenticatedRequestExecutor(),
    this.runtimeEnabled = false,
  }) : baseUri = _checkedOrigin(baseUri);

  final Uri baseUri;
  final ConnectedSiteAuthenticatedRequestExecutor executor;
  final bool runtimeEnabled;

  static Uri _checkedOrigin(Uri uri) {
    if (uri.scheme != 'https' ||
        uri.host.isEmpty ||
        uri.userInfo.isNotEmpty ||
        uri.query.isNotEmpty ||
        uri.fragment.isNotEmpty ||
        uri.path != '' && uri.path != '/') {
      throw const FormatException('connected_cloud_feed_origin_invalid');
    }
    return uri;
  }

  Future<ConnectedCloudFeedHttpReceipt> read({
    required String signedRequestJson,
    required ConnectedSiteRetailFeedExpectation expected,
    required String requestNonce,
    required String actorRole,
    required int trustedNowMillis,
    required ConnectedCloudFeedPinnedIssuerVerifier issuerVerifier,
  }) async {
    if (!runtimeEnabled) {
      throw const ConnectedSiteReconciliationException(
        'connected_cloud_feed_disabled',
      );
    }
    if (signedRequestJson.length > 8192 ||
        connectedSiteSha256(jsonDecode(signedRequestJson)) !=
            expected.requestDigest ||
        canonicalConnectedSiteJson(jsonDecode(signedRequestJson)) !=
            signedRequestJson) {
      throw const FormatException('connected_cloud_feed_request_invalid');
    }
    final uri = baseUri.resolve('/api/connected-site/v1/event-feed');
    final response = await executor.execute(
      uri: uri,
      method: 'POST',
      headers: const {
        'accept': 'application/json',
        'content-type': 'application/json',
      },
      body: utf8.encode(signedRequestJson),
      maxResponseBytes: 262144,
    );
    if (response.effectiveUri != uri) {
      throw const ConnectedSiteReconciliationException(
        'connected_site_cloud_redirect_rejected',
      );
    }
    if (response.statusCode != 200) {
      throw ConnectedSiteReconciliationException(
        response.statusCode == 401 || response.statusCode == 403
            ? 'connected_site_cloud_authority_rejected'
            : 'connected_cloud_feed_http_rejected',
      );
    }
    if (response.body.length > 262144 ||
        response.contentType?.toLowerCase().split(';').first.trim() !=
            'application/json') {
      throw const FormatException('connected_cloud_feed_response_invalid');
    }
    final wire = utf8.decode(response.body, allowMalformed: false);
    final decoded = jsonDecode(wire);
    if (decoded is! Map<String, dynamic> ||
        decoded.keys.toSet().difference({
          'requestJson',
          'pageJson',
          'proofJson',
        }).isNotEmpty ||
        decoded.length != 3 ||
        canonicalConnectedSiteJson(decoded) != wire ||
        decoded['requestJson'] != signedRequestJson ||
        decoded['pageJson'] is! String ||
        decoded['proofJson'] is! String) {
      throw const FormatException('connected_cloud_feed_response_invalid');
    }
    final pageJson = decoded['pageJson'] as String;
    final proofJson = decoded['proofJson'] as String;
    final page = ConnectedSiteRetailFeedPageV1.parse(
      canonicalBytes: pageJson,
      expected: expected,
    );
    final proof = ConnectedCloudFeedProofV1.parse(
      canonicalBytes: proofJson,
      page: page,
      expected: expected,
      requestNonce: requestNonce,
      actorRole: actorRole,
      trustedNowMillis: trustedNowMillis,
    );
    await issuerVerifier.verify(proof);
    return ConnectedCloudFeedHttpReceipt(
      requestJson: signedRequestJson,
      pageJson: pageJson,
      proofJson: proofJson,
    );
  }
}
