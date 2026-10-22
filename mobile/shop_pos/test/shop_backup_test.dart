import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart' as crypto;
import 'package:cryptography/cryptography.dart';
import 'package:file_selector/file_selector.dart';
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart';
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_backup_export_screen.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_models.dart';
import 'package:supermega_shop/shop_startup.dart';

const _password = 'correct horse battery staple';
const _pathProviderChannel = MethodChannel('plugins.flutter.io/path_provider');
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
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_pathProviderChannel, (call) async {
          if (call.method == 'getTemporaryDirectory' ||
              call.method == 'getApplicationDocumentsDirectory') {
            return directory.path;
          }
          throw MissingPluginException();
        });
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
    await database.createWalletCheckoutIntent(
      operationId: 'backup-wallet-1',
      merchant: MerchantWalletSetup(
        provider: 'KBZPay',
        merchantPhone: '09123456789',
        officialQrPayload: _syntheticStaticMmqr(),
        issuerConfirmed: true,
      ),
      lines: const [ShopSaleLineInput(productId: 'rice', quantity: 1)],
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
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_pathProviderChannel, null);
    await directory.delete(recursive: true);
  });

  test(
    'archive is encrypted and restores all local state into a new target',
    () async {
      final bytes = await archive.readAsBytes();
      expect(bytes.sublist(0, 4), ascii.encode('SMBK'));
      expect(bytes[5], 11);
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

  test('encrypted backup preserves a pending wallet reversal and exact retry state', () async {
    final source = ShopDatabase(NativeDatabase.memory());
    try {
      await source.addProduct(
        id: 'backup-reversal-product',
        name: 'Tea',
        priceMmk: 1500,
        openingStock: 3,
      );
      const lines = [
        ShopSaleLineInput(productId: 'backup-reversal-product', quantity: 2),
      ];
      await source.createWalletCheckoutIntent(
        operationId: 'backup-reversal-sale',
        merchant: MerchantWalletSetup(
          provider: 'KBZPay',
          merchantPhone: null,
          officialQrPayload: _syntheticStaticMmqr(),
          issuerConfirmed: true,
        ),
        lines: lines,
      );
      final sale = await source.recordSale(
        operationId: 'backup-reversal-sale',
        lines: lines,
        paymentMethod: 'kbzpay',
        walletCheckoutOperationId: 'backup-reversal-sale',
      );
      final command = await source.previewFullSaleReversal(
        operationId: 'backup-pending-reversal',
        saleId: sale.id,
        restockItems: true,
        reason: 'Full sale returned',
        confirmCashReturned: false,
      );
      final authorization = _backupAuthorization(
        command.commandDigest,
        capability: 'shop.sale.reverse',
        receiptId: 'backup-reversal-receipt',
      );
      await source.recordAuthorizedFullSaleReversal(
        command: command,
        authorization: authorization,
      );
      final reversalArchive = File('${directory.path}/wallet-reversal.smbak');
      await ShopBackup.exportEncrypted(
        database: source,
        archive: reversalArchive,
        password: _password,
        scratchRoot: directory,
      );
      final target = File('${directory.path}/wallet-reversal.sqlite');
      await ShopBackup.restoreIntoEmptyDatabase(
        archive: reversalArchive,
        target: target,
        password: _password,
      );
      final restored = ShopDatabase(NativeDatabase(target));
      try {
        final recent = (await restored.readRecentSales()).single;
        expect(recent.reversal?.walletReconciliationPending, isTrue);
        expect(recent.reversal?.restockItems, isTrue);
        expect((await restored.readActiveProducts()).single.onHand, 3);
        await restored.recordAuthorizedFullSaleReversal(
          command: command,
          authorization: authorization,
        );
        expect((await restored.readActiveProducts()).single.onHand, 3);
        final reconciliation = await restored.previewWalletReconciliation(
          operationId: 'backup-wallet-confirmation',
          reversalId: command.operationId,
          outcome: 'money_returned',
          evidenceReference: 'Provider history receipt 99',
        );
        final confirmed = await restored.recordAuthorizedWalletReconciliation(
          command: reconciliation,
          authorization: _backupAuthorization(
            reconciliation.commandDigest,
            capability: 'shop.sale.reconcile_wallet',
            receiptId: 'backup-confirmation-receipt',
          ),
        );
        expect(confirmed.walletReconciliationOutcome, 'money_returned');
        expect((await restored.readActiveProducts()).single.onHand, 3);
      } finally {
        await restored.close();
      }
    } finally {
      await source.close();
    }
  });

  test(
    'encrypted backup restores a cash reversal and closed-shift audit',
    () async {
      final source = await _closedCashReversalDatabase();
      try {
        final cashArchive = File('${directory.path}/cash-reversal-close.smbak');
        await ShopBackup.exportEncrypted(
          database: source,
          archive: cashArchive,
          password: _password,
          scratchRoot: directory,
        );
        final target = File('${directory.path}/cash-reversal-close.sqlite');
        await ShopBackup.restoreIntoEmptyDatabase(
          archive: cashArchive,
          target: target,
          password: _password,
        );
        final restored = ShopDatabase(NativeDatabase(target));
        try {
          final shift = await restored.readLatestCashShift();
          expect(shift?.state, 'closed');
          expect(shift?.cashSalesTotalMmk, 3000);
          expect(shift?.cashReversalCount, 1);
          expect(shift?.cashReversalTotalMmk, 3000);
          expect(shift?.cashDrawerOutflowMmk, 3000);
          expect(shift?.expectedCashMmk, 5000);
          expect(shift?.differenceMmk, 0);
          final receipt = (await restored.readRecentSales()).single;
          expect(receipt.reversal?.cashDrawerDeltaMmk, -3000);
          expect(receipt.reversal?.restockItems, isTrue);
          expect((await restored.readActiveProducts()).single.onHand, 3);
          expect(await restored.countOutboxOperations(), 5);
        } finally {
          await restored.close();
        }
      } finally {
        await source.close();
      }
    },
  );

  test(
    'authenticated v11 restore rejects reversal digest and event corruption',
    () async {
      final base = File('${directory.path}/verifier-wallet-base.sqlite');
      await _writeWalletReversalSnapshot(base);
      ShopBackup.verifySnapshot(base, expectedSchemaVersion: 11);
      final cases = <({String name, void Function(Database) mutate})>[
        (
          name: 'sale-snapshot-digest',
          mutate: (connection) => _mutateImmutableAuditRow(
            connection,
            table: 'shop_sale_reversals',
            mutate: () => connection.execute(
              'UPDATE shop_sale_reversals SET sale_snapshot_digest = ?',
              [List<String>.filled(64, '0').join()],
            ),
          ),
        ),
        (
          name: 'reversal-request',
          mutate: (connection) => _mutateImmutableAuditRow(
            connection,
            table: 'shop_sale_reversals',
            mutate: () => connection.execute(
              'UPDATE shop_sale_reversals SET request_fingerprint = ?',
              ['{}'],
            ),
          ),
        ),
        (
          name: 'reversal-command-digest',
          mutate: (connection) => _mutateImmutableAuditRow(
            connection,
            table: 'shop_sale_reversals',
            mutate: () => connection.execute(
              'UPDATE shop_sale_reversals '
              'SET authorization_command_digest = ?',
              [List<String>.filled(64, 'c').join()],
            ),
          ),
        ),
        (
          name: 'reversal-receipt-digest',
          mutate: (connection) => _mutateImmutableAuditRow(
            connection,
            table: 'shop_sale_reversals',
            mutate: () => connection.execute(
              'UPDATE shop_sale_reversals '
              'SET authorization_receipt_digest = ?',
              [List<String>.filled(64, '0').join()],
            ),
          ),
        ),
        (
          name: 'wallet-money-returned',
          mutate: (connection) {
            final row = connection.select(
              'SELECT payload_json FROM shop_sync_outbox '
              'WHERE operation_id = ?',
              ['verifier-wallet-reversal'],
            ).single;
            final payload = Map<String, dynamic>.from(
              jsonDecode(row['payload_json'] as String) as Map,
            );
            payload['moneyReturned'] = true;
            payload['externalReconciliationState'] = 'confirmed';
            connection.execute(
              'UPDATE shop_sync_outbox SET payload_json = ? '
              'WHERE operation_id = ?',
              [jsonEncode(payload), 'verifier-wallet-reversal'],
            );
          },
        ),
        (
          name: 'reversal-event-line',
          mutate: (connection) {
            final row = connection.select(
              'SELECT payload_json FROM shop_sync_outbox '
              'WHERE operation_id = ?',
              ['verifier-wallet-reversal'],
            ).single;
            final payload = Map<String, dynamic>.from(
              jsonDecode(row['payload_json'] as String) as Map,
            );
            final lines = List<dynamic>.from(payload['lines'] as List);
            final line = Map<String, dynamic>.from(lines.single as Map);
            line['quantity'] = (line['quantity'] as int) + 1;
            payload['lines'] = [line];
            connection.execute(
              'UPDATE shop_sync_outbox SET payload_json = ? '
              'WHERE operation_id = ?',
              [jsonEncode(payload), 'verifier-wallet-reversal'],
            );
          },
        ),
        (
          name: 'orphan-reversal-restock',
          mutate: (connection) => connection.execute(
            'INSERT INTO shop_stock_movements '
            '(id, sale_id, product_id, quantity_delta, reason, '
            'created_at_millis) VALUES (?, ?, ?, ?, ?, ?)',
            [
              'orphan-reversal-restock',
              'verifier-wallet-sale',
              'verifier-wallet-product',
              2,
              'sale_reversal_restock',
              DateTime.now().millisecondsSinceEpoch,
            ],
          ),
        ),
      ];
      for (final testCase in cases) {
        final corrupt = File(
          '${directory.path}/verifier-${testCase.name}.sqlite',
        );
        await corrupt.writeAsBytes(await base.readAsBytes());
        final connection = sqlite3.open(corrupt.path);
        try {
          testCase.mutate(connection);
        } finally {
          connection.close();
        }
        await _expectAuthenticatedRestoreRejected(
          directory: directory,
          snapshot: corrupt,
          stem: 'verifier-${testCase.name}',
          schemaVersion: 11,
        );
      }
    },
  );

  test('authenticated v11 restore rejects reconciliation command and event corruption', () async {
    final base = File('${directory.path}/verifier-reconciled-base.sqlite');
    await _writeWalletReversalSnapshot(base, reconciled: true);
    ShopBackup.verifySnapshot(base, expectedSchemaVersion: 11);
    final cases = <({String name, void Function(Database) mutate})>[
      (
        name: 'reconciliation-request',
        mutate: (connection) => _mutateImmutableAuditRow(
          connection,
          table: 'shop_wallet_reversal_reconciliations',
          mutate: () => connection.execute(
            'UPDATE shop_wallet_reversal_reconciliations '
            'SET request_fingerprint = ?',
            ['{}'],
          ),
        ),
      ),
      (
        name: 'reconciliation-command-digest',
        mutate: (connection) => _mutateImmutableAuditRow(
          connection,
          table: 'shop_wallet_reversal_reconciliations',
          mutate: () => connection.execute(
            'UPDATE shop_wallet_reversal_reconciliations '
            'SET authorization_command_digest = ?',
            [List<String>.filled(64, 'd').join()],
          ),
        ),
      ),
      (
        name: 'reconciliation-legacy-unbound-request',
        mutate: (connection) {
          final row = connection
              .select('SELECT * FROM shop_wallet_reversal_reconciliations')
              .single;
          final legacyFingerprint = jsonEncode(<String, Object>{
            'operationId': row['operation_id'] as String,
            'reversalId': row['reversal_id'] as String,
            'outcome': row['outcome'] as String,
            'evidenceReference': row['evidence_reference'] as String,
          });
          final commandDigest = crypto.sha256
              .convert(utf8.encode(legacyFingerprint))
              .toString();
          final receiptDigest = shopCorrectionAuthorizationReceiptDigest(
            source: row['authorization_source'] as String,
            receiptId: row['authorization_receipt_id'] as String,
            workspaceId: row['authorization_workspace_id'] as String,
            actorId: row['authorized_actor_id'] as String,
            actorLabel: row['authorized_actor_label'] as String,
            actorRole: row['authorized_actor_role'] as String,
            capability: row['authorization_capability'] as String,
            commandDigest: commandDigest,
            issuedAtMillis: row['authorization_issued_at_millis'] as int,
            expiresAtMillis: row['authorization_expires_at_millis'] as int,
          );
          _mutateImmutableAuditRow(
            connection,
            table: 'shop_wallet_reversal_reconciliations',
            mutate: () => connection.execute(
              'UPDATE shop_wallet_reversal_reconciliations '
              'SET request_fingerprint = ?, '
              'authorization_command_digest = ?, '
              'authorization_receipt_digest = ?',
              [legacyFingerprint, commandDigest, receiptDigest],
            ),
          );
        },
      ),
      (
        name: 'reconciliation-receipt-metadata',
        mutate: (connection) => _mutateImmutableAuditRow(
          connection,
          table: 'shop_wallet_reversal_reconciliations',
          mutate: () => connection.execute(
            'UPDATE shop_wallet_reversal_reconciliations '
            'SET authorized_actor_label = ?',
            ['Tampered owner'],
          ),
        ),
      ),
      (
        name: 'reconciliation-money-returned',
        mutate: (connection) {
          final row = connection.select(
            'SELECT payload_json FROM shop_sync_outbox '
            'WHERE operation_id = ?',
            ['verifier-wallet-reconciliation'],
          ).single;
          final payload = Map<String, dynamic>.from(
            jsonDecode(row['payload_json'] as String) as Map,
          );
          payload['moneyReturned'] = false;
          connection.execute(
            'UPDATE shop_sync_outbox SET payload_json = ? '
            'WHERE operation_id = ?',
            [jsonEncode(payload), 'verifier-wallet-reconciliation'],
          );
        },
      ),
    ];
    for (final testCase in cases) {
      final corrupt = File(
        '${directory.path}/verifier-${testCase.name}.sqlite',
      );
      await corrupt.writeAsBytes(await base.readAsBytes());
      final connection = sqlite3.open(corrupt.path);
      try {
        testCase.mutate(connection);
      } finally {
        connection.close();
      }
      await _expectAuthenticatedRestoreRejected(
        directory: directory,
        snapshot: corrupt,
        stem: 'verifier-${testCase.name}',
        schemaVersion: 11,
      );
    }
  });

  test('authenticated v11 restore rejects cash-close snapshot and event corruption', () async {
    final source = await _closedCashReversalDatabase();
    final base = File('${directory.path}/verifier-cash-base.sqlite');
    try {
      await source.exportVerifiedLocalSnapshot(base);
    } finally {
      await source.close();
    }
    ShopBackup.verifySnapshot(base, expectedSchemaVersion: 11);
    final cases = <({String name, void Function(Database) mutate})>[
      (
        name: 'cash-close-reversal-total',
        mutate: (connection) => connection.execute(
          'UPDATE shop_cash_shifts '
          'SET cash_reversal_total_mmk = cash_reversal_total_mmk + 1',
        ),
      ),
      (
        name: 'cash-close-expected',
        mutate: (connection) => connection.execute(
          'UPDATE shop_cash_shifts '
          'SET expected_cash_mmk = expected_cash_mmk + 1',
        ),
      ),
      (
        name: 'cash-close-event',
        mutate: (connection) {
          final row = connection.select(
            'SELECT payload_json FROM shop_sync_outbox '
            'WHERE operation_id = ?',
            ['verifier-cash-close'],
          ).single;
          final payload = Map<String, dynamic>.from(
            jsonDecode(row['payload_json'] as String) as Map,
          );
          payload['cashDrawerOutflowMmk'] = 0;
          connection.execute(
            'UPDATE shop_sync_outbox SET payload_json = ? '
            'WHERE operation_id = ?',
            [jsonEncode(payload), 'verifier-cash-close'],
          );
        },
      ),
    ];
    for (final testCase in cases) {
      final corrupt = File(
        '${directory.path}/verifier-${testCase.name}.sqlite',
      );
      await corrupt.writeAsBytes(await base.readAsBytes());
      final connection = sqlite3.open(corrupt.path);
      try {
        testCase.mutate(connection);
      } finally {
        connection.close();
      }
      await _expectAuthenticatedRestoreRejected(
        directory: directory,
        snapshot: corrupt,
        stem: 'verifier-${testCase.name}',
        schemaVersion: 11,
      );
    }
  });

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

  test(
    'restored pending wallet blocks other sales and completes only once',
    () async {
      final target = File('${directory.path}/wallet-restored.sqlite');
      await ShopBackup.restoreIntoEmptyDatabase(
        archive: archive,
        target: target,
        password: _password,
      );
      final restored = ShopDatabase(NativeDatabase(target));
      try {
        final pending = await restored.readPendingWalletCheckout();
        expect(pending?.operationId, 'backup-wallet-1');
        expect(pending?.paymentMethod, 'kbzpay');
        expect(pending?.totalMmk, 12000);
        expect(pending?.lines.single.productId, 'rice');
        expect(pending?.lines.single.quantity, 1);

        await expectLater(
          restored.recordCashSale(
            operationId: 'sale-during-restored-wallet',
            lines: const [ShopSaleLineInput(productId: 'rice', quantity: 1)],
          ),
          throwsStateError,
        );
        expect(await restored.countSales(), 1);
        expect((await restored.readActiveProducts()).single.onHand, 3);

        final first = await restored.recordSale(
          operationId: 'backup-wallet-1',
          lines: const [ShopSaleLineInput(productId: 'rice', quantity: 1)],
          paymentMethod: 'kbzpay',
          walletCheckoutOperationId: 'backup-wallet-1',
        );
        final retry = await restored.recordSale(
          operationId: 'backup-wallet-1',
          lines: const [ShopSaleLineInput(productId: 'rice', quantity: 1)],
          paymentMethod: 'kbzpay',
          walletCheckoutOperationId: 'backup-wallet-1',
        );
        expect(retry.id, first.id);
        expect(await restored.countSales(), 2);
        expect((await restored.readActiveProducts()).single.onHand, 2);
        expect(await restored.readPendingWalletCheckout(), isNull);
      } finally {
        await restored.close();
      }
    },
  );

  test(
    'encrypted backup restores a named held basket without stock or payment',
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
          operationId: 'held-backup-op',
          quantities: const {'water': 2},
        );
        await source.holdCounterSaleDraft(
          id: 'held-backup-id',
          name: 'Customer May',
          operationId: 'held-backup-op',
        );
        final heldArchive = File('${directory.path}/held.smbak');
        await ShopBackup.exportEncrypted(
          database: source,
          archive: heldArchive,
          password: _password,
          scratchRoot: directory,
        );
        final target = File('${directory.path}/held-restored.sqlite');
        await ShopBackup.restoreIntoEmptyDatabase(
          archive: heldArchive,
          target: target,
          password: _password,
        );
        final restored = ShopDatabase(NativeDatabase(target));
        try {
          final ticket = (await restored.readHeldSaleTickets()).single;
          expect(ticket.name, 'Customer May');
          expect(ticket.draft.quantities, {'water': 2});
          expect(await restored.readCounterSaleDraft(), isNull);
          expect((await restored.readActiveProducts()).single.onHand, 5);
          expect(await restored.countSales(), 0);
          expect(
            (await restored.reopenHeldSaleTicket(ticket.id)).operationId,
            'held-backup-op',
          );
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

  test('v6 archive restores, then migrates its catalog to v11', () async {
    final legacy = File('${directory.path}/legacy-v6.sqlite');
    await database.exportVerifiedLocalSnapshot(legacy);
    final connection = sqlite3.open(legacy.path);
    try {
      _removeV11ObjectsForLegacyFixture(connection);
      connection.execute('ALTER TABLE shop_products DROP COLUMN reorder_level');
      connection.execute('DROP TABLE shop_product_images');
      connection.execute('DROP TABLE shop_counter_drafts');
      connection.execute('DROP TABLE shop_held_sales');
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
      expect((await migrated.readActiveProducts()).single.reorderLevel, 5);
      expect(await migrated.readProductThumbnail('rice'), isNull);
      expect(
        (await migrated.customSelect('PRAGMA user_version').getSingle())
            .read<int>('user_version'),
        11,
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
      _removeV11ObjectsForLegacyFixture(connection);
      connection.execute('ALTER TABLE shop_products DROP COLUMN reorder_level');
      connection.execute('DROP TABLE shop_counter_drafts');
      connection.execute('DROP TABLE shop_held_sales');
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
        11,
      );
    } finally {
      await upgraded.close();
    }
  });

  test('v10 snapshot gains empty immutable reversal audit tables', () async {
    final old = File('${directory.path}/legacy-v10.sqlite');
    await database.exportVerifiedLocalSnapshot(old);
    final connection = sqlite3.open(old.path);
    try {
      _removeV11ObjectsForLegacyFixture(connection);
      connection.execute('PRAGMA user_version = 10');
      connection.execute('CREATE TABLE shop_sale_reversals (fake TEXT)');
      expect(
        () => ShopBackup.verifySnapshot(old, expectedSchemaVersion: 10),
        throwsFormatException,
      );
      connection.execute('DROP TABLE shop_sale_reversals');
      connection.execute('''
        CREATE TRIGGER shop_sales_no_update
        BEFORE UPDATE ON shop_sales BEGIN SELECT 1; END
      ''');
      expect(
        () => ShopBackup.verifySnapshot(old, expectedSchemaVersion: 10),
        throwsFormatException,
      );
      connection.execute('DROP TRIGGER shop_sales_no_update');
    } finally {
      connection.close();
    }
    ShopBackup.verifySnapshot(old, expectedSchemaVersion: 10);
    final upgraded = ShopDatabase(NativeDatabase(old));
    try {
      expect(await upgraded.readSaleReversalForSale('backup-sale-1'), isNull);
      expect(await upgraded.countSales(), 1);
      expect(
        (await upgraded.customSelect('PRAGMA user_version').getSingle())
            .read<int>('user_version'),
        11,
      );
    } finally {
      await upgraded.close();
    }
    ShopBackup.verifySnapshot(old, expectedSchemaVersion: 11);
  });

  test(
    'authenticated v10 restores reject case-insensitive reserved v11 names',
    () async {
      final cases = <({String name, void Function(Database) mutate})>[
        (
          name: 'table',
          mutate: (connection) => connection.execute(
            'CREATE TABLE SHOP_SALE_REVERSALS (fake TEXT)',
          ),
        ),
        (
          name: 'trigger',
          mutate: (connection) => connection.execute('''
            CREATE TRIGGER SHOP_SALES_NO_UPDATE
            BEFORE UPDATE ON shop_sales BEGIN SELECT 1; END
          '''),
        ),
        (
          name: 'view',
          mutate: (connection) => connection.execute(
            'CREATE VIEW Shop_Sale_Reversals AS SELECT id FROM shop_sales',
          ),
        ),
        (
          name: 'index',
          mutate: (connection) => connection.execute(
            'CREATE INDEX Shop_Sales_No_Update ON shop_sales(id)',
          ),
        ),
        (
          name: 'shift-column',
          mutate: (connection) => connection.execute(
            'ALTER TABLE shop_cash_shifts '
            'ADD COLUMN CASH_REVERSAL_COUNT INTEGER',
          ),
        ),
      ];

      for (final testCase in cases) {
        final legacy = File(
          '${directory.path}/legacy-reserved-${testCase.name}.sqlite',
        );
        await database.exportVerifiedLocalSnapshot(legacy);
        final connection = sqlite3.open(legacy.path);
        try {
          _removeV11ObjectsForLegacyFixture(connection);
          connection.execute('PRAGMA user_version = 10');
          testCase.mutate(connection);
        } finally {
          connection.close();
        }
        await _expectAuthenticatedRestoreRejected(
          directory: directory,
          snapshot: legacy,
          stem: 'legacy-reserved-${testCase.name}',
          schemaVersion: 10,
        );
      }
    },
  );

  test(
    'direct v10 migration rejects a mixed-case reserved v11 table',
    () async {
      final legacy = File('${directory.path}/legacy-direct-mixed-case.sqlite');
      await database.exportVerifiedLocalSnapshot(legacy);
      final connection = sqlite3.open(legacy.path);
      try {
        _removeV11ObjectsForLegacyFixture(connection);
        connection.execute('PRAGMA user_version = 10');
        connection.execute('CREATE TABLE SHOP_SALE_REVERSALS (fake TEXT)');
      } finally {
        connection.close();
      }
      final upgrading = ShopDatabase(NativeDatabase(legacy));
      try {
        await expectLater(upgrading.countSales(), throwsA(isA<StateError>()));
      } finally {
        await upgrading.close();
      }
    },
  );

  test(
    'v9 database gains an empty held-sale table without stock writes',
    () async {
      final old = File('${directory.path}/legacy-v9.sqlite');
      await database.exportVerifiedLocalSnapshot(old);
      final connection = sqlite3.open(old.path);
      try {
        _removeV11ObjectsForLegacyFixture(connection);
        connection.execute('DROP TABLE shop_held_sales');
        connection.execute('PRAGMA user_version = 9');
      } finally {
        connection.close();
      }
      ShopBackup.verifySnapshot(old, expectedSchemaVersion: 9);
      final upgraded = ShopDatabase(NativeDatabase(old));
      try {
        expect(await upgraded.readHeldSaleTickets(), isEmpty);
        expect((await upgraded.readActiveProducts()).single.onHand, 3);
        expect(await upgraded.countSales(), 1);
        expect(
          (await upgraded.customSelect('PRAGMA user_version').getSingle())
              .read<int>('user_version'),
          11,
        );
      } finally {
        await upgraded.close();
      }
      ShopBackup.verifySnapshot(old, expectedSchemaVersion: 11);
    },
  );

  test(
    'v8 catalog gains the documented alert default without stock writes',
    () async {
      final old = File('${directory.path}/legacy-v8.sqlite');
      await database.exportVerifiedLocalSnapshot(old);
      final connection = sqlite3.open(old.path);
      try {
        _removeV11ObjectsForLegacyFixture(connection);
        connection.execute(
          'ALTER TABLE shop_products DROP COLUMN reorder_level',
        );
        connection.execute('PRAGMA user_version = 8');
        connection.execute('DROP TABLE shop_held_sales');
      } finally {
        connection.close();
      }
      ShopBackup.verifySnapshot(old, expectedSchemaVersion: 8);
      final migrated = ShopDatabase(NativeDatabase(old));
      try {
        expect((await migrated.readActiveProducts()).single.reorderLevel, 5);
        expect(await migrated.countStockMovements(), 2);
        expect(await migrated.countOutboxOperations(), 2);
        expect(
          (await migrated.customSelect('PRAGMA user_version').getSingle())
              .read<int>('user_version'),
          11,
        );
      } finally {
        await migrated.close();
      }
      ShopBackup.verifySnapshot(old, expectedSchemaVersion: 11);
    },
  );

  test('v11 backup preserves custom and disabled low-stock alerts', () async {
    final source = ShopDatabase(NativeDatabase.memory());
    try {
      await source.addProduct(
        id: 'custom',
        name: 'Rice',
        priceMmk: 12000,
        openingStock: 8,
      );
      await source.addProduct(
        id: 'off',
        name: 'Water',
        priceMmk: 1000,
        openingStock: 2,
      );
      await source.setReorderLevel(
        productId: 'custom',
        expectedReorderLevel: 5,
        reorderLevel: 12,
      );
      await source.setReorderLevel(
        productId: 'off',
        expectedReorderLevel: 5,
        reorderLevel: null,
      );
      final export = File('${directory.path}/alerts.smbak');
      await ShopBackup.exportEncrypted(
        database: source,
        archive: export,
        password: _password,
        scratchRoot: directory,
      );
      final restored = File('${directory.path}/alerts-restored.sqlite');
      await ShopBackup.restoreIntoEmptyDatabase(
        archive: export,
        target: restored,
        password: _password,
      );
      ShopBackup.verifySnapshot(restored, expectedSchemaVersion: 11);
      final reopened = ShopDatabase(NativeDatabase(restored));
      try {
        final products = {
          for (final item in await reopened.readActiveProducts()) item.id: item,
        };
        expect(products['custom']?.reorderLevel, 12);
        expect(products['off']?.reorderLevel, isNull);
        expect(products['custom']?.onHand, 8);
        expect(products['off']?.onHand, 2);
      } finally {
        await reopened.close();
      }
    } finally {
      await source.close();
    }
  });

  test('v11 snapshot rejects a same-name no-op audit trigger', () async {
    final corrupt = File('${directory.path}/noop-audit-trigger.sqlite');
    await database.exportVerifiedLocalSnapshot(corrupt);
    final connection = sqlite3.open(corrupt.path);
    try {
      connection.execute('DROP TRIGGER shop_sale_reversals_no_update');
      connection.execute('''
        CREATE TRIGGER shop_sale_reversals_no_update
        BEFORE UPDATE ON shop_sale_reversals BEGIN SELECT 1; END
      ''');
    } finally {
      connection.close();
    }
    expect(
      () => ShopBackup.verifySnapshot(corrupt, expectedSchemaVersion: 11),
      throwsFormatException,
    );
  });

  test(
    'authenticated v11 restore rejects an extra executable trigger',
    () async {
      final corrupt = File('${directory.path}/extra-audit-trigger.sqlite');
      await database.exportVerifiedLocalSnapshot(corrupt);
      final connection = sqlite3.open(corrupt.path);
      try {
        connection.execute('''
        CREATE TRIGGER unexpected_product_insert
        AFTER INSERT ON shop_products BEGIN SELECT 1; END
      ''');
      } finally {
        connection.close();
      }
      await _expectAuthenticatedRestoreRejected(
        directory: directory,
        snapshot: corrupt,
        stem: 'extra-audit-trigger',
        schemaVersion: 11,
      );
    },
  );

  test(
    'authenticated v11 restore preserves quoted CHECK literal case',
    () async {
      final corrupt = File('${directory.path}/changed-check-literal.sqlite');
      await database.exportVerifiedLocalSnapshot(corrupt);
      final connection = sqlite3.open(corrupt.path);
      try {
        connection.execute('PRAGMA writable_schema = ON');
        connection.execute(
          "UPDATE sqlite_master SET sql = replace(sql, ?, ?) "
          "WHERE type = 'table' AND name = 'shop_sale_reversals'",
          ["'wavepay'", "'WAVEPAY'"],
        );
        expect(
          connection
              .select(
                "SELECT sql FROM sqlite_master "
                "WHERE type = 'table' AND name = 'shop_sale_reversals'",
              )
              .single['sql'],
          contains("'WAVEPAY'"),
        );
        connection.execute('PRAGMA writable_schema = OFF');
      } finally {
        connection.close();
      }
      await _expectAuthenticatedRestoreRejected(
        directory: directory,
        snapshot: corrupt,
        stem: 'changed-check-literal',
        schemaVersion: 11,
      );
    },
  );

  test(
    'authenticated v11 restore rejects changed audit column types',
    () async {
      final corrupt = File('${directory.path}/changed-audit-column.sqlite');
      await database.exportVerifiedLocalSnapshot(corrupt);
      final connection = sqlite3.open(corrupt.path);
      try {
        connection.execute('PRAGMA writable_schema = ON');
        connection.execute(
          "UPDATE sqlite_master SET sql = replace(sql, ?, ?) "
          "WHERE type = 'table' AND name = 'shop_cash_shifts'",
          ['cash_reversal_count INTEGER', 'cash_reversal_count TEXT'],
        );
        connection.execute('PRAGMA writable_schema = OFF');
      } finally {
        connection.close();
      }
      await _expectAuthenticatedRestoreRejected(
        directory: directory,
        snapshot: corrupt,
        stem: 'changed-audit-column',
        schemaVersion: 11,
      );
    },
  );

  test('v11 snapshots reject missing or invalid alert settings', () async {
    final missing = File('${directory.path}/missing-reorder.sqlite');
    await database.exportVerifiedLocalSnapshot(missing);
    final missingConnection = sqlite3.open(missing.path);
    try {
      missingConnection.execute(
        'ALTER TABLE shop_products DROP COLUMN reorder_level',
      );
    } finally {
      missingConnection.close();
    }
    expect(() => ShopBackup.verifySnapshot(missing), throwsFormatException);

    final invalid = File('${directory.path}/invalid-reorder.sqlite');
    await database.exportVerifiedLocalSnapshot(invalid);
    final invalidConnection = sqlite3.open(invalid.path);
    try {
      invalidConnection.execute('UPDATE shop_products SET reorder_level = -1');
    } finally {
      invalidConnection.close();
    }
    expect(() => ShopBackup.verifySnapshot(invalid), throwsFormatException);
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

  test('v11 snapshot rejects a malformed pending wallet basket', () async {
    final corrupt = File('${directory.path}/malformed-wallet.sqlite');
    await database.exportVerifiedLocalSnapshot(corrupt);
    final connection = sqlite3.open(corrupt.path);
    try {
      connection.execute(
        "UPDATE shop_wallet_checkout_intents SET basket_json = '[]' "
        "WHERE state = 'pending'",
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

  test(
    'an existing rollback journal blocks restore and is never removed',
    () async {
      final target = File('${directory.path}/rollback.sqlite');
      final journal = File('${target.path}-journal');
      await journal.writeAsString('another database owns this');
      await expectLater(
        ShopBackup.restoreIntoEmptyDatabase(
          archive: archive,
          target: target,
          password: _password,
        ),
        throwsStateError,
      );
      expect(await target.exists(), isFalse);
      expect(await journal.readAsString(), 'another database owns this');
    },
  );

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
      throwsA(isA<FileSystemException>()),
    );
    expect(await target.readAsString(), 'another Shop instance');
    expect(await wal.readAsString(), 'its WAL');
    expect(await ShopBackup.restoreMarkerFor(target).exists(), isTrue);
    await _expectNoScratch(directory);
  });

  for (final suffix in const ['-journal', '-wal', '-shm']) {
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

  test('Drift opens the restored private database after install', () async {
    final documents = await Directory.systemTemp.createTemp('shop-drift-');
    ShopDatabase? reopened;
    try {
      await ShopBackup.restoreIntoEmptyDatabase(
        archive: archive,
        target: ShopDatabase.privateDatabaseFile(documents),
        password: _password,
      );
      reopened = ShopDatabase.inPrivateDocuments(documents);
      expect((await reopened.readActiveProducts()).single.onHand, 3);
      expect(await reopened.countSales(), 1);
    } finally {
      await reopened?.close();
      await documents.delete(recursive: true);
    }
  });

  testWidgets('fresh install restores before Shop opens', (tester) async {
    final documents = Directory.systemTemp.createTempSync('shop-first-run-');
    try {
      await tester.pumpWidget(
        ShopStartup(
          documents: documents,
          importScratchRoot: documents,
          initialMyanmar: false,
          pickBackup: () async => XFile(archive.path),
          buildShop: (_, _) =>
              const MaterialApp(home: Scaffold(body: Text('Opened Shop'))),
        ),
      );
      await _pumpUntil(tester, find.text('Start new Shop'));
      expect(find.text('Start new Shop'), findsOneWidget);
      expect(tester.widget<Text>(find.text('Start Shop')).style?.fontSize, 30);
      final startButton = find.widgetWithText(FilledButton, 'Start new Shop');
      expect(tester.getSize(startButton).height, greaterThanOrEqualTo(48));
      expect(ShopDatabase.privateDatabaseFile(documents).existsSync(), isFalse);
      await tester.tap(find.text('Restore backup'));
      await _pumpUntil(tester, find.text('Restore and open Shop'));
      expect(ShopDatabase.privateDatabaseFile(documents).existsSync(), isFalse);
      await tester.enterText(find.byType(TextField), _password);
      await tester.tap(find.text('Restore and open Shop'));
      await _pumpUntil(tester, find.text('Opened Shop'));
      await tester.pump(const Duration(milliseconds: 1));
      expect(find.text('Opened Shop'), findsOneWidget);
      final restoredFile = ShopDatabase.privateDatabaseFile(documents);
      expect(restoredFile.existsSync(), isTrue);
      ShopBackup.verifySnapshot(restoredFile);
      final restored = sqlite3.open(restoredFile.path, mode: OpenMode.readOnly);
      try {
        final products = restored.select(
          'SELECT on_hand FROM shop_products WHERE id = ?',
          ['rice'],
        );
        final sales = restored.select('SELECT COUNT(*) AS n FROM shop_sales');
        expect(products.single['on_hand'], 3);
        expect(sales.single['n'], 1);
      } finally {
        restored.close();
      }
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      // The static builder never queries the lazy executor; the normal-async
      // Drift reopen test above verifies opening, querying, and closing it.
      documents.deleteSync(recursive: true);
    }
  });

  testWidgets('Start new reserves the exact Drift database path', (
    tester,
  ) async {
    final documents = Directory.systemTemp.createTempSync('shop-new-');
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
      await tester.pump(const Duration(milliseconds: 1));
      expect(find.text('Opened Shop'), findsOneWidget);
      expect(ShopDatabase.privateDatabaseFile(documents).existsSync(), isTrue);
      expect(opened, isNotNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      // The static builder does not open Drift's lazy executor.
      documents.deleteSync(recursive: true);
    }
  });

  testWidgets('wrong password keeps restore choice and local data empty', (
    tester,
  ) async {
    final documents = Directory.systemTemp.createTempSync('shop-wrong-pass-');
    try {
      await tester.pumpWidget(
        ShopStartup(
          documents: documents,
          importScratchRoot: documents,
          initialMyanmar: false,
          pickBackup: () async => XFile(archive.path),
          buildShop: (_, _) =>
              const MaterialApp(home: Scaffold(body: Text('Opened Shop'))),
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
      expect(ShopDatabase.privateDatabaseFile(documents).existsSync(), isFalse);
      await tester.enterText(find.byType(TextField), _password);
      await tester.tap(find.text('Restore and open Shop'));
      await _pumpUntil(tester, find.text('Opened Shop'));
      await tester.pump(const Duration(milliseconds: 1));
      expect(find.text('Opened Shop'), findsOneWidget);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      documents.deleteSync(recursive: true);
    }
  });

  testWidgets('cancelled restore cannot create a Shop database', (
    tester,
  ) async {
    final documents = Directory.systemTemp.createTempSync('shop-cancel-');
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
      expect(ShopDatabase.privateDatabaseFile(documents).existsSync(), isFalse);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      documents.deleteSync(recursive: true);
    }
  });

  testWidgets('existing Shop opens without offering restore', (tester) async {
    final documents = Directory.systemTemp.createTempSync('shop-existing-');
    ShopDatabase? opened;
    try {
      await tester.runAsync(
        () => ShopBackup.restoreIntoEmptyDatabase(
          archive: archive,
          target: ShopDatabase.privateDatabaseFile(documents),
          password: _password,
        ),
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
      await tester.pump(const Duration(milliseconds: 1));
      expect(find.text('Opened Shop'), findsOneWidget);
      expect(find.text('Restore backup'), findsNothing);
      expect(opened, isNotNull);
      ShopBackup.verifySnapshot(ShopDatabase.privateDatabaseFile(documents));
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      // The static builder does not open Drift's lazy executor.
      documents.deleteSync(recursive: true);
    }
  });

  testWidgets('orphaned WAL blocks first-run actions without deletion', (
    tester,
  ) async {
    final documents = Directory.systemTemp.createTempSync('shop-orphan-wal-');
    try {
      final target = ShopDatabase.privateDatabaseFile(documents);
      final sidecar = File('${target.path}-wal');
      sidecar.writeAsStringSync('preserve this file');
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
      expect(sidecar.readAsStringSync(), 'preserve this file');
      expect(target.existsSync(), isFalse);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      documents.deleteSync(recursive: true);
    }
  });

  testWidgets(
    'orphaned rollback journal blocks first-run actions without deletion',
    (tester) async {
      final documents = Directory.systemTemp.createTempSync(
        'shop-orphan-journal-',
      );
      try {
        final target = ShopDatabase.privateDatabaseFile(documents);
        final sidecar = File('${target.path}-journal');
        sidecar.writeAsStringSync('preserve this file');
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
        expect(sidecar.readAsStringSync(), 'preserve this file');
        expect(target.existsSync(), isFalse);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        documents.deleteSync(recursive: true);
      }
    },
  );

  testWidgets('published recovery marker blocks opening an existing Shop', (
    tester,
  ) async {
    final documents = Directory.systemTemp.createTempSync('shop-marked-');
    var opened = false;
    try {
      final target = ShopDatabase.privateDatabaseFile(documents);
      await tester.runAsync(
        () => ShopBackup.restoreIntoEmptyDatabase(
          archive: archive,
          target: target,
          password: _password,
        ),
      );
      ShopBackup.restoreMarkerFor(target).writeAsStringSync('interrupted');
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
      expect(target.existsSync(), isTrue);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      documents.deleteSync(recursive: true);
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

  test(
    'authenticated incomplete Shop schema fails before publication',
    () async {
      final incomplete = File('${directory.path}/incomplete-schema.sqlite');
      await database.exportVerifiedLocalSnapshot(incomplete);
      final connection = sqlite3.open(incomplete.path);
      try {
        connection.execute(
          'ALTER TABLE shop_wallet_checkout_intents '
          'RENAME COLUMN request_fingerprint TO legacy_fingerprint',
        );
      } finally {
        connection.close();
      }
      final incompleteArchive = File(
        '${directory.path}/incomplete-schema.smbak',
      );
      await _writeAuthenticatedArchive(
        incompleteArchive,
        await incomplete.readAsBytes(),
      );
      final target = File(
        '${directory.path}/incomplete-schema-restored.sqlite',
      );
      await expectLater(
        ShopBackup.restoreIntoEmptyDatabase(
          archive: incompleteArchive,
          target: target,
          password: _password,
        ),
        throwsFormatException,
      );
      expect(await target.exists(), isFalse);
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

void _removeV11ObjectsForLegacyFixture(Database connection) {
  connection.execute('DROP TABLE shop_wallet_reversal_reconciliations');
  connection.execute('DROP TABLE shop_sale_reversal_lines');
  connection.execute('DROP TABLE shop_sale_reversals');
  for (final table in const [
    'shop_sales',
    'shop_sale_lines',
    'shop_stock_movements',
  ]) {
    connection.execute('DROP TRIGGER ${table}_no_update');
    connection.execute('DROP TRIGGER ${table}_no_delete');
  }
  for (final column in const [
    'cash_reversal_count',
    'cash_reversal_total_mmk',
    'cash_drawer_outflow_mmk',
    'review_cash_reversal_count',
    'review_cash_drawer_outflow_mmk',
  ]) {
    connection.execute('ALTER TABLE shop_cash_shifts DROP COLUMN $column');
  }
}

ShopCorrectionAuthorization _backupAuthorization(
  String commandDigest, {
  required String capability,
  required String receiptId,
}) {
  final now = DateTime.now().millisecondsSinceEpoch;
  final issuedAtMillis = now - 1000;
  final expiresAtMillis = now + const Duration(minutes: 5).inMilliseconds;
  const workspaceId = 'workspace-backup-test';
  const actorId = 'owner-backup-test';
  const actorLabel = 'Backup test owner';
  const actorRole = 'owner';
  const source = 'managed_membership_receipt_v1';
  return ShopCorrectionAuthorization(
    receiptId: receiptId,
    receiptDigest: shopCorrectionAuthorizationReceiptDigest(
      source: source,
      receiptId: receiptId,
      workspaceId: workspaceId,
      actorId: actorId,
      actorLabel: actorLabel,
      actorRole: actorRole,
      capability: capability,
      commandDigest: commandDigest,
      issuedAtMillis: issuedAtMillis,
      expiresAtMillis: expiresAtMillis,
    ),
    workspaceId: workspaceId,
    actorId: actorId,
    actorLabel: actorLabel,
    actorRole: actorRole,
    capability: capability,
    source: source,
    commandDigest: commandDigest,
    issuedAtMillis: issuedAtMillis,
    expiresAtMillis: expiresAtMillis,
  );
}

Future<void> _writeWalletReversalSnapshot(
  File target, {
  bool reconciled = false,
}) async {
  final source = ShopDatabase(NativeDatabase.memory());
  try {
    await source.addProduct(
      id: 'verifier-wallet-product',
      name: 'Verifier Tea',
      priceMmk: 1500,
      openingStock: 3,
    );
    const lines = [
      ShopSaleLineInput(productId: 'verifier-wallet-product', quantity: 2),
    ];
    await source.createWalletCheckoutIntent(
      operationId: 'verifier-wallet-sale',
      merchant: MerchantWalletSetup(
        provider: 'KBZPay',
        merchantPhone: null,
        officialQrPayload: _syntheticStaticMmqr(),
        issuerConfirmed: true,
      ),
      lines: lines,
    );
    final sale = await source.recordSale(
      operationId: 'verifier-wallet-sale',
      lines: lines,
      paymentMethod: 'kbzpay',
      walletCheckoutOperationId: 'verifier-wallet-sale',
    );
    final reversal = await source.previewFullSaleReversal(
      operationId: 'verifier-wallet-reversal',
      saleId: sale.id,
      restockItems: true,
      reason: 'Verifier full wallet return',
      confirmCashReturned: false,
    );
    await source.recordAuthorizedFullSaleReversal(
      command: reversal,
      authorization: _backupAuthorization(
        reversal.commandDigest,
        capability: 'shop.sale.reverse',
        receiptId: 'verifier-wallet-reversal-receipt',
      ),
    );
    if (reconciled) {
      final reconciliation = await source.previewWalletReconciliation(
        operationId: 'verifier-wallet-reconciliation',
        reversalId: reversal.operationId,
        outcome: 'money_returned',
        evidenceReference: 'Provider reference verifier-1',
      );
      await source.recordAuthorizedWalletReconciliation(
        command: reconciliation,
        authorization: _backupAuthorization(
          reconciliation.commandDigest,
          capability: 'shop.sale.reconcile_wallet',
          receiptId: 'verifier-wallet-reconciliation-receipt',
        ),
      );
    }
    await source.exportVerifiedLocalSnapshot(target);
  } finally {
    await source.close();
  }
}

Future<ShopDatabase> _closedCashReversalDatabase() async {
  final source = ShopDatabase(NativeDatabase.memory());
  try {
    await source.addProduct(
      id: 'verifier-cash-product',
      name: 'Verifier Rice',
      priceMmk: 1500,
      openingStock: 3,
    );
    final shift = await source.openCashShift(
      operationId: 'verifier-cash-open',
      operatorLabel: 'Backup verifier',
      openingFloatMmk: 5000,
    );
    final sale = await source.recordCashSale(
      operationId: 'verifier-cash-sale',
      lines: const [
        ShopSaleLineInput(productId: 'verifier-cash-product', quantity: 2),
      ],
    );
    final reversal = await source.previewFullSaleReversal(
      operationId: 'verifier-cash-reversal',
      saleId: sale.id,
      restockItems: true,
      reason: 'Verifier full cash return',
      confirmCashReturned: true,
    );
    await source.recordAuthorizedFullSaleReversal(
      command: reversal,
      authorization: _backupAuthorization(
        reversal.commandDigest,
        capability: 'shop.sale.reverse',
        receiptId: 'verifier-cash-reversal-receipt',
      ),
    );
    final review = await source.readCashShiftReview(shift.id);
    await source.closeCashShift(
      shiftId: shift.id,
      operationId: 'verifier-cash-close',
      seenSaleCount: review.saleCount,
      seenCashTotalMmk: review.cashSalesTotalMmk,
      seenCashReversalCount: review.cashReversalCount,
      seenCashDrawerOutflowMmk: review.cashDrawerOutflowMmk,
      countedCashMmk: review.expectedCashMmk,
    );
    return source;
  } catch (_) {
    await source.close();
    rethrow;
  }
}

void _mutateImmutableAuditRow(
  Database connection, {
  required String table,
  required void Function() mutate,
}) {
  connection.execute('DROP TRIGGER ${table}_no_update');
  mutate();
  connection.execute(
    shopImmutableTriggerV11Sql(
      table: table,
      operation: 'update',
      message: 'Shop reversal audit records are immutable',
    ),
  );
}

Future<void> _expectAuthenticatedRestoreRejected({
  required Directory directory,
  required File snapshot,
  required String stem,
  required int schemaVersion,
}) async {
  final archive = File('${directory.path}/$stem.smbak');
  await _writeAuthenticatedArchive(
    archive,
    await snapshot.readAsBytes(),
    schemaVersion: schemaVersion,
  );
  final target = File('${directory.path}/$stem-restored.sqlite');
  await expectLater(
    ShopBackup.restoreIntoEmptyDatabase(
      archive: archive,
      target: target,
      password: _password,
    ),
    throwsFormatException,
  );
  expect(await target.exists(), isFalse);
  await _expectNoScratch(directory);
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

String _syntheticStaticMmqr() {
  String field(String id, String value) =>
      '$id${utf8.encode(value).length.toString().padLeft(2, '0')}$value';

  final merchant = [
    field('00', 'MM.COM.MMQR'),
    field('01', '999999999999999'),
    field('02', '000000'),
  ].join();
  final language = [field('00', 'my'), field('01', 'ဆိုင်')].join();
  final body = [
    field('00', '01'),
    field('01', '11'),
    field('26', merchant),
    field('52', '5411'),
    field('53', '104'),
    field('58', 'MM'),
    field('59', 'TEST STORE'),
    field('60', 'Yangon'),
    field('64', language),
    '6304',
  ].join();
  var crc = 0xffff;
  for (final byte in utf8.encode(body)) {
    crc ^= byte << 8;
    for (var bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) != 0 ? ((crc << 1) ^ 0x1021) : crc << 1;
      crc &= 0xffff;
    }
  }
  return '$body${crc.toRadixString(16).toUpperCase().padLeft(4, '0')}';
}
