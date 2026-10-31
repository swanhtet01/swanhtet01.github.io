import 'dart:convert';
import 'dart:io';

import 'package:cryptography/cryptography.dart';
import 'package:drift/drift.dart' show Variable;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart';
import 'package:supermega_shop/shop_database.dart';

import 'managed_staff_test_support.dart';

import 'package:supermega_shop/shop_models.dart';
import 'package:supermega_shop/shop_operational_export.dart';

const _testKeyId = 'shop-export-test-2026';
const _testPublicKey = 'A6EHv_POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg';

void main() {
  test('closed-shift snapshot reads linked sale, line, movement and totals without mutation', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: '0099999999999',
        name: 'လက်ဖက်၊ "အထူး"',
        priceMmk: 2500,
        openingStock: 10,
        barcode: '0099999999999',
      );
      final openingMovement = await database
          .customSelect(
            "SELECT created_at_millis FROM shop_stock_movements "
            "WHERE reason = 'opening_stock'",
          )
          .getSingle();
      final openingMovementAt = openingMovement.read<int>('created_at_millis');
      while (DateTime.now().millisecondsSinceEpoch <= openingMovementAt) {
        await Future<void>.delayed(const Duration(milliseconds: 1));
      }
      final shift = await database.openManagedTestCashShift(
        operationId: 'export-open-1',
        operatorLabel: 'May',
        openingFloatMmk: 10000,
      );
      final receipt = await database.recordManagedTestCashSale(
        operationId: 'export-sale-1',
        lines: const [
          ShopSaleLineInput(productId: '0099999999999', quantity: 2),
        ],
      );

      await expectLater(
        database.readClosedCashShiftOperationalExport(shift.id),
        throwsA(
          isA<StateError>().having(
            (error) => error.message,
            'message',
            'shop_closed_shift_snapshot_incomplete',
          ),
        ),
      );

      final review = await database.readCashShiftReview(shift.id);
      final closed = await database.closeManagedTestCashShift(
        shiftId: shift.id,
        operationId: 'export-close-1',
        seenSaleCount: review.saleCount,
        seenCashTotalMmk: review.cashSalesTotalMmk,
        countedCashMmk: 14900,
      );
      final salesBefore = await database.countSales();
      final movementsBefore = await database.countStockMovements();
      final outboxBefore = await database.countOutboxOperations();

      final snapshot = await database.readClosedCashShiftOperationalExport(
        shift.id,
      );

      expect(snapshot.shift.id, shift.id);
      expect(snapshot.shift.isClosed, isTrue);
      expect(snapshot.shift.closedAtMillis, closed.closedAtMillis);
      expect(snapshot.shift.cashSalesCount, 1);
      expect(snapshot.shift.cashSalesTotalMmk, 5000);
      expect(snapshot.shift.walletSalesCount, 0);
      expect(snapshot.shift.walletSalesTotalMmk, 0);
      expect(snapshot.shift.expectedCashMmk, 15000);
      expect(snapshot.shift.countedCashMmk, 14900);
      expect(snapshot.shift.differenceMmk, -100);
      expect(snapshot.sales, hasLength(1));
      expect(snapshot.sales.single.id, receipt.id);
      expect(snapshot.sales.single.totalMmk, 5000);
      expect(snapshot.sales.single.lines, hasLength(1));
      final line = snapshot.sales.single.lines.single;
      expect(line.productId, '0099999999999');
      expect(line.productName, 'လက်ဖက်၊ "အထူး"');
      expect(line.quantity, 2);
      expect(line.unitPriceMmk, 2500);
      expect(line.lineTotalMmk, 5000);
      expect(snapshot.stockMovements, hasLength(1));
      final movement = snapshot.stockMovements.single;
      expect(movement.saleId, receipt.id);
      expect(movement.productId, '0099999999999');
      expect(movement.quantityDelta, -2);
      expect(movement.reason, 'cash_sale');
      expect(snapshot.reversals, isEmpty);
      expect(snapshot.walletReconciliations, isEmpty);

      expect(await database.countSales(), salesBefore);
      expect(await database.countStockMovements(), movementsBefore);
      expect(await database.countOutboxOperations(), outboxBefore);
    } finally {
      await database.close();
    }
  });

  test(
    'v15 upgrade member-linked CSV omits member card and linkage internals',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'shop-member-export-v15-',
      );
      final source = ShopDatabase(NativeDatabase.memory());
      final snapshotFile = File('${directory.path}/legacy-v15.sqlite');
      try {
        await source.addProduct(
          id: 'member-export-product',
          name: 'Member export product',
          priceMmk: 3000,
          openingStock: 2,
        );
        await source.exportVerifiedLocalSnapshot(snapshotFile);
      } finally {
        await source.close();
      }

      final raw = sqlite3.open(snapshotFile.path);
      try {
        _removePostV15SchemaObjects(raw);
        raw.execute('PRAGMA user_version = 15');
      } finally {
        raw.close();
      }

      final database = ShopDatabase(NativeDatabase(snapshotFile));
      const memberId = 'mem_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const displayCode = '00004567';
      final memberToken = _memberToken(17);
      try {
        await database.verifyReadyForUse();
        expect(database.schemaVersion, 22);
        final storeRef = await database.readStoreRef();
        await _seedPseudonymousMember(
          database,
          memberId: memberId,
          displayCode: displayCode,
          token: memberToken,
        );
        final tokenDigest = await _memberDigest(memberToken);
        final shift = await database.openManagedTestCashShift(
          operationId: 'member-export-open',
          operatorLabel: 'May',
          openingFloatMmk: 5000,
        );
        final sale = await database.recordManagedTestSale(
          operationId: 'member-export-sale',
          lines: const [
            ShopSaleLineInput(productId: 'member-export-product', quantity: 1),
          ],
          paymentMethod: 'cash',
          memberCardToken: memberToken,
        );
        expect((await database.readSaleMember(sale.id))?.memberId, memberId);
        final review = await database.readCashShiftReview(shift.id);
        await database.closeManagedTestCashShift(
          shiftId: shift.id,
          operationId: 'member-export-close',
          seenSaleCount: review.saleCount,
          seenCashTotalMmk: review.cashSalesTotalMmk,
          countedCashMmk: review.expectedCashMmk,
        );
        final salesBefore = await database.countSales();
        final stockBefore = await database.countStockMovements();
        final outboxBefore = await database.countOutboxOperations();
        final linksBefore =
            (await database
                    .customSelect(
                      'SELECT COUNT(*) AS count FROM shop_sale_member_links',
                    )
                    .getSingle())
                .read<int>('count');

        final encoded = const ShopOperationalExporter().encode(
          await database.readClosedCashShiftOperationalExport(shift.id),
        );
        final csv = utf8.decode(encoded.bytes.sublist(3));
        expect(csv, contains(sale.id));
        expect(csv, contains('Member export product'));
        expect(csv, contains('3000'));
        for (final privateValue in [
          memberId,
          displayCode,
          memberToken,
          tokenDigest,
          storeRef,
        ]) {
          expect(csv, isNot(contains(privateValue)));
        }
        for (final header in shopOperationalExportHeaders) {
          expect(
            header,
            isNot(
              matches(
                RegExp(r'member|card|token|digest|revision|linkage|store_ref'),
              ),
            ),
          );
        }
        expect(await database.countSales(), salesBefore);
        expect(await database.countStockMovements(), stockBefore);
        expect(await database.countOutboxOperations(), outboxBefore);
        expect(
          (await database
                  .customSelect(
                    'SELECT COUNT(*) AS count FROM shop_sale_member_links',
                  )
                  .getSingle())
              .read<int>('count'),
          linksBefore,
        );
      } finally {
        await database.close();
        await directory.delete(recursive: true);
      }
    },
  );

  test('closed-shift snapshot projects signed wallet correction without private proof fields', () async {
    final database = ShopDatabase.withCorrectionReceiptVerifier(
      executor: NativeDatabase.memory(),
      correctionReceiptVerifier: ShopCorrectionReceiptVerifier({
        _testKeyId: _testPublicKey,
      }),
      testOnlyAllowUnconsumedAuthorization: true,
    );
    try {
      await database.attachAuthenticatedManagedWorkspace(
        const ShopAuthenticatedWorkspaceSelection(
          workspaceId: 'workspace-export-test',
          actorId: 'owner-export-test',
        ),
      );
      await database.addProduct(
        id: 'wallet-product',
        name: 'ရေသန့်',
        priceMmk: 1000,
        openingStock: 5,
      );
      final shift = await database.openManagedTestCashShift(
        operationId: 'wallet-export-open',
        operatorLabel: 'May',
        openingFloatMmk: 10000,
      );
      const lines = [
        ShopSaleLineInput(productId: 'wallet-product', quantity: 1),
      ];
      await database.createWalletCheckoutIntent(
        operationId: 'wallet-export-sale',
        merchant: MerchantWalletSetup(
          provider: 'KBZPay',
          merchantPhone: '09999999999',
          officialQrPayload: _syntheticStaticMmqr(),
          issuerConfirmed: true,
        ),
        lines: lines,
      );
      final sale = await database.recordManagedTestSale(
        operationId: 'wallet-export-sale',
        lines: lines,
        paymentMethod: 'kbzpay',
        walletCheckoutOperationId: 'wallet-export-sale',
      );
      final reversalCommand = await database.previewFullSaleReversal(
        operationId: 'wallet-export-reversal',
        saleId: sale.id,
        restockItems: true,
        reason: 'Duplicate wallet sale',
        confirmCashReturned: false,
      );
      final reversalAuthorization = await _authorization(
        commandDigest: reversalCommand.commandDigest,
        capability: 'shop.sale.reverse',
        receiptId: 'wallet-export-reversal-receipt',
      );
      final reversal = await database.recordAuthorizedFullSaleReversal(
        command: reversalCommand,
        authorization: reversalAuthorization,
      );
      final reconciliationCommand = await database.previewWalletReconciliation(
        operationId: 'wallet-export-reconciliation',
        reversalId: reversal.id,
        outcome: 'money_returned',
        evidenceReference: ' =HYPERLINK("https://evil.invalid")',
      );
      final reconciliationAuthorization = await _authorization(
        commandDigest: reconciliationCommand.commandDigest,
        capability: 'shop.sale.reconcile_wallet',
        receiptId: 'wallet-export-reconciliation-receipt',
      );
      await database.recordAuthorizedWalletReconciliation(
        command: reconciliationCommand,
        authorization: reconciliationAuthorization,
      );
      expect(
        (await database.recordAuthorizedFullSaleReversal(
          command: reversalCommand,
          authorization: reversalAuthorization,
        )).id,
        reversal.id,
      );
      expect(
        (await database.recordAuthorizedWalletReconciliation(
          command: reconciliationCommand,
          authorization: reconciliationAuthorization,
        )).id,
        reversal.id,
      );
      final review = await database.readCashShiftReview(shift.id);
      await database.closeManagedTestCashShift(
        shiftId: shift.id,
        operationId: 'wallet-export-close',
        seenSaleCount: review.saleCount,
        seenCashTotalMmk: review.cashSalesTotalMmk,
        countedCashMmk: review.expectedCashMmk,
      );

      final salesBefore = await database.countSales();
      final movementsBefore = await database.countStockMovements();
      final outboxBefore = await database.countOutboxOperations();
      final snapshot = await database.readClosedCashShiftOperationalExport(
        shift.id,
      );

      expect(snapshot.shift.walletSalesCount, 1);
      expect(snapshot.shift.walletSalesTotalMmk, 1000);
      expect(snapshot.shift.cashReversalCount, 0);
      expect(snapshot.shift.cashDrawerOutflowMmk, 0);
      expect(snapshot.reversals, hasLength(1));
      expect(snapshot.reversals.single.id, reversal.id);
      expect(snapshot.reversals.single.lines.single.restockQuantity, 1);
      expect(snapshot.walletReconciliations, hasLength(1));
      expect(
        snapshot.walletReconciliations.single.outcome,
        ShopOperationalWalletOutcome.moneyReturned,
      );
      expect(
        snapshot.walletReconciliations.single.evidenceReference,
        '=HYPERLINK("https://evil.invalid")',
      );
      final encoded = const ShopOperationalExporter().encode(snapshot);
      final reconciliationRow = encoded.rows.singleWhere(
        (row) => row['row_type'] == 'wallet_reconciliation',
      );
      expect(
        shopOperationalSpreadsheetSafeText(
          reconciliationRow['evidence_reference']!,
        ),
        '\'=HYPERLINK("https://evil.invalid")',
      );
      final csv = utf8.decode(encoded.bytes.sublist(3));
      expect(csv, contains('merchant_recorded_money_returned'));
      expect(csv, isNot(contains('workspace-export-test')));
      expect(csv, isNot(contains('owner-export-test')));
      expect(csv, isNot(contains('09999999999')));
      expect(csv, isNot(contains('wallet-export-reversal-receipt')));
      expect(csv, isNot(contains(reversalCommand.commandDigest)));
      expect(csv, isNot(contains(_syntheticStaticMmqr())));
      expect(await database.countSales(), salesBefore);
      expect(await database.countStockMovements(), movementsBefore);
      expect(await database.countOutboxOperations(), outboxBefore);
    } finally {
      await database.close();
    }
  });
}

