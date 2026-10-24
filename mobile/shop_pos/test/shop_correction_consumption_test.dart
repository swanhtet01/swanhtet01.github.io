import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:cryptography/cryptography.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_backup.dart';

const _keyId = 'shop-test-2026';
const _publicKey = 'A6EHv_POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg';
const _workspaceId = 'workspace-shop-test';
const _actorId = 'owner-test';

void main() {
  late ShopDatabase database;
  late String saleId;

  setUp(() async {
    database = ShopDatabase.withCorrectionReceiptVerifier(
      executor: NativeDatabase.memory(),
      correctionReceiptVerifier: ShopCorrectionReceiptVerifier({
        _keyId: _publicKey,
      }),
    );
    await database.addProduct(
      id: 'rice',
      name: 'Rice',
      priceMmk: 2500,
      openingStock: 2,
    );
    await database.openCashShift(
      operationId: 'shift-open',
      operatorLabel: 'May',
      openingFloatMmk: 10000,
    );
    saleId = (await database.recordCashSale(
      operationId: 'sale-op',
      lines: const [ShopSaleLineInput(productId: 'rice', quantity: 1)],
    )).id;
    await database.attachAuthenticatedManagedWorkspace(
      const ShopAuthenticatedWorkspaceSelection(
        workspaceId: _workspaceId,
        actorId: _actorId,
      ),
    );
    await database.acceptCorrectionLineage(
      const ShopCorrectionLineage(
        activationRequestId: '10000000-0000-4000-8000-000000000001',
        workspaceId: _workspaceId,
        actorId: _actorId,
        lineageId: '20000000-0000-4000-8000-000000000001',
        lineageEpoch: 1,
        previousLineageId: null,
        previousLineageEpoch: null,
        consumptionOrdinal: 0,
        consumptionDigest: null,
        activatedAtMillis: 1000,
      ),
    );
  });

  tearDown(() => database.close());

  test(
    'signed consume proof commits cash, stock and outbox exactly once',
    () async {
      final command = await database.previewFullSaleReversal(
        operationId: 'reverse-op',
        saleId: saleId,
        restockItems: true,
        reason: 'Customer returned the full sale',
        confirmCashReturned: true,
      );
      final authorization = await _authorization(command.commandDigest);
      await database.prepareFullSaleCorrectionConsumption(
        consumptionRequestId: '30000000-0000-4000-8000-000000000001',
        command: command,
        authorization: authorization,
      );
      final proof = await _proof(
        authorization: authorization,
        command: command,
        consumptionId: '40000000-0000-4000-8000-000000000001',
        requestId: '30000000-0000-4000-8000-000000000001',
      );

      final first = await database.recordAuthorizedFullSaleReversal(
        command: command,
        authorization: authorization,
        consumptionProof: proof,
      );
      final outboxAfterFirst = await database.countOutboxOperations();
      final second = await database.recordAuthorizedFullSaleReversal(
        command: command,
        authorization: authorization,
        consumptionProof: proof,
      );

      expect(second.id, first.id);
      expect(await database.countSales(), 1);
      expect(await database.countOutboxOperations(), outboxAfterFirst);
      expect((await database.readActiveProducts()).single.onHand, 2);
      final lineage = await database.readCorrectionLineageState();
      expect(lineage?.lineage.consumptionOrdinal, 1);
      expect(lineage?.lineage.consumptionDigest, proof.historyDigest);
    },
  );

  test(
    'lost consume reply retries the stable request without duplicate effects',
    () async {
      final command = await database.previewFullSaleReversal(
        operationId: 'reverse-lost-reply',
        saleId: saleId,
        restockItems: true,
        reason: 'Customer returned the full sale',
        confirmCashReturned: true,
      );
      final authorization = await _authorization(command.commandDigest);
      final gateway = _LostReplyGateway(command);
      const requestId = '30000000-0000-4000-8000-000000000005';

      await expectLater(
        database.consumeAndRecordAuthorizedFullSaleReversal(
          command: command,
          authorization: authorization,
          consumptionRequestId: requestId,
          gateway: gateway,
        ),
        throwsA(isA<TimeoutException>()),
      );
      expect(gateway.serverCommitCount, 1);
      expect(await database.readSaleReversalForSale(saleId), isNull);
      expect((await database.readActiveProducts()).single.onHand, 1);

      final first = await database.resumePendingFullSaleReversal(
        consumptionRequestId: requestId,
        gateway: gateway,
      );
      final outboxAfterFirst = await database.countOutboxOperations();
      final replay = await database.consumeAndRecordAuthorizedFullSaleReversal(
        command: command,
        authorization: authorization,
        consumptionRequestId: requestId,
        gateway: gateway,
      );

      expect(replay.id, first.id);
      expect(gateway.serverCommitCount, 1);
      expect(await database.countOutboxOperations(), outboxAfterFirst);
      expect((await database.readActiveProducts()).single.onHand, 2);
    },
  );

  test('mismatched authorization cannot persist a recovery intent', () async {
    final command = await database.previewFullSaleReversal(
      operationId: 'reverse-mismatched-authorization',
      saleId: saleId,
      restockItems: true,
      reason: 'Customer returned the full sale',
      confirmCashReturned: true,
    );
    final mismatchedDigest = List<String>.filled(64, 'a').join();
    final stale = await _authorization(
      mismatchedDigest,
      receiptId: '50000000-0000-4000-8000-000000000010',
      finalizationRequestId: '60000000-0000-4000-8000-000000000010',
    );
    final wrongCapability = await _authorization(
      command.commandDigest,
      receiptId: '50000000-0000-4000-8000-000000000011',
      finalizationRequestId: '60000000-0000-4000-8000-000000000011',
      capability: 'shop.sale.reconcile_wallet',
    );
    for (final authorization in [stale, wrongCapability]) {
      await expectLater(
        database.prepareFullSaleCorrectionConsumption(
          consumptionRequestId: authorization.receiptId,
          command: command,
          authorization: authorization,
        ),
        throwsStateError,
      );
    }
    expect(
      await database
          .customSelect('SELECT 1 FROM shop_correction_consumption_intents')
          .get(),
      isEmpty,
    );
    await database.verifyReadyForUse();
  });

  test(
    'signed server-time consumption recovers after authorization expiry',
    () async {
      final command = await database.previewFullSaleReversal(
        operationId: 'reverse-expired-reply',
        saleId: saleId,
        restockItems: true,
        reason: 'Customer returned the full sale',
        confirmCashReturned: true,
      );
      final issuedAt = DateTime.now().millisecondsSinceEpoch - 600000;
      final authorization = await _authorization(
        command.commandDigest,
        issuedAtMillis: issuedAt,
      );
      const requestId = '30000000-0000-4000-8000-000000000008';
      await database.prepareFullSaleCorrectionConsumption(
        consumptionRequestId: requestId,
        command: command,
        authorization: authorization,
      );
      final proof = await _proof(
        authorization: authorization,
        command: command,
        consumptionId: '40000000-0000-4000-8000-000000000008',
        requestId: requestId,
        consumedAtMillis: issuedAt + 1000,
      );

      await database.recordAuthorizedFullSaleReversal(
        command: command,
        authorization: authorization,
        consumptionProof: proof,
      );
      expect(await database.readSaleReversalForSale(saleId), isNotNull);
      expect((await database.readActiveProducts()).single.onHand, 2);
    },
  );

  test('reopen and backup reject transplanted operation or lineage bindings', () async {
    final command = await database.previewFullSaleReversal(
      operationId: 'reverse-binding',
      saleId: saleId,
      restockItems: true,
      reason: 'Customer returned the full sale',
      confirmCashReturned: true,
    );
    final authorization = await _authorization(command.commandDigest);
    const requestId = '30000000-0000-4000-8000-000000000006';
    await database.prepareFullSaleCorrectionConsumption(
      consumptionRequestId: requestId,
      command: command,
      authorization: authorization,
    );
    final proof = await _proof(
      authorization: authorization,
      command: command,
      consumptionId: '40000000-0000-4000-8000-000000000006',
      requestId: requestId,
    );
    await database.recordAuthorizedFullSaleReversal(
      command: command,
      authorization: authorization,
      consumptionProof: proof,
    );
    final otherCommand = await database.previewFullSaleReversal(
      operationId: 'unconsumed-binding-operation',
      saleId: saleId,
      restockItems: true,
      reason: 'Customer returned the full sale',
      confirmCashReturned: true,
    );
    await database.prepareFullSaleCorrectionConsumption(
      consumptionRequestId: '30000000-0000-4000-8000-000000000007',
      command: otherCommand,
      authorization: await _authorization(
        otherCommand.commandDigest,
        receiptId: '50000000-0000-4000-8000-000000000007',
        finalizationRequestId: '60000000-0000-4000-8000-000000000007',
      ),
    );

    final directory = await Directory.systemTemp.createTemp(
      'shop-correction-binding-tamper-',
    );
    final base = File('${directory.path}/base.sqlite');
    try {
      await database.exportVerifiedLocalSnapshot(base);
      final cases = <String, void Function(Database)>{
        'local-operation': (raw) => _rewriteImmutableRow(
          raw,
          table: 'shop_correction_consumptions',
          trigger: 'shop_correction_consumptions_no_update',
          update: "UPDATE shop_correction_consumptions SET local_operation_id = 'unconsumed-binding-operation'",
        ),
        'intent-lineage': (raw) => _rewriteImmutableRow(
          raw,
          table: 'shop_correction_consumption_intents',
          trigger: 'shop_correction_consumption_intents_no_update',
          update:
              "UPDATE shop_correction_consumption_intents SET lineage_id = '20000000-0000-4000-8000-000000000099', lineage_epoch = 2 WHERE consumption_request_id = '$requestId'",
        ),
        'noncanonical-envelope': (raw) => _rewriteImmutableRow(
          raw,
          table: 'shop_correction_consumption_intents',
          trigger: 'shop_correction_consumption_intents_no_update',
          update:
              "UPDATE shop_correction_consumption_intents SET recovery_envelope_json = ' ' || recovery_envelope_json WHERE consumption_request_id = '$requestId'",
        ),
      };
      for (final entry in cases.entries) {
        final tampered = File('${directory.path}/${entry.key}.sqlite');
        await base.copy(tampered.path);
        final raw = sqlite3.open(tampered.path);
        try {
          entry.value(raw);
        } finally {
          raw.close();
        }
        expect(
          () => ShopBackup.verifySnapshot(tampered),
          throwsA(isA<FormatException>()),
          reason: '${entry.key} backup validation must fail closed',
        );
        final reopened = ShopDatabase.withCorrectionReceiptVerifier(
          executor: NativeDatabase(tampered),
          correctionReceiptVerifier: ShopCorrectionReceiptVerifier({
            _keyId: _publicKey,
          }),
        );
        try {
          await expectLater(
            reopened.verifyReadyForUse(),
            throwsStateError,
            reason: '${entry.key} runtime validation must fail closed',
          );
        } finally {
          await reopened.close();
        }
      }
    } finally {
      await directory.delete(recursive: true);
    }
  });

  test('server-ahead status quarantines correction but not normal selling', () async {
    final accepted = await database.applyCorrectionReconciliationStatus(
      const ShopCorrectionReconciliationStatus(
        workspaceId: _workspaceId,
        requestedLineageId: '20000000-0000-4000-8000-000000000001',
        requestedLineageEpoch: 1,
        activeLineageId: '20000000-0000-4000-8000-000000000001',
        activeLineageEpoch: 1,
        serverConsumptionOrdinal: 1,
        serverConsumptionDigest:
            'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        localConsumptionOrdinal: 0,
        localConsumptionDigest: null,
        state: 'reconciliation_required',
      ),
    );
    expect(accepted, isFalse);
    expect(
      (await database.readCorrectionLineageState())?.lifecycleState,
      'reconciliation_required',
    );
    await database.recordCashSale(
      operationId: 'sale-after-quarantine',
      lines: const [ShopSaleLineInput(productId: 'rice', quantity: 1)],
    );
    expect(await database.countSales(), 2);
  });

  test(
    'validly signed actor mismatch quarantines without sale effects',
    () async {
      final command = await database.previewFullSaleReversal(
        operationId: 'reverse-mismatch-op',
        saleId: saleId,
        restockItems: true,
        reason: 'Customer returned the full sale',
        confirmCashReturned: true,
      );
      final authorization = await _authorization(command.commandDigest);
      await database.prepareFullSaleCorrectionConsumption(
        consumptionRequestId: '30000000-0000-4000-8000-000000000002',
        command: command,
        authorization: authorization,
      );
      final proof = await _proof(
        authorization: authorization,
        command: command,
        consumptionId: '40000000-0000-4000-8000-000000000002',
        requestId: '30000000-0000-4000-8000-000000000002',
        actorId: 'owner-other',
      );

      await expectLater(
        database.recordAuthorizedFullSaleReversal(
          command: command,
          authorization: authorization,
          consumptionProof: proof,
        ),
        throwsStateError,
      );
      expect(await database.readSaleReversalForSale(saleId), isNull);
      expect((await database.readActiveProducts()).single.onHand, 1);
      expect(
        (await database.readCorrectionLineageState())?.lifecycleState,
        'reconciliation_required',
      );
    },
  );

  test('lost consume reply resumes after a real database reopen', () async {
    final directory = await Directory.systemTemp.createTemp(
      'shop-correction-restart-',
    );
    final file = File('${directory.path}/shop.sqlite');
    ShopDatabase? opened;
    try {
      opened = ShopDatabase.withCorrectionReceiptVerifier(
        executor: NativeDatabase(file),
        correctionReceiptVerifier: ShopCorrectionReceiptVerifier({
          _keyId: _publicKey,
        }),
      );
      await opened.addProduct(
        id: 'restart-rice',
        name: 'Rice',
        priceMmk: 2500,
        openingStock: 2,
      );
      await opened.openCashShift(
        operationId: 'restart-shift',
        operatorLabel: 'May',
        openingFloatMmk: 10000,
      );
      final restartSale = await opened.recordCashSale(
        operationId: 'restart-sale',
        lines: const [
          ShopSaleLineInput(productId: 'restart-rice', quantity: 1),
        ],
      );
      await opened.attachAuthenticatedManagedWorkspace(
        const ShopAuthenticatedWorkspaceSelection(
          workspaceId: _workspaceId,
          actorId: _actorId,
        ),
      );
      await opened.acceptCorrectionLineage(
        const ShopCorrectionLineage(
          activationRequestId: '10000000-0000-4000-8000-000000000009',
          workspaceId: _workspaceId,
          actorId: _actorId,
          lineageId: '20000000-0000-4000-8000-000000000001',
          lineageEpoch: 1,
          previousLineageId: null,
          previousLineageEpoch: null,
          consumptionOrdinal: 0,
          consumptionDigest: null,
          activatedAtMillis: 1000,
        ),
      );
      final command = await opened.previewFullSaleReversal(
        operationId: 'restart-reversal',
        saleId: restartSale.id,
        restockItems: true,
        reason: 'Customer returned the full sale',
        confirmCashReturned: true,
      );
      final authorization = await _authorization(command.commandDigest);
      final gateway = _LostReplyGateway(command);
      const requestId = '30000000-0000-4000-8000-000000000009';
      await expectLater(
        opened.consumeAndRecordAuthorizedFullSaleReversal(
          command: command,
          authorization: authorization,
          consumptionRequestId: requestId,
          gateway: gateway,
        ),
        throwsA(isA<TimeoutException>()),
      );
      await opened.close();
      opened = ShopDatabase.withCorrectionReceiptVerifier(
        executor: NativeDatabase(file),
        correctionReceiptVerifier: ShopCorrectionReceiptVerifier({
          _keyId: _publicKey,
        }),
      );
      await opened.verifyReadyForUse();
      await opened.resumePendingFullSaleReversal(
        consumptionRequestId: requestId,
        gateway: gateway,
      );
      expect(gateway.serverCommitCount, 1);
      expect((await opened.readActiveProducts()).single.onHand, 2);
      expect(await opened.readSaleReversalForSale(restartSale.id), isNotNull);
    } finally {
      await opened?.close();
      await directory.delete(recursive: true);
    }
  });

  test(
    'restore-pending lineage mismatch persists correction quarantine',
    () async {
      await database.markCorrectionRestorePending();
      await expectLater(
        database.acceptCorrectionLineage(
          const ShopCorrectionLineage(
            activationRequestId: '10000000-0000-4000-8000-000000000002',
            workspaceId: _workspaceId,
            actorId: _actorId,
            lineageId: '20000000-0000-4000-8000-000000000002',
            lineageEpoch: 2,
            previousLineageId: '20000000-0000-4000-8000-000000000001',
            previousLineageEpoch: 1,
            consumptionOrdinal: 1,
            consumptionDigest: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            activatedAtMillis: 2000,
          ),
        ),
        throwsStateError,
      );
      expect(
        (await database.readCorrectionLineageState())?.lifecycleState,
        'reconciliation_required',
        reason: 'a signed watermark mismatch must survive transaction rollback',
      );
      await database.recordCashSale(
        operationId: 'sale-after-restore-quarantine',
        lines: const [ShopSaleLineInput(productId: 'rice', quantity: 1)],
      );
      expect(await database.countSales(), 2);
    },
  );

  test('restore-pending lineage rotates at the exact watermark', () async {
    await database.markCorrectionRestorePending();
    await database.acceptCorrectionLineage(
      const ShopCorrectionLineage(
        activationRequestId: '10000000-0000-4000-8000-000000000003',
        workspaceId: _workspaceId,
        actorId: _actorId,
        lineageId: '20000000-0000-4000-8000-000000000003',
        lineageEpoch: 2,
        previousLineageId: '20000000-0000-4000-8000-000000000001',
        previousLineageEpoch: 1,
        consumptionOrdinal: 0,
        consumptionDigest: null,
        activatedAtMillis: 3000,
      ),
    );
    expect((await database.readCorrectionLineageState())?.canConsume, isTrue);
  });

  test(
    'encrypted backup preserves ambiguous intent and restores quarantined',
    () async {
      final command = await database.previewFullSaleReversal(
        operationId: 'reverse-ambiguous',
        saleId: saleId,
        restockItems: true,
        reason: 'Customer returned the full sale',
        confirmCashReturned: true,
      );
      final authorization = await _authorization(command.commandDigest);
      await database.prepareFullSaleCorrectionConsumption(
        consumptionRequestId: '30000000-0000-4000-8000-000000000004',
        command: command,
        authorization: authorization,
      );
      final directory = await Directory.systemTemp.createTemp(
        'shop-correction-ambiguous-restore-',
      );
      final archive = File('${directory.path}/shop.smbak');
      final target = File('${directory.path}/restored.sqlite');
      try {
        await ShopBackup.exportEncrypted(
          database: database,
          archive: archive,
          password: 'correct horse battery staple',
          scratchRoot: directory,
        );
        await ShopBackup.restoreIntoEmptyDatabase(
          archive: archive,
          target: target,
          password: 'correct horse battery staple',
          correctionReceiptVerifier: ShopCorrectionReceiptVerifier({
            _keyId: _publicKey,
          }),
        );
        final restored = ShopDatabase.withCorrectionReceiptVerifier(
          executor: NativeDatabase(target),
          correctionReceiptVerifier: ShopCorrectionReceiptVerifier({
            _keyId: _publicKey,
          }),
        );
        try {
          expect(
            (await restored.readCorrectionLineageState())?.lifecycleState,
            'restore_pending',
          );
          expect(await restored.readSaleReversalForSale(saleId), isNull);
          expect(
            await restored
                .customSelect(
                  'SELECT 1 FROM shop_correction_consumption_intents',
                )
                .get(),
            hasLength(1),
          );
        } finally {
          await restored.close();
        }
      } finally {
        await directory.delete(recursive: true);
      }
    },
  );

  test(
    'encrypted post-correction restore reconstructs without new effects',
    () async {
      final command = await database.previewFullSaleReversal(
        operationId: 'reverse-before-backup',
        saleId: saleId,
        restockItems: true,
        reason: 'Customer returned the full sale',
        confirmCashReturned: true,
      );
      final authorization = await _authorization(command.commandDigest);
      const requestId = '30000000-0000-4000-8000-000000000003';
      await database.prepareFullSaleCorrectionConsumption(
        consumptionRequestId: requestId,
        command: command,
        authorization: authorization,
      );
      final proof = await _proof(
        authorization: authorization,
        command: command,
        consumptionId: '40000000-0000-4000-8000-000000000003',
        requestId: requestId,
      );
      await database.recordAuthorizedFullSaleReversal(
        command: command,
        authorization: authorization,
        consumptionProof: proof,
      );

      final directory = await Directory.systemTemp.createTemp(
        'shop-correction-consumption-restore-',
      );
      final archive = File('${directory.path}/shop.smbak');
      final target = File('${directory.path}/restored.sqlite');
      try {
        await ShopBackup.exportEncrypted(
          database: database,
          archive: archive,
          password: 'correct horse battery staple',
          scratchRoot: directory,
        );
        await ShopBackup.restoreIntoEmptyDatabase(
          archive: archive,
          target: target,
          password: 'correct horse battery staple',
          correctionReceiptVerifier: ShopCorrectionReceiptVerifier({
            _keyId: _publicKey,
          }),
        );
        final restored = ShopDatabase.withCorrectionReceiptVerifier(
          executor: NativeDatabase(target),
          correctionReceiptVerifier: ShopCorrectionReceiptVerifier({
            _keyId: _publicKey,
          }),
        );
        try {
          final pending = await restored.readCorrectionLineageState();
          expect(pending?.lifecycleState, 'restore_pending');
          expect(pending?.lineage.consumptionOrdinal, 1);
          expect(pending?.lineage.consumptionDigest, proof.historyDigest);
          await restored.acceptCorrectionLineage(
            ShopCorrectionLineage(
              activationRequestId: '10000000-0000-4000-8000-000000000004',
              workspaceId: _workspaceId,
              actorId: _actorId,
              lineageId: '20000000-0000-4000-8000-000000000004',
              lineageEpoch: 2,
              previousLineageId: '20000000-0000-4000-8000-000000000001',
              previousLineageEpoch: 1,
              consumptionOrdinal: 1,
              consumptionDigest: proof.historyDigest,
              activatedAtMillis: 4000,
            ),
          );
          final outboxBeforeRetry = await restored.countOutboxOperations();
          final stockBeforeRetry =
              (await restored.readActiveProducts()).single.onHand;
          await restored.recordAuthorizedFullSaleReversal(
            command: command,
            authorization: authorization,
            consumptionProof: proof,
          );
          expect(await restored.countOutboxOperations(), outboxBeforeRetry);
          expect(
            (await restored.readActiveProducts()).single.onHand,
            stockBeforeRetry,
          );
          expect(await restored.countSales(), 1);
        } finally {
          await restored.close();
        }
      } finally {
        await directory.delete(recursive: true);
      }
    },
  );
}

