import 'dart:convert';
import 'dart:io';

import 'package:cryptography/cryptography.dart';
import 'package:drift/drift.dart' show QueryExecutor, Variable;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart';
import 'package:supermega_shop/shop_cafe_order_contract.dart';
import 'package:supermega_shop/shop_cafe_order_store.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_models.dart';

import 'managed_staff_test_support.dart';

const _operationId = 'synthetic-process-interrupt-sale';
const _productId = 'synthetic-process-interrupt-product';
const _stockOperationId = 'synthetic-process-interrupt-stock';
const _shiftOpenOperationId = 'synthetic-process-interrupt-shift-open';
const _shiftCloseOperationId = 'synthetic-process-interrupt-shift-close';
const _cashMovementOperationId = 'synthetic-process-interrupt-cash-movement';
const _cashMovementShiftOpenOperationId =
    'synthetic-process-interrupt-cash-movement-open';
const _cashReversalShiftOpenOperationId =
    'synthetic-process-interrupt-cash-reversal-open';
const _cashReversalSaleOperationId =
    'synthetic-process-interrupt-cash-reversal-sale';
const _cashReversalOperationId = 'synthetic-process-interrupt-cash-reversal';
const _walletCancelOperationId = 'synthetic-process-interrupt-wallet-cancel';
const _walletResumeOperationId = 'synthetic-process-interrupt-wallet-resume';
const _cafeOrderId = 'synthetic-process-interrupt-cafe-order';
const _cafeCommandId = 'synthetic-process-interrupt-cafe-command';
const _cafeSaleOperationId = 'synthetic-process-interrupt-cafe-sale';
const _cashMovementKeyId = 'shop-test-2026';
const _cashMovementPublicKey = 'A6EHv_POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg';
final _cashMovementClock = DateTime.fromMillisecondsSinceEpoch(2000000000000);
final _cashMovementVerifier = ShopCorrectionReceiptVerifier({
  _cashMovementKeyId: _cashMovementPublicKey,
});

void main() {
  final phase = Platform.environment['SUPERMEGA_PROCESS_INTERRUPT_PHASE'] ?? '';
  final databasePath =
      Platform.environment['SUPERMEGA_PROCESS_INTERRUPT_DATABASE'] ?? '';
  final markerPath =
      Platform.environment['SUPERMEGA_PROCESS_INTERRUPT_MARKER'] ?? '';
  final authorizationIssuedAt = int.tryParse(
    Platform.environment['SUPERMEGA_PROCESS_INTERRUPT_AUTH_ISSUED_AT'] ?? '',
  );

  test(
    'synthetic process interruption worker',
    () async {
      if (!const {
        'kill_during_transaction',
        'verify_rolled_back',
        'kill_after_commit',
        'verify_committed',
        'kill_stock_during_transaction',
        'verify_stock_rolled_back',
        'kill_stock_after_commit',
        'verify_stock_committed',
        'kill_shift_close_during_transaction',
        'verify_shift_close_rolled_back',
        'kill_shift_close_after_commit',
        'verify_shift_close_committed',
        'kill_cash_movement_during_transaction',
        'verify_cash_movement_rolled_back',
        'kill_cash_movement_after_commit',
        'verify_cash_movement_committed',
        'kill_cafe_sale_during_transaction',
        'verify_cafe_sale_rolled_back',
        'kill_cafe_sale_after_commit',
        'verify_cafe_sale_committed',
        'kill_cash_reversal_during_transaction',
        'verify_cash_reversal_rolled_back',
        'kill_cash_reversal_after_commit',
        'verify_cash_reversal_committed',
        'kill_wallet_cancel_during_transaction',
        'verify_wallet_cancel_rolled_back',
        'kill_wallet_cancel_after_commit',
        'verify_wallet_cancel_committed',
      }.contains(phase)) {
        fail('Unsupported process-interruption phase.');
      }
      if (databasePath.isEmpty ||
          markerPath.isEmpty ||
          authorizationIssuedAt == null) {
        fail('Process-interruption paths are required.');
      }
      final databaseFile = File(databasePath);
      final markerFile = File(markerPath);
      switch (phase) {
        case 'kill_during_transaction':
          await _killDuringTransaction(databaseFile, markerFile);
        case 'verify_rolled_back':
          await _verifyRolledBack(databaseFile);
        case 'kill_after_commit':
          await _killAfterCommit(databaseFile, markerFile);
        case 'verify_committed':
          await _verifyCommitted(databaseFile);
        case 'kill_stock_during_transaction':
          await _killStockDuringTransaction(databaseFile, markerFile);
        case 'verify_stock_rolled_back':
          await _verifyStockRolledBack(databaseFile);
        case 'kill_stock_after_commit':
          await _killStockAfterCommit(databaseFile, markerFile);
        case 'verify_stock_committed':
          await _verifyStockCommitted(databaseFile);
        case 'kill_shift_close_during_transaction':
          await _killShiftCloseDuringTransaction(databaseFile, markerFile);
        case 'verify_shift_close_rolled_back':
          await _verifyShiftCloseRolledBack(databaseFile);
        case 'kill_shift_close_after_commit':
          await _killShiftCloseAfterCommit(databaseFile, markerFile);
        case 'verify_shift_close_committed':
          await _verifyShiftCloseCommitted(databaseFile);
        case 'kill_cash_movement_during_transaction':
          await _killCashMovementDuringTransaction(databaseFile, markerFile);
        case 'verify_cash_movement_rolled_back':
          await _verifyCashMovementRolledBack(databaseFile);
        case 'kill_cash_movement_after_commit':
          await _killCashMovementAfterCommit(databaseFile, markerFile);
        case 'verify_cash_movement_committed':
          await _verifyCashMovementCommitted(databaseFile);
        case 'kill_cafe_sale_during_transaction':
          await _killCafeSaleDuringTransaction(databaseFile, markerFile);
        case 'verify_cafe_sale_rolled_back':
          await _verifyCafeSaleRolledBack(databaseFile);
        case 'kill_cafe_sale_after_commit':
          await _killCafeSaleAfterCommit(databaseFile, markerFile);
        case 'verify_cafe_sale_committed':
          await _verifyCafeSaleCommitted(databaseFile);
        case 'kill_cash_reversal_during_transaction':
          await _killCashReversalDuringTransaction(
            databaseFile,
            markerFile,
            authorizationIssuedAt,
          );
        case 'verify_cash_reversal_rolled_back':
          await _verifyCashReversalRolledBack(
            databaseFile,
            authorizationIssuedAt,
          );
        case 'kill_cash_reversal_after_commit':
          await _killCashReversalAfterCommit(
            databaseFile,
            markerFile,
            authorizationIssuedAt,
          );
        case 'verify_cash_reversal_committed':
          await _verifyCashReversalCommitted(
            databaseFile,
            authorizationIssuedAt,
          );
        case 'kill_wallet_cancel_during_transaction':
          await _killWalletCancelDuringTransaction(databaseFile, markerFile);
        case 'verify_wallet_cancel_rolled_back':
          await _verifyWalletCancelRolledBack(databaseFile);
        case 'kill_wallet_cancel_after_commit':
          await _killWalletCancelAfterCommit(databaseFile, markerFile);
        case 'verify_wallet_cancel_committed':
          await _verifyWalletCancelCommitted(databaseFile);
      }
    },
    skip: phase.isEmpty
        ? 'Run only through scripts/test_shop_process_interruption.py.'
        : false,
    timeout: const Timeout(Duration(minutes: 10)),
  );
}