String _memberToken(int seed) {
  final bytes = List<int>.generate(32, (index) => (seed + index) & 0xff);
  return 'SMC1.${base64Url.encode(bytes).replaceAll('=', '')}';
}

Future<String> _memberDigest(String token) async {
  final digest = await Sha256().hash(
    utf8.encode('supermega.shop.member-card.lookup.v1\u0000$token'),
  );
  return digest.bytes
      .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
      .join();
}

Future<void> _seedPseudonymousMember(
  ShopDatabase database, {
  required String memberId,
  required String displayCode,
  required String token,
}) async {
  final storeRef = await database.readStoreRef();
  const now = 1_800_000_000_000;
  await database.customInsert(
    'INSERT INTO shop_members '
    '(id, store_ref, display_code, status, created_at_millis, updated_at_millis) '
    'VALUES (?, ?, ?, ?, ?, ?)',
    variables: [
      Variable<String>(memberId),
      Variable<String>(storeRef),
      Variable<String>(displayCode),
      const Variable<String>('active'),
      const Variable<int>(now),
      const Variable<int>(now),
    ],
  );
  await database.customInsert(
    'INSERT INTO shop_member_cards '
    '(token_digest, member_id, revision, state, issued_at_millis, '
    'retired_at_millis) VALUES (?, ?, 1, ?, ?, NULL)',
    variables: [
      Variable<String>(await _memberDigest(token)),
      Variable<String>(memberId),
      const Variable<String>('active'),
      const Variable<int>(now),
    ],
  );
}

