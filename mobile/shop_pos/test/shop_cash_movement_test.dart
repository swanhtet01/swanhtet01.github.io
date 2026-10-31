import 'dart:convert';
import 'dart:io';

import 'package:cryptography/cryptography.dart';
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart';
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_database.dart';

import 'managed_staff_test_support.dart';

const _keyId = 'shop-test-2026';
const _publicKey = 'A6EHv_POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg';
final _verifier = ShopCorrectionReceiptVerifier({_keyId: _publicKey});
final _clock = DateTime.fromMillisecondsSinceEpoch(2000000000000);

void main() {
  test('owner-authorized cash movements are durable and idempotent', () async {
    final database = _database(NativeDatabase.memory());
    try {
      await _attach(database);
      final shift = await database.openManagedTestCashShift(
        operationId: 'movement-shift-open',
        operatorLabel: 'Synthetic cashier',
        openingFloatMmk: 10000,
      );
      final cashIn = await database.prepareCashMovementCommand(
        operationId: 'movement-cash-in',
        shiftId: shift.id,
        kind: 'cash_in',
        amountMmk: 5000,
        reason: 'float_top_up',
      );
      final cashInAuthorization = await _authorization(
        cashIn,
        receiptId: '11111111-1111-4111-8111-111111111111',
      );
      final recorded = await database.recordCashMovement(
        command: cashIn,
        authorization: cashInAuthorization,
      );
      final replay = await database.recordCashMovement(
        command: cashIn,
        authorization: cashInAuthorization,
      );
      expect(replay.id, recorded.id);

      final changed = await database.prepareCashMovementCommand(
        operationId: cashIn.operationId,
        shiftId: shift.id,
        kind: 'cash_in',
        amountMmk: 6000,
        reason: 'float_top_up',
      );
      await expectLater(
        database.recordCashMovement(
          command: changed,
          authorization: await _authorization(
            changed,
            receiptId: '22222222-2222-4222-8222-222222222222',
          ),
        ),
        throwsStateError,
      );

      final cashOut = await database.prepareCashMovementCommand(
        operationId: 'movement-cash-out',
        shiftId: shift.id,
        kind: 'cash_out',
        amountMmk: 3000,
        reason: 'petty_cash_expense',
      );
      await database.recordCashMovement(
        command: cashOut,
        authorization: await _authorization(
          cashOut,
          receiptId: '33333333-3333-4333-8333-333333333333',
        ),
      );
      final review = await database.readCashShiftReview(shift.id);
      expect(review.cashMovementCount, 2);
      expect(review.cashInTotalMmk, 5000);
      expect(review.cashOutTotalMmk, 3000);
      expect(review.expectedCashMmk, 12000);
      await expectLater(
        database.closeManagedTestCashShift(
          shiftId: shift.id,
          operationId: 'movement-stale-close',
          seenSaleCount: review.saleCount,
          seenCashTotalMmk: review.cashSalesTotalMmk,
          seenCashMovementCount: 0,
          seenCashInTotalMmk: 0,
          seenCashOutTotalMmk: 0,
          countedCashMmk: 12000,
        ),
        throwsStateError,
      );
      final closed = await database.closeManagedTestCashShift(
        shiftId: shift.id,
        operationId: 'movement-close',
        seenSaleCount: review.saleCount,
        seenCashTotalMmk: review.cashSalesTotalMmk,
        seenCashMovementCount: review.cashMovementCount,
        seenCashInTotalMmk: review.cashInTotalMmk,
        seenCashOutTotalMmk: review.cashOutTotalMmk,
        countedCashMmk: 12000,
      );
      expect(closed.cashMovementCount, 2);
      expect(closed.differenceMmk, 0);
      expect(await database.readCashMovements(shift.id), hasLength(2));
      expect(
        await database
            .customSelect(
              "SELECT COUNT(*) AS total FROM shop_sync_outbox WHERE event_type = 'shop.cash_shift.movement_recorded.v1'",
            )
            .getSingle()
            .then((row) => row.read<int>('total')),
        2,
      );
      await expectLater(
        database.customUpdate(
          "UPDATE shop_cash_movements SET reason = 'other'",
        ),
        throwsA(anything),
      );
      await expectLater(
        database.customUpdate('DELETE FROM shop_cash_movements'),
        throwsA(anything),
      );
    } finally {
      await database.close();
    }
  });

  test('cash movement and outbox roll back together', () async {
    final database = _database(NativeDatabase.memory());
    try {
      await _attach(database);
      final shift = await database.openManagedTestCashShift(
        operationId: 'movement-abort-open',
        operatorLabel: 'Synthetic cashier',
        openingFloatMmk: 10000,
      );
      final command = await database.prepareCashMovementCommand(
        operationId: 'movement-abort',
        shiftId: shift.id,
        kind: 'cash_out',
        amountMmk: 1000,
        reason: 'bank_deposit',
      );
      await database.customStatement(
        "CREATE TRIGGER synthetic_movement_outbox_abort BEFORE INSERT ON shop_sync_outbox WHEN NEW.event_type = 'shop.cash_shift.movement_recorded.v1' BEGIN SELECT RAISE(ABORT, 'synthetic outbox failure'); END",
      );
      await expectLater(
        database.recordCashMovement(
          command: command,
          authorization: await _authorization(
            command,
            receiptId: '44444444-4444-4444-8444-444444444444',
          ),
        ),
        throwsA(anything),
      );
      expect(await database.readCashMovements(shift.id), isEmpty);
      expect(
        (await database.readCashShiftReview(shift.id)).expectedCashMmk,
        10000,
      );
    } finally {
      await database.close();
    }
  });

  test(
    'cash movement authority cannot cross immutable store identity',
    () async {
      final source = _database(NativeDatabase.memory());
      final foreign = _database(NativeDatabase.memory());
      try {
        await _attach(source);
        await _attach(foreign);
        final sourceShift = await source.openManagedTestCashShift(
          operationId: 'cross-store-open',
          operatorLabel: 'Synthetic cashier',
          openingFloatMmk: 10000,
        );
        final foreignShift = await foreign.openManagedTestCashShift(
          operationId: 'cross-store-open',
          operatorLabel: 'Synthetic cashier',
          openingFloatMmk: 10000,
        );
        expect(foreignShift.id, sourceShift.id);
        expect(
          await foreign.readStoreRef(),
          isNot(await source.readStoreRef()),
        );
        final command = await source.prepareCashMovementCommand(
          operationId: 'cross-store-movement',
          shiftId: sourceShift.id,
          kind: 'cash_in',
          amountMmk: 1000,
          reason: 'float_top_up',
        );
        await expectLater(
          foreign.recordCashMovement(
            command: command,
            authorization: await _authorization(
              command,
              receiptId: 'abababab-abab-4bab-8bab-abababababab',
            ),
          ),
          throwsStateError,
        );
        expect(await foreign.readCashMovements(foreignShift.id), isEmpty);
      } finally {
        await source.close();
        await foreign.close();
      }
    },
  );

  test(
    'direct readiness rejects tampered closed movement review totals',
    () async {
      final database = _database(NativeDatabase.memory());
      try {
        await _attach(database);
        final shift = await database.openManagedTestCashShift(
          operationId: 'movement-tamper-open',
          operatorLabel: 'Synthetic cashier',
          openingFloatMmk: 10000,
        );
        final command = await database.prepareCashMovementCommand(
          operationId: 'movement-tamper-in',
          shiftId: shift.id,
          kind: 'cash_in',
          amountMmk: 1000,
          reason: 'float_top_up',
        );
        await database.recordCashMovement(
          command: command,
          authorization: await _authorization(
            command,
            receiptId: 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd',
          ),
        );
        final review = await database.readCashShiftReview(shift.id);
        await database.closeManagedTestCashShift(
          shiftId: shift.id,
          operationId: 'movement-tamper-close',
          seenSaleCount: 0,
          seenCashTotalMmk: 0,
          seenCashMovementCount: review.cashMovementCount,
          seenCashInTotalMmk: review.cashInTotalMmk,
          seenCashOutTotalMmk: review.cashOutTotalMmk,
          countedCashMmk: review.expectedCashMmk,
        );
        await database.customUpdate(
          'UPDATE shop_cash_shifts SET review_cash_in_total_mmk = 999 '
          'WHERE id = ?',
          variables: [Variable<String>(shift.id)],
        );
        await expectLater(database.verifyReadyForUse(), throwsStateError);
      } finally {
        await database.close();
      }
    },
  );

  test(
    'v17 migrates atomically and encrypted restore preserves movement',
    () async {
      final root = await Directory.systemTemp.createTemp('shop-cash-v18-');
      final store = File('${root.path}/shop.sqlite');
      final restored = File('${root.path}/restored.sqlite');
      final archive = File('${root.path}/shop.smbk');
      final scratch = Directory('${root.path}/scratch');
      try {
        var database = _database(NativeDatabase(store));
        await database.verifyReadyForUse();
        await database.close();
        _downgradeEmptyV18ToV17(store);
        ShopBackup.verifyRuntimeStore(store);
        database = _database(NativeDatabase(store));
        await _attach(database);
        final shift = await database.openManagedTestCashShift(
          operationId: 'movement-backup-open',
          operatorLabel: 'Synthetic cashier',
          openingFloatMmk: 20000,
        );
        final command = await database.prepareCashMovementCommand(
          operationId: 'movement-backup-in',
          shiftId: shift.id,
          kind: 'cash_in',
          amountMmk: 5000,
          reason: 'float_top_up',
        );
        await database.recordCashMovement(
          command: command,
          authorization: await _authorization(
            command,
            receiptId: '55555555-5555-4555-8555-555555555555',
          ),
        );
        await ShopBackup.exportEncrypted(
          database: database,
          archive: archive,
          scratchRoot: scratch,
          password: 'cash-movement-test-password',
        );
        await database.close();
        await ShopBackup.restoreIntoEmptyDatabase(
          archive: archive,
          target: restored,
          password: 'cash-movement-test-password',
          correctionReceiptVerifier: _verifier,
        );
        final reopened = _database(NativeDatabase(restored));
        try {
          final movements = await reopened.readCashMovements(shift.id);
          expect(movements, hasLength(1));
          expect(movements.single.amountMmk, 5000);
          expect(
            (await reopened.readCashShiftReview(shift.id)).expectedCashMmk,
            25000,
          );
        } finally {
          await reopened.close();
        }
      } finally {
        if (await root.exists()) await root.delete(recursive: true);
      }
    },
  );

  test('production verifier and closed shift fail before mutation', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _attach(database);
      final shift = await database.openManagedTestCashShift(
        operationId: 'movement-closed-open',
        operatorLabel: 'Synthetic cashier',
        openingFloatMmk: 10000,
      );
      final review = await database.readCashShiftReview(shift.id);
      await database.closeManagedTestCashShift(
        shiftId: shift.id,
        operationId: 'movement-closed-close',
        seenSaleCount: 0,
        seenCashTotalMmk: 0,
        countedCashMmk: review.expectedCashMmk,
      );
      final command = await database.prepareCashMovementCommand(
        operationId: 'movement-closed-write',
        shiftId: shift.id,
        kind: 'cash_in',
        amountMmk: 1000,
        reason: 'other',
      );
      await expectLater(
        database.recordCashMovement(
          command: command,
          authorization: await _authorization(
            command,
            receiptId: '66666666-6666-4666-8666-666666666666',
          ),
        ),
        throwsStateError,
      );
      expect(await database.readCashMovements(shift.id), isEmpty);
    } finally {
      await database.close();
    }
  });
}