Future<void> _killWalletCancelDuringTransaction(File file, File marker) async {
  final database = ShopDatabase(
    NativeDatabase(
      file,
      setup: (sqlite) {
        sqlite.createFunction(
          functionName: 'synthetic_interrupt_checkpoint',
          argumentCount: const AllowedArgumentCount(0),
          directOnly: false,
          function: (_) {
            marker.writeAsStringSync('wallet-cancel-draft-before-commit');
            sleep(const Duration(minutes: 5));
            return 1;
          },
        );
      },
    ),
  );
  await _initializeWalletCancel(database);
  await database.customStatement(
    'CREATE TEMP TRIGGER synthetic_process_interrupt_wallet_cancel_draft '
    'AFTER INSERT ON shop_counter_drafts '
    "WHEN NEW.operation_id = '$_walletResumeOperationId' "
    'BEGIN SELECT synthetic_interrupt_checkpoint(); END',
  );
  await database.cancelWalletCheckoutIntent(
    _walletCancelOperationId,
    resumeOperationId: _walletResumeOperationId,
  );
  fail('The parent process did not terminate the wallet cancellation worker.');
}

Future<void> _killWalletCancelAfterCommit(File file, File marker) async {
  final database = ShopDatabase(NativeDatabase(file));
  await _initializeWalletCancel(database);
  expect(
    await database.cancelWalletCheckoutIntent(
      _walletCancelOperationId,
      resumeOperationId: _walletResumeOperationId,
    ),
    isTrue,
  );
  marker.writeAsStringSync('wallet-cancel-committed-before-reply');
  sleep(const Duration(minutes: 5));
  fail('The parent process did not terminate the committed wallet worker.');
}

Future<void> _verifyWalletCancelRolledBack(File file) async {
  final database = ShopDatabase(NativeDatabase(file));
  try {
    expect(await _walletCancelState(database), _walletCancelPendingState);
    expect(
      await database.cancelWalletCheckoutIntent(
        _walletCancelOperationId,
        resumeOperationId: _walletResumeOperationId,
      ),
      isTrue,
    );
    expect(await _walletCancelState(database), _walletCancelCommittedState);
    expect(
      await database.cancelWalletCheckoutIntent(
        _walletCancelOperationId,
        resumeOperationId: _walletResumeOperationId,
      ),
      isFalse,
    );
    expect(await _walletCancelState(database), _walletCancelCommittedState);
  } finally {
    await database.close();
  }
}

Future<void> _verifyWalletCancelCommitted(File file) async {
  final database = ShopDatabase(NativeDatabase(file));
  try {
    expect(await _walletCancelState(database), _walletCancelCommittedState);
    expect(
      await database.cancelWalletCheckoutIntent(
        _walletCancelOperationId,
        resumeOperationId: _walletResumeOperationId,
      ),
      isFalse,
    );
    expect(await _walletCancelState(database), _walletCancelCommittedState);
  } finally {
    await database.close();
  }
}

Future<void> _initializeWalletCancel(ShopDatabase database) async {
  await database.addProduct(
    id: _productId,
    name: 'Synthetic tea',
    priceMmk: 2500,
    openingStock: 2,
  );
  await database.saveCounterSaleDraft(
    operationId: _walletCancelOperationId,
    quantities: const {_productId: 1},
  );
  await database.createWalletCheckoutIntent(
    operationId: _walletCancelOperationId,
    merchant: MerchantWalletSetup(
      provider: 'KBZPay',
      merchantPhone: null,
      officialQrPayload: _syntheticStaticMmqr(),
      issuerConfirmed: true,
    ),
    lines: const [ShopSaleLineInput(productId: _productId, quantity: 1)],
  );
}

Future<Map<String, Object?>> _walletCancelState(ShopDatabase database) async {
  Future<int> count(String table, String where) async =>
      (await database
              .customSelect('SELECT COUNT(*) AS n FROM $table WHERE $where')
              .getSingle())
          .read<int>('n');
  final draft = await database.readCounterSaleDraft();
  final product = (await database.readActiveProducts()).single;
  return {
    'pending': await count(
      'shop_wallet_checkout_intents',
      "operation_id = '$_walletCancelOperationId' AND state = 'pending'",
    ),
    'cancelled': await count(
      'shop_wallet_checkout_intents',
      "operation_id = '$_walletCancelOperationId' AND state = 'cancelled'",
    ),
    'draftOperationId': draft?.operationId,
    'draftQuantity': draft?.quantities[_productId],
    'sales': await database.countSales(),
    'stockMovements': await database.countStockMovements(),
    'outbox': await database.countOutboxOperations(),
    'stock': product.onHand,
  };
}

