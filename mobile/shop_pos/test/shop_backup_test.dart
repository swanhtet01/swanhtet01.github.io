import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:file_selector/file_selector.dart';
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart';
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_backup_export_screen.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_startup.dart';

const _password = 'correct horse battery staple';
final _thumbnail = base64Decode(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ'
  'AAAADUlEQVR4nGPQyNjxHwAETAJIB09U9wAAAABJRU5ErkJggg==',
);

Future<void> _pumpUntil(WidgetTester tester, Finder finder) async {
  for (var attempt = 0; attempt < 200; attempt++) {
    await tester.pump();
    if (finder.evaluate().isNotEmpty) return;
    await tester.runAsync(() async {
      await Future<void>.delayed(const Duration(milliseconds: 25));
    });
  }
  throw TestFailure('The expected Shop state did not appear: $finder');
}

void main() {
  late Directory directory;
  late ShopDatabase database;
  late File archive;

  setUpAll(() async {
    directory = await Directory.systemTemp.createTemp('shop-backup-test-');
    database = ShopDatabase(NativeDatabase.memory());
    await database.addProduct(
      id: 'rice',
      name: 'KAUNG 90 Days Rice',
      priceMmk: 12000,
      openingStock: 5,
    );
    await database.saveProductThumbnail('rice', _thumbnail);
    await database.recordCashSale(
      operationId: 'backup-sale-1',
      lines: const [ShopSaleLineInput(productId: 'rice', quantity: 2)],
    );
    await database.customStatement(
      'INSERT INTO shop_wallet_checkout_intents '
      '(operation_id, payment_method, request_fingerprint, total_mmk, '
      'merchant_phone, merchant_qr_payload, basket_json, state, '
      'created_at_millis) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['backup-wallet-1', 'kbzpay', 'synthetic', 0, '', '', '[]', 'pending', 1],
    );
    archive = File('${directory.path}${Platform.pathSeparator}shop.smbak');
    await ShopBackup.exportEncrypted(
      database: database,
      archive: archive,
      password: _password,
      scratchRoot: directory,
    );
  });

  tearDownAll(() async {
    await database.close();
    await directory.delete(recursive: true);
  });

  test(
    'archive is encrypted and restores all local state into a new target',
    () async {
      final bytes = await archive.readAsBytes();
      expect(bytes.sublist(0, 4), ascii.encode('SMBK'));
      expect(bytes[5], 8);
      expect(
        bytes.sublist(0, 16),
        isNot(ascii.encode('SQLite format 3\u0000')),
      );
      expect(
        utf8.decode(bytes, allowMalformed: true),
        isNot(contains('KAUNG')),
      );

      final target = File(
        '${directory.path}${Platform.pathSeparator}restored.sqlite',
      );
      await ShopBackup.restoreIntoEmptyDatabase(
        archive: archive,
        target: target,
        password: _password,
      );
      ShopBackup.verifySnapshot(target);
      await _expectNoScratch(directory);
      final reopened = ShopDatabase(NativeDatabase(target));
      try {
        expect((await reopened.readActiveProducts()).single.onHand, 3);
        expect(await reopened.readProductThumbnail('rice'), _thumbnail);
        expect(await reopened.countSales(), 1);
        expect(await reopened.countStockMovements(), 2);
        expect(await reopened.countOutboxOperations(), 2);
        final intents = await reopened
            .customSelect(
              'SELECT operation_id FROM shop_wallet_checkout_intents',
            )
            .get();
        expect(intents.single.read<String>('operation_id'), 'backup-wallet-1');
      } finally {
        await reopened.close();
      }
    },
  );

  test(
    'encrypted export keeps an unfinished sale without recording it',
    () async {
      final source = ShopDatabase(NativeDatabase.memory());
      try {
        await source.addProduct(
          id: 'water',
          name: 'Water',
          priceMmk: 1200,
          openingStock: 5,
        );
        await source.saveCounterSaleDraft(
          operationId: 'unfinished-backup-1',
          quantities: const {'water': 2},
        );
        final draftArchive = File('${directory.path}/unfinished.smbak');
        await ShopBackup.exportEncrypted(
          database: source,
          archive: draftArchive,
          password: _password,
          scratchRoot: directory,
        );
        final target = File('${directory.path}/unfinished-restored.sqlite');
        await ShopBackup.restoreIntoEmptyDatabase(
          archive: draftArchive,
          target: target,
          password: _password,
        );
        final restored = ShopDatabase(NativeDatabase(target));
        try {
          final draft = await restored.readCounterSaleDraft();
          expect(draft?.operationId, 'unfinished-backup-1');
          expect(draft?.quantities, {'water': 2});
          expect((await restored.readActiveProducts()).single.onHand, 5);
          expect(await restored.countSales(), 0);
        } finally {
          await restored.close();
        }
      } finally {
        await source.close();
      }
    },
  );

  test('merchant export hands only the encrypted archive to Save As', () async {
    File? handedArchive;
    String? suggestedName;
    final result = await ShopBackupExporter.export(
      database: database,
      password: _password,
      scratchRoot: directory,
      encryptedRoot: directory,
      now: DateTime(2026, 10, 22, 14, 5, 9),
      saveArchive: (encrypted, name) async {
        handedArchive = encrypted;
        suggestedName = name;
        final bytes = await encrypted.readAsBytes();
        expect(bytes.sublist(0, 4), ascii.encode('SMBK'));
        expect(
          utf8.decode(bytes, allowMalformed: true),
          isNot(contains('KAUNG')),
        );
        return 'chosen-document';
      },
    );
    expect(result, ShopBackupExportResult.saved);
    expect(suggestedName, 'SuperMega-Shop-20261022-140509');
    expect(await handedArchive!.exists(), isFalse);
    await _expectNoScratch(directory);
  });

  test('cancelling Save As removes the temporary encrypted archive', () async {
    File? handedArchive;
    final result = await ShopBackupExporter.export(
      database: database,
      password: _password,
      scratchRoot: directory,
      encryptedRoot: directory,
      saveArchive: (encrypted, _) async {
        handedArchive = encrypted;
        return null;
      },
    );
    expect(result, ShopBackupExportResult.cancelled);
    expect(await handedArchive!.exists(), isFalse);
    await _expectNoScratch(directory);
  });

  test('Save As failure preserves records and clears staging', () async {
    File? handedArchive;
    await expectLater(
      ShopBackupExporter.export(
        database: database,
        password: _password,
        scratchRoot: directory,
        encryptedRoot: directory,
        saveArchive: (encrypted, _) async {
          handedArchive = encrypted;
          throw StateError('simulated picker failure');
        },
      ),
      throwsStateError,
    );
    expect(await handedArchive!.exists(), isFalse);
    expect(await database.countSales(), 1);
    await _expectNoScratch(directory);
  });

  testWidgets('export screen validates the password before opening Save As', (
    tester,
  ) async {
    var pickerOpened = false;
    await tester.pumpWidget(
      MaterialApp(
        home: ShopBackupExportScreen(
          database: database,
          myanmar: false,
          scratchRoot: directory,
          encryptedRoot: directory,
          saveArchive: (_, _) async {
            pickerOpened = true;
            return null;
          },
        ),
      ),
    );
    await tester.tap(find.text('Choose where to save'));
    await tester.pump();
    expect(
      find.text('Use a password of at least 12 characters.'),
      findsOneWidget,
    );
    expect(pickerOpened, isFalse);
  });

  testWidgets('cancelled export never reports that a backup was saved', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: ShopBackupExportScreen(
          database: database,
          myanmar: false,
          exportAction: (_) async => ShopBackupExportResult.cancelled,
        ),
      ),
    );
    await tester.enterText(find.byType(TextField).at(0), _password);
    await tester.enterText(find.byType(TextField).at(1), _password);
    await tester.tap(find.text('Choose where to save'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Save cancelled.'), findsOneWidget);
    expect(find.textContaining('Backup file saved.'), findsNothing);
  });

  test('wrong password never creates a target', () async {
    final target = File(
      '${directory.path}${Platform.pathSeparator}wrong.sqlite',
    );
    await expectLater(
      ShopBackup.restoreIntoEmptyDatabase(
        archive: archive,
        target: target,
        password: 'a different long password',
      ),
      throwsFormatException,
    );
    expect(await target.exists(), isFalse);
  });

  test(
    'merchant photos stay out of sync events and reject oversized input',
    () async {
      expect(await database.countOutboxOperations(), 2);
      await expectLater(
        database.saveProductThumbnail('rice', Uint8List(193 * 1024)),
        throwsArgumentError,
      );
      final brokenPng = Uint8List.fromList(_thumbnail);
      brokenPng[50] ^= 1;
      await expectLater(
        database.saveProductThumbnail('rice', brokenPng),
        throwsArgumentError,
      );
      expect(await database.readProductThumbnail('rice'), _thumbnail);
      expect(await database.countOutboxOperations(), 2);
    },
  );

  test('v6 archive restores, then migrates its catalog to v8', () async {
    final legacy = File('${directory.path}/legacy-v6.sqlite');
    await database.exportVerifiedLocalSnapshot(legacy);
    final connection = sqlite3.open(legacy.path);
    try {
      connection.execute('DROP TABLE shop_product_images');
      connection.execute('DROP TABLE shop_counter_drafts');
      connection.execute('PRAGMA user_version = 6');
    } finally {
      connection.close();
    }
    ShopBackup.verifySnapshot(legacy, expectedSchemaVersion: 6);
    final legacyArchive = File('${directory.path}/legacy-v6.smbak');
    await _writeAuthenticatedArchive(
      legacyArchive,
      await legacy.readAsBytes(),
      schemaVersion: 6,
    );
    final mismatchedArchive = File('${directory.path}/mismatched-v7.smbak');
    await _writeAuthenticatedArchive(
      mismatchedArchive,
      await legacy.readAsBytes(),
      schemaVersion: 7,
    );
    final mismatchedTarget = File('${directory.path}/mismatched-v7.sqlite');
    await expectLater(
      ShopBackup.restoreIntoEmptyDatabase(
        archive: mismatchedArchive,
        target: mismatchedTarget,
        password: _password,
      ),
      throwsFormatException,
    );
    expect(await mismatchedTarget.exists(), isFalse);
    final target = File('${directory.path}/legacy-v6-restored.sqlite');
    await ShopBackup.restoreIntoEmptyDatabase(
      archive: legacyArchive,
      target: target,
      password: _password,
    );
    final migrated = ShopDatabase(NativeDatabase(target));
    try {
      expect(
        (await migrated.readActiveProducts()).single.name,
        'KAUNG 90 Days Rice',
      );
      expect(await migrated.readProductThumbnail('rice'), isNull);
      expect(
        (await migrated.customSelect('PRAGMA user_version').getSingle())
            .read<int>('user_version'),
        8,
      );
    } finally {
      await migrated.close();
    }
  });

  test('v7 snapshot opens with a new empty counter draft table', () async {
    final old = File('${directory.path}/legacy-v7.sqlite');
    await database.exportVerifiedLocalSnapshot(old);
    final connection = sqlite3.open(old.path);
    try {
      connection.execute('DROP TABLE shop_counter_drafts');
      connection.execute('PRAGMA user_version = 7');
    } finally {
      connection.close();
    }
    ShopBackup.verifySnapshot(old, expectedSchemaVersion: 7);
    final upgraded = ShopDatabase(NativeDatabase(old));
    try {
      expect(await upgraded.readCounterSaleDraft(), isNull);
      expect(
        (await upgraded.customSelect('PRAGMA user_version').getSingle())
            .read<int>('user_version'),
        8,
      );
    } finally {
      await upgraded.close();
    }
  });

  test('v8 snapshot rejects a malformed image blob', () async {
    final corrupt = File('${directory.path}/malformed-photo.sqlite');
    await database.exportVerifiedLocalSnapshot(corrupt);
    final connection = sqlite3.open(corrupt.path);
    try {
      connection.execute('UPDATE shop_product_images SET image_png = ?', [
        Uint8List.fromList([1, 2, 3]),
      ]);
    } finally {
      connection.close();
    }
    expect(() => ShopBackup.verifySnapshot(corrupt), throwsFormatException);
  });

  test('v8 snapshot rejects a malformed unfinished sale', () async {
    final corrupt = File('${directory.path}/malformed-draft.sqlite');
    await database.exportVerifiedLocalSnapshot(corrupt);
    final connection = sqlite3.open(corrupt.path);
    try {
      connection.execute(
        'INSERT INTO shop_counter_drafts '
        '(slot, operation_id, basket_json, updated_at_millis) '
        'VALUES (1, ?, ?, 1)',
        ['bad-draft', '[{"productId":"rice","quantity":0}]'],
      );
    } finally {
      connection.close();
    }
    expect(() => ShopBackup.verifySnapshot(corrupt), throwsFormatException);
  });

  test(
    'changed ciphertext and truncated archive never create a target',
    () async {
      final original = await archive.readAsBytes();
      final tampered = Uint8List.fromList(original);
      tampered[50] ^= 1;
      final tamperedArchive = File('${directory.path}/tampered.smbak');
      await tamperedArchive.writeAsBytes(tampered);
      final truncatedArchive = File('${directory.path}/truncated.smbak');
      await truncatedArchive.writeAsBytes(
        original.sublist(0, original.length - 7),
      );

      for (final candidate in [tamperedArchive, truncatedArchive]) {
        final target = File('${candidate.path}.sqlite');
        await expectLater(
          ShopBackup.restoreIntoEmptyDatabase(
            archive: candidate,
            target: target,
            password: _password,
          ),
          throwsFormatException,
        );
        expect(await target.exists(), isFalse);
      }
    },
  );

  test('an existing database cannot be overwritten', () async {
    final target = File('${directory.path}/active.sqlite');
    await target.writeAsString('active records');
    await expectLater(
      ShopBackup.restoreIntoEmptyDatabase(
        archive: archive,
        target: target,
        password: _password,
      ),
      throwsStateError,
    );
    expect(await target.readAsString(), 'active records');
  });

  test('existing SQLite sidecars are never removed', () async {
    final target = File('${directory.path}/sidecar.sqlite');
    final sidecar = File('${target.path}-wal');
    await sidecar.writeAsString('another database owns this');
    await expectLater(
      ShopBackup.restoreIntoEmptyDatabase(
        archive: archive,
        target: target,
        password: _password,
      ),
      throwsStateError,
    );
    expect(await target.exists(), isFalse);
    expect(await sidecar.readAsString(), 'another database owns this');
  });

  test('late database and WAL creator wins without being replaced', () async {
    final target = File('${directory.path}/late.sqlite');
    final wal = File('${target.path}-wal');
    await expectLater(
      ShopBackup.restoreIntoEmptyDatabase(
        archive: archive,
        target: target,
        password: _password,
        beforePublishForTest: () async {
          await target.writeAsString('another Shop instance');
          await wal.writeAsString('its WAL');
        },
      ),
      throwsFileSystemException,
    );
    expect(await target.readAsString(), 'another Shop instance');
    expect(await wal.readAsString(), 'its WAL');
    expect(await ShopBackup.restoreMarkerFor(target).exists(), isTrue);
    await _expectNoScratch(directory);
  });

  for (final suffix in const ['-wal', '-shm']) {
    for (final timing in const ['before', 'after']) {
      test(
        'late $suffix creator $timing publication leaves recovery marker',
        () async {
          final target = File(
            '${directory.path}/late-sidecar-$timing-'
            '${suffix.substring(1)}.sqlite',
          );
          final sidecar = File('${target.path}$suffix');
          Future<void> createSidecar() async {
            await sidecar.writeAsString('other writer');
          }

          await expectLater(
            ShopBackup.restoreIntoEmptyDatabase(
              archive: archive,
              target: target,
              password: _password,
              beforePublishForTest: timing == 'before' ? createSidecar : null,
              afterPublishForTest: timing == 'after' ? createSidecar : null,
            ),
            throwsStateError,
          );
          expect(await sidecar.readAsString(), 'other writer');
          expect(await target.exists(), isTrue);
          expect(await ShopBackup.restoreMarkerFor(target).exists(), isTrue);
          await _expectNoScratch(directory);
        },
      );
    }
  }

  test('valid SQLite changed after publication stays blocked', () async {
    final target = File('${directory.path}/changed-after-link.sqlite');
    await expectLater(
      ShopBackup.restoreIntoEmptyDatabase(
        archive: archive,
        target: target,
        password: _password,
        afterPublishForTest: () async {
          final connection = sqlite3.open(target.path);
          try {
            connection.execute(
              'UPDATE shop_products SET price_mmk = price_mmk + 1 '
              'WHERE id = ?',
              ['rice'],
            );
          } finally {
            connection.close();
          }
        },
      ),
      throwsStateError,
    );
    expect(await target.exists(), isTrue);
    expect(await ShopBackup.restoreMarkerFor(target).exists(), isTrue);
    await _expectNoScratch(directory);
  });

  test('startup clears only an unpublished restore marker', () async {
    final target = File('${directory.path}/unpublished.sqlite');
    final marker = ShopBackup.restoreMarkerFor(target);
    final staging = await directory.createTemp('.supermega-shop-restore-');
    await File('${staging.path}/shop.sqlite').writeAsString('plaintext');
    await marker.writeAsString('preparing-v1\n');
    await ShopBackup.cleanupInterruptedStaging(
      directory,
      restoreTarget: target,
    );
    expect(await staging.exists(), isFalse);
    expect(await marker.exists(), isFalse);
    expect(await target.exists(), isFalse);
  });

  test(
    'startup keeps an uncertain committing marker even without DB',
    () async {
      final target = File('${directory.path}/uncertain.sqlite');
      final marker = ShopBackup.restoreMarkerFor(target);
      await marker.writeAsString('committing-v1\n');
      await ShopBackup.cleanupInterruptedStaging(
        directory,
        restoreTarget: target,
      );
      expect(await marker.exists(), isTrue);
      expect(
        await ShopBackup.inspectStore(target),
        ShopStorePresence.interrupted,
      );
    },
  );

  test('startup retains a published restore marker', () async {
    final target = File('${directory.path}/marked.sqlite');
    await ShopBackup.restoreIntoEmptyDatabase(
      archive: archive,
      target: target,
      password: _password,
    );
    final original = await target.readAsBytes();
    final marker = ShopBackup.restoreMarkerFor(target);
    await marker.writeAsString('interrupted after commit');
    await ShopBackup.cleanupInterruptedStaging(
      directory,
      restoreTarget: target,
    );
    expect(await marker.exists(), isTrue);
    expect(await target.readAsBytes(), original);
  });

  test(
    'new Shop reservation prevents a later restore from replacing it',
    () async {
      final target = File('${directory.path}/new-shop.sqlite');
      expect(await ShopBackup.inspectStore(target), ShopStorePresence.empty);
      await ShopBackup.reserveNewStore(target);
      expect(await ShopBackup.inspectStore(target), ShopStorePresence.existing);
      await expectLater(
        ShopBackup.restoreIntoEmptyDatabase(
          archive: archive,
          target: target,
          password: _password,
        ),
        throwsStateError,
      );
      expect(await target.length(), 0);
    },
  );

  test(
    'restore after empty inspection prevents a stale new-Shop choice',
    () async {
      final target = File('${directory.path}/restore-wins.sqlite');
      expect(await ShopBackup.inspectStore(target), ShopStorePresence.empty);
      await ShopBackup.restoreIntoEmptyDatabase(
        archive: archive,
        target: target,
        password: _password,
      );
      final bytes = await target.readAsBytes();
      await expectLater(ShopBackup.reserveNewStore(target), throwsStateError);
      expect(await target.readAsBytes(), bytes);
    },
  );

  test('startup cleanup leaves a fully published database intact', () async {
    final target = File('${directory.path}/published.sqlite');
    await ShopBackup.restoreIntoEmptyDatabase(
      archive: archive,
      target: target,
      password: _password,
    );
    final before = await target.readAsBytes();
    final interrupted = await directory.createTemp('.supermega-shop-restore-');
    await target.copy('${interrupted.path}/shop.sqlite');
    await ShopBackup.cleanupInterruptedStaging(directory);
    expect(await interrupted.exists(), isFalse);
    expect(await target.readAsBytes(), before);
    ShopBackup.verifySnapshot(target);
  });

  testWidgets('fresh install restores before Shop opens', (tester) async {
    final documents = await Directory.systemTemp.createTemp('shop-first-run-');
    ShopDatabase? opened;
    try {
      await tester.pumpWidget(
        ShopStartup(
          documents: documents,
          importScratchRoot: documents,
          initialMyanmar: false,
          pickBackup: () async => XFile(archive.path),
          buildShop: (database, _) {
            opened = database;
            return const MaterialApp(home: Scaffold(body: Text('Opened Shop')));
          },
        ),
      );
      await _pumpUntil(tester, find.text('Start new Shop'));
      expect(find.text('Start new Shop'), findsOneWidget);
      expect(
        await ShopDatabase.privateDatabaseFile(documents).exists(),
        isFalse,
      );
      await tester.tap(find.text('Restore backup'));
      await _pumpUntil(tester, find.text('Restore and open Shop'));
      expect(
        await ShopDatabase.privateDatabaseFile(documents).exists(),
        isFalse,
      );
      await tester.enterText(find.byType(TextField), _password);
      await tester.tap(find.text('Restore and open Shop'));
      await _pumpUntil(tester, find.text('Opened Shop'));
      expect(find.text('Opened Shop'), findsOneWidget);
      expect((await opened!.readActiveProducts()).single.onHand, 3);
      expect(await opened!.countSales(), 1);
      expect(
        await ShopDatabase.privateDatabaseFile(documents).exists(),
        isTrue,
      );
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await opened?.close();
      await documents.delete(recursive: true);
    }
  });

  testWidgets('Start new reserves the exact Drift database path', (
    tester,
  ) async {
    final documents = await Directory.systemTemp.createTemp('shop-new-');
    ShopDatabase? opened;
    try {
      await tester.pumpWidget(
        ShopStartup(
          documents: documents,
          importScratchRoot: documents,
          initialMyanmar: false,
          buildShop: (database, _) {
            opened = database;
            return const MaterialApp(home: Scaffold(body: Text('Opened Shop')));
          },
        ),
      );
      await _pumpUntil(tester, find.text('Start new Shop'));
      await tester.tap(find.text('Start new Shop'));
      await _pumpUntil(tester, find.text('Opened Shop'));
      expect(find.text('Opened Shop'), findsOneWidget);
      expect(
        await ShopDatabase.privateDatabaseFile(documents).exists(),
        isTrue,
      );
      expect(await opened!.readActiveProducts(), isEmpty);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await opened?.close();
      await documents.delete(recursive: true);
    }
  });

  testWidgets('wrong password keeps restore choice and local data empty', (
    tester,
  ) async {
    final documents = await Directory.systemTemp.createTemp('shop-wrong-pass-');
    ShopDatabase? opened;
    try {
      await tester.pumpWidget(
        ShopStartup(
          documents: documents,
          importScratchRoot: documents,
          initialMyanmar: false,
          pickBackup: () async => XFile(archive.path),
          buildShop: (database, _) {
            opened = database;
            return const MaterialApp(home: Scaffold(body: Text('Opened Shop')));
          },
        ),
      );
      await _pumpUntil(tester, find.text('Start new Shop'));
      await tester.tap(find.text('Restore backup'));
      await _pumpUntil(tester, find.text('Restore and open Shop'));
      await tester.enterText(find.byType(TextField), 'a wrong long password');
      await tester.tap(find.text('Restore and open Shop'));
      await _pumpUntil(tester, find.textContaining('Could not restore'));
      expect(find.textContaining('Could not restore'), findsOneWidget);
      expect(find.text('Restore and open Shop'), findsOneWidget);
      expect(
        await ShopDatabase.privateDatabaseFile(documents).exists(),
        isFalse,
      );
      await tester.enterText(find.byType(TextField), _password);
      await tester.tap(find.text('Restore and open Shop'));
      await _pumpUntil(tester, find.text('Opened Shop'));
      expect(find.text('Opened Shop'), findsOneWidget);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await opened?.close();
      await documents.delete(recursive: true);
    }
  });

  testWidgets('cancelled restore cannot create a Shop database', (
    tester,
  ) async {
    final documents = await Directory.systemTemp.createTemp('shop-cancel-');
    try {
      await tester.pumpWidget(
        ShopStartup(
          documents: documents,
          importScratchRoot: documents,
          initialMyanmar: true,
          pickBackup: () async => null,
          buildShop: (_, _) => const SizedBox.shrink(),
        ),
      );
      await _pumpUntil(tester, find.text('Shop အသစ် စတင်ရန်'));
      await tester.tap(find.text('အရန်ကူးဖိုင် ပြန်ယူရန်'));
      await tester.pump();
      expect(find.text('Shop အသစ် စတင်ရန်'), findsOneWidget);
      expect(
        await ShopDatabase.privateDatabaseFile(documents).exists(),
        isFalse,
      );
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await documents.delete(recursive: true);
    }
  });

  testWidgets('existing Shop opens without offering restore', (tester) async {
    final documents = await Directory.systemTemp.createTemp('shop-existing-');
    ShopDatabase? opened;
    try {
      await ShopBackup.restoreIntoEmptyDatabase(
        archive: archive,
        target: ShopDatabase.privateDatabaseFile(documents),
        password: _password,
      );
      await tester.pumpWidget(
        ShopStartup(
          documents: documents,
          importScratchRoot: documents,
          initialMyanmar: false,
          buildShop: (database, _) {
            opened = database;
            return const MaterialApp(home: Scaffold(body: Text('Opened Shop')));
          },
        ),
      );
      await _pumpUntil(tester, find.text('Opened Shop'));
      expect(find.text('Opened Shop'), findsOneWidget);
      expect(find.text('Restore backup'), findsNothing);
      expect((await opened!.readActiveProducts()).single.onHand, 3);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await opened?.close();
      await documents.delete(recursive: true);
    }
  });

  testWidgets('orphaned WAL blocks first-run actions without deletion', (
    tester,
  ) async {
    final documents = await Directory.systemTemp.createTemp('shop-orphan-wal-');
    try {
      final target = ShopDatabase.privateDatabaseFile(documents);
      final sidecar = File('${target.path}-wal');
      await sidecar.writeAsString('preserve this file');
      await tester.pumpWidget(
        ShopStartup(
          documents: documents,
          importScratchRoot: documents,
          initialMyanmar: false,
          buildShop: (_, _) => const SizedBox.shrink(),
        ),
      );
      await _pumpUntil(tester, find.textContaining('cannot safely open'));
      expect(find.textContaining('cannot safely open'), findsOneWidget);
      expect(find.text('Start new Shop'), findsNothing);
      expect(find.text('Restore backup'), findsNothing);
      expect(await sidecar.readAsString(), 'preserve this file');
      expect(await target.exists(), isFalse);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await documents.delete(recursive: true);
    }
  });

  testWidgets('published recovery marker blocks opening an existing Shop', (
    tester,
  ) async {
    final documents = await Directory.systemTemp.createTemp('shop-marked-');
    var opened = false;
    try {
      final target = ShopDatabase.privateDatabaseFile(documents);
      await ShopBackup.restoreIntoEmptyDatabase(
        archive: archive,
        target: target,
        password: _password,
      );
      await ShopBackup.restoreMarkerFor(target).writeAsString('interrupted');
      await tester.pumpWidget(
        ShopStartup(
          documents: documents,
          importScratchRoot: documents,
          initialMyanmar: false,
          buildShop: (_, _) {
            opened = true;
            return const SizedBox.shrink();
          },
        ),
      );
      await _pumpUntil(tester, find.textContaining('restore was interrupted'));
      expect(opened, isFalse);
      expect(find.textContaining('restore was interrupted'), findsOneWidget);
      expect(find.text('Start new Shop'), findsNothing);
      expect(find.text('Restore backup'), findsNothing);
      expect(await target.exists(), isTrue);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await documents.delete(recursive: true);
    }
  });

  test('concurrent cleanup fails fast and releases its lock', () async {
    final lock = File('${directory.path}/.supermega-shop-backup.lock');
    expect(await lock.exists(), isTrue);
    final first = ShopBackup.cleanupInterruptedStaging(directory);
    await expectLater(
      ShopBackup.cleanupInterruptedStaging(directory),
      throwsStateError,
    );
    await first;
    await ShopBackup.cleanupInterruptedStaging(directory);
    expect(await lock.exists(), isTrue);
  });

  test('stale legacy restore lock does not block a new restore', () async {
    final target = File('${directory.path}/busy.sqlite');
    final oldLock = File('${target.path}.restore.lock');
    await oldLock.writeAsString('interrupted old restore');
    await ShopBackup.restoreIntoEmptyDatabase(
      archive: archive,
      target: target,
      password: _password,
    );
    ShopBackup.verifySnapshot(target);
    expect(await oldLock.readAsString(), 'interrupted old restore');
    await _expectNoScratch(directory);
  });

  test('startup cleanup removes only recognized plaintext staging', () async {
    final staleExport = await directory.createTemp('supermega-shop-backup-');
    final staleRestore = await directory.createTemp('.supermega-shop-restore-');
    final unrelated = await directory.createTemp('merchant-data-');
    final exportPlaintext = File('${staleExport.path}/shop.sqlite');
    final restorePlaintext = File('${staleRestore.path}/shop.sqlite');
    final unrelatedFile = File('${unrelated.path}/keep.txt');
    await exportPlaintext.writeAsString('private export');
    await restorePlaintext.writeAsString('private restore');
    await unrelatedFile.writeAsString('keep');

    await ShopBackup.cleanupInterruptedStaging(directory);

    expect(await staleExport.exists(), isFalse);
    expect(await staleRestore.exists(), isFalse);
    expect(await unrelatedFile.readAsString(), 'keep');
    expect(await archive.exists(), isTrue);
    await _expectNoScratch(directory);
  });

  test('cleanup refuses a staging symlink and preserves its target', () async {
    final outside = await directory.createTemp('merchant-data-');
    final keep = File('${outside.path}/keep.txt');
    await keep.writeAsString('never delete');
    final stagingLink = Link('${directory.path}/supermega-shop-backup-link');
    try {
      await stagingLink.create(outside.path);
    } on FileSystemException {
      // Creating symlinks requires a privilege on some Windows test runners.
      return;
    }
    try {
      await expectLater(
        ShopBackup.cleanupInterruptedStaging(directory),
        throwsStateError,
      );
      expect(await keep.readAsString(), 'never delete');
    } finally {
      await stagingLink.delete();
    }
    await ShopBackup.cleanupInterruptedStaging(directory);
  });

  test(
    'authenticated older schema and corrupt SQLite both fail closed',
    () async {
      final old = File('${directory.path}/old.sqlite');
      final oldDatabase = sqlite3.open(old.path);
      try {
        oldDatabase.execute('CREATE TABLE old_shop (id INTEGER PRIMARY KEY)');
        oldDatabase.execute('PRAGMA user_version = 1');
      } finally {
        oldDatabase.close();
      }
      final oldArchive = File('${directory.path}/old.smbak');
      await _writeAuthenticatedArchive(oldArchive, await old.readAsBytes());
      final oldTarget = File('${directory.path}/old-restored.sqlite');
      await expectLater(
        ShopBackup.restoreIntoEmptyDatabase(
          archive: oldArchive,
          target: oldTarget,
          password: _password,
        ),
        throwsFormatException,
      );
      expect(await oldTarget.exists(), isFalse);
      await _expectNoScratch(directory);

      final corrupt = Uint8List(512);
      corrupt.setRange(0, 16, ascii.encode('SQLite format 3\u0000'));
      final corruptArchive = File('${directory.path}/corrupt.smbak');
      await _writeAuthenticatedArchive(corruptArchive, corrupt);
      final corruptTarget = File('${directory.path}/corrupt-restored.sqlite');
      await expectLater(
        ShopBackup.restoreIntoEmptyDatabase(
          archive: corruptArchive,
          target: corruptTarget,
          password: _password,
        ),
        throwsA(isA<Exception>()),
      );
      expect(await corruptTarget.exists(), isFalse);
      await _expectNoScratch(directory);
    },
  );
}

