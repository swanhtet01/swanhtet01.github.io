import 'dart:convert';
import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart' as sqlite;
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_connected_trusted_time_client_store.dart';
import 'package:supermega_shop/shop_connected_trusted_time_composition.dart';
import 'package:supermega_shop/shop_connected_trusted_time_contract.dart';
import 'package:supermega_shop/shop_connected_trusted_time_stream.dart';
import 'package:supermega_shop/shop_connected_trusted_time_stream_acceptance.dart';
import 'package:supermega_shop/shop_database.dart';

import 'historical_shop_fixture_support.dart';

void main() {
  test('v38 migrates to empty v39 client evidence', () async {
    final directory = await Directory.systemTemp.createTemp('shop-v39-');
    final file = File('${directory.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    await database.verifyReadyForUse();
    await dropHistoricalShopSchemaDefinitionGroupInDatabase(
      database,
      shopConnectedCloudFeedSchemaDefinitionsV40(),
    );
    for (final name
        in shopConnectedTrustedTimeClientSchemaDefinitionsV39().keys.where(
          (name) => name.endsWith('_no_update') || name.endsWith('_no_delete'),
        )) {
      await database.customStatement('DROP TRIGGER $name');
    }
    for (final name in const [
      'shop_connected_time_client_restore_clearances',
      'shop_connected_time_client_restore_barriers',
      'shop_connected_time_client_heads',
      'shop_connected_time_client_acks',
      'shop_connected_time_client_entries',
    ]) {
      await database.customStatement('DROP TABLE $name');
    }
    await database.customStatement('PRAGMA user_version = 38');
    await database.close();

    database = ShopDatabase(NativeDatabase(file));
    await database.verifyReadyForUse();
    expect(database.schemaVersion, 41);
    final rows = await database
        .customSelect(
          'SELECT COUNT(*) AS total FROM shop_connected_time_client_heads',
        )
        .getSingle();
    expect(rows.read<int>('total'), 0);
    await database.close();
    await directory.delete(recursive: true);
  });

  test(
    'atomic head persistence is exact, idempotent and restart-safe',
    () async {
      final directory = await Directory.systemTemp.createTemp('shop-v39-head-');
      final file = File('${directory.path}/shop.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      var store = ShopConnectedTrustedTimeClientStore(database, enabled: true);
      final first = _entry();
      final ack = _ack(first);
      final head = await store.persist(entry: first, acknowledgement: ack);
      expect(head.timeGranted, isFalse);
      final replay = await store.persist(entry: first, acknowledgement: ack);
      expect(replay.headDigest, head.headDigest);
      await expectLater(
        store.persist(
          entry: _entry(sequence: 2, predecessor: '9' * 64),
          acknowledgement: _ack(_entry(sequence: 2, predecessor: '9' * 64)),
        ),
        throwsStateError,
      );
      await database.close();

      database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      store = ShopConnectedTrustedTimeClientStore(database, enabled: true);
      final restored = await store.latest(head.streamDigest);
      expect(restored?.headDigest, head.headDigest);
      expect(restored?.usable, isTrue);
      await database.close();
      await directory.delete(recursive: true);
    },
  );

  test('outer rollback removes entry, ack and head atomically', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    await database.verifyReadyForUse();
    final store = ShopConnectedTrustedTimeClientStore(database, enabled: true);
    final entry = _entry();
    await expectLater(
      database.transaction(() async {
        await store.persist(entry: entry, acknowledgement: _ack(entry));
        throw StateError('rollback');
      }),
      throwsStateError,
    );
    for (final table in const [
      'shop_connected_time_client_entries',
      'shop_connected_time_client_acks',
      'shop_connected_time_client_heads',
    ]) {
      final count = await database
          .customSelect('SELECT COUNT(*) AS total FROM $table')
          .getSingle();
      expect(count.read<int>('total'), 0);
    }
    await database.close();
  });

  test('competing sequence one writers retain one complete closure', () async {
    final directory = await Directory.systemTemp.createTemp('shop-v39-race-');
    final file = File('${directory.path}/shop.sqlite');
    final first = ShopDatabase(NativeDatabase(file));
    final second = ShopDatabase(NativeDatabase(file));
    await first.verifyReadyForUse();
    await second.verifyReadyForUse();
    Future<bool> attempt(ShopDatabase database, int observed) async {
      final entry = _entry(observedAt: observed);
      try {
        await ShopConnectedTrustedTimeClientStore(
          database,
          enabled: true,
        ).persist(entry: entry, acknowledgement: _ack(entry));
        return true;
      } on Object {
        return false;
      }
    }

    final results = await Future.wait([
      attempt(first, 1000),
      attempt(second, 1001),
    ]);
    expect(results.where((value) => value), hasLength(1));
    await first.verifyReadyForUse();
    await second.close();
    await first.close();
    await directory.delete(recursive: true);
  });

  test(
    'fresh-target restore is blocked until every authority revalidates',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'shop-v39-restore-',
      );
      final file = File('${directory.path}/shop.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      var store = ShopConnectedTrustedTimeClientStore(database, enabled: true);
      final entry = _entry();
      final head = await store.persist(
        entry: entry,
        acknowledgement: _ack(entry),
      );
      await database.close();

      ShopBackup.verifySnapshot(file, expectedSchemaVersion: 41);
      await ShopDatabase.migrateAndVerifyRestoreFile(file);
      database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      store = ShopConnectedTrustedTimeClientStore(database, enabled: true);
      expect((await store.latest(head.streamDigest))?.usable, isFalse);
      await expectLater(
        store.persist(
          entry: _entry(sequence: 2, predecessor: entry.entryDigest),
          acknowledgement: _ack(
            _entry(sequence: 2, predecessor: entry.entryDigest),
          ),
        ),
        throwsStateError,
      );
      await expectLater(
        store.revalidateRestored(
          streamDigest: head.streamDigest,
          dependencies: _dependencies(authorityAccepted: false),
        ),
        throwsStateError,
      );
      expect((await store.latest(head.streamDigest))?.usable, isFalse);

      final cleared = await store.revalidateRestored(
        streamDigest: head.streamDigest,
        dependencies: _dependencies(),
      );
      expect(cleared.usable, isTrue);
      expect(cleared.timeGranted, isFalse);
      expect((await store.latest(head.streamDigest))?.usable, isTrue);
      await database.close();
      await directory.delete(recursive: true);
    },
  );

  test('backup verifier rejects tampered retained entry bytes', () async {
    final directory = await Directory.systemTemp.createTemp('shop-v39-tamper-');
    final file = File('${directory.path}/shop.sqlite');
    final database = ShopDatabase(NativeDatabase(file));
    await database.verifyReadyForUse();
    final entry = _entry();
    await ShopConnectedTrustedTimeClientStore(
      database,
      enabled: true,
    ).persist(entry: entry, acknowledgement: _ack(entry));
    await database.close();
    ShopBackup.verifySnapshot(file, expectedSchemaVersion: 41);
    final raw = sqlite.sqlite3.open(file.path);
    try {
      raw.execute('DROP TRIGGER shop_connected_time_client_entries_no_update');
      raw.execute(
        "UPDATE shop_connected_time_client_entries SET entry_bytes_digest = '${'0' * 64}'",
      );
    } finally {
      raw.close();
    }
    expect(
      () => ShopBackup.verifySnapshot(file, expectedSchemaVersion: 41),
      throwsFormatException,
    );
    await directory.delete(recursive: true);
  });

  test(
    'backup verifier rejects permuted acknowledgement head closure',
    () async {
      final directory = await Directory.systemTemp.createTemp('shop-v39-swap-');
      final file = File('${directory.path}/shop.sqlite');
      final database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      final store = ShopConnectedTrustedTimeClientStore(
        database,
        enabled: true,
      );
      final first = _entry();
      final firstHead = await store.persist(
        entry: first,
        acknowledgement: _ack(first),
      );
      final second = _entry(
        sequence: 2,
        predecessor: first.entryDigest,
        observedAt: 2000,
      );
      final secondHead = await store.persist(
        entry: second,
        acknowledgement: _ack(second),
      );
      await database.close();
      final raw = sqlite.sqlite3.open(file.path);
      try {
        raw.execute('DROP TRIGGER shop_connected_time_client_heads_no_delete');
        raw.execute('DELETE FROM shop_connected_time_client_heads');
        final firstSwapped = connectedTrustedTimeClientHeadDigest(
          streamDigest: firstHead.streamDigest,
          authoritySequence: 1,
          entryDigest: first.entryDigest,
          ackDigest: secondHead.ackDigest,
        );
        final secondSwapped = connectedTrustedTimeClientHeadDigest(
          streamDigest: secondHead.streamDigest,
          authoritySequence: 2,
          entryDigest: second.entryDigest,
          ackDigest: firstHead.ackDigest,
        );
        raw.execute(
          'INSERT INTO shop_connected_time_client_heads VALUES '
          "('$firstSwapped', '${firstHead.streamDigest}', 1, "
          "'${first.entryDigest}', '${secondHead.ackDigest}'), "
          "('$secondSwapped', '${secondHead.streamDigest}', 2, "
          "'${second.entryDigest}', '${firstHead.ackDigest}')",
        );
      } finally {
        raw.close();
      }
      expect(
        () => ShopBackup.verifySnapshot(file, expectedSchemaVersion: 41),
        throwsFormatException,
      );
      await directory.delete(recursive: true);
    },
  );
}