const _walletCancelPendingState = <String, Object?>{
  'pending': 1,
  'cancelled': 0,
  'draftOperationId': null,
  'draftQuantity': null,
  'sales': 0,
  'stockMovements': 1,
  'outbox': 1,
  'stock': 2,
};

const _walletCancelCommittedState = <String, Object?>{
  'pending': 0,
  'cancelled': 1,
  'draftOperationId': _walletResumeOperationId,
  'draftQuantity': 1,
  'sales': 0,
  'stockMovements': 1,
  'outbox': 1,
  'stock': 2,
};

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
  return '$body${_testCrc16(utf8.encode(body))}';
}

String _testCrc16(List<int> bytes) {
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

Future<void> _killCashReversalDuringTransaction(
  File file,
  File marker,
  int authorizationIssuedAt,
) async {
  final database = _cashReversalDatabase(
    NativeDatabase(
      file,
      setup: (sqlite) {
        sqlite.createFunction(
          functionName: 'synthetic_interrupt_checkpoint',
          argumentCount: const AllowedArgumentCount(0),
          directOnly: false,
          function: (_) {
            marker.writeAsStringSync('cash-reversal-outbox-before-commit');
            sleep(const Duration(minutes: 5));
            return 1;
          },
        );
      },
    ),
  );
  final reversal = await _initializeCashReversal(
    database,
    authorizationIssuedAt,
  );
  await database.customStatement(
    'CREATE TEMP TRIGGER synthetic_process_interrupt_cash_reversal_outbox '
    'AFTER INSERT ON shop_sync_outbox '
    "WHEN NEW.operation_id = '$_cashReversalOperationId' "
    'BEGIN SELECT synthetic_interrupt_checkpoint(); END',
  );
  await database.recordAuthorizedFullSaleReversal(
    command: reversal.$1,
    authorization: reversal.$2,
  );
  fail('The parent process did not terminate the cash reversal worker.');
}

Future<void> _killCashReversalAfterCommit(
  File file,
  File marker,
  int authorizationIssuedAt,
) async {
  final database = _cashReversalDatabase(NativeDatabase(file));
  final reversal = await _initializeCashReversal(
    database,
    authorizationIssuedAt,
  );
  await database.recordAuthorizedFullSaleReversal(
    command: reversal.$1,
    authorization: reversal.$2,
  );
  marker.writeAsStringSync('cash-reversal-committed-before-reply');
  sleep(const Duration(minutes: 5));
  fail('The parent process did not terminate the committed reversal worker.');
}

Future<void> _verifyCashReversalRolledBack(
  File file,
  int authorizationIssuedAt,
) async {
  final database = _cashReversalDatabase(NativeDatabase(file));
  try {
    expect(await _cashReversalState(database), _cashReversalEmptyState);
    final reversal = await _cashReversalRequest(
      database,
      authorizationIssuedAt,
    );
    final recorded = await database.recordAuthorizedFullSaleReversal(
      command: reversal.$1,
      authorization: reversal.$2,
    );
    expect(recorded.id, _cashReversalOperationId);
    expect(await _cashReversalState(database), _cashReversalCommittedState);
    final replay = await database.recordAuthorizedFullSaleReversal(
      command: reversal.$1,
      authorization: reversal.$2,
    );
    expect(replay.id, recorded.id);
    expect(await _cashReversalState(database), _cashReversalCommittedState);
  } finally {
    await database.close();
  }
}

Future<void> _verifyCashReversalCommitted(
  File file,
  int authorizationIssuedAt,
) async {
  final database = _cashReversalDatabase(NativeDatabase(file));
  try {
    expect(await _cashReversalState(database), _cashReversalCommittedState);
    final reversal = await _cashReversalRequest(
      database,
      authorizationIssuedAt,
    );
    final replay = await database.recordAuthorizedFullSaleReversal(
      command: reversal.$1,
      authorization: reversal.$2,
    );
    expect(replay.id, _cashReversalOperationId);
    expect(await _cashReversalState(database), _cashReversalCommittedState);
  } finally {
    await database.close();
  }
}

ShopDatabase _cashReversalDatabase(QueryExecutor executor) =>
    ShopDatabase.withCorrectionReceiptVerifier(
      executor: executor,
      correctionReceiptVerifier: _cashMovementVerifier,
      testOnlyAllowUnconsumedAuthorization: true,
    );

Future<(ShopFullSaleReversalCommand, ShopCorrectionAuthorization)>
_initializeCashReversal(
  ShopDatabase database,
  int authorizationIssuedAt,
) async {
  await database.attachAuthenticatedManagedWorkspace(
    const ShopAuthenticatedWorkspaceSelection(
      workspaceId: 'workspace-process-interrupt',
      actorId: 'owner-process-interrupt',
    ),
  );
  await database.addProduct(
    id: _productId,
    name: 'Synthetic tea',
    priceMmk: 2500,
    openingStock: 2,
  );
  await database.openManagedTestCashShift(
    operationId: _cashReversalShiftOpenOperationId,
    operatorLabel: 'Synthetic cashier',
    openingFloatMmk: 10000,
  );
  await database.recordManagedTestCashSale(
    operationId: _cashReversalSaleOperationId,
    lines: const [ShopSaleLineInput(productId: _productId, quantity: 1)],
  );
  return _cashReversalRequest(database, authorizationIssuedAt);
}

Future<(ShopFullSaleReversalCommand, ShopCorrectionAuthorization)>
_cashReversalRequest(ShopDatabase database, int authorizationIssuedAt) async {
  final command = await database.previewFullSaleReversal(
    operationId: _cashReversalOperationId,
    saleId: _cashReversalSaleOperationId,
    restockItems: true,
    reason: 'Synthetic full cash return',
    confirmCashReturned: true,
  );
  return (
    command,
    await _reversalAuthorization(command, authorizationIssuedAt),
  );
}

Future<ShopCorrectionAuthorization> _reversalAuthorization(
  ShopFullSaleReversalCommand command,
  int issuedAtMillis,
) async {
  final expiresAtMillis =
      issuedAtMillis + const Duration(minutes: 5).inMilliseconds;
  const receiptId = '77777777-7777-4777-8777-777777777777';
  const requestId = '66666666-6666-4666-8666-666666666666';
  const source = 'managed_membership_receipt_v1';
  final digest = shopCorrectionAuthorizationReceiptDigest(
    source: source,
    receiptId: receiptId,
    workspaceId: 'workspace-process-interrupt',
    actorId: 'owner-process-interrupt',
    actorLabel: 'Synthetic owner',
    actorRole: 'owner',
    capability: 'shop.sale.reverse',
    commandDigest: command.commandDigest,
    finalizationRequestId: requestId,
    finalizedAtMillis: issuedAtMillis,
    issuedAtMillis: issuedAtMillis,
    expiresAtMillis: expiresAtMillis,
  );
  final keyPair = await Ed25519().newKeyPairFromSeed(
    List<int>.generate(32, (index) => index),
  );
  final signature = await Ed25519().sign(
    utf8.encode(
      shopCorrectionAuthorizationSignatureMessage(
        keyId: _cashMovementKeyId,
        receiptDigest: digest,
      ),
    ),
    keyPair: keyPair,
  );
  return ShopCorrectionAuthorization(
    contract: shopCorrectionAuthorizationReceiptContract,
    receiptId: receiptId,
    receiptDigest: digest,
    workspaceId: 'workspace-process-interrupt',
    actorId: 'owner-process-interrupt',
    actorLabel: 'Synthetic owner',
    actorRole: 'owner',
    capability: 'shop.sale.reverse',
    source: source,
    commandDigest: command.commandDigest,
    finalizationRequestId: requestId,
    finalizedAtMillis: issuedAtMillis,
    issuedAtMillis: issuedAtMillis,
    expiresAtMillis: expiresAtMillis,
    keyId: _cashMovementKeyId,
    signature: base64Url.encode(signature.bytes).replaceAll('=', ''),
  );
}

Future<Map<String, int>> _cashReversalState(ShopDatabase database) async {
  Future<int> count(String table, String column, String value) async =>
      (await database
              .customSelect(
                'SELECT COUNT(*) AS n FROM $table WHERE $column = ?',
                variables: [Variable<String>(value)],
              )
              .getSingle())
          .read<int>('n');
  final shift = (await database.readOpenCashShift())!;
  final review = await database.readCashShiftReview(shift.id);
  final product = (await database.readActiveProducts()).single;
  return {
    'sales': await count(
      'shop_sales',
      'operation_id',
      _cashReversalSaleOperationId,
    ),
    'reversals': await count(
      'shop_sale_reversals',
      'operation_id',
      _cashReversalOperationId,
    ),
    'reversalLines': await count(
      'shop_sale_reversal_lines',
      'reversal_id',
      _cashReversalOperationId,
    ),
    'authorizationProofs': await count(
      'shop_correction_authorization_proofs',
      'local_operation_id',
      _cashReversalOperationId,
    ),
    'reversalMovements': await count(
      'shop_stock_movements',
      'id',
      '$_cashReversalOperationId:reversal:0',
    ),
    'reversalOutbox': await count(
      'shop_sync_outbox',
      'operation_id',
      _cashReversalOperationId,
    ),
    'onHand': product.onHand,
    'cashReversalCount': review.cashReversalCount,
    'cashReversalTotalMmk': review.cashReversalTotalMmk,
    'cashDrawerOutflowMmk': review.cashDrawerOutflowMmk,
    'expectedCashMmk': review.expectedCashMmk,
  };
}

const _cashReversalEmptyState = {
  'sales': 1,
  'reversals': 0,
  'reversalLines': 0,
  'authorizationProofs': 0,
  'reversalMovements': 0,
  'reversalOutbox': 0,
  'onHand': 1,
  'cashReversalCount': 0,
  'cashReversalTotalMmk': 0,
  'cashDrawerOutflowMmk': 0,
  'expectedCashMmk': 12500,
};

const _cashReversalCommittedState = {
  'sales': 1,
  'reversals': 1,
  'reversalLines': 1,
  'authorizationProofs': 1,
  'reversalMovements': 1,
  'reversalOutbox': 1,
  'onHand': 2,
  'cashReversalCount': 1,
  'cashReversalTotalMmk': 2500,
  'cashDrawerOutflowMmk': 2500,
  'expectedCashMmk': 10000,
};

Future<void> _killCafeSaleDuringTransaction(File file, File marker) async {
  final database = ShopDatabase(
    NativeDatabase(
      file,
      setup: (sqlite) {
        sqlite.createFunction(
          functionName: 'synthetic_interrupt_checkpoint',
          argumentCount: const AllowedArgumentCount(0),
          directOnly: false,
          function: (_) {
            marker.writeAsStringSync('cafe-sale-outbox-before-commit');
            sleep(const Duration(minutes: 5));
            return 1;
          },
        );
      },
    ),
  );
  final store = await _initializeCafeOrder(database);
  await database.customStatement(
    'CREATE TEMP TRIGGER synthetic_process_interrupt_cafe_outbox '
    'AFTER INSERT ON shop_sync_outbox '
    "WHEN NEW.operation_id = '$_cafeSaleOperationId' "
    'BEGIN SELECT synthetic_interrupt_checkpoint(); END',
  );
  await _completeCafeSale(store);
  fail('The parent process did not terminate the café transaction worker.');
}

Future<void> _killCafeSaleAfterCommit(File file, File marker) async {
  final database = ShopDatabase(NativeDatabase(file));
  final store = await _initializeCafeOrder(database);
  await _completeCafeSale(store);
  marker.writeAsStringSync('cafe-sale-committed-before-reply');
  sleep(const Duration(minutes: 5));
  fail('The parent process did not terminate the committed café worker.');
}

Future<void> _verifyCafeSaleRolledBack(File file) async {
  final database = ShopDatabase(NativeDatabase(file));
  try {
    final store = ShopCafeOrderStore(database);
    expect(await _cafeSaleState(database, store), _cafeSaleEmptyState);
    final receipt = await _completeCafeSale(store);
    expect(receipt.id, _cafeSaleOperationId);
    expect(await _cafeSaleState(database, store), _cafeSaleCommittedState);
    expect((await _completeCafeSale(store)).id, receipt.id);
    expect(await _cafeSaleState(database, store), _cafeSaleCommittedState);
  } finally {
    await database.close();
  }
}

Future<void> _verifyCafeSaleCommitted(File file) async {
  final database = ShopDatabase(NativeDatabase(file));
  try {
    final store = ShopCafeOrderStore(database);
    expect(await _cafeSaleState(database, store), _cafeSaleCommittedState);
    expect((await _completeCafeSale(store)).id, _cafeSaleOperationId);
    expect(await _cafeSaleState(database, store), _cafeSaleCommittedState);
  } finally {
    await database.close();
  }
}

Future<ShopCafeOrderStore> _initializeCafeOrder(ShopDatabase database) async {
  await database.addProduct(
    id: _productId,
    name: 'Synthetic tea',
    priceMmk: 2500,
    openingStock: 2,
  );
  final store = ShopCafeOrderStore(database);
  await store.applyCommand(
    CafeOrderCommand(
      id: _cafeCommandId,
      ticketId: _cafeOrderId,
      expectedVersion: 0,
      lines: [
        CafeOrderLine.local(
          id: 'synthetic-cafe-line',
          productId: _productId,
          quantity: 1,
          baseUnitPriceMmk: 2500,
          remark: 'less ice',
          modifiers: [
            CafeModifierSnapshot(
              id: 'soy',
              version: 1,
              labelEn: 'Soy milk',
              labelMy: 'ပဲနို့',
              priceDeltaMmk: 500,
            ),
          ],
        ),
      ],
    ),
    const {
      'soy@1': CafeModifierSnapshot(
        id: 'soy',
        version: 1,
        labelEn: 'Soy milk',
        labelMy: 'ပဲနို့',
        priceDeltaMmk: 500,
      ),
    },
  );
  await database.beginPendingCashCheckout(
    operationId: _cafeSaleOperationId,
    checkoutKind: 'cafe',
    subjectId: _cafeOrderId,
  );
  return store;
}

Future<ShopSaleReceipt> _completeCafeSale(ShopCafeOrderStore store) =>
    store.completeCash(
      orderId: _cafeOrderId,
      operationId: _cafeSaleOperationId,
      expectedTicketVersion: 1,
      expectedStateRevision: 0,
      requirePendingCashCheckout: true,
    );

Future<Map<String, Object?>> _cafeSaleState(
  ShopDatabase database,
  ShopCafeOrderStore store,
) async {
  Future<int> count(String table, String column) async =>
      (await database
              .customSelect(
                'SELECT COUNT(*) AS n FROM $table WHERE $column = ?',
                variables: [Variable<String>(_cafeSaleOperationId)],
              )
              .getSingle())
          .read<int>('n');
  final order = await store.read(_cafeOrderId);
  final product = (await database.readActiveProducts()).single;
  return {
    'state': order?.state,
    'revision': order?.stateRevision,
    'sales': await count('shop_sales', 'operation_id'),
    'lines': await count('shop_sale_lines', 'sale_id'),
    'movements': await count('shop_stock_movements', 'sale_id'),
    'outbox': await count('shop_sync_outbox', 'operation_id'),
    'pendingCash': await count('shop_pending_cash_checkouts', 'operation_id'),
    'onHand': product.onHand,
  };
}

const _cafeSaleEmptyState = {
  'state': 'open',
  'revision': 0,
  'sales': 0,
  'lines': 0,
  'movements': 0,
  'outbox': 0,
  'pendingCash': 1,
  'onHand': 2,
};

const _cafeSaleCommittedState = {
  'state': 'completed',
  'revision': 1,
  'sales': 1,
  'lines': 1,
  'movements': 1,
  'outbox': 1,
  'pendingCash': 0,
  'onHand': 1,
};

Future<void> _killCashMovementDuringTransaction(File file, File marker) async {
  final database = _cashMovementDatabase(
    NativeDatabase(
      file,
      setup: (sqlite) {
        sqlite.createFunction(
          functionName: 'synthetic_interrupt_checkpoint',
          argumentCount: const AllowedArgumentCount(0),
          directOnly: false,
          function: (_) {
            marker.writeAsStringSync('cash-movement-outbox-before-commit');
            sleep(const Duration(minutes: 5));
            return 1;
          },
        );
      },
    ),
  );
  final shift = await _initializeCashMovement(database);
  await database.customStatement(
    'CREATE TEMP TRIGGER synthetic_process_interrupt_cash_movement_outbox '
    'AFTER INSERT ON shop_sync_outbox '
    "WHEN NEW.operation_id = '$_cashMovementOperationId' "
    'BEGIN SELECT synthetic_interrupt_checkpoint(); END',
  );
  await _recordCashMovement(database, shift);
  fail('The parent process did not terminate the cash-movement worker.');
}

Future<void> _killCashMovementAfterCommit(File file, File marker) async {
  final database = _cashMovementDatabase(NativeDatabase(file));
  final shift = await _initializeCashMovement(database);
  await _recordCashMovement(database, shift);
  marker.writeAsStringSync('cash-movement-committed-before-reply');
  sleep(const Duration(minutes: 5));
  fail('The parent process did not terminate the committed movement worker.');
}

Future<void> _verifyCashMovementRolledBack(File file) async {
  final database = _cashMovementDatabase(NativeDatabase(file));
  try {
    final shift = (await database.readOpenCashShift())!;
    expect(await _cashMovementState(database), _cashMovementEmptyState);
    await _recordCashMovement(database, shift);
    expect(await _cashMovementState(database), _cashMovementCommittedState);
    await _recordCashMovement(database, shift);
    expect(await _cashMovementState(database), _cashMovementCommittedState);
  } finally {
    await database.close();
  }
}

Future<void> _verifyCashMovementCommitted(File file) async {
  final database = _cashMovementDatabase(NativeDatabase(file));
  try {
    final shift = (await database.readOpenCashShift())!;
    expect(await _cashMovementState(database), _cashMovementCommittedState);
    await _recordCashMovement(database, shift);
    expect(await _cashMovementState(database), _cashMovementCommittedState);
  } finally {
    await database.close();
  }
}

ShopDatabase _cashMovementDatabase(QueryExecutor executor) =>
    ShopDatabase.withCorrectionReceiptVerifier(
      executor: executor,
      correctionReceiptVerifier: _cashMovementVerifier,
      testOnlySaleAndCashShiftClock: () => _cashMovementClock,
    );

Future<ShopCashShift> _initializeCashMovement(ShopDatabase database) async {
  await database.attachAuthenticatedManagedWorkspace(
    const ShopAuthenticatedWorkspaceSelection(
      workspaceId: 'workspace-process-interrupt',
      actorId: 'owner-process-interrupt',
    ),
  );
  return database.openManagedTestCashShift(
    operationId: _cashMovementShiftOpenOperationId,
    operatorLabel: 'Synthetic cashier',
    openingFloatMmk: 10000,
  );
}

Future<ShopCashMovement> _recordCashMovement(
  ShopDatabase database,
  ShopCashShift shift,
) async {
  final command = await database.prepareCashMovementCommand(
    operationId: _cashMovementOperationId,
    shiftId: shift.id,
    kind: 'cash_out',
    amountMmk: 1000,
    reason: 'petty_cash_expense',
  );
  return database.recordCashMovement(
    command: command,
    authorization: await _cashMovementAuthorization(command),
  );
}

Future<ShopCorrectionAuthorization> _cashMovementAuthorization(
  ShopCashMovementCommand command,
) async {
  final issued = _cashMovementClock.millisecondsSinceEpoch - 1000;
  final expires = issued + const Duration(minutes: 5).inMilliseconds;
  const receiptId = '88888888-8888-4888-8888-888888888888';
  const requestId = '99999999-9999-4999-8999-999999999999';
  const source = 'managed_membership_receipt_v1';
  final digest = shopCorrectionAuthorizationReceiptDigest(
    source: source,
    receiptId: receiptId,
    workspaceId: 'workspace-process-interrupt',
    actorId: 'owner-process-interrupt',
    actorLabel: 'Synthetic owner',
    actorRole: 'owner',
    capability: 'shop.cash_shift.move',
    commandDigest: command.commandDigest,
    finalizationRequestId: requestId,
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
        keyId: _cashMovementKeyId,
        receiptDigest: digest,
      ),
    ),
    keyPair: keyPair,
  );
  return ShopCorrectionAuthorization(
    contract: shopCorrectionAuthorizationReceiptContract,
    receiptId: receiptId,
    receiptDigest: digest,
    workspaceId: 'workspace-process-interrupt',
    actorId: 'owner-process-interrupt',
    actorLabel: 'Synthetic owner',
    actorRole: 'owner',
    capability: 'shop.cash_shift.move',
    source: source,
    commandDigest: command.commandDigest,
    finalizationRequestId: requestId,
    finalizedAtMillis: issued,
    issuedAtMillis: issued,
    expiresAtMillis: expires,
    keyId: _cashMovementKeyId,
    signature: base64Url.encode(signature.bytes).replaceAll('=', ''),
  );
}

