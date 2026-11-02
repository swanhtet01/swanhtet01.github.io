import 'dart:convert';

import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_trusted_time_contract.dart';
import 'package:supermega_shop/shop_connected_trusted_time_verifier.dart';

void main() {
  late SimpleKeyPair ownerPair;
  late SimpleKeyPair authorityPair;
  late List<int> ownerPublicKey;
  late List<int> authorityPublicKey;

  setUp(() async {
    ownerPair = await Ed25519().newKeyPairFromSeed(List<int>.filled(32, 1));
    authorityPair = await Ed25519().newKeyPairFromSeed(List<int>.filled(32, 2));
    ownerPublicKey = (await ownerPair.extractPublicKey()).bytes;
    authorityPublicKey = (await authorityPair.extractPublicKey()).bytes;
  });

  test(
    'accepts exact owner approval and exact observation signatures',
    () async {
      final fixture = await _fixture(
        ownerPair: ownerPair,
        authorityPair: authorityPair,
        authorityPublicKey: authorityPublicKey,
      );
      final verifier = _verifier(
        ownerPublicKey: ownerPublicKey,
        authorityPublicKey: authorityPublicKey,
      );

      expect(await verifier.verifyApproval(fixture.approval), isTrue);
      expect(
        await verifier.verifyObservation(
          approval: fixture.approval,
          observation: fixture.observation,
        ),
        isTrue,
      );
    },
  );

  test(
    'rejects wrong owner, authority key and substituted signature',
    () async {
      final fixture = await _fixture(
        ownerPair: ownerPair,
        authorityPair: authorityPair,
        authorityPublicKey: authorityPublicKey,
      );
      final foreignOwner = await Ed25519().newKeyPairFromSeed(
        List<int>.filled(32, 9),
      );
      final foreignAuthority = await Ed25519().newKeyPairFromSeed(
        List<int>.filled(32, 8),
      );
      expect(
        await _verifier(
          ownerPublicKey: (await foreignOwner.extractPublicKey()).bytes,
          authorityPublicKey: authorityPublicKey,
        ).verifyApproval(fixture.approval),
        isFalse,
      );
      expect(
        await _verifier(
          ownerPublicKey: ownerPublicKey,
          authorityPublicKey: (await foreignAuthority.extractPublicKey()).bytes,
        ).verifyObservation(
          approval: fixture.approval,
          observation: fixture.observation,
        ),
        isFalse,
      );
      final altered = ConnectedTrustedTimeObservationV1(
        challenge: fixture.observation.challenge,
        authorityKeyId: fixture.observation.authorityKeyId,
        authorityKeyFingerprint: fixture.observation.authorityKeyFingerprint,
        authorityKeyGeneration: fixture.observation.authorityKeyGeneration,
        authorityEpoch: fixture.observation.authorityEpoch,
        authoritySequence: fixture.observation.authoritySequence + 1,
        observedAtMillis: fixture.observation.observedAtMillis,
        validUntilMillis: fixture.observation.validUntilMillis,
        authoritySignature: fixture.observation.authoritySignature,
      );
      expect(
        await _verifier(
          ownerPublicKey: ownerPublicKey,
          authorityPublicKey: authorityPublicKey,
        ).verifyObservation(approval: fixture.approval, observation: altered),
        isFalse,
      );
    },
  );

  test(
    'rejects scope, binding, generation and validity substitution',
    () async {
      final fixture = await _fixture(
        ownerPair: ownerPair,
        authorityPair: authorityPair,
        authorityPublicKey: authorityPublicKey,
      );
      final verifier = _verifier(
        ownerPublicKey: ownerPublicKey,
        authorityPublicKey: authorityPublicKey,
      );
      for (final challenge in [
        _challenge(siteId: 'site_2'),
        _challenge(bindingGeneration: 8),
      ]) {
        final observation = await _signedObservation(
          challenge: challenge,
          authorityPair: authorityPair,
          authorityFingerprint: fixture.approval.authorityKeyFingerprint,
        );
        expect(
          await verifier.verifyObservation(
            approval: fixture.approval,
            observation: observation,
          ),
          isFalse,
        );
      }
      final outsideApproval = await _signedObservation(
        challenge: fixture.observation.challenge,
        authorityPair: authorityPair,
        authorityFingerprint: fixture.approval.authorityKeyFingerprint,
        observedAtMillis: fixture.approval.expiresAtMillis + 1,
        validUntilMillis: fixture.approval.expiresAtMillis + 2,
      );
      expect(
        await verifier.verifyObservation(
          approval: fixture.approval,
          observation: outsideApproval,
        ),
        isFalse,
      );
    },
  );

  test('rejects malformed and duplicate pinned key configuration', () async {
    expect(
      () => PinnedEd25519ConnectedTrustedTimeAuthorityVerifier(
        ownerPublicKeys: {'owner_key_1': List<int>.filled(31, 1)},
        authorityKeys: const [],
      ),
      throwsFormatException,
    );
    final key = _authorityKey(authorityPublicKey);
    expect(
      () => PinnedEd25519ConnectedTrustedTimeAuthorityVerifier(
        ownerPublicKeys: {'owner_key_1': ownerPublicKey},
        authorityKeys: [key, key],
      ),
      throwsFormatException,
    );
  });
}

PinnedEd25519ConnectedTrustedTimeAuthorityVerifier _verifier({
  required List<int> ownerPublicKey,
  required List<int> authorityPublicKey,
}) => PinnedEd25519ConnectedTrustedTimeAuthorityVerifier(
  ownerPublicKeys: {'owner_key_1': ownerPublicKey},
  authorityKeys: [_authorityKey(authorityPublicKey)],
);

