import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_trusted_time_head.dart';

void main() {
  test('client head round-trips exact canonical accepted identity', () {
    final head = _head();
    final decoded = ConnectedTrustedTimeClientHeadV1.fromCanonicalBytes(
      head.canonicalBytes,
    );

    expect(decoded.headDigest, head.headDigest);
    expect(decoded.authoritySequence, 11);
    expect(decoded.sessionGeneration, 3);
    expect(decoded.coordinatorBindingGeneration, 7);
    expect(decoded.requestDigest, '5' * 64);
    expect(decoded.observationDigest, '6' * 64);
    expect(decoded.acceptanceDigest, '7' * 64);
    expect(utf8.decode(decoded.canonicalBytes), head.canonicalJson);
  });

  test('scope authority and acceptance substitutions fail closed', () {
    final json = _head().toJson();
    for (final entry in <String, Object>{
      'clientDeviceId': 'device_2',
      'sessionGeneration': 4,
      'coordinatorBindingDigest': '9' * 64,
      'coordinatorBindingGeneration': 8,
      'authorityKeyGeneration': 3,
      'authorityEpoch': 6,
      'authoritySequence': 12,
      'requestDigest': '8' * 64,
      'observationDigest': '8' * 64,
      'acceptanceDigest': '8' * 64,
      'effectiveAtMillis': 1800000000001,
    }.entries) {
      expect(
        () => ConnectedTrustedTimeClientHeadV1.fromJson({
          ...json,
          entry.key: entry.value,
        }),
        throwsFormatException,
        reason: entry.key,
      );
    }
  });

  test('invalid values and synthetic genesis fail closed', () {
    expect(() => _head(authoritySequence: 0), throwsFormatException);
    expect(() => _head(sessionGeneration: 0), throwsFormatException);
    expect(() => _head(validUntilMillis: 1799999999999), throwsFormatException);
    expect(
      () => ConnectedTrustedTimeClientHeadV1.fromJson({
        ..._head().toJson(),
        'clientFingerprint': 'not-a-digest',
      }),
      throwsFormatException,
    );
  });

  test(
    'extra missing malformed noncanonical and oversized bytes fail closed',
    () {
      final head = _head();
      expect(
        () => ConnectedTrustedTimeClientHeadV1.fromJson({
          ...head.toJson(),
          'extra': true,
        }),
        throwsFormatException,
      );
      final missing = Map<String, Object>.from(head.toJson())
        ..remove('authorityEpoch');
      expect(
        () => ConnectedTrustedTimeClientHeadV1.fromJson(missing),
        throwsFormatException,
      );
      expect(
        () => ConnectedTrustedTimeClientHeadV1.fromCanonicalBytes(
          utf8.encode('${head.canonicalJson}\n'),
        ),
        throwsFormatException,
      );
      expect(
        () => ConnectedTrustedTimeClientHeadV1.fromCanonicalBytes(const [0xff]),
        throwsFormatException,
      );
      expect(
        () => ConnectedTrustedTimeClientHeadV1.fromCanonicalBytes(
          List<int>.filled(connectedTrustedTimeClientHeadMaximumBytes + 1, 32),
        ),
        throwsFormatException,
      );
    },
  );
}

ConnectedTrustedTimeClientHeadV1 _head({
  int sessionGeneration = 3,
  int authoritySequence = 11,
  int validUntilMillis = 1800000060000,
}) => ConnectedTrustedTimeClientHeadV1(
  workspaceId: 'workspace_1',
  siteId: 'site_1',
  coordinatorDeviceId: 'coordinator_1',
  clientDeviceId: 'device_1',
  clientFingerprint: '1' * 64,
  sessionGeneration: sessionGeneration,
  coordinatorBindingDigest: '2' * 64,
  coordinatorBindingGeneration: 7,
  authorityKeyId: 'time_key_1',
  authorityKeyFingerprint: '4' * 64,
  authorityKeyGeneration: 2,
  authorityEpoch: 5,
  authoritySequence: authoritySequence,
  requestDigest: '5' * 64,
  observationDigest: '6' * 64,
  acceptanceDigest: '7' * 64,
  observedAtMillis: 1800000000000,
  bootSessionId: '3' * 64,
  acceptedAtMonotonicMillis: 5010,
  effectiveAtMillis: 1800000000000,
  validUntilMillis: validUntilMillis,
);