Future<Map<String, int>> _cashMovementState(ShopDatabase database) async {
  Future<int> count(String table) async =>
      (await database
              .customSelect(
                'SELECT COUNT(*) AS n FROM $table WHERE operation_id = ?',
                variables: [Variable<String>(_cashMovementOperationId)],
              )
              .getSingle())
          .read<int>('n');
  final shift = (await database.readOpenCashShift())!;
  final review = await database.readCashShiftReview(shift.id);
  return {
    'movements': await count('shop_cash_movements'),
    'outbox': await count('shop_sync_outbox'),
    'movementCount': review.cashMovementCount,
    'cashOutTotalMmk': review.cashOutTotalMmk,
    'expectedCashMmk': review.expectedCashMmk,
  };
}

const _cashMovementEmptyState = {
  'movements': 0,
  'outbox': 0,
  'movementCount': 0,
  'cashOutTotalMmk': 0,
  'expectedCashMmk': 10000,
};

const _cashMovementCommittedState = {
  'movements': 1,
  'outbox': 1,
  'movementCount': 1,
  'cashOutTotalMmk': 1000,
  'expectedCashMmk': 9000,
};

Future<void> _killStockDuringTransaction(File file, File marker) async {
  final database = ShopDatabase(
    NativeDatabase(
      file,
      setup: (sqlite) {
        sqlite.createFunction(
          functionName: 'synthetic_interrupt_checkpoint',
          argumentCount: const AllowedArgumentCount(0),
          directOnly: false,
          function: (_) {
            marker.writeAsStringSync('stock-outbox-inserted-before-commit');
            sleep(const Duration(minutes: 5));
            return 1;
          },
        );
      },
    ),
  );
  await _initializeStock(database);
  await database.customStatement(
    'CREATE TEMP TRIGGER synthetic_process_interrupt_stock_outbox '
    'AFTER INSERT ON shop_sync_outbox '
    "WHEN NEW.operation_id = '$_stockOperationId' "
    'BEGIN SELECT synthetic_interrupt_checkpoint(); END',
  );
  await _changeStock(database);
  fail('The parent process did not terminate the stock transaction worker.');
}

