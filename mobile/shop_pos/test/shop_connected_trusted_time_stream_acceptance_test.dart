// Test fixtures keep public constructor labels distinct from mutable hostile
// identity state.
// ignore_for_file: prefer_initializing_formals

import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_connected_trusted_time_composition.dart';
import 'package:supermega_shop/shop_connected_trusted_time_contract.dart';
import 'package:supermega_shop/shop_connected_trusted_time_stream.dart';
import 'package:supermega_shop/shop_connected_trusted_time_stream_acceptance.dart';

void main() {
  test('default-off boundary rejects before invoking custody', () async {
    final verifier = _Verifier();
    final signer = _Signer();
    final client = _client(verifier: verifier, signer: signer);

    await expectLater(
      client.accept(_entry()),
      throwsA(_state('connected_trusted_time_stream_acceptance_disabled')),
    );
    expect(verifier.calls, 0);
    expect(signer.signCalls, 0);
  });

  test('time entry verifies exact identity and returns signed ack', () async {
    final verifier = _Verifier();
    final signer = _Signer();
    final client = _client(
      enabled: true,
      verifier: verifier,
      signer: signer,
      clock: _Clock(monotonic: [100]),
    );

    final accepted = await client.accept(_entry());

    expect(accepted.replayed, isFalse);
    expect(accepted.effectiveTimeMillis, 1800000000000);
    expect(accepted.validUntilMillis, 1800000060000);
    expect(accepted.acknowledgement.entryDigest, accepted.entry.entryDigest);
    expect(accepted.acknowledgement.authoritySequence, 1);
    expect(accepted.acknowledgement.bootSessionId, '3' * 64);
    expect(accepted.acknowledgement.acknowledgedAtMonotonicMillis, 100);
    expect(verifier.calls, 1);
    expect(signer.signCalls, 1);
    expect(signer.verifyCalls, 1);
  });

  test('live reading binds accepted entry, ack and same-boot sample', () async {
    final client = _client(enabled: true, clock: _Clock(monotonic: [100, 125]));
    final accepted = await client.accept(_entry());
    final reading = await client.readLiveTime();
    expect(reading.entryDigest, accepted.entry.entryDigest);
    expect(reading.ackDigest, accepted.acknowledgement.ackDigest);
    expect(reading.bootSessionId, accepted.acknowledgement.bootSessionId);
    expect(reading.monotonicMillis, 125);
    expect(reading.effectiveTimeMillis, 1800000000025);
    await expectLater(
      _client(enabled: true).readLiveTime(),
      throwsA(_state('connected_trusted_time_stream_live_unavailable')),
    );
  });

  test('successive live readings reject monotonic rollback', () async {
    final client = _client(
      enabled: true,
      clock: _Clock(monotonic: [100, 130, 125]),
    );
    await client.accept(_entry());
    expect((await client.readLiveTime()).monotonicMillis, 130);
    await expectLater(
      client.readLiveTime(),
      throwsA(_state('connected_trusted_time_stream_clock_stale')),
    );
  });

  test('overlapping live reads fail closed', () async {
    final clock = _BlockingClock();
    final client = _client(enabled: true, clock: clock);
    await client.accept(_entry());
    final first = client.readLiveTime();
    await clock.entered.future;
    await expectLater(
      client.readLiveTime(),
      throwsA(_state('connected_trusted_time_stream_live_unavailable')),
    );
    clock.release.complete();
    expect((await first).monotonicMillis, 125);
  });

  test(
    'live reading rejects expiry, boot swap and monotonic rollback',
    () async {
      for (final (clock, reason) in [
        (
          _Clock(monotonic: [100, 60101]),
          'connected_trusted_time_stream_live_expired',
        ),
        (
          _Clock(boot: ['3' * 64, '4' * 64], monotonic: [100, 125]),
          'connected_trusted_time_stream_clock_stale',
        ),
        (
          _Clock(monotonic: [100, 99]),
          'connected_trusted_time_stream_clock_stale',
        ),
      ]) {
        final client = _client(enabled: true, clock: clock);
        await client.accept(_entry());
        await expectLater(client.readLiveTime(), throwsA(_state(reason)));
      }
    },
  );

  test('continuity head denies the previous live time', () async {
    final client = _client(enabled: true, clock: _Clock(monotonic: [100, 200]));
    final first = _entry();
    await client.accept(first);
    await client.accept(
      _entry(
        sequence: 2,
        predecessor: first.entryDigest,
        kind: ConnectedTrustedTimeStreamEntryKind.continuity,
        observedAtMillis: 1800000000100,
        validUntilMillis: 1800000000100,
      ),
    );
    await expectLater(
      client.readLiveTime(),
      throwsA(_state('connected_trusted_time_stream_live_unavailable')),
    );
  });

  test(
    'continuity advances exact head, grants no time, replay is idempotent',
    () async {
      final verifier = _Verifier();
      final signer = _Signer();
      final clock = _Clock(monotonic: [100, 200]);
      final client = _client(
        enabled: true,
        verifier: verifier,
        signer: signer,
        clock: clock,
      );
      final first = _entry();
      await client.accept(first);
      final continuity = _entry(
        sequence: 2,
        predecessor: first.entryDigest,
        kind: ConnectedTrustedTimeStreamEntryKind.continuity,
        observedAtMillis: 1800000000100,
        validUntilMillis: 1800000000100,
      );

      final accepted = await client.accept(continuity);
      final replay = await client.accept(continuity);

      expect(accepted.effectiveTimeMillis, isNull);
      expect(accepted.validUntilMillis, isNull);
      expect(
        accepted.acknowledgement.resultingHeadDigest,
        continuity.entryDigest,
      );
      expect(replay.replayed, isTrue);
      expect(
        replay.acknowledgement.canonicalJson,
        accepted.acknowledgement.canonicalJson,
      );
      expect(verifier.calls, 2);
      expect(signer.signCalls, 2);
      expect(clock.monotonicCalls, 3);
    },
  );

  test(
    'scope, authority signature, signer and ack substitution fail closed',
    () async {
      await expectLater(
        _client(enabled: true).accept(_entry(siteId: 'other_site')),
        throwsA(_state('connected_trusted_time_stream_scope_mismatch')),
      );
      await expectLater(
        _client(enabled: true).accept(_entry(authorityEpoch: 6)),
        throwsA(_state('connected_trusted_time_stream_authority_mismatch')),
      );
      await expectLater(
        _client(
          enabled: true,
          verifier: _Verifier(accept: false),
        ).accept(_entry()),
        throwsA(_state('connected_trusted_time_stream_signature_rejected')),
      );
      await expectLater(
        _client(
          enabled: true,
          signer: _Signer(clientDeviceId: 'substituted_device'),
        ).accept(_entry()),
        throwsA(_state('connected_trusted_time_stream_ack_signer_mismatch')),
      );
      await expectLater(
        _client(
          enabled: true,
          signer: _Signer(clientSigningKeyId: 'substituted_key'),
        ).accept(_entry()),
        throwsA(_state('connected_trusted_time_stream_ack_signer_mismatch')),
      );
      await expectLater(
        _client(
          enabled: true,
          signer: _Signer(acceptVerification: false),
        ).accept(_entry()),
        throwsA(_state('connected_trusted_time_stream_ack_signature_rejected')),
      );
    },
  );

  test('altered replay, reordered and gapped entries fail closed', () async {
    final clock = _Clock(monotonic: [100, 200, 300, 400]);
    final client = _client(enabled: true, clock: clock);
    final first = _entry();
    await client.accept(first);

    await expectLater(
      client.accept(_entry(observedAtMillis: 1800000000001)),
      throwsA(_state('connected_trusted_time_stream_chain_mismatch')),
    );
    await expectLater(
      client.accept(_entry(sequence: 3, predecessor: first.entryDigest)),
      throwsA(_state('connected_trusted_time_stream_chain_mismatch')),
    );
    await expectLater(
      client.accept(_entry(sequence: 2, predecessor: '9' * 64)),
      throwsA(_state('connected_trusted_time_stream_chain_mismatch')),
    );
  });

  test('boot replacement and stale monotonic readings fail closed', () async {
    final first = _entry();
    final bootClock = _Clock(boot: ['3' * 64, '4' * 64], monotonic: [100, 200]);
    final bootClient = _client(enabled: true, clock: bootClock);
    await bootClient.accept(first);
    await expectLater(
      bootClient.accept(_entry(sequence: 2, predecessor: first.entryDigest)),
      throwsA(_state('connected_trusted_time_stream_clock_stale')),
    );

    final staleClock = _Clock(monotonic: [100, 100]);
    final staleClient = _client(enabled: true, clock: staleClock);
    await staleClient.accept(first);
    await expectLater(
      staleClient.accept(_entry(sequence: 2, predecessor: first.entryDigest)),
      throwsA(_state('connected_trusted_time_stream_clock_stale')),
    );
  });

  test('time cannot roll back across continuity entries', () async {
    final clock = _Clock(monotonic: [100, 200, 300]);
    final client = _client(enabled: true, clock: clock);
    final first = _entry();
    await client.accept(first);
    final continuity = _entry(
      sequence: 2,
      predecessor: first.entryDigest,
      kind: ConnectedTrustedTimeStreamEntryKind.continuity,
      observedAtMillis: 1800000000100,
      validUntilMillis: 1800000000100,
    );
    await client.accept(continuity);

    await expectLater(
      client.accept(
        _entry(
          sequence: 3,
          predecessor: continuity.entryDigest,
          observedAtMillis: 1800000000199,
          validUntilMillis: 1800000060199,
        ),
      ),
      throwsA(_state('connected_trusted_time_stream_time_rollback')),
    );
  });

  test('signer identity mutation during signing fails closed', () async {
    final signer = _Signer(mutateIdentityAfterSigning: true);
    await expectLater(
      _client(enabled: true, signer: signer).accept(_entry()),
      throwsA(_state('connected_trusted_time_stream_ack_signer_mismatch')),
    );
    await expectLater(
      _client(
        enabled: true,
        signer: _Signer(mutateIdentityAfterVerification: true),
      ).accept(_entry()),
      throwsA(_state('connected_trusted_time_stream_ack_signer_mismatch')),
    );
  });

  test('replay revalidates boot and monotonic without resigning', () async {
    final entry = _entry();
    final bootSigner = _Signer();
    final bootClient = _client(
      enabled: true,
      signer: bootSigner,
      clock: _Clock(boot: ['3' * 64, '4' * 64], monotonic: [100, 200]),
    );
    await bootClient.accept(entry);
    await expectLater(
      bootClient.accept(entry),
      throwsA(_state('connected_trusted_time_stream_clock_stale')),
    );
    expect(bootSigner.signCalls, 1);

    final staleSigner = _Signer();
    final staleClient = _client(
      enabled: true,
      signer: staleSigner,
      clock: _Clock(monotonic: [100, 99]),
    );
    await staleClient.accept(entry);
    await expectLater(
      staleClient.accept(entry),
      throwsA(_state('connected_trusted_time_stream_clock_stale')),
    );
    expect(staleSigner.signCalls, 1);

    final expirySigner = _Signer();
    final expiryClient = _client(
      enabled: true,
      signer: expirySigner,
      clock: _Clock(monotonic: [100, 60101]),
    );
    final initial = await expiryClient.accept(entry);
    final expiredReplay = await expiryClient.accept(entry);
    expect(expiredReplay.effectiveTimeMillis, isNull);
    expect(expiredReplay.validUntilMillis, isNull);
    expect(
      expiredReplay.acknowledgement.canonicalJson,
      initial.acknowledgement.canonicalJson,
    );
    expect(expirySigner.signCalls, 1);
  });
}

