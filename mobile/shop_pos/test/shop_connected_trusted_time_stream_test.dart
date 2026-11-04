import 'dart:convert';

import 'package:crypto/crypto.dart' as crypto;
import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_trusted_time_client_schema.dart';
import 'package:supermega_shop/shop_connected_trusted_time_stream.dart';

void main() {
  test('retained signed time sample rejects altered time and scope', () async {
    final authorityPair = await Ed25519().newKeyPairFromSeed(
      List<int>.filled(32, 12),
    );
    final clientPair = await Ed25519().newKeyPairFromSeed(
      List<int>.filled(32, 13),
    );
    final authorityPublic = (await authorityPair.extractPublicKey()).bytes;
    final clientPublic = (await clientPair.extractPublicKey()).bytes;
    final authorityFingerprint = crypto.sha256
        .convert(authorityPublic)
        .toString();
    final clientFingerprint = crypto.sha256.convert(clientPublic).toString();
    ConnectedTrustedTimeStreamEntryV2 entryWith(String signature) =>
        ConnectedTrustedTimeStreamEntryV2(
          workspaceId: 'workspace_1',
          siteId: 'site_1',
          coordinatorDeviceId: 'coordinator_1',
          clientDeviceId: 'device_1',
          clientFingerprint: clientFingerprint,
          sessionGeneration: 3,
          coordinatorBindingDigest: '2' * 64,
          coordinatorBindingGeneration: 7,
          authorityKeyId: 'time_key_1',
          authorityKeyFingerprint: authorityFingerprint,
          authorityKeyGeneration: 2,
          authorityEpoch: 5,
          authoritySequence: 1,
          previousEntryDigest: null,
          kind: ConnectedTrustedTimeStreamEntryKind.time,
          observedAtMillis: 1800000000000,
          validUntilMillis: 1800000060000,
          authoritySignature: signature,
        );
    final entryUnsigned = entryWith(_authoritySignature);
    final entrySignature = base64UrlEncode(
      (await Ed25519().sign(
        utf8.encode(entryUnsigned.canonicalSigningPayload),
        keyPair: authorityPair,
      )).bytes,
    ).replaceAll('=', '');
    final entry = entryWith(entrySignature);
    ConnectedTrustedTimeStreamAckV1 ackWith(String signature) =>
        ConnectedTrustedTimeStreamAckV1(
          workspaceId: entry.workspaceId,
          siteId: entry.siteId,
          coordinatorDeviceId: entry.coordinatorDeviceId,
          clientDeviceId: entry.clientDeviceId,
          clientFingerprint: entry.clientFingerprint,
          clientSigningKeyId: 'client_key_1',
          sessionGeneration: entry.sessionGeneration,
          coordinatorBindingDigest: entry.coordinatorBindingDigest,
          coordinatorBindingGeneration: entry.coordinatorBindingGeneration,
          authorityKeyGeneration: entry.authorityKeyGeneration,
          authorityEpoch: entry.authorityEpoch,
          authoritySequence: entry.authoritySequence,
          entryDigest: entry.entryDigest,
          resultingHeadDigest: entry.entryDigest,
          bootSessionId: '3' * 64,
          acknowledgedAtMonotonicMillis: 7000,
          clientSignature: signature,
        );
    final ackUnsigned = ackWith(_clientSignature);
    final ackSignature = base64UrlEncode(
      (await Ed25519().sign(
        utf8.encode(ackUnsigned.canonicalSigningPayload),
        keyPair: clientPair,
      )).bytes,
    ).replaceAll('=', '');
    final ack = ackWith(ackSignature);
    final headDigest = connectedTrustedTimeClientHeadDigest(
      streamDigest: connectedTrustedTimeClientStreamDigest(entry),
      authoritySequence: entry.authoritySequence,
      entryDigest: entry.entryDigest,
      ackDigest: ack.ackDigest,
    );
    bool valid({
      String? site,
      String? coordinator,
      int? epoch,
      int? time,
      String? candidateEntryJson,
      String? candidateAckJson,
      Map<String, List<int>>? authorityPins,
      Map<String, List<int>>? clientPins,
    }) => verifyRetainedTrustedTimeSampleV39Sync(
      entryJson: candidateEntryJson ?? entry.canonicalJson,
      ackJson: candidateAckJson ?? ack.canonicalJson,
      entryDigest: entry.entryDigest,
      ackDigest: ack.ackDigest,
      headDigest: headDigest,
      workspaceId: entry.workspaceId,
      siteId: site ?? entry.siteId,
      coordinatorDeviceId: coordinator ?? entry.coordinatorDeviceId,
      deviceId: entry.clientDeviceId,
      clientFingerprint: clientFingerprint,
      clientSigningKeyId: ack.clientSigningKeyId,
      sessionGeneration: entry.sessionGeneration,
      coordinatorBindingDigest: entry.coordinatorBindingDigest,
      coordinatorBindingGeneration: entry.coordinatorBindingGeneration,
      authorityKeyId: entry.authorityKeyId,
      authorityKeyGeneration: entry.authorityKeyGeneration,
      authorityEpoch: epoch ?? entry.authorityEpoch,
      bootSessionId: ack.bootSessionId,
      sampleMonotonicMillis: 8000,
      trustedNowMillis: time ?? 1800000001000,
      pinnedAuthorityKeys:
          authorityPins ?? {entry.authorityKeyId: authorityPublic},
      pinnedClientKeys: clientPins ?? {ack.clientSigningKeyId: clientPublic},
    );
    expect(valid(), isTrue);
    expect(valid(site: 'other'), isFalse);
    expect(valid(coordinator: 'other'), isFalse);
    expect(valid(epoch: entry.authorityEpoch + 1), isFalse);
    expect(valid(time: 1800000001001), isFalse);
    expect(valid(authorityPins: const {}), isFalse);
    expect(valid(clientPins: const {}), isFalse);
    expect(
      valid(
        candidateEntryJson: entry.canonicalJson.replaceFirst(
          'workspace_1',
          'workspace_2',
        ),
      ),
      isFalse,
    );
    expect(
      valid(
        candidateAckJson: ack.canonicalJson.replaceFirst(
          'device_1',
          'device_2',
        ),
      ),
      isFalse,
    );
  });

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