Future<void> _killStockAfterCommit(File file, File marker) async {
  final database = ShopDatabase(NativeDatabase(file));
  await _initializeStock(database);
  await _changeStock(database);
  marker.writeAsStringSync('stock-committed-before-reply');
  sleep(const Duration(minutes: 5));
  fail('The parent process did not terminate the committed stock worker.');
}

Future<void> _verifyStockRolledBack(File file) async {
  final database = ShopDatabase(NativeDatabase(file));
  try {
    expect(await _stockState(database), _stockEmptyState);
    expect(await _changeStock(database), 8);
    expect(await _stockState(database), _stockCommittedState);
    expect(await _changeStock(database), 8);
    expect(await _stockState(database), _stockCommittedState);
  } finally {
    await database.close();
  }
}

Future<void> _verifyStockCommitted(File file) async {
  final database = ShopDatabase(NativeDatabase(file));
  try {
    expect(await _stockState(database), _stockCommittedState);
    expect(await _changeStock(database), 8);
    expect(await _stockState(database), _stockCommittedState);
  } finally {
    await database.close();
  }
}

Future<void> _killShiftCloseDuringTransaction(File file, File marker) async {
  final database = ShopDatabase(
    NativeDatabase(
      file,
      setup: (sqlite) {
        sqlite.createFunction(
          functionName: 'synthetic_interrupt_checkpoint',
          argumentCount: const AllowedArgumentCount(0),
          directOnly: false,
          function: (_) {
            marker.writeAsStringSync('shift-close-outbox-before-commit');
            sleep(const Duration(minutes: 5));
            return 1;
          },
        );
      },
    ),
  );
  final shift = await _initializeShift(database);
  await database.customStatement(
    'CREATE TEMP TRIGGER synthetic_process_interrupt_shift_outbox '
    'AFTER INSERT ON shop_sync_outbox '
    "WHEN NEW.operation_id = '$_shiftCloseOperationId' "
    'BEGIN SELECT synthetic_interrupt_checkpoint(); END',
  );
  await _closeShift(database, shift);
  fail('The parent process did not terminate the shift transaction worker.');
}