ConnectedTrustedTimeStreamClientAcceptance _client({
  bool enabled = false,
  _Verifier? verifier,
  _Signer? signer,
  ConnectedTrustedTimePlatformClock? clock,
}) => ConnectedTrustedTimeStreamClientAcceptance(
  enabled: enabled,
  scope: ConnectedTrustedTimeScope(
    workspaceId: 'workspace_1',
    siteId: 'site_1',
    coordinatorDeviceId: 'coordinator_1',
    clientDeviceId: 'device_1',
    clientFingerprint: '1' * 64,
    sessionGeneration: 3,
    coordinatorBindingDigest: '2' * 64,
    coordinatorBindingGeneration: 7,
  ),
  authority: ConnectedTrustedTimeStreamAuthorityIdentity(
    authorityKeyId: 'time_key_1',
    authorityKeyFingerprint: '4' * 64,
    authorityKeyGeneration: 2,
    authorityEpoch: 5,
  ),
  clock: clock ?? _Clock(),
  authorityVerifier: verifier ?? _Verifier(),
  deviceAckSigner: signer ?? _Signer(),
  clientSigningKeyId: 'device_signing_key_1',
);

ConnectedTrustedTimeStreamEntryV2 _entry({
  String siteId = 'site_1',
  int authorityEpoch = 5,
  int sequence = 1,
  String? predecessor,
  ConnectedTrustedTimeStreamEntryKind kind =
      ConnectedTrustedTimeStreamEntryKind.time,
  int observedAtMillis = 1800000000000,
  int validUntilMillis = 1800000060000,
}) => ConnectedTrustedTimeStreamEntryV2(
  workspaceId: 'workspace_1',
  siteId: siteId,
  coordinatorDeviceId: 'coordinator_1',
  clientDeviceId: 'device_1',
  clientFingerprint: '1' * 64,
  sessionGeneration: 3,
  coordinatorBindingDigest: '2' * 64,
  coordinatorBindingGeneration: 7,
  authorityKeyId: 'time_key_1',
  authorityKeyFingerprint: '4' * 64,
  authorityKeyGeneration: 2,
  authorityEpoch: authorityEpoch,
  authoritySequence: sequence,
  previousEntryDigest: predecessor,
  kind: kind,
  observedAtMillis: observedAtMillis,
  validUntilMillis: validUntilMillis,
  authoritySignature: _signature(utf8.encode('authority:$sequence')),
);