ShopDatabase _database(QueryExecutor executor) =>
    ShopDatabase.withCorrectionReceiptVerifier(
      executor: executor,
      correctionReceiptVerifier: _verifier,
      testOnlySaleAndCashShiftClock: () => _clock,
    );

Future<void> _attach(ShopDatabase database) =>
    database.attachAuthenticatedManagedWorkspace(
      const ShopAuthenticatedWorkspaceSelection(
        workspaceId: 'workspace-shop-test',
        actorId: 'owner-test',
      ),
    );

Future<ShopCorrectionAuthorization> _authorization(
  ShopCashMovementCommand command, {
  required String receiptId,
}) async {
  final issued = _clock.millisecondsSinceEpoch - 1000;
  final expires = issued + const Duration(minutes: 5).inMilliseconds;
  const finalizationRequestId = '77777777-7777-4777-8777-777777777777';
  const source = 'managed_membership_receipt_v1';
  final digest = shopCorrectionAuthorizationReceiptDigest(
    source: source,
    receiptId: receiptId,
    workspaceId: 'workspace-shop-test',
    actorId: 'owner-test',
    actorLabel: 'Synthetic owner',
    actorRole: 'owner',
    capability: 'shop.cash_shift.move',
    commandDigest: command.commandDigest,
    finalizationRequestId: finalizationRequestId,
    finalizedAtMillis: issued,
    issuedAtMillis: issued,
    expiresAtMillis: expires,
  );
  final keyPair = await Ed25519().newKeyPairFromSeed(
    List<int>.generate(32, (index) => index),
  );
  final signature = await Ed25519().sign(
    utf8.encode(
      shopCorrectionAuthorizationSignatureMessage(
        keyId: _keyId,
        receiptDigest: digest,
      ),
    ),
    keyPair: keyPair,
  );
  return ShopCorrectionAuthorization(
    contract: shopCorrectionAuthorizationReceiptContract,
    receiptId: receiptId,
    receiptDigest: digest,
    workspaceId: 'workspace-shop-test',
    actorId: 'owner-test',
    actorLabel: 'Synthetic owner',
    actorRole: 'owner',
    capability: 'shop.cash_shift.move',
    source: source,
    commandDigest: command.commandDigest,
    finalizationRequestId: finalizationRequestId,
    finalizedAtMillis: issued,
    issuedAtMillis: issued,
    expiresAtMillis: expires,
    keyId: _keyId,
    signature: base64Url.encode(signature.bytes).replaceAll('=', ''),
  );
}

void _downgradeEmptyV18ToV17(File store) {
  final connection = sqlite3.open(store.path);
  try {
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
            : 'TRIGGER'} ${definition.key}',
      );
    }
    for (final definition
        in shopCafeCancellationSchemaDefinitionsV20().entries
            .toList()
            .reversed) {
      final type = shopSchemaObjectTypeForDefinition(definition.value);
      connection.execute(
        'DROP ${type == 'table'
            ? 'TABLE'
            : type == 'index'
            ? 'INDEX'
            : 'TRIGGER'} ${definition.key}',
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
            : 'TRIGGER'} ${definition.key}',
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
            : 'TRIGGER'} ${definition.key}',
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
    connection.execute('PRAGMA user_version = 17');
  } finally {
    connection.close();
  }
}