Future<void> _killShiftCloseAfterCommit(File file, File marker) async {
  final database = ShopDatabase(NativeDatabase(file));
  final shift = await _initializeShift(database);
  await _closeShift(database, shift);
  marker.writeAsStringSync('shift-close-committed-before-reply');
  sleep(const Duration(minutes: 5));
  fail('The parent process did not terminate the committed shift worker.');
}

Future<void> _verifyShiftCloseRolledBack(File file) async {
  final database = ShopDatabase(NativeDatabase(file));
  try {
    expect(await _shiftState(database), _shiftOpenState);
    final shift = (await database.readOpenCashShift())!;
    final closed = await _closeShift(database, shift);
    expect(closed.state, 'closed');
    expect(await _shiftState(database), _shiftClosedState);
    final replay = await _closeShift(database, closed);
    expect(replay.id, closed.id);
    expect(await _shiftState(database), _shiftClosedState);
  } finally {
    await database.close();
  }
}

Future<void> _verifyShiftCloseCommitted(File file) async {
  final database = ShopDatabase(NativeDatabase(file));
  try {
    expect(await _shiftState(database), _shiftClosedState);
    final shift = (await database.readLatestCashShift())!;
    final replay = await _closeShift(database, shift);
    expect(replay.id, shift.id);
    expect(replay.state, 'closed');
    expect(await _shiftState(database), _shiftClosedState);
  } finally {
    await database.close();
  }
}