Matcher _state(String message) =>
    isA<StateError>().having((error) => error.message, 'message', message);

final class _Clock implements ConnectedTrustedTimePlatformClock {
  _Clock({List<String>? boot, List<int>? monotonic})
    : _boot = boot ?? ['3' * 64],
      _monotonic = monotonic ?? [100];

  final List<String> _boot;
  final List<int> _monotonic;
  int bootCalls = 0;
  int monotonicCalls = 0;

  @override
  Future<String> bootSessionId() async {
    final call = bootCalls++;
    return _boot[call < _boot.length ? call : _boot.length - 1];
  }

  @override
  Future<int> monotonicMillis() async {
    final call = monotonicCalls++;
    return _monotonic[call < _monotonic.length ? call : _monotonic.length - 1];
  }
}

final class _BlockingClock implements ConnectedTrustedTimePlatformClock {
  final Completer<void> entered = Completer<void>();
  final Completer<void> release = Completer<void>();
  int calls = 0;

  @override
  Future<String> bootSessionId() async => '3' * 64;

  @override
  Future<int> monotonicMillis() async {
    if (calls++ == 0) return 100;
    entered.complete();
    await release.future;
    return 125;
  }
}

final class _Verifier implements ConnectedTrustedTimeStreamAuthorityVerifier {
  _Verifier({this.accept = true});
  final bool accept;
  int calls = 0;
  @override
  Future<bool> verify(ConnectedTrustedTimeStreamEntryV2 entry) async {
    calls += 1;
    return accept;
  }
}

