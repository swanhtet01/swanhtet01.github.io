import 'dart:convert';
import 'dart:io';

import 'package:drift/drift.dart' show Variable;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart' as sqlite;
import 'package:supermega_shop/shop_connected_trusted_time_issuer_store.dart';
import 'package:supermega_shop/shop_connected_trusted_time_stream.dart';
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_database.dart';

void main() {
  test('v38 creates empty issuer state and preserves v37 evidence', () async {
    final directory = await Directory.systemTemp.createTemp('shop-v38-');
    final file = File('${directory.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    await database.verifyReadyForUse();
    for (final definition
        in shopConnectedCloudFeedSchemaDefinitionsV41().entries
            .toList()
            .reversed) {
      final type = shopSchemaObjectTypeForDefinition(definition.value);
      await database.customStatement(
        'DROP ${type == 'table'
            ? 'TABLE'
            : type == 'index'
            ? 'INDEX'
            : 'TRIGGER'} IF EXISTS ${definition.key}',
      );
    }
    for (final definition
        in shopConnectedCloudFeedSchemaDefinitionsV40().entries
            .toList()
            .reversed) {
      final type = shopSchemaObjectTypeForDefinition(definition.value);
      await database.customStatement(
        'DROP ${type == 'table'
            ? 'TABLE'
            : type == 'index'
            ? 'INDEX'
            : 'TRIGGER'} IF EXISTS ${definition.key}',
      );
    }
    for (final definition
        in shopConnectedTrustedTimeClientSchemaDefinitionsV39().entries
            .toList()
            .reversed) {
      final type = shopSchemaObjectTypeForDefinition(definition.value);
      await database.customStatement(
        'DROP ${type == 'table'
            ? 'TABLE'
            : type == 'index'
            ? 'INDEX'
            : 'TRIGGER'} IF EXISTS ${definition.key}',
      );
    }
    await database.customStatement(
      'DROP TRIGGER shop_connected_time_issuer_state_guard_insert',
    );
    await database.customStatement(
      'DROP TRIGGER shop_connected_time_issuer_state_guard_update',
    );
    await database.customStatement(
      'DROP TRIGGER shop_connected_time_issuer_state_no_delete',
    );
    await database.customStatement(
      'DROP TRIGGER shop_connected_time_issuer_allocations_no_update',
    );
    await database.customStatement(
      'DROP TRIGGER shop_connected_time_issuer_allocations_no_delete',
    );
    await database.customStatement(
      'DROP TRIGGER shop_connected_time_issuer_signed_entries_no_update',
    );
    await database.customStatement(
      'DROP TRIGGER shop_connected_time_issuer_signed_entries_no_delete',
    );
    await database.customStatement(
      'DROP TRIGGER shop_connected_time_issuer_acks_no_update',
    );
    await database.customStatement(
      'DROP TRIGGER shop_connected_time_issuer_acks_no_delete',
    );
    await database.customStatement(
      'DROP TABLE shop_connected_time_issuer_acks',
    );
    await database.customStatement(
      'DROP TABLE shop_connected_time_issuer_signed_entries',
    );
    await database.customStatement(
      'DROP TABLE shop_connected_time_issuer_allocations',
    );
    await database.customStatement(
      'DROP TABLE shop_connected_time_issuer_streams',
    );
    await database.customStatement(
      'DROP TABLE shop_connected_time_issuer_state',
    );
    await database.customStatement('PRAGMA user_version = 37');
    await database.close();

    database = ShopDatabase(NativeDatabase(file));
    await database.verifyReadyForUse();
    final streams = await database
        .customSelect(
          'SELECT COUNT(*) AS total FROM shop_connected_time_issuer_streams',
        )
        .getSingle();
    expect(database.schemaVersion, 41);
    expect(streams.read<int>('total'), 0);
    await database.close();
    await directory.delete(recursive: true);
  });

  test(
    'allocation, signature, lost response replay, and ack are exact',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      await database.verifyReadyForUse();
      expect(
        () =>
            ShopConnectedTrustedTimeIssuerStore(database)
                .reserve(_entry().canonicalBytes),
        throwsStateError,
      );
      final store = ShopConnectedTrustedTimeIssuerStore(
        database,
        enabled: true,
      );
      final entry = _entry();
      final unsigned = utf8.encode(entry.canonicalSigningPayload);
      final allocation = await store.reserve(unsigned);
      final repeated = await store.reserve(unsigned);
      expect(repeated.entryDigest, allocation.entryDigest);
      await expectLater(
        store.reserve(
          utf8.encode(_entry(observedAtMillis: 1001).canonicalSigningPayload),
        ),
        throwsStateError,
      );
      await store.attachSignature(entry.canonicalBytes);
      await store.attachSignature(entry.canonicalBytes);
      expect(
        (await store.replayPending(allocation.streamDigest))?.canonicalJson,
        entry.canonicalJson,
      );

      final ack = _ack(entry);
      await store.acknowledge(ack.canonicalBytes);
      await store.acknowledge(ack.canonicalBytes);
      expect(await store.replayPending(allocation.streamDigest), isNull);
      await expectLater(
        store.acknowledge(_ack(entry, signatureByte: 9).canonicalBytes),
        throwsStateError,
      );
      final second = _entry(
        sequence: 2,
        previousEntryDigest: entry.entryDigest,
        observedAtMillis: 2000,
      );
      final secondAllocation = await store.reserve(
        utf8.encode(second.canonicalSigningPayload),
      );
      expect(secondAllocation.sequence, 2);
      await store.attachSignature(second.canonicalBytes);
      await store.acknowledge(_ack(second).canonicalBytes);
      await database.verifyReadyForUse();
      await database.close();
    },
  );

  test('two client streams allocate sequence one independently', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    await database.verifyReadyForUse();
    final store = ShopConnectedTrustedTimeIssuerStore(database, enabled: true);
    final results = await Future.wait([
      store.reserve(
        utf8.encode(_entry(clientDeviceId: 'client-a').canonicalSigningPayload),
      ),
      store.reserve(
        utf8.encode(_entry(clientDeviceId: 'client-b').canonicalSigningPayload),
      ),
    ]);
    expect(results.map((value) => value.streamDigest).toSet(), hasLength(2));
    expect(results.every((value) => value.sequence == 1), isTrue);
    await database.close();
  });

  test(
    'competing same-stream allocations retain exactly one pending',
    () async {
      final directory = await Directory.systemTemp.createTemp('shop-v38-race-');
      final file = File('${directory.path}/shop.sqlite');
      final database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      final competitor = ShopDatabase(NativeDatabase(file));
      await competitor.verifyReadyForUse();
      Future<bool> attempt(
        ShopDatabase owner,
        ConnectedTrustedTimeStreamEntryV2 entry,
      ) async {
        try {
          await ShopConnectedTrustedTimeIssuerStore(
            owner,
            enabled: true,
          ).reserve(utf8.encode(entry.canonicalSigningPayload));
          return true;
        } on Object {
          return false;
        }
      }

      final outcomes = await Future.wait([
        attempt(database, _entry(observedAtMillis: 1000)),
        attempt(competitor, _entry(observedAtMillis: 1001)),
      ]);
      expect(outcomes.where((value) => value), hasLength(1));
      final count = await database
          .customSelect(
            'SELECT COUNT(*) AS total FROM shop_connected_time_issuer_allocations',
          )
          .getSingle();
      expect(count.read<int>('total'), 1);
      await database.verifyReadyForUse();
      await competitor.close();
      await database.close();
      await directory.delete(recursive: true);
    },
  );

  test(
    'allocation and signature crash boundaries replay after restart',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'shop-v38-crash-',
      );
      final file = File('${directory.path}/shop.sqlite');
      final entry = _entry();
      var database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      var store = ShopConnectedTrustedTimeIssuerStore(database, enabled: true);
      final allocation = await store.reserve(
        utf8.encode(entry.canonicalSigningPayload),
      );
      await database.close();
      database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      store = ShopConnectedTrustedTimeIssuerStore(database, enabled: true);
      expect(
        (await store.reserve(utf8.encode(entry.canonicalSigningPayload)))
            .entryDigest,
        allocation.entryDigest,
      );
      await store.attachSignature(entry.canonicalBytes);
      await database.close();
      database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      store = ShopConnectedTrustedTimeIssuerStore(database, enabled: true);
      expect(
        (await store.replayPending(allocation.streamDigest))?.entryDigest,
        entry.entryDigest,
      );
      await store.acknowledge(_ack(entry).canonicalBytes);
      await database.verifyReadyForUse();
      await database.close();
      await directory.delete(recursive: true);
    },
  );

  test(
    'fresh-target restore preserves evidence and suspends issuance',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'shop-v38-restore-',
      );
      final file = File('${directory.path}/shop.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      final store = ShopConnectedTrustedTimeIssuerStore(
        database,
        enabled: true,
      );
      final entry = _entry();
      final allocation = await store.reserve(
        utf8.encode(entry.canonicalSigningPayload),
      );
      await store.attachSignature(entry.canonicalBytes);
      await database.close();

      ShopBackup.verifySnapshot(file, expectedSchemaVersion: 41);
      await ShopDatabase.migrateAndVerifyRestoreFile(file);
      database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      final restored = ShopConnectedTrustedTimeIssuerStore(
        database,
        enabled: true,
      );
      await expectLater(
        restored.replayPending(allocation.streamDigest),
        throwsStateError,
      );
      await expectLater(
        restored.reserve(utf8.encode(entry.canonicalSigningPayload)),
        throwsStateError,
      );
      await expectLater(
        database.customStatement(
          'INSERT OR REPLACE INTO shop_connected_time_issuer_state '
          '(singleton_id, issuance_suspended) VALUES (1, 0)',
        ),
        throwsA(anything),
      );
      await expectLater(
        restored.reserve(
          utf8.encode(
            _entry(clientDeviceId: 'client-new').canonicalSigningPayload,
          ),
        ),
        throwsStateError,
      );
      final retained = await database
          .customSelect(
            'SELECT COUNT(*) AS total FROM shop_connected_time_issuer_signed_entries',
          )
          .getSingle();
      expect(retained.read<int>('total'), 1);
      await database.close();
      await directory.delete(recursive: true);
    },
  );

  test('guarded heads and canonical closure reject tamper', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    await database.verifyReadyForUse();
    final store = ShopConnectedTrustedTimeIssuerStore(database, enabled: true);
    final entry = _entry();
    final allocation = await store.reserve(
      utf8.encode(entry.canonicalSigningPayload),
    );
    await store.attachSignature(entry.canonicalBytes);
    await expectLater(
      database.customUpdate(
        'UPDATE shop_connected_time_issuer_streams '
        'SET acknowledged_sequence = 1, acknowledged_entry_digest = ?, '
        'pending_entry_digest = NULL WHERE stream_digest = ?',
        variables: [
          Variable<String>(entry.entryDigest),
          Variable<String>(allocation.streamDigest),
        ],
      ),
      throwsA(anything),
    );
    await database.customStatement(
      'DROP TRIGGER shop_connected_time_issuer_signed_entries_no_update',
    );
    await database.customUpdate(
      'UPDATE shop_connected_time_issuer_signed_entries '
      "SET signed_entry_digest = '${'0' * 64}' WHERE entry_digest = ?",
      variables: [Variable<String>(entry.entryDigest)],
    );
    await expectLater(database.verifyReadyForUse(), throwsStateError);
    await database.close();
  });

  test('backup verifier rejects malformed pending unsigned bytes', () async {
    final directory = await Directory.systemTemp.createTemp(
      'shop-v38-partial-',
    );
    final file = File('${directory.path}/shop.sqlite');
    final database = ShopDatabase(NativeDatabase(file));
    await database.verifyReadyForUse();
    await ShopConnectedTrustedTimeIssuerStore(
      database,
      enabled: true,
    ).reserve(utf8.encode(_entry().canonicalSigningPayload));
    await database.close();
    ShopBackup.verifySnapshot(file, expectedSchemaVersion: 41);
    final raw = sqlite.sqlite3.open(file.path);
    try {
      raw.execute(
        'DROP TRIGGER shop_connected_time_issuer_allocations_no_update',
      );
      raw.execute(
        "UPDATE shop_connected_time_issuer_allocations SET unsigned_entry_json = '{\"foo\":\"bar\"}'",
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
}

ConnectedTrustedTimeStreamEntryV2 _entry({
  String clientDeviceId = 'client-a',
  int observedAtMillis = 1000,
  int sequence = 1,
  String? previousEntryDigest,
}) => ConnectedTrustedTimeStreamEntryV2(
  workspaceId: 'workspace-a',
  siteId: 'site-a',
  coordinatorDeviceId: 'coordinator-a',
  clientDeviceId: clientDeviceId,
  clientFingerprint: '1' * 64,
  sessionGeneration: 1,
  coordinatorBindingDigest: '2' * 64,
  coordinatorBindingGeneration: 1,
  authorityKeyId: 'authority-a',
  authorityKeyFingerprint: '3' * 64,
  authorityKeyGeneration: 1,
  authorityEpoch: 1,
  authoritySequence: sequence,
  previousEntryDigest: previousEntryDigest,
  kind: ConnectedTrustedTimeStreamEntryKind.time,
  observedAtMillis: observedAtMillis,
  validUntilMillis: observedAtMillis + 1000,
  authoritySignature: base64UrlEncode(List<int>.filled(64, 7))
      .replaceAll('=', ''),
);

ConnectedTrustedTimeStreamAckV1 _ack(
  ConnectedTrustedTimeStreamEntryV2 entry, {
  int signatureByte = 8,
}) => ConnectedTrustedTimeStreamAckV1(
  workspaceId: entry.workspaceId,
  siteId: entry.siteId,
  coordinatorDeviceId: entry.coordinatorDeviceId,
  clientDeviceId: entry.clientDeviceId,
  clientFingerprint: entry.clientFingerprint,
  clientSigningKeyId: 'client-key-a',
  sessionGeneration: entry.sessionGeneration,
  coordinatorBindingDigest: entry.coordinatorBindingDigest,
  coordinatorBindingGeneration: entry.coordinatorBindingGeneration,
  authorityKeyGeneration: entry.authorityKeyGeneration,
  authorityEpoch: entry.authorityEpoch,
  authoritySequence: entry.authoritySequence,
  entryDigest: entry.entryDigest,
  resultingHeadDigest: entry.entryDigest,
  bootSessionId: '4' * 64,
  acknowledgedAtMonotonicMillis: 10,
  clientSignature: base64UrlEncode(List<int>.filled(64, signatureByte))
      .replaceAll('=', ''),
);
