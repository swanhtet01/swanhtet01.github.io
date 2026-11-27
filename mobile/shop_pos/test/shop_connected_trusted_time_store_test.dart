import 'dart:convert';
import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart' as sqlite;
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_connected_trusted_time_contract.dart';
import 'package:supermega_shop/shop_connected_trusted_time_store.dart';
import 'package:supermega_shop/shop_database.dart';

import 'historical_shop_fixture_support.dart';

void main() {
  test(
    'v37 consumes once and restart cannot reuse capability or head',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      addTearDown(database.close);
      final clock = _Clock();
      final store = ShopConnectedTrustedTimeStore(
        database: database,
        clock: clock,
        verifier: const _Verifier(),
      );
      final challenge = _challenge(1, clock);
      final capability = await store.retainChallenge(
        approval: _approval(),
        challenge: challenge,
      );
      clock.monotonic += 10;
      final accepted = await store.complete(
        capability: capability,
        approval: _approval(),
        observation: _observation(challenge, sequence: 11),
      );
      expect(accepted.effectiveAtMillis, 1800000000021);
      expect(await _effectiveTime(store), 1800000000021);
      expect(
        await store.effectiveTimeMillis(
          workspaceId: 'workspace_2',
          siteId: 'site_1',
          coordinatorDeviceId: 'coordinator_1',
          clientDeviceId: 'device_1',
          clientFingerprint: '1' * 64,
          sessionGeneration: 3,
          coordinatorBindingDigest: '2' * 64,
          coordinatorBindingGeneration: 7,
        ),
        isNull,
      );
      await expectLater(
        store.complete(
          capability: capability,
          approval: _approval(),
          observation: _observation(challenge, sequence: 11),
        ),
        throwsA(_state('connected_trusted_time_capability_invalid')),
      );
      final restarted = ShopConnectedTrustedTimeStore(
        database: database,
        clock: clock,
        verifier: const _Verifier(),
      );
      expect(await _effectiveTime(restarted), isNull);
      await expectLater(
        restarted.complete(
          capability: capability,
          approval: _approval(),
          observation: _observation(challenge, sequence: 11),
        ),
        throwsA(_state('connected_trusted_time_capability_invalid')),
      );
    },
  );

  test(
    'authority tuple rollback fails and concurrent sequence consumes once',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      addTearDown(database.close);
      final clock = _Clock();
      final first = ShopConnectedTrustedTimeStore(
        database: database,
        clock: clock,
        verifier: const _Verifier(),
      );
      final c1 = _challenge(1, clock);
      final p1 = await first.retainChallenge(
        approval: _approval(),
        challenge: c1,
      );
      await first.complete(
        capability: p1,
        approval: _approval(),
        observation: _observation(c1, sequence: 20),
      );

      clock.monotonic += 1;
      final rollbackChallenge = _challenge(2, clock);
      final rollbackCapability = await first.retainChallenge(
        approval: _approval(),
        challenge: rollbackChallenge,
      );
      await expectLater(
        first.complete(
          capability: rollbackCapability,
          approval: _approval(),
          observation: _observation(rollbackChallenge, sequence: 20),
        ),
        throwsA(_state('connected_trusted_time_authority_rollback')),
      );

      clock.monotonic += 1;
      final second = ShopConnectedTrustedTimeStore(
        database: database,
        clock: clock,
        verifier: const _Verifier(),
      );
      final c2 = _challenge(3, clock);
      final c3 = _challenge(4, clock);
      final p2 = await first.retainChallenge(
        approval: _approval(),
        challenge: c2,
      );
      final p3 = await second.retainChallenge(
        approval: _approval(),
        challenge: c3,
      );
      final results = await Future.wait([
        _capture(
          first.complete(
            capability: p2,
            approval: _approval(),
            observation: _observation(c2, sequence: 21),
          ),
        ),
        _capture(
          second.complete(
            capability: p3,
            approval: _approval(),
            observation: _observation(c3, sequence: 21),
          ),
        ),
      ]);
      expect(results.where((value) => value == null), hasLength(1));
      expect(
        results.whereType<StateError>().single.message,
        'connected_trusted_time_authority_rollback',
      );
    },
  );

  test(
    'foreign same-digest capability cannot evict the retained capability',
    () async {
      final abandonOwnerDatabase = ShopDatabase(NativeDatabase.memory());
      final abandonForeignDatabase = ShopDatabase(NativeDatabase.memory());
      final completeOwnerDatabase = ShopDatabase(NativeDatabase.memory());
      final completeForeignDatabase = ShopDatabase(NativeDatabase.memory());
      addTearDown(abandonOwnerDatabase.close);
      addTearDown(abandonForeignDatabase.close);
      addTearDown(completeOwnerDatabase.close);
      addTearDown(completeForeignDatabase.close);
      final clock = _Clock();

      final abandonOwner = ShopConnectedTrustedTimeStore(
        database: abandonOwnerDatabase,
        clock: clock,
        verifier: const _Verifier(),
      );
      final abandonForeign = ShopConnectedTrustedTimeStore(
        database: abandonForeignDatabase,
        clock: clock,
        verifier: const _Verifier(),
      );
      final abandonChallenge = _challenge(5, clock);
      final abandonOwnerCapability = await abandonOwner.retainChallenge(
        approval: _approval(),
        challenge: abandonChallenge,
      );
      final abandonForeignCapability = await abandonForeign.retainChallenge(
        approval: _approval(),
        challenge: abandonChallenge,
      );

      abandonOwner.abandon(abandonForeignCapability);
      await abandonOwner.complete(
        capability: abandonOwnerCapability,
        approval: _approval(),
        observation: _observation(abandonChallenge, sequence: 30),
      );

      final completeOwner = ShopConnectedTrustedTimeStore(
        database: completeOwnerDatabase,
        clock: clock,
        verifier: const _Verifier(),
      );
      final completeForeign = ShopConnectedTrustedTimeStore(
        database: completeForeignDatabase,
        clock: clock,
        verifier: const _Verifier(),
      );
      final completeChallenge = _challenge(6, clock);
      final completeOwnerCapability = await completeOwner.retainChallenge(
        approval: _approval(),
        challenge: completeChallenge,
      );
      final completeForeignCapability = await completeForeign.retainChallenge(
        approval: _approval(),
        challenge: completeChallenge,
      );

      await expectLater(
        completeOwner.complete(
          capability: completeForeignCapability,
          approval: _approval(),
          observation: _observation(completeChallenge, sequence: 31),
        ),
        throwsA(_state('connected_trusted_time_capability_invalid')),
      );
      await completeOwner.complete(
        capability: completeOwnerCapability,
        approval: _approval(),
        observation: _observation(completeChallenge, sequence: 31),
      );
    },
  );

  test(
    'head deletion or mutation fails completion inside transaction',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      addTearDown(database.close);
      final clock = _Clock();
      final store = ShopConnectedTrustedTimeStore(
        database: database,
        clock: clock,
        verifier: const _Verifier(),
      );
      final first = _challenge(41, clock);
      final firstCapability = await store.retainChallenge(
        approval: _approval(),
        challenge: first,
      );
      await store.complete(
        capability: firstCapability,
        approval: _approval(),
        observation: _observation(first, sequence: 40),
      );
      clock.monotonic += 1;
      final second = _challenge(42, clock);
      final secondCapability = await store.retainChallenge(
        approval: _approval(),
        challenge: second,
      );
      await database.customStatement(
        'DELETE FROM shop_connected_time_authority_heads',
      );
      await expectLater(
        store.complete(
          capability: secondCapability,
          approval: _approval(),
          observation: _observation(second, sequence: 41),
        ),
        throwsA(
          isA<StateError>().having(
            (error) => error.message,
            'message',
            'Connected trusted-time evidence is invalid.',
          ),
        ),
      );
    },
  );

  test(
    'v36 database migrates to empty fail-closed v37 evidence schema',
    () async {
      final directory = await Directory.systemTemp.createTemp('shop-time-v37-');
      addTearDown(() => directory.delete(recursive: true));
      final file = File('${directory.path}/shop.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      await database.close();
      final raw = sqlite.sqlite3.open(file.path);
      dropHistoricalShopSchemaDefinitionGroup(
        raw,
        shopConnectedTrustedTimeIssuerSchemaDefinitionsV38(),
      );
      for (final name in shopConnectedTrustedTimeSchemaDefinitionsV37().keys) {
        raw.execute(
          'DROP ${name.contains('_no_') ? 'TRIGGER' : 'TABLE'} IF EXISTS $name',
        );
      }
      raw.execute('PRAGMA user_version = 36');
      raw.close();
      database = ShopDatabase(NativeDatabase(file));
      addTearDown(database.close);
      await database.verifyReadyForUse();
      expect(database.schemaVersion, 42);
      final count = await database
          .customSelect(
            'SELECT COUNT(*) AS total FROM shop_connected_time_requests',
          )
          .getSingle();
      expect(count.read<int>('total'), 0);
    },
  );

  test('encrypted restore retains audit evidence but not live time', () async {
    final directory = await Directory.systemTemp.createTemp(
      'shop-time-v37-backup-',
    );
    addTearDown(() => directory.delete(recursive: true));
    final sourceFile = File('${directory.path}/source.sqlite');
    final archive = File('${directory.path}/time.smbak');
    final restoredFile = File('${directory.path}/restored.sqlite');
    var database = ShopDatabase(NativeDatabase(sourceFile));
    final clock = _Clock();
    final store = ShopConnectedTrustedTimeStore(
      database: database,
      clock: clock,
      verifier: const _Verifier(),
    );
    final challenge = _challenge(9, clock);
    final capability = await store.retainChallenge(
      approval: _approval(),
      challenge: challenge,
    );
    await store.complete(
      capability: capability,
      approval: _approval(),
      observation: _observation(challenge, sequence: 31),
    );
    await ShopBackup.exportEncrypted(
      database: database,
      archive: archive,
      password: 'correct horse battery staple',
      scratchRoot: directory,
    );
    await database.close();
    await ShopBackup.restoreIntoEmptyDatabase(
      archive: archive,
      target: restoredFile,
      password: 'correct horse battery staple',
    );
    ShopBackup.verifySnapshot(restoredFile);
    database = ShopDatabase(NativeDatabase(restoredFile));
    addTearDown(database.close);
    final restored = ShopConnectedTrustedTimeStore(
      database: database,
      clock: clock,
      verifier: const _Verifier(),
    );
    expect(await _effectiveTime(restored), isNull);
    final evidence = await database
        .customSelect(
          'SELECT COUNT(*) AS total FROM shop_connected_time_acceptances',
        )
        .getSingle();
    expect(evidence.read<int>('total'), 1);
  });
}