Future<ShopCorrectionAuthorization> _authorization({
  required String commandDigest,
  required String capability,
  required String receiptId,
}) async {
  final issuedAtMillis = DateTime.now().millisecondsSinceEpoch - 1000;
  final expiresAtMillis =
      issuedAtMillis + const Duration(minutes: 5).inMilliseconds;
  const workspaceId = 'workspace-export-test';
  const actorId = 'owner-export-test';
  const actorLabel = 'Export test owner';
  const actorRole = 'owner';
  const source = 'managed_membership_receipt_v1';
  const finalizationRequestId = '55555555-5555-4555-8555-555555555555';
  final receiptDigest = shopCorrectionAuthorizationReceiptDigest(
    source: source,
    receiptId: receiptId,
    workspaceId: workspaceId,
    actorId: actorId,
    actorLabel: actorLabel,
    actorRole: actorRole,
    capability: capability,
    commandDigest: commandDigest,
    finalizationRequestId: finalizationRequestId,
    finalizedAtMillis: issuedAtMillis,
    issuedAtMillis: issuedAtMillis,
    expiresAtMillis: expiresAtMillis,
  );
  final keyPair = await Ed25519().newKeyPairFromSeed(
    List<int>.generate(32, (index) => index),
  );
  final signed = await Ed25519().sign(
    utf8.encode(
      shopCorrectionAuthorizationSignatureMessage(
        keyId: _testKeyId,
        receiptDigest: receiptDigest,
      ),
    ),
    keyPair: keyPair,
  );
  return ShopCorrectionAuthorization(
    contract: shopCorrectionAuthorizationReceiptContract,
    receiptId: receiptId,
    receiptDigest: receiptDigest,
    workspaceId: workspaceId,
    actorId: actorId,
    actorLabel: actorLabel,
    actorRole: actorRole,
    capability: capability,
    source: source,
    commandDigest: commandDigest,
    finalizationRequestId: finalizationRequestId,
    finalizedAtMillis: issuedAtMillis,
    issuedAtMillis: issuedAtMillis,
    expiresAtMillis: expiresAtMillis,
    keyId: _testKeyId,
    signature: base64Url.encode(signed.bytes).replaceAll('=', ''),
  );
}

