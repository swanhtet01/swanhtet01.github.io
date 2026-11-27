import 'dart:convert';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_trusted_time_composition.dart';
import 'package:supermega_shop/shop_connected_trusted_time_contract.dart';
import 'package:supermega_shop/shop_database.dart';

void main() {
  test('disabled composition is dependency and side-effect silent', () {
    var calls = 0;
    final composition = ShopConnectedTrustedTimeComposition.resolve(
      connectedSiteEnabled: false,
      dependencies: () {
        calls += 1;
        throw StateError('must not run');
      },
    );
    expect(composition.enabled, isFalse);
    expect(composition.runtime, isNull);
    expect(calls, 0);
    expect(
      () => ShopConnectedTrustedTimeComposition.resolve(
        connectedSiteEnabled: true,
      ),
      throwsA(_state('connected_trusted_time_dependencies_required')),
    );
  });

  test(
    'pins exact scope through challenge exchange and effective time',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      addTearDown(database.close);
      final clock = _Clock();
      final exchange = _Exchange();
      final runtime = ShopConnectedTrustedTimeComposition.resolve(
        connectedSiteEnabled: true,
        dependencies: () =>
            _dependencies(database: database, clock: clock, exchange: exchange),
      ).runtime!;

      final accepted = await runtime.refresh();
      expect(accepted.effectiveAtMillis, 1800000000000);
      final challenge = exchange.challenges.single;
      expect(challenge.workspaceId, 'workspace_1');
      expect(challenge.siteId, 'site_1');
      expect(challenge.coordinatorDeviceId, 'coordinator_1');
      expect(challenge.clientDeviceId, 'device_1');
      expect(challenge.clientFingerprint, '1' * 64);
      expect(challenge.sessionGeneration, 3);
      expect(challenge.coordinatorBindingDigest, '2' * 64);
      expect(challenge.coordinatorBindingGeneration, 7);
      expect(await runtime.effectiveTimeMillis(), 1800000000000);
      expect(
        await runtime.readValidatedNowMillis(
          tenantId: 'workspace_1',
          siteId: 'site_1',
        ),
        1800000000000,
      );
      await expectLater(
        runtime.readValidatedNowMillis(
          tenantId: 'workspace_2',
          siteId: 'site_1',
        ),
        throwsA(_state('connected_trusted_time_scope_mismatch')),
      );
      await expectLater(
        runtime.readValidatedNowMillis(
          tenantId: 'workspace_1',
          siteId: 'site_2',
        ),
        throwsA(_state('connected_trusted_time_scope_mismatch')),
      );
    },
  );

  test('scope substitution and exchange failure stay fail closed', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    addTearDown(database.close);
    expect(
      () => _dependencies(
        database: database,
        clock: _Clock(),
        exchange: _Exchange(),
        scope: _scope(siteId: 'site_2'),
      ),
      throwsA(_state('connected_trusted_time_composition_scope_mismatch')),
    );

    final clock = _Clock();
    final exchange = _Exchange(error: StateError('exchange_unavailable'));
    final runtime = ShopConnectedTrustedTimeComposition.resolve(
      connectedSiteEnabled: true,
      dependencies: () =>
          _dependencies(database: database, clock: clock, exchange: exchange),
    ).runtime!;
    await expectLater(
      runtime.refresh(),
      throwsA(_state('exchange_unavailable')),
    );
    expect(await runtime.effectiveTimeMillis(), isNull);
    await expectLater(
      runtime.readValidatedNowMillis(tenantId: 'workspace_1', siteId: 'site_1'),
      throwsA(_state('connected_trusted_time_unavailable')),
    );
  });

  test(
    'substituted observation, key, and clock regression fail closed',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      addTearDown(database.close);
      final clock = _Clock();
      final exchange = _Exchange(substituteSite: true);
      final runtime = ShopConnectedTrustedTimeComposition.resolve(
        connectedSiteEnabled: true,
        dependencies: () =>
            _dependencies(database: database, clock: clock, exchange: exchange),
      ).runtime!;
      await expectLater(
        runtime.refresh(),
        throwsA(_state('connected_trusted_time_capability_invalid')),
      );
      expect(await runtime.effectiveTimeMillis(), isNull);

      final wrongKey = ShopConnectedTrustedTimeComposition.resolve(
        connectedSiteEnabled: true,
        dependencies: () => _dependencies(
          database: database,
          clock: clock,
          exchange: _Exchange(wrongKey: true, sequence: 2),
          nonce: 'trusted_time_composition_nonce_2',
        ),
      ).runtime!;
      await expectLater(
        wrongKey.refresh(),
        throwsA(_state('connected_trusted_time_observation_invalid')),
      );

      final valid = ShopConnectedTrustedTimeComposition.resolve(
        connectedSiteEnabled: true,
        dependencies: () => _dependencies(
          database: database,
          clock: clock,
          exchange: _Exchange(sequence: 3),
          nonce: 'trusted_time_composition_nonce_3',
        ),
      ).runtime!;
      clock.monotonicReads
        ..clear()
        ..addAll([5000, 4999]);
      await expectLater(
        valid.refresh(),
        throwsA(_state('connected_trusted_time_challenge_stale')),
      );
    },
  );

  test(
    'replay and observation expiry pass through the durable store',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      addTearDown(database.close);
      final clock = _Clock();
      final runtime = ShopConnectedTrustedTimeComposition.resolve(
        connectedSiteEnabled: true,
        dependencies: () => _dependencies(
          database: database,
          clock: clock,
          exchange: _Exchange(),
        ),
      ).runtime!;
      await runtime.refresh();
      await expectLater(
        runtime.refresh(),
        throwsA(_state('connected_trusted_time_request_replayed')),
      );

      clock.monotonic = 6000;
      final expired = ShopConnectedTrustedTimeComposition.resolve(
        connectedSiteEnabled: true,
        dependencies: () => _dependencies(
          database: database,
          clock: clock,
          exchange: _Exchange(
            sequence: 2,
            observedAtMillis: 1800000000000,
            validUntilMillis: 1800000000000,
          ),
          nonce: 'trusted_time_composition_nonce_expired',
        ),
      ).runtime!;
      clock.monotonicReads.addAll([5000, 6000]);
      await expectLater(
        expired.refresh(),
        throwsA(_state('connected_trusted_time_observation_expired')),
      );
    },
  );
}