Future<int?> _effectiveTime(ShopConnectedTrustedTimeStore store) =>
    store.effectiveTimeMillis(
      workspaceId: 'workspace_1',
      siteId: 'site_1',
      coordinatorDeviceId: 'coordinator_1',
      clientDeviceId: 'device_1',
      clientFingerprint: '1' * 64,
      sessionGeneration: 3,
      coordinatorBindingDigest: '2' * 64,
      coordinatorBindingGeneration: 7,
    );

Future<Object?> _capture(Future<Object?> value) async {
  try {
    await value;
    return null;
  } on Object catch (error) {
    return error;
  }
}

Matcher _state(String message) =>
    isA<StateError>().having((error) => error.message, 'message', message);

class _Clock implements ConnectedTrustedTimePlatformClock {
  int monotonic = 5000;
  String boot = '3' * 64;
  @override
  Future<String> bootSessionId() async => boot;
  @override
  Future<int> monotonicMillis() async => monotonic;
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
  }) async => true;
}

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
      expiresAtMillis: 1800003600000,
      ownerAuthorityKeyId: 'owner_key_1',
      ownerAuthoritySignature: _signature,
    );

ConnectedTrustedTimeChallengeV1 _challenge(int id, _Clock clock) =>
    ConnectedTrustedTimeChallengeV1(
      workspaceId: 'workspace_1',
      siteId: 'site_1',
      coordinatorDeviceId: 'coordinator_1',
      clientDeviceId: 'device_1',
      clientFingerprint: '1' * 64,
      sessionGeneration: 3,
      coordinatorBindingDigest: '2' * 64,
      coordinatorBindingGeneration: 7,
      nonce: 'time_nonce_abcdefghijklmnop_$id',
      bootSessionId: clock.boot,
      startedMonotonicMillis: clock.monotonic,
    );

ConnectedTrustedTimeObservationV1 _observation(
  ConnectedTrustedTimeChallengeV1 challenge, {
  required int sequence,
}) => ConnectedTrustedTimeObservationV1(
  challenge: challenge,
  authorityKeyId: 'time_key_1',
  authorityKeyFingerprint: '4' * 64,
  authorityKeyGeneration: 2,
  authorityEpoch: 5,
  authoritySequence: sequence,
  observedAtMillis: 1800000000000 + sequence,
  validUntilMillis: 1800000060000 + sequence,
  authoritySignature: _signature,
);

final _signature = base64UrlEncode(List<int>.filled(64, 7)).replaceAll('=', '');