void _removePostV15SchemaObjects(Database connection) {
  connection.execute('ALTER TABLE shop_sales DROP COLUMN cash_tendered_mmk');
  for (final definition
      in shopPendingCashCheckoutSchemaDefinitionsV21().entries
          .toList()
          .reversed) {
    final type = shopSchemaObjectTypeForDefinition(definition.value);
    connection.execute(
      'DROP ${type == 'table'
          ? 'TABLE'
          : type == 'index'
          ? 'INDEX'
          : 'TRIGGER'} IF EXISTS ${definition.key}',
    );
  }
  for (final definition
      in shopCafeCancellationSchemaDefinitionsV20().entries.toList().reversed) {
    final type = shopSchemaObjectTypeForDefinition(definition.value);
    connection.execute(
      'DROP ${type == 'table'
          ? 'TABLE'
          : type == 'index'
          ? 'INDEX'
          : 'TRIGGER'} IF EXISTS ${definition.key}',
    );
  }
  for (final definition
      in shopCafeOrderSchemaDefinitionsV19().entries.toList().reversed) {
    final type = shopSchemaObjectTypeForDefinition(definition.value);
    connection.execute(
      'DROP ${type == 'table'
          ? 'TABLE'
          : type == 'index'
          ? 'INDEX'
          : 'TRIGGER'} IF EXISTS ${definition.key}',
    );
  }
  for (final definition
      in shopCashMovementSchemaDefinitionsV18().entries.toList().reversed) {
    final type = shopSchemaObjectTypeForDefinition(definition.value);
    connection.execute(
      'DROP ${type == 'table'
          ? 'TABLE'
          : type == 'index'
          ? 'INDEX'
          : 'TRIGGER'} IF EXISTS ${definition.key}',
    );
  }
  for (final column in const [
    'review_cash_out_total_mmk',
    'review_cash_in_total_mmk',
    'review_cash_movement_count',
    'cash_out_total_mmk',
    'cash_in_total_mmk',
    'cash_movement_count',
  ]) {
    connection.execute('ALTER TABLE shop_cash_shifts DROP COLUMN $column');
  }
  for (final trigger in const [
    'shop_sale_reversals_require_consumption',
    'shop_wallet_reconciliations_require_consumption',
    'shop_correction_lineage_state_guard_update',
    'shop_correction_lineage_state_no_delete',
    'shop_correction_consumption_intents_no_update',
    'shop_correction_consumption_intents_no_delete',
    'shop_correction_consumptions_no_update',
    'shop_correction_consumptions_no_delete',
  ]) {
    connection.execute('DROP TRIGGER IF EXISTS $trigger');
  }
  for (final table in const [
    'shop_correction_consumptions',
    'shop_correction_consumption_intents',
    'shop_correction_lineage_state',
  ]) {
    connection.execute('DROP TABLE IF EXISTS $table');
  }
  for (final table in const [
    'shop_wallet_checkout_member_links',
    'shop_sale_member_links',
    'shop_member_cards',
    'shop_members',
    'shop_store_identity',
  ]) {
    connection.execute('DROP TABLE IF EXISTS $table');
  }
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
  return '$body${_crc16(utf8.encode(body))}';
}

String _crc16(List<int> bytes) {
  var crc = 0xffff;
  for (final byte in bytes) {
    crc ^= byte << 8;
    for (var bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) != 0 ? ((crc << 1) ^ 0x1021) : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toRadixString(16).toUpperCase().padLeft(4, '0');
}