Future<ShopCorrectionAuthorization> _authorization(
  String commandDigest, {
  String receiptId = '50000000-0000-4000-8000-000000000001',
  String finalizationRequestId = '60000000-0000-4000-8000-000000000001',
  int? issuedAtMillis,
  String capability = 'shop.sale.reverse',
}) async {
  final issued = issuedAtMillis ?? DateTime.now().millisecondsSinceEpoch - 1000;
  final digest = shopCorrectionAuthorizationReceiptDigest(
    source: 'managed_membership_receipt_v1',
    receiptId: receiptId,
    workspaceId: _workspaceId,
    actorId: _actorId,
    actorLabel: 'Test owner',
    actorRole: 'owner',
    capability: capability,
    commandDigest: commandDigest,
    finalizationRequestId: finalizationRequestId,
    finalizedAtMillis: issued,
    issuedAtMillis: issued,
    expiresAtMillis: issued + 300000,
  );
  return ShopCorrectionAuthorization(
    contract: shopCorrectionAuthorizationReceiptContract,
    receiptId: receiptId,
    receiptDigest: digest,
    workspaceId: _workspaceId,
    actorId: _actorId,
    actorLabel: 'Test owner',
    actorRole: 'owner',
    capability: capability,
    source: 'managed_membership_receipt_v1',
    commandDigest: commandDigest,
    finalizationRequestId: finalizationRequestId,
    finalizedAtMillis: issued,
    issuedAtMillis: issued,
    expiresAtMillis: issued + 300000,
    keyId: _keyId,
    signature: await _sign(digest),
  );
}