ConnectedTrustedTimeStreamEntryV2 _entry({
  int sequence = 1,
  String? predecessor,
  int observedAt = 1000,
}) => ConnectedTrustedTimeStreamEntryV2(
  workspaceId: 'workspace-a',
  siteId: 'site-a',
  coordinatorDeviceId: 'coordinator-a',
  clientDeviceId: 'client-a',
  clientFingerprint: '1' * 64,
  sessionGeneration: 1,
  coordinatorBindingDigest: '2' * 64,
  coordinatorBindingGeneration: 1,
  authorityKeyId: 'authority-a',
  authorityKeyFingerprint: '3' * 64,
  authorityKeyGeneration: 1,
  authorityEpoch: 1,
  authoritySequence: sequence,
  previousEntryDigest: predecessor,
  kind: ConnectedTrustedTimeStreamEntryKind.time,
  observedAtMillis: observedAt,
  validUntilMillis: observedAt + 1000,
  authoritySignature: base64UrlEncode(List<int>.filled(64, 7))
      .replaceAll('=', ''),
);

ConnectedTrustedTimeStreamAckV1 _ack(ConnectedTrustedTimeStreamEntryV2 entry) =>
    ConnectedTrustedTimeStreamAckV1(
      workspaceId: entry.workspaceId,
      siteId: entry.siteId,
      coordinatorDeviceId: entry.coordinatorDeviceId,
      clientDeviceId: entry.clientDeviceId,
      clientFingerprint: entry.clientFingerprint,
      clientSigningKeyId: 'device-key-a',
      sessionGeneration: entry.sessionGeneration,
      coordinatorBindingDigest: entry.coordinatorBindingDigest,
      coordinatorBindingGeneration: entry.coordinatorBindingGeneration,
      authorityKeyGeneration: entry.authorityKeyGeneration,
      authorityEpoch: entry.authorityEpoch,
      authoritySequence: entry.authoritySequence,
      entryDigest: entry.entryDigest,
      resultingHeadDigest: entry.entryDigest,
      bootSessionId: '4' * 64,
      acknowledgedAtMonotonicMillis: 100,
      clientSignature: base64UrlEncode(List<int>.filled(64, 8))
          .replaceAll('=', ''),
    );