ConnectedTrustedTimePinnedAuthorityKey _authorityKey(List<int> publicKey) =>
    ConnectedTrustedTimePinnedAuthorityKey(
      workspaceId: 'workspace_1',
      siteId: 'site_1',
      coordinatorDeviceId: 'coordinator_1',
      coordinatorBindingDigest: '2' * 64,
      coordinatorBindingGeneration: 7,
      authorityKeyId: 'time_key_1',
      authorityKeyGeneration: 2,
      publicKey: publicKey,
    );

Future<_Fixture> _fixture({
  required SimpleKeyPair ownerPair,
  required SimpleKeyPair authorityPair,
  required List<int> authorityPublicKey,
}) async {
  final unsignedApproval = ConnectedTrustedTimeAuthorityApprovalV1(
    workspaceId: 'workspace_1',
    siteId: 'site_1',
    coordinatorDeviceId: 'coordinator_1',
    coordinatorBindingDigest: '2' * 64,
    coordinatorBindingGeneration: 7,
    authorityKeyId: 'time_key_1',
    authorityKeyFingerprint: _authorityKey(authorityPublicKey)
        .authorityKeyFingerprint,
    authorityKeyGeneration: 2,
    issuedAtMillis: 1800000000000,
    expiresAtMillis: 1800003600000,
    ownerAuthorityKeyId: 'owner_key_1',
    ownerAuthoritySignature: _placeholderSignature,
  );
  final approval = ConnectedTrustedTimeAuthorityApprovalV1(
    workspaceId: unsignedApproval.workspaceId,
    siteId: unsignedApproval.siteId,
    coordinatorDeviceId: unsignedApproval.coordinatorDeviceId,
    coordinatorBindingDigest: unsignedApproval.coordinatorBindingDigest,
    coordinatorBindingGeneration: unsignedApproval.coordinatorBindingGeneration,
    authorityKeyId: unsignedApproval.authorityKeyId,
    authorityKeyFingerprint: unsignedApproval.authorityKeyFingerprint,
    authorityKeyGeneration: unsignedApproval.authorityKeyGeneration,
    issuedAtMillis: unsignedApproval.issuedAtMillis,
    expiresAtMillis: unsignedApproval.expiresAtMillis,
    ownerAuthorityKeyId: unsignedApproval.ownerAuthorityKeyId,
    ownerAuthoritySignature: _encode(
      await Ed25519().sign(
        utf8.encode(unsignedApproval.canonicalEvidence),
        keyPair: ownerPair,
      ),
    ),
  );
  return _Fixture(
    approval,
    await _signedObservation(
      challenge: _challenge(),
      authorityPair: authorityPair,
      authorityFingerprint: approval.authorityKeyFingerprint,
    ),
  );
}

ConnectedTrustedTimeChallengeV1 _challenge({
  String siteId = 'site_1',
  int bindingGeneration = 7,
}) => ConnectedTrustedTimeChallengeV1(
  workspaceId: 'workspace_1',
  siteId: siteId,
  coordinatorDeviceId: 'coordinator_1',
  clientDeviceId: 'device_1',
  clientFingerprint: '1' * 64,
  sessionGeneration: 3,
  coordinatorBindingDigest: '2' * 64,
  coordinatorBindingGeneration: bindingGeneration,
  nonce: 'time_nonce_abcdefghijklmnop_1',
  bootSessionId: '3' * 64,
  startedMonotonicMillis: 5000,
);

Future<ConnectedTrustedTimeObservationV1> _signedObservation({
  required ConnectedTrustedTimeChallengeV1 challenge,
  required SimpleKeyPair authorityPair,
  required String authorityFingerprint,
  int observedAtMillis = 1800000000100,
  int validUntilMillis = 1800000060100,
}) async {
  final unsigned = ConnectedTrustedTimeObservationV1(
    challenge: challenge,
    authorityKeyId: 'time_key_1',
    authorityKeyFingerprint: authorityFingerprint,
    authorityKeyGeneration: 2,
    authorityEpoch: 5,
    authoritySequence: 11,
    observedAtMillis: observedAtMillis,
    validUntilMillis: validUntilMillis,
    authoritySignature: _placeholderSignature,
  );
  return ConnectedTrustedTimeObservationV1(
    challenge: challenge,
    authorityKeyId: unsigned.authorityKeyId,
    authorityKeyFingerprint: unsigned.authorityKeyFingerprint,
    authorityKeyGeneration: unsigned.authorityKeyGeneration,
    authorityEpoch: unsigned.authorityEpoch,
    authoritySequence: unsigned.authoritySequence,
    observedAtMillis: unsigned.observedAtMillis,
    validUntilMillis: unsigned.validUntilMillis,
    authoritySignature: _encode(
      await Ed25519().sign(
        utf8.encode(unsigned.canonicalSignedPayload),
        keyPair: authorityPair,
      ),
    ),
  );
}

String _encode(Signature signature) =>
    base64UrlEncode(signature.bytes).replaceAll('=', '');

final _placeholderSignature = base64UrlEncode(List<int>.filled(64, 0))
    .replaceAll('=', '');

class _Fixture {
  const _Fixture(this.approval, this.observation);
  final ConnectedTrustedTimeAuthorityApprovalV1 approval;
  final ConnectedTrustedTimeObservationV1 observation;
}
