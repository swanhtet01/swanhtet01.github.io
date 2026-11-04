import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_trusted_time_contract.dart';

void main() {
  test('challenge and observation round-trip exact canonical bindings', () {
    final challenge = _challenge();
    final observation = _observation(challenge);

    expect(
      ConnectedTrustedTimeChallengeV1.fromJson(challenge.toJson())
          .requestDigest,
      challenge.requestDigest,
    );
    expect(
      ConnectedTrustedTimeObservationV1.fromJson(
        observation.toJson(),
        challenge,
      ).observationDigest,
      observation.observationDigest,
    );
    expect(
      observation.signedPayload['observationDigest'],
      observation.observationDigest,
    );
  });

  test('challenge rejects extra fields, altered digest and wrong session', () {
    final challenge = _challenge();
    expect(
      () => ConnectedTrustedTimeChallengeV1.fromJson({
        ...challenge.toJson(),
        'extra': true,
      }),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeChallengeV1.fromJson({
        ...challenge.toJson(),
        'requestDigest': '0' * 64,
      }),
      throwsFormatException,
    );
    expect(
      _challenge(sessionGeneration: 4).requestDigest,
      isNot(challenge.requestDigest),
    );
    expect(
      _challenge(bindingGeneration: 8).requestDigest,
      isNot(challenge.requestDigest),
    );
  });

  test('observation rejects substitution and noncanonical signature', () {
    final challenge = _challenge();
    final observation = _observation(challenge);
    expect(
      () => ConnectedTrustedTimeObservationV1.fromJson({
        ...observation.toJson(),
        'clientDeviceId': 'device_2',
      }, challenge),
      throwsFormatException,
    );
    expect(
      () => ConnectedTrustedTimeObservationV1.fromJson({
        ...observation.toJson(),
        'observationDigest': '0' * 64,
      }, challenge),
      throwsFormatException,
    );
    expect(
      () => _observation(
        challenge,
        signature: base64UrlEncode(List.filled(63, 1)),
      ),
      throwsFormatException,
    );
  });

  test(
    'owner approval binds usage, coordinator binding and key generation',
    () {
      final approval = _approval();
      expect(approval.evidence['usage'], 'connected-trusted-time-v1');
      expect(approval.approvalDigest, hasLength(64));
      expect(
        _approval(keyGeneration: 3).approvalDigest,
        isNot(approval.approvalDigest),
      );
      expect(
        _approval(bindingGeneration: 8).approvalDigest,
        isNot(approval.approvalDigest),
      );
      expect(
        ConnectedTrustedTimeAuthorityApprovalV1.fromJson(approval.toJson())
            .approvalDigest,
        approval.approvalDigest,
      );
      expect(
        () => ConnectedTrustedTimeAuthorityApprovalV1.fromJson({
          ...approval.toJson(),
          'usage': 'coordinator-tls',
        }),
        throwsFormatException,
      );
      expect(
        () => _approval(signature: base64UrlEncode(List<int>.filled(63, 7))),
        throwsFormatException,
      );
      final canonical = _signature();
      expect(
        () => _approval(
          signature: '${canonical.substring(0, canonical.length - 1)}B',
        ),
        throwsFormatException,
      );
    },
  );

  test(
    'platform clock and authority verification remain unavailable',
    () async {
      const clock = UnavailableConnectedTrustedTimePlatformClock();
      const verifier = UnavailableConnectedTrustedTimeAuthorityVerifier();
      await expectLater(clock.bootSessionId(), throwsStateError);
      await expectLater(clock.monotonicMillis(), throwsStateError);
      expect(await verifier.verifyApproval(_approval()), isFalse);
      expect(
        await verifier.verifyObservation(
          approval: _approval(),
          observation: _observation(_challenge()),
        ),
        isFalse,
      );
    },
  );
}

ConnectedTrustedTimeAuthorityApprovalV1 _approval({
  int keyGeneration = 2,
  int bindingGeneration = 7,
  String? signature,
}) => ConnectedTrustedTimeAuthorityApprovalV1(
  workspaceId: 'workspace_1',
  siteId: 'site_1',
  coordinatorDeviceId: 'coordinator_1',
  coordinatorBindingDigest: '2' * 64,
  coordinatorBindingGeneration: bindingGeneration,
  authorityKeyId: 'time_key_1',
  authorityKeyFingerprint: '4' * 64,
  authorityKeyGeneration: keyGeneration,
  issuedAtMillis: 1800000000000,
  expiresAtMillis: 1800003600000,
  ownerAuthorityKeyId: 'owner_key_1',
  ownerAuthoritySignature: signature ?? _signature(),
);

ConnectedTrustedTimeChallengeV1 _challenge({
  int sessionGeneration = 3,
  int bindingGeneration = 7,
}) => ConnectedTrustedTimeChallengeV1(
  workspaceId: 'workspace_1',
  siteId: 'site_1',
  coordinatorDeviceId: 'coordinator_1',
  clientDeviceId: 'device_1',
  clientFingerprint: '1' * 64,
  sessionGeneration: sessionGeneration,
  coordinatorBindingDigest: '2' * 64,
  coordinatorBindingGeneration: bindingGeneration,
  nonce: 'time_nonce_abcdefghijklmnop_1',
  bootSessionId: '3' * 64,
  startedMonotonicMillis: 5000,
);

ConnectedTrustedTimeObservationV1 _observation(
  ConnectedTrustedTimeChallengeV1 challenge, {
  String? signature,
}) => ConnectedTrustedTimeObservationV1(
  challenge: challenge,
  authorityKeyId: 'time_key_1',
  authorityKeyFingerprint: '4' * 64,
  authorityKeyGeneration: 2,
  authorityEpoch: 5,
  authoritySequence: 11,
  observedAtMillis: 1800000000000,
  validUntilMillis: 1800000060000,
  authoritySignature: signature ?? _signature(),
);

String _signature() =>
    base64UrlEncode(List<int>.filled(64, 7)).replaceAll('=', '');
