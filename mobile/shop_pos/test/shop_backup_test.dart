import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart';
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_database.dart';

const _password = 'correct horse battery staple';

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
      await _expectNoRestoreScratch(directory, target);
      final reopened = ShopDatabase(NativeDatabase(target));
      try {
        expect((await reopened.readActiveProducts()).single.onHand, 3);
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

  test('a restore in progress blocks another restore', () async {
    final target = File('${directory.path}/busy.sqlite');
    final lock = File('${target.path}.restore.lock');
    await lock.writeAsString('another restore');
    try {
      await expectLater(
        ShopBackup.restoreIntoEmptyDatabase(
          archive: archive,
          target: target,
          password: _password,
        ),
        throwsA(isA<FileSystemException>()),
      );
      expect(await target.exists(), isFalse);
      expect(await lock.readAsString(), 'another restore');
    } finally {
      await lock.delete();
    }
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
      await _expectNoRestoreScratch(directory, oldTarget);

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
      await _expectNoRestoreScratch(directory, corruptTarget);
    },
  );
}

Future<void> _expectNoRestoreScratch(Directory parent, File target) async {
  final entries = await parent.list().toList();
  expect(
    entries.where(
      (entry) => entry.path
          .split(Platform.pathSeparator)
          .last
          .startsWith('.supermega-shop-restore-'),
    ),
    isEmpty,
  );
  expect(await File('${target.path}.restore.lock').exists(), isFalse);
}

// A second encoder proves the restore path checks the decrypted database, not
// only its valid AES-GCM authentication tag.
Future<void> _writeAuthenticatedArchive(
  File target,
  List<int> cleartext,
) async {
  final salt = List<int>.generate(16, (index) => index + 10);
  final nonce = List<int>.generate(12, (index) => index + 30);
  final header = [
    ...ascii.encode('SMBK'),
    ShopBackup.formatVersion,
    ShopBackup.supportedSchemaVersion,
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