ShopConnectedTrustedTimeDependencies _dependencies({
  required ShopDatabase database,
  required _Clock clock,
  required _Exchange exchange,
  ConnectedTrustedTimeScope? scope,
  String nonce = 'trusted_time_composition_nonce_1',
}) => ShopConnectedTrustedTimeDependencies(
  database: database,
  scope: scope ?? _scope(),
  approval: _approval(),
  verifier: const _Verifier(),
  clock: clock,
  exchange: exchange,
  nonceSource: _NonceSource(nonce),
);

ConnectedTrustedTimeScope _scope({String siteId = 'site_1'}) =>
    ConnectedTrustedTimeScope(
      workspaceId: 'workspace_1',
      siteId: siteId,
      coordinatorDeviceId: 'coordinator_1',
      clientDeviceId: 'device_1',
      clientFingerprint: '1' * 64,
      sessionGeneration: 3,
      coordinatorBindingDigest: '2' * 64,
      coordinatorBindingGeneration: 7,
    );

ConnectedTrustedTimeAuthorityApprovalV1 _approval() =>
    ConnectedTrustedTimeAuthorityApprovalV1(
      workspaceId: 'workspace_1',
      siteId: 'site_1',
      coordinatorDeviceId: 'coordinator_1',
      coordinatorBindingDigest: '2' * 64,
      coordinatorBindingGeneration: 7,
      authorityKeyId: 'time_key_1',
      authorityKeyFingerprint: '4' * 64,
      authorityKeyGeneration: 2,
      issuedAtMillis: 1799999999000,
      expiresAtMillis: 1800001000000,
      ownerAuthorityKeyId: 'owner_key_1',
      ownerAuthoritySignature: base64UrlEncode(List<int>.filled(64, 7))
          .replaceAll('=', ''),
    );

