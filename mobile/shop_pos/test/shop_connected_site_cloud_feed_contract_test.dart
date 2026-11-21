import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_site_cloud_feed_contract.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';

void main() {
  const expected = ConnectedSiteRetailFeedExpectation(
    workspaceId: 'workspace-a',
    siteId: 'site-a',
    actorId: 'actor-a',
    deviceId: 'device-a',
    authorityGeneration: 2,
    revocationGeneration: 3,
    authorityPayloadDigest: _a,
    leaseDigest: _b,
    requestDigest: _c,
    afterSequence: 0,
    priorEventDigest: null,
    limit: 64,
  );

  test('checked cloud page retains only sanitized source-bound data', () {
    final page = ConnectedSiteRetailFeedPageV1.parse(
      canonicalBytes: _wire(_page()),
      expected: expected,
    );
    expect(page.nextSequence, 1);
    expect(page.nextEventDigest, _a);
    expect(page.hasMore, isFalse);
    expect(page.canonicalBytes, isNot(contains('customerPhone')));
    expect(page.canonicalBytes, isNot(contains('unitPrice')));
  });

  test(
    'wrong scope, role context, request, lease and authority fail closed',
    () {
      for (final change in <void Function(Map<String, Object?>)>[
        (value) => value['workspaceId'] = 'other-workspace',
        (value) => value['siteId'] = 'other-site',
        (value) => value['actorId'] = 'other-actor',
        (value) => value['deviceId'] = 'other-device',
        (value) => value['authorityGeneration'] = 3,
        (value) => value['revocationGeneration'] = 4,
        (value) => value['authorityPayloadDigest'] = _b,
        (value) => value['leaseDigest'] = _a,
        (value) => value['requestDigest'] = _a,
      ]) {
        final value = _page();
        change(value);
        expect(
          () => ConnectedSiteRetailFeedPageV1.parse(
            canonicalBytes: _wire(value),
            expected: expected,
          ),
          throwsFormatException,
        );
      }
    },
  );

  test('gap, altered chain, projection substitution and lookahead fail', () {
    for (final change in <void Function(Map<String, Object?>)>[
      (value) => _headers(value)[0]['sequence'] = 2,
      (value) => _headers(value)[0]['previousEventDigest'] = _b,
      (value) => value['nextSequence'] = 2,
      (value) => value['nextEventDigest'] = _b,
      (value) => _projections(value)[0]['sequence'] = 2,
      (value) => _projections(value)[0]['eventDigest'] = _b,
      (value) => _projection(value)['candidateEventDigest'] = _b,
      (value) => _projection(value)['workspaceId'] = 'other-workspace',
      (value) => _projection(value)['customerPhone'] = 'private',
      (value) => (_projection(value)['lines'] as List)[0] = {
        'productId': 'product-a',
        'quantity': 0,
      },
      (value) => _projections(value).add(_projections(value)[0]),
    ]) {
      final value = _page();
      change(value);
      expect(
        () => ConnectedSiteRetailFeedPageV1.parse(
          canonicalBytes: _wire(value),
          expected: expected,
        ),
        throwsFormatException,
      );
    }
  });

  test('noncanonical, duplicate-key, missing and oversized pages fail', () {
    final canonical = _wire(_page());
    for (final bytes in [
      ' $canonical',
      canonical.replaceFirst(
        '"actorId":"actor-a"',
        '"actorId":"actor-a","actorId":"actor-a"',
      ),
      '{}',
      'x' * 262145,
    ]) {
      expect(
        () => ConnectedSiteRetailFeedPageV1.parse(
          canonicalBytes: bytes,
          expected: expected,
        ),
        throwsFormatException,
      );
    }
    final changedDigest = jsonDecode(canonical) as Map<String, dynamic>;
    changedDigest['pageDigest'] = _b;
    expect(
      () => ConnectedSiteRetailFeedPageV1.parse(
        canonicalBytes: canonicalConnectedSiteJson(changedDigest),
        expected: expected,
      ),
      throwsFormatException,
    );
  });

  test('empty and nonzero-cursor pages preserve the checked chain', () {
    final empty = _page();
    empty['headers'] = <Object>[];
    empty['projections'] = <Object>[];
    empty['nextSequence'] = 0;
    empty['nextEventDigest'] = null;
    final parsedEmpty = ConnectedSiteRetailFeedPageV1.parse(
      canonicalBytes: _wire(empty),
      expected: expected,
    );
    expect(parsedEmpty.nextSequence, 0);
    expect(parsedEmpty.nextEventDigest, isNull);
    final resumed = _page();
    resumed['afterSequence'] = 1;
    resumed['priorEventDigest'] = _b;
    _headers(resumed)[0]['sequence'] = 2;
    _headers(resumed)[0]['previousEventDigest'] = _b;
    _projections(resumed)[0]['sequence'] = 2;
    resumed['nextSequence'] = 2;
    final resumedExpected = ConnectedSiteRetailFeedExpectation(
      workspaceId: expected.workspaceId,
      siteId: expected.siteId,
      actorId: expected.actorId,
      deviceId: expected.deviceId,
      authorityGeneration: expected.authorityGeneration,
      revocationGeneration: expected.revocationGeneration,
      authorityPayloadDigest: expected.authorityPayloadDigest,
      leaseDigest: expected.leaseDigest,
      requestDigest: expected.requestDigest,
      afterSequence: 1,
      priorEventDigest: _b,
      limit: 64,
    );
    expect(
      ConnectedSiteRetailFeedPageV1.parse(
        canonicalBytes: _wire(resumed),
        expected: resumedExpected,
      ).nextSequence,
      2,
    );
    expect(
      () => ConnectedSiteRetailFeedPageV1.parse(
        canonicalBytes: _wire(resumed),
        expected: expected,
      ),
      throwsFormatException,
    );
  });

  test('request limit accepts 64 headers and rejects overflow', () {
    final value = _page();
    value['headers'] = List<Map<String, Object?>>.generate(
      64,
      (i) => {
        'sequence': i + 1,
        'eventDigest': _a,
        'previousEventDigest': i == 0 ? null : _a,
      },
    );
    value['nextSequence'] = 64;
    expect(
      ConnectedSiteRetailFeedPageV1.parse(
        canonicalBytes: _wire(value),
        expected: expected,
      ).nextSequence,
      64,
    );
    final thirtyThree = _page();
    thirtyThree['headers'] = _headers(value).take(33).toList();
    thirtyThree['nextSequence'] = 33;
    final limit32 = ConnectedSiteRetailFeedExpectation(
      workspaceId: expected.workspaceId,
      siteId: expected.siteId,
      actorId: expected.actorId,
      deviceId: expected.deviceId,
      authorityGeneration: expected.authorityGeneration,
      revocationGeneration: expected.revocationGeneration,
      authorityPayloadDigest: expected.authorityPayloadDigest,
      leaseDigest: expected.leaseDigest,
      requestDigest: expected.requestDigest,
      afterSequence: 0,
      priorEventDigest: null,
      limit: 32,
    );
    expect(
      () => ConnectedSiteRetailFeedPageV1.parse(
        canonicalBytes: _wire(thirtyThree),
        expected: limit32,
      ),
      throwsFormatException,
    );
    _headers(value)
        .add({'sequence': 65, 'eventDigest': _a, 'previousEventDigest': _a});
    value['nextSequence'] = 65;
    expect(
      () => ConnectedSiteRetailFeedPageV1.parse(
        canonicalBytes: _wire(value),
        expected: expected,
      ),
      throwsFormatException,
    );
  });

  test('projection order must follow header order', () {
    final value = _page();
    _headers(value)
        .add({'sequence': 2, 'eventDigest': _b, 'previousEventDigest': _a});
    value['nextSequence'] = 2;
    value['nextEventDigest'] = _b;
    final second = Map<String, Object?>.from(_projections(value)[0]);
    second['sequence'] = 2;
    second['eventDigest'] = _b;
    second['projection'] = {..._projection(value), 'candidateEventDigest': _b};
    _projections(value).add(second);
    expect(
      ConnectedSiteRetailFeedPageV1.parse(
        canonicalBytes: _wire(value),
        expected: expected,
      ).nextSequence,
      2,
    );
    final projections = _projections(value);
    projections[0] = second;
    projections[1] = {
      'sequence': 1,
      'eventDigest': _a,
      'projection': {..._projection(value), 'candidateEventDigest': _a},
    };
    expect(
      () => ConnectedSiteRetailFeedPageV1.parse(
        canonicalBytes: _wire(value),
        expected: expected,
      ),
      throwsFormatException,
    );
  });
}