Future<ShopCorrectionConsumptionProof> _proof({
  required ShopCorrectionAuthorization authorization,
  required ShopFullSaleReversalCommand command,
  required String consumptionId,
  required String requestId,
  String? actorId,
  int? consumedAtMillis,
}) async {
  final unsigned = ShopCorrectionConsumptionProof(
    consumptionId: consumptionId,
    consumptionRequestId: requestId,
    authorizationReceiptId: authorization.receiptId,
    authorizationReceiptDigest: authorization.receiptDigest,
    workspaceId: authorization.workspaceId,
    actorId: actorId ?? authorization.actorId,
    capability: authorization.capability,
    semanticTargetId: command.saleId,
    commandDigest: command.commandDigest,
    lineageId: '20000000-0000-4000-8000-000000000001',
    lineageEpoch: 1,
    consumptionOrdinal: 1,
    previousConsumptionDigest: null,
    historyDigest: List<String>.filled(64, '0').join(),
    consumedAtMillis: consumedAtMillis ?? DateTime.now().millisecondsSinceEpoch,
    keyId: _keyId,
    signature: List<String>.filled(86, 'A').join(),
  );
  final digest = unsigned.recomputeHistoryDigest();
  return ShopCorrectionConsumptionProof(
    consumptionId: unsigned.consumptionId,
    consumptionRequestId: unsigned.consumptionRequestId,
    authorizationReceiptId: unsigned.authorizationReceiptId,
    authorizationReceiptDigest: unsigned.authorizationReceiptDigest,
    workspaceId: unsigned.workspaceId,
    actorId: unsigned.actorId,
    capability: unsigned.capability,
    semanticTargetId: unsigned.semanticTargetId,
    commandDigest: unsigned.commandDigest,
    lineageId: unsigned.lineageId,
    lineageEpoch: unsigned.lineageEpoch,
    consumptionOrdinal: unsigned.consumptionOrdinal,
    previousConsumptionDigest: unsigned.previousConsumptionDigest,
    historyDigest: digest,
    consumedAtMillis: unsigned.consumedAtMillis,
    keyId: _keyId,
    signature: await _sign(digest),
  );
}