ConnectedTrustedTimeClientRestorationDependencies _dependencies({
  bool authorityAccepted = true,
}) => ConnectedTrustedTimeClientRestorationDependencies(
  authorityVerifier: _AuthorityVerifier(authorityAccepted),
  deviceAckVerifier: const _AckVerifier(),
  bindingResolver: const _BindingResolver(),
  clock: const _Clock(),
  policy: const _Policy(),
);

final class _AuthorityVerifier
    implements ConnectedTrustedTimeStreamAuthorityVerifier {
  const _AuthorityVerifier(this.accepted);
  final bool accepted;
  @override
  Future<bool> verify(ConnectedTrustedTimeStreamEntryV2 entry) async =>
      accepted;
}

final class _AckVerifier
    implements ConnectedTrustedTimeStreamDeviceAckVerifier {
  const _AckVerifier();
  @override
  Future<bool> verify(ConnectedTrustedTimeStreamAckV1 acknowledgement) async =>
      true;
}

final class _BindingResolver
    implements ConnectedTrustedTimeCurrentBindingResolver {
  const _BindingResolver();
  @override
  Future<ConnectedTrustedTimeScope?> resolve({
    required String workspaceId,
    required String siteId,
    required String clientDeviceId,
  }) async => ConnectedTrustedTimeScope(
    workspaceId: workspaceId,
    siteId: siteId,
    coordinatorDeviceId: 'coordinator-a',
    clientDeviceId: clientDeviceId,
    clientFingerprint: '1' * 64,
    sessionGeneration: 1,
    coordinatorBindingDigest: '2' * 64,
    coordinatorBindingGeneration: 1,
  );
}

final class _Clock implements ConnectedTrustedTimePlatformClock {
  const _Clock();
  @override
  Future<String> bootSessionId() async => '5' * 64;
  @override
  Future<int> monotonicMillis() async => 10;
}

final class _Policy implements ConnectedTrustedTimeRestorationPolicy {
  const _Policy();
  @override
  Future<String?> approve({
    required ConnectedTrustedTimeStreamEntryV2 entry,
    required ConnectedTrustedTimeStreamAckV1 acknowledgement,
    required String barrierDigest,
  }) async => '6' * 64;
}
