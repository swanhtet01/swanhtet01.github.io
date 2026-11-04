import 'dart:convert';

import 'shop_connected_site_contracts.dart';

/// A checked shape, not a trusted response or an enabled cloud-sync client.
/// The caller must separately verify ingress, response authentication, current
/// role/lease/authority and trusted time before any durable apply is possible.
class ConnectedSiteRetailFeedExpectation {
  const ConnectedSiteRetailFeedExpectation({
    required this.workspaceId,
    required this.siteId,
    required this.actorId,
    required this.deviceId,
    required this.authorityGeneration,
    required this.revocationGeneration,
    required this.authorityPayloadDigest,
    required this.leaseDigest,
    required this.requestDigest,
    required this.afterSequence,
    required this.priorEventDigest,
    required this.limit,
  });

  final String workspaceId;
  final String siteId;
  final String actorId;
  final String deviceId;
  final int authorityGeneration;
  final int revocationGeneration;
  final String authorityPayloadDigest;
  final String leaseDigest;
  final String requestDigest;
  final int afterSequence;
  final String? priorEventDigest;
  final int limit;
}

Never _invalid() => throw const FormatException('connected_cloud_feed_invalid');

Map<String, Object?> _exact(Object? value, Set<String> keys) {
  if (value is! Map) _invalid();
  final result = <String, Object?>{};
  for (final entry in value.entries) {
    if (entry.key is! String) _invalid();
    result[entry.key as String] = entry.value;
  }
  if (result.length != keys.length || !result.keys.toSet().containsAll(keys)) {
    _invalid();
  }
  return result;
}

bool _digest(Object? value) =>
    value is String && RegExp(r'^[0-9a-f]{64}$').hasMatch(value);

bool _identifier(Object? value) =>
    value is String &&
    value.length <= 128 &&
    RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:@/-]*$').hasMatch(value);

/// Immutable canonical bytes of one sanitized, manager-only source page.
/// Never put this in the LAN SiteDeltaV1/replica namespace or treat its digest
/// as a signature. A future v40 ledger must commit headers, projections and
/// its own cloud cursor atomically after an independent response verifier.
class ConnectedSiteRetailFeedPageV1 {
  ConnectedSiteRetailFeedPageV1._({
    required this.canonicalBytes,
    required this.pageDigest,
    required this.nextSequence,
    required this.nextEventDigest,
    required this.hasMore,
  });

  final String canonicalBytes;
  final String pageDigest;
  final int nextSequence;
  final String? nextEventDigest;
  final bool hasMore;