Future<String> _sign(String digest) async {
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
  return base64Url.encode(signature.bytes).replaceAll('=', '');
}

class _LostReplyGateway implements ShopCorrectionConsumptionGateway {
  _LostReplyGateway(this.command);

  final ShopFullSaleReversalCommand command;
  ShopCorrectionConsumptionProof? _committed;
  var serverCommitCount = 0;
  var _replyLost = false;

  @override
  Future<ShopCorrectionConsumptionProof> consume({
    required String consumptionRequestId,
    required ShopCorrectionAuthorization authorization,
    required String lineageId,
    required int lineageEpoch,
    required String semanticTargetId,
  }) async {
    final proof = _committed ??= await _proof(
      authorization: authorization,
      command: command,
      consumptionId: '40000000-0000-4000-8000-000000000005',
      requestId: consumptionRequestId,
    );
    if (serverCommitCount == 0) serverCommitCount = 1;
    if (!_replyLost) {
      _replyLost = true;
      throw TimeoutException('Synthetic reply was lost after server commit.');
    }
    return proof;
  }

  @override
  Future<ShopCorrectionLineage> activateLineage({
    required String activationRequestId,
    required String lineageId,
    required String? expectedPreviousLineageId,
    required int? expectedPreviousLineageEpoch,
    required int localConsumptionOrdinal,
    required String? localConsumptionDigest,
  }) => throw UnsupportedError('Lineage activation is outside this fixture.');

  @override
  Future<ShopCorrectionReconciliationStatus> status({
    required String lineageId,
    required int lineageEpoch,
    required int localConsumptionOrdinal,
    required String? localConsumptionDigest,
  }) => throw UnsupportedError('Status is outside this fixture.');
}

void _rewriteImmutableRow(
  Database database, {
  required String table,
  required String trigger,
  required String update,
}) {
  final triggerSql =
      database.select(
            "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?",
            [trigger],
          ).single['sql']
          as String;
  database.execute('DROP TRIGGER $trigger');
  database.execute(update);
  database.execute(triggerSql);
  expect(
    database.select('SELECT count(*) AS count FROM $table').single['count'],
    greaterThan(0),
  );
}