final class _Signer implements ConnectedTrustedTimeStreamDeviceAckSigner {
  _Signer({
    String clientDeviceId = 'device_1',
    this.clientSigningKeyId = 'device_signing_key_1',
    this.acceptVerification = true,
    this.mutateIdentityAfterSigning = false,
    this.mutateIdentityAfterVerification = false,
  }) : _clientDeviceId = clientDeviceId;

  String _clientDeviceId;
  @override
  final String clientSigningKeyId;
  final bool acceptVerification;
  final bool mutateIdentityAfterSigning;
  final bool mutateIdentityAfterVerification;
  int signCalls = 0;
  int verifyCalls = 0;

  @override
  String get clientDeviceId => _clientDeviceId;
  @override
  String get clientFingerprint => '1' * 64;
  @override
  Future<String> sign(List<int> canonicalSigningBytes) async {
    signCalls += 1;
    final result = _signature(canonicalSigningBytes);
    if (mutateIdentityAfterSigning) _clientDeviceId = 'substituted_device';
    return result;
  }

  @override
  Future<bool> verify({
    required List<int> canonicalSigningBytes,
    required String signature,
  }) async {
    verifyCalls += 1;
    final result =
        acceptVerification && signature == _signature(canonicalSigningBytes);
    if (mutateIdentityAfterVerification) {
      _clientDeviceId = 'substituted_device';
    }
    return result;
  }
}

String _signature(List<int> bytes) {
  final digest = connectedSiteSha256({'bytes': base64Encode(bytes)});
  return base64UrlEncode(utf8.encode(digest)).replaceAll('=', '');
}