const _a = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const _b = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const _c = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

Map<String, Object?> _page() => {
  'contract': 'supermega.connected-site-retail-feed.v1',
  'protocolVersion': 1,
  'workspaceId': 'workspace-a',
  'siteId': 'site-a',
  'actorId': 'actor-a',
  'deviceId': 'device-a',
  'authorityGeneration': 2,
  'revocationGeneration': 3,
  'authorityPayloadDigest': _a,
  'leaseDigest': _b,
  'requestDigest': _c,
  'afterSequence': 0,
  'priorEventDigest': null,
  'headers': <Map<String, Object?>>[
    {'sequence': 1, 'eventDigest': _a, 'previousEventDigest': null},
  ],
  'projections': <Map<String, Object?>>[
    {
      'sequence': 1,
      'eventDigest': _a,
      'projection': {
        'contract': 'supermega.connected-site-retail-reservation-view.v1',
        'workspaceId': 'workspace-a',
        'siteId': 'site-a',
        'candidateEventDigest': _a,
        'reservationId': 'reservation-a',
        'reservationDigest': _b,
        'state': 'held',
        'stateVersion': 1,
        'lines': [
          {'productId': 'product-a', 'quantity': 1},
        ],
      },
    },
  ],
  'nextSequence': 1,
  'nextEventDigest': _a,
  'hasMore': false,
};

String _wire(Map<String, Object?> value) => canonicalConnectedSiteJson({
  ...value,
  'pageDigest': connectedSiteSha256(value),
});

List<Map<String, Object?>> _headers(Map<String, Object?> value) =>
    (value['headers'] as List).cast<Map<String, Object?>>();

List<Map<String, Object?>> _projections(Map<String, Object?> value) =>
    (value['projections'] as List).cast<Map<String, Object?>>();

Map<String, Object?> _projection(Map<String, Object?> value) =>
    _projections(value)[0]['projection'] as Map<String, Object?>;