  static ConnectedSiteRetailFeedPageV1 parse({
    required String canonicalBytes,
    required ConnectedSiteRetailFeedExpectation expected,
  }) {
    if (canonicalBytes.length > 262144) _invalid();
    if (expected.limit < 1 ||
        expected.limit > 64 ||
        expected.afterSequence < 0 ||
        expected.afterSequence > 9223372036854775807 ||
        (expected.afterSequence == 0) != (expected.priorEventDigest == null) ||
        (expected.priorEventDigest != null &&
            !_digest(expected.priorEventDigest)) ||
        expected.authorityGeneration < 0 ||
        expected.revocationGeneration < 0) {
      _invalid();
    }
    Object? decoded;
    try {
      decoded = jsonDecode(canonicalBytes);
      if (canonicalConnectedSiteJson(decoded) != canonicalBytes) _invalid();
    } on Object {
      _invalid();
    }
    final page = _exact(decoded, {
      'contract',
      'protocolVersion',
      'workspaceId',
      'siteId',
      'actorId',
      'deviceId',
      'authorityGeneration',
      'revocationGeneration',
      'authorityPayloadDigest',
      'leaseDigest',
      'requestDigest',
      'afterSequence',
      'priorEventDigest',
      'headers',
      'projections',
      'nextSequence',
      'nextEventDigest',
      'hasMore',
      'pageDigest',
    });
    if (page['contract'] != 'supermega.connected-site-retail-feed.v1' ||
        page['protocolVersion'] != connectedSiteProtocolVersion ||
        page['workspaceId'] != expected.workspaceId ||
        page['siteId'] != expected.siteId ||
        page['actorId'] != expected.actorId ||
        page['deviceId'] != expected.deviceId ||
        page['authorityGeneration'] != expected.authorityGeneration ||
        page['revocationGeneration'] != expected.revocationGeneration ||
        page['authorityPayloadDigest'] != expected.authorityPayloadDigest ||
        page['leaseDigest'] != expected.leaseDigest ||
        page['requestDigest'] != expected.requestDigest ||
        page['afterSequence'] != expected.afterSequence ||
        page['priorEventDigest'] != expected.priorEventDigest ||
        !_identifier(page['workspaceId']) ||
        !_identifier(page['siteId']) ||
        !_identifier(page['actorId']) ||
        !_identifier(page['deviceId']) ||
        !_digest(page['authorityPayloadDigest']) ||
        !_digest(page['leaseDigest']) ||
        !_digest(page['requestDigest']) ||
        (page['afterSequence'] is! int) ||
        (page['afterSequence'] as int) < 0 ||
        (page['priorEventDigest'] != null &&
            !_digest(page['priorEventDigest'])) ||
        !_digest(page['pageDigest']) ||
        page['hasMore'] is! bool) {
      _invalid();
    }
    final unsigned = Map<String, Object?>.from(page)..remove('pageDigest');
    if (connectedSiteSha256(unsigned) != page['pageDigest']) _invalid();
    final rawHeaders = page['headers'];
    final rawProjections = page['projections'];
    if (rawHeaders is! List ||
        rawHeaders.length > expected.limit ||
        rawProjections is! List ||
        rawProjections.length > rawHeaders.length) {
      _invalid();
    }
    var sequence = expected.afterSequence;
    String? previous = expected.priorEventDigest;
    final headers = <int, String>{};
    for (final raw in rawHeaders) {
      final header = _exact(raw, {
        'sequence',
        'eventDigest',
        'previousEventDigest',
      });
      sequence += 1;
      if (header['sequence'] != sequence ||
          !_digest(header['eventDigest']) ||
          header['previousEventDigest'] != previous) {
        _invalid();
      }
      previous = header['eventDigest'] as String;
      headers[sequence] = previous;
    }
    if (page['nextSequence'] != sequence ||
        page['nextEventDigest'] != previous ||
        sequence > 9223372036854775807) {
      _invalid();
    }
    final seen = <int>{};
    var lastProjectionSequence = expected.afterSequence;
    for (final raw in rawProjections) {
      final entry = _exact(raw, {'sequence', 'eventDigest', 'projection'});
      final sourceSequence = entry['sequence'];
      if (sourceSequence is! int ||
          sourceSequence <= lastProjectionSequence ||
          !seen.add(sourceSequence) ||
          headers[sourceSequence] != entry['eventDigest']) {
        _invalid();
      }
      lastProjectionSequence = sourceSequence;
      final projection = _exact(entry['projection'], {
        'contract',
        'workspaceId',
        'siteId',
        'candidateEventDigest',
        'reservationId',
        'reservationDigest',
        'state',
        'stateVersion',
        'lines',
      });
      if (projection['contract'] !=
              'supermega.connected-site-retail-reservation-view.v1' ||
          projection['workspaceId'] != expected.workspaceId ||
          projection['siteId'] != expected.siteId ||
          projection['candidateEventDigest'] != entry['eventDigest'] ||
          !_identifier(projection['reservationId']) ||
          !_digest(projection['reservationDigest']) ||
          projection['state'] != 'held' ||
          projection['stateVersion'] != 1) {
        _invalid();
      }
      final lines = projection['lines'];
      if (lines is! List || lines.isEmpty || lines.length > 100) _invalid();
      String? priorProduct;
      for (final rawLine in lines) {
        final line = _exact(rawLine, {'productId', 'quantity'});
        final product = line['productId'];
        final quantity = line['quantity'];
        if (!_identifier(product) ||
            quantity is! int ||
            quantity < 1 ||
            quantity > 1000 ||
            (priorProduct != null &&
                priorProduct.compareTo(product as String) >= 0)) {
          _invalid();
        }
        priorProduct = product as String;
      }
    }
    return ConnectedSiteRetailFeedPageV1._(
      canonicalBytes: canonicalBytes,
      pageDigest: page['pageDigest'] as String,
      nextSequence: sequence,
      nextEventDigest: previous,
      hasMore: page['hasMore'] as bool,
    );
  }
}