class _Clock implements ConnectedTrustedTimePlatformClock {
  int monotonic = 5000;
  String boot = '3' * 64;
  final List<int> monotonicReads = [];
  @override
  Future<String> bootSessionId() async => boot;
  @override
  Future<int> monotonicMillis() async =>
      monotonicReads.isEmpty ? monotonic : monotonicReads.removeAt(0);
}

class _NonceSource implements ConnectedTrustedTimeNonceSource {
  const _NonceSource(this.value);
  final String value;
  @override
  String createNonce() => value;
}

class _Verifier implements ConnectedTrustedTimeAuthorityVerifier {
  const _Verifier();
  @override
  Future<bool> verifyApproval(
    ConnectedTrustedTimeAuthorityApprovalV1 approval,
  ) async => true;
  @override
  Future<bool> verifyObservation({
    required ConnectedTrustedTimeAuthorityApprovalV1 approval,
    required ConnectedTrustedTimeObservationV1 observation,
  }) async =>
      observation.authorityKeyId == approval.authorityKeyId &&
      observation.authorityKeyFingerprint == approval.authorityKeyFingerprint &&
      observation.authorityKeyGeneration == approval.authorityKeyGeneration;
}

class _Exchange implements ConnectedTrustedTimeObservationExchange {
  _Exchange({
    this.error,
    this.substituteSite = false,
    this.wrongKey = false,
    this.sequence = 1,
    this.observedAtMillis = 1800000000000,
    this.validUntilMillis = 1800000060000,
  });
  final Object? error;
  final bool substituteSite;
  final bool wrongKey;
  final int sequence;
  final int observedAtMillis;
  final int validUntilMillis;
  final List<ConnectedTrustedTimeChallengeV1> challenges = [];

  @override
  Future<ConnectedTrustedTimeObservationV1> observe({
    required ConnectedTrustedTimeAuthorityApprovalV1 approval,
    required ConnectedTrustedTimeChallengeV1 challenge,
  }) async {
    challenges.add(challenge);
    if (error != null) throw error!;
    final returnedChallenge = substituteSite
        ? ConnectedTrustedTimeChallengeV1(
            workspaceId: challenge.workspaceId,
            siteId: 'site_2',
            coordinatorDeviceId: challenge.coordinatorDeviceId,
            clientDeviceId: challenge.clientDeviceId,
            clientFingerprint: challenge.clientFingerprint,
            sessionGeneration: challenge.sessionGeneration,
            coordinatorBindingDigest: challenge.coordinatorBindingDigest,
            coordinatorBindingGeneration:
                challenge.coordinatorBindingGeneration,
            nonce: challenge.nonce,
            bootSessionId: challenge.bootSessionId,
            startedMonotonicMillis: challenge.startedMonotonicMillis,
          )
        : challenge;
    return ConnectedTrustedTimeObservationV1(
      challenge: returnedChallenge,
      authorityKeyId: wrongKey ? 'time_key_wrong' : approval.authorityKeyId,
      authorityKeyFingerprint: approval.authorityKeyFingerprint,
      authorityKeyGeneration: approval.authorityKeyGeneration,
      authorityEpoch: 1,
      authoritySequence: sequence,
      observedAtMillis: observedAtMillis,
      validUntilMillis: validUntilMillis,
      authoritySignature: base64UrlEncode(List<int>.filled(64, 8))
          .replaceAll('=', ''),
    );
  }
}

Matcher _state(String message) =>
    isA<StateError>().having((error) => error.message, 'message', message);