Future<void> _expectNoScratch(Directory parent) async {
  final entries = await parent.list(followLinks: false).toList();
  expect(
    entries.where((entry) {
      final name = entry.path.split(Platform.pathSeparator).last;
      return name.startsWith('.supermega-shop-restore-') ||
          name.startsWith('supermega-shop-backup-');
    }),
    isEmpty,
  );
}

// A second encoder proves the restore path checks the decrypted database, not
// only its valid AES-GCM authentication tag.
Future<void> _writeAuthenticatedArchive(
  File target,
  List<int> cleartext, {
  int schemaVersion = ShopBackup.supportedSchemaVersion,
}) async {
  final salt = List<int>.generate(16, (index) => index + 10);
  final nonce = List<int>.generate(12, (index) => index + 30);
  final header = [
    ...ascii.encode('SMBK'),
    ShopBackup.formatVersion,
    schemaVersion,
    ...salt,
    ...nonce,
  ];
  final key = await Argon2id(
    memory: 19 * 1024,
    parallelism: 1,
    iterations: 2,
    hashLength: 32,
  ).deriveKeyFromPassword(password: _password, nonce: salt);
  final box = await AesGcm.with256bits().encrypt(
    cleartext,
    secretKey: key,
    nonce: nonce,
    aad: header,
  );
  await target.writeAsBytes([...header, ...box.cipherText, ...box.mac.bytes]);
}
