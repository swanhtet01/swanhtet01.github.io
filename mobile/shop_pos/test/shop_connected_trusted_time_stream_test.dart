import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_trusted_time_stream.dart';

void main() {
  test('per-client entries round-trip and chain without shared sequencing', () {
    final first = _entry();
    final decoded = ConnectedTrustedTimeStreamEntryV2.fromCanonicalBytes(
      first.canonicalBytes,
    );
    expect(decoded.entryDigest, first.entryDigest);
    expect(decoded.previousEntryDigest, isNull);
    expect(decoded.kind, ConnectedTrustedTimeStreamEntryKind.time);

    final second = _entry(
      sequence: 2,
      previousEntryDigest: first.entryDigest,
      kind: ConnectedTrustedTimeStreamEntryKind.continuity,
      observedAtMillis: 1800000060000,
      validUntilMillis: 1800000060000,
    );
    expect(second.previousEntryDigest, first.entryDigest);
    expect(second.entryDigest, isNot(first.entryDigest));

    final otherClient = _entry(clientDeviceId: 'device_2');
    expect(otherClient.authoritySequence, 1);
    expect(otherClient.previousEntryDigest, isNull);
    expect(otherClient.entryDigest, isNot(first.entryDigest));
  });

  test('sequence predecessor and time-kind invariants fail closed', () {
    expect(() => _entry(previousEntryDigest: '9' * 64), throwsFormatException);
    expect(() => _entry(sequence: 2), throwsFormatException);
    expect(
      () => _entry(validUntilMillis: 1800000000000),
      throwsFormatException,
    );
    expect(
      () => _entry(kind: ConnectedTrustedTimeStreamEntryKind.continuity),
      throwsFormatException,
    );
    expect(
      () => _entry(validUntilMillis: 1800000120001),
      throwsFormatException,
    );
  });

  test('entry substitution and noncanonical bytes fail closed', () {
    final entry = _entry();
    expect(
      () => ConnectedTrustedTimeStreamEntryV2.fromJson({
        ...entry.toJson(),
        'sessionGeneration': 4,
      }),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeStreamEntryV2.fromJson({
        ...entry.toJson(),
        'extra': true,
      }),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeStreamEntryV2.fromJson({
        ...entry.toJson(),
        'authoritySignature': 'short',
      }),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeStreamEntryV2.fromJson({
        ...entry.toJson(),
        'authoritySignature': '${_authoritySignature.substring(0, 85)}B',
      }),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeStreamEntryV2.fromCanonicalBytes(
        utf8.encode('${entry.canonicalJson}\n'),
      ),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeStreamEntryV2.fromCanonicalBytes(
        List<int>.filled(connectedTrustedTimeStreamMaximumBytes + 1, 0x20),
      ),
      throwsFormatException,
    );
  });

  test('device acknowledgement binds exact resulting stream head', () {
    final entry = _entry();
    final ack = _ack(entry);
    final decoded = ConnectedTrustedTimeStreamAckV1.fromCanonicalBytes(
      ack.canonicalBytes,
    );
    expect(decoded.entryDigest, entry.entryDigest);
    expect(decoded.resultingHeadDigest, entry.entryDigest);
    expect(decoded.ackDigest, ack.ackDigest);
    expect(decoded.acknowledgedAtMonotonicMillis, 7000);

    expect(
      () => _ack(entry, resultingHeadDigest: '8' * 64),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeStreamAckV1.fromJson({
        ...ack.toJson(),
        'authoritySequence': 2,
      }),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeStreamAckV1.fromJson({
        ...ack.toJson(),
        'clientSignature': 'not-a-signature',
      }),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeStreamAckV1.fromJson({
        ...ack.toJson(),
        'clientSignature': '${_clientSignature.substring(0, 85)}B',
      }),
      throwsFormatException,
    );
  });

  test('ack exact schema, canonical bytes and size cap fail closed', () {
    final ack = _ack(_entry());
    expect(
      () => ConnectedTrustedTimeStreamAckV1.fromJson({
        ...ack.toJson(),
        'extra': 1,
      }),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeStreamAckV1.fromCanonicalBytes(
        utf8.encode('${ack.canonicalJson} '),
      ),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeStreamAckV1.fromCanonicalBytes(const [0xff]),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeStreamAckV1.fromCanonicalBytes(
        List<int>.filled(connectedTrustedTimeStreamMaximumBytes + 1, 0x20),
      ),
      throwsFormatException,
    );
  });
}

ConnectedTrustedTimeStreamEntryV2 _entry({
  String clientDeviceId = 'device_1',
  int sequence = 1,
  String? previousEntryDigest,
  ConnectedTrustedTimeStreamEntryKind kind =
      ConnectedTrustedTimeStreamEntryKind.time,
  int observedAtMillis = 1800000000000,
  int validUntilMillis = 1800000060000,
}) => ConnectedTrustedTimeStreamEntryV2(
  workspaceId: 'workspace_1',
  siteId: 'site_1',
  coordinatorDeviceId: 'coordinator_1',
  clientDeviceId: clientDeviceId,
  clientFingerprint: clientDeviceId == 'device_1' ? '1' * 64 : '9' * 64,
  sessionGeneration: 3,
  coordinatorBindingDigest: '2' * 64,
  coordinatorBindingGeneration: 7,
  authorityKeyId: 'time_key_1',
  authorityKeyFingerprint: '4' * 64,
  authorityKeyGeneration: 2,
  authorityEpoch: 5,
  authoritySequence: sequence,
  previousEntryDigest: previousEntryDigest,
  kind: kind,
  observedAtMillis: observedAtMillis,
  validUntilMillis: validUntilMillis,
  authoritySignature: _authoritySignature,
);

ConnectedTrustedTimeStreamAckV1 _ack(
  ConnectedTrustedTimeStreamEntryV2 entry, {
  String? resultingHeadDigest,
}) => ConnectedTrustedTimeStreamAckV1(
  workspaceId: entry.workspaceId,
  siteId: entry.siteId,
  coordinatorDeviceId: entry.coordinatorDeviceId,
  clientDeviceId: entry.clientDeviceId,
  clientFingerprint: entry.clientFingerprint,
  clientSigningKeyId: entry.clientFingerprint,
  sessionGeneration: entry.sessionGeneration,
  coordinatorBindingDigest: entry.coordinatorBindingDigest,
  coordinatorBindingGeneration: entry.coordinatorBindingGeneration,
  authorityKeyGeneration: entry.authorityKeyGeneration,
  authorityEpoch: entry.authorityEpoch,
  authoritySequence: entry.authoritySequence,
  entryDigest: entry.entryDigest,
  resultingHeadDigest: resultingHeadDigest ?? entry.entryDigest,
  bootSessionId: '3' * 64,
  acknowledgedAtMonotonicMillis: 7000,
  clientSignature: _clientSignature,
);

final _authoritySignature = base64UrlEncode(List<int>.filled(64, 7))
    .replaceAll('=', '');
final _clientSignature = base64UrlEncode(List<int>.filled(64, 8))
    .replaceAll('=', '');