Future<void> _killDuringTransaction(File file, File marker) async {
  final database = ShopDatabase(
    NativeDatabase(
      file,
      setup: (sqlite) {
        sqlite.createFunction(
          functionName: 'synthetic_interrupt_checkpoint',
          argumentCount: const AllowedArgumentCount(0),
          directOnly: false,
          function: (_) {
            marker.writeAsStringSync('outbox-inserted-before-commit');
            sleep(const Duration(minutes: 5));
            return 1;
          },
        );
      },
    ),
  );
  await _initialize(database);
  await database.customStatement(
    'CREATE TEMP TRIGGER synthetic_process_interrupt_outbox '
    'AFTER INSERT ON shop_sync_outbox '
    "WHEN NEW.operation_id = '$_operationId' "
    'BEGIN SELECT synthetic_interrupt_checkpoint(); END',
  );
  await database.recordCashSale(
    operationId: _operationId,
    lines: const [ShopSaleLineInput(productId: _productId, quantity: 1)],
    requirePendingCashCheckout: true,
  );
  fail('The parent process did not terminate the transaction worker.');
}

Future<void> _killAfterCommit(File file, File marker) async {
  final database = ShopDatabase(NativeDatabase(file));
  await _initialize(database);
  await database.recordCashSale(
    operationId: _operationId,
    lines: const [ShopSaleLineInput(productId: _productId, quantity: 1)],
    requirePendingCashCheckout: true,
  );
  marker.writeAsStringSync('sale-committed-before-reply');
  sleep(const Duration(minutes: 5));
  fail('The parent process did not terminate the committed worker.');
}

Future<void> _verifyRolledBack(File file) async {
  final database = ShopDatabase(NativeDatabase(file));
  try {
    expect(await _state(database), _emptyState);
    final receipt = await database.recordCashSale(
      operationId: _operationId,
      lines: const [ShopSaleLineInput(productId: _productId, quantity: 1)],
      requirePendingCashCheckout: true,
    );
    expect(receipt.id, _operationId);
    expect(await _state(database), _committedState);
  } finally {
    await database.close();
  }
}

Future<void> _verifyCommitted(File file) async {
  final database = ShopDatabase(NativeDatabase(file));
  try {
    expect(await _state(database), _committedState);
    final replay = await database.recordCashSale(
      operationId: _operationId,
      lines: const [ShopSaleLineInput(productId: _productId, quantity: 1)],
      requirePendingCashCheckout: true,
    );
    expect(replay.id, _operationId);
    expect(await _state(database), _committedState);
  } finally {
    await database.close();
  }
}

Future<void> _initialize(ShopDatabase database) async {
  await database.addProduct(
    id: _productId,
    name: 'Synthetic tea',
    priceMmk: 2500,
    openingStock: 2,
  );
  await database.saveCounterSaleDraft(
    operationId: _operationId,
    quantities: const {_productId: 1},
  );
  await database.beginPendingCashCheckout(
    operationId: _operationId,
    checkoutKind: 'counter',
    subjectId: _operationId,
  );
}

Future<void> _initializeStock(ShopDatabase database) async {
  await database.addProduct(
    id: _productId,
    name: 'Synthetic tea',
    priceMmk: 2500,
    openingStock: 5,
  );
}

Future<int> _changeStock(ShopDatabase database) => database.changeStock(
  operationId: _stockOperationId,
  productId: _productId,
  kind: 'receive',
  quantity: 3,
  expectedOnHand: 5,
);

Future<ShopCashShift> _initializeShift(ShopDatabase database) =>
    database.openCashShift(
      operationId: _shiftOpenOperationId,
      operatorLabel: 'Synthetic operator',
      openingFloatMmk: 10000,
    );

Future<ShopCashShift> _closeShift(ShopDatabase database, ShopCashShift shift) =>
    database.closeCashShift(
      shiftId: shift.id,
      operationId: _shiftCloseOperationId,
      seenSaleCount: 0,
      seenCashTotalMmk: 0,
      countedCashMmk: 10000,
    );

Future<Map<String, int>> _state(ShopDatabase database) async {
  Future<int> count(String table, String field) async =>
      (await database
              .customSelect(
                'SELECT COUNT(*) AS n FROM $table WHERE $field = ?',
                variables: [Variable<String>(_operationId)],
              )
              .getSingle())
          .read<int>('n');
  final product = (await database.readActiveProducts()).single;
  return {
    'sales': await count('shop_sales', 'operation_id'),
    'lines': await count('shop_sale_lines', 'sale_id'),
    'movements': await count('shop_stock_movements', 'sale_id'),
    'outbox': await count('shop_sync_outbox', 'operation_id'),
    'pendingCash': await count('shop_pending_cash_checkouts', 'operation_id'),
    'drafts': await count('shop_counter_drafts', 'operation_id'),
    'onHand': product.onHand,
  };
}

const _emptyState = {
  'sales': 0,
  'lines': 0,
  'movements': 0,
  'outbox': 0,
  'pendingCash': 1,
  'drafts': 1,
  'onHand': 2,
};

const _committedState = {
  'sales': 1,
  'lines': 1,
  'movements': 1,
  'outbox': 1,
  'pendingCash': 0,
  'drafts': 0,
  'onHand': 1,
};

Future<Map<String, Object?>> _stockState(ShopDatabase database) async {
  final product = (await database.readActiveProducts()).single;
  final movementCount =
      (await database
              .customSelect(
                'SELECT COUNT(*) AS n FROM shop_stock_movements WHERE id = ?',
                variables: [Variable<String>('$_stockOperationId:stock')],
              )
              .getSingle())
          .read<int>('n');
  final outboxCount =
      (await database
              .customSelect(
                'SELECT COUNT(*) AS n FROM shop_sync_outbox '
                'WHERE operation_id = ?',
                variables: [Variable<String>(_stockOperationId)],
              )
              .getSingle())
          .read<int>('n');
  return {
    'onHand': product.onHand,
    'operationMovements': movementCount,
    'operationOutbox': outboxCount,
  };
}

const _stockEmptyState = {
  'onHand': 5,
  'operationMovements': 0,
  'operationOutbox': 0,
};

const _stockCommittedState = {
  'onHand': 8,
  'operationMovements': 1,
  'operationOutbox': 1,
};

Future<Map<String, Object?>> _shiftState(ShopDatabase database) async {
  final shift = (await database
      .customSelect(
        'SELECT state, open_operation_id, close_operation_id '
        'FROM shop_cash_shifts WHERE open_operation_id = ?',
        variables: [Variable<String>(_shiftOpenOperationId)],
      )
      .getSingle());
  Future<int> outboxCount(String operationId) async =>
      (await database
              .customSelect(
                'SELECT COUNT(*) AS n FROM shop_sync_outbox '
                'WHERE operation_id = ?',
                variables: [Variable<String>(operationId)],
              )
              .getSingle())
          .read<int>('n');
  return {
    'state': shift.read<String>('state'),
    'closeOperationId': shift.readNullable<String>('close_operation_id'),
    'openOutbox': await outboxCount(_shiftOpenOperationId),
    'closeOutbox': await outboxCount(_shiftCloseOperationId),
  };
}

const _shiftOpenState = {
  'state': 'open',
  'closeOperationId': null,
  'openOutbox': 1,
  'closeOutbox': 0,
};

const _shiftClosedState = {
  'state': 'closed',
  'closeOperationId': _shiftCloseOperationId,
  'openOutbox': 1,
  'closeOutbox': 1,
};
