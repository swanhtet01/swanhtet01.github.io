import 'dart:convert';

import 'package:crypto/crypto.dart' as crypto;
import 'package:cryptography/cryptography.dart';
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/main.dart';
import 'package:supermega_shop/shop_cash_shift_screen.dart';
import 'package:supermega_shop/shop_correction_authorization_service.dart';
import 'package:supermega_shop/shop_database.dart';

import 'managed_staff_test_support.dart';

const _workspaceId = 'workspace-cash-flow-test';
const _ownerId = 'owner-cash-flow-test';
const _keyId = 'cash-flow-test-key';
const _publicKey = 'A6EHv_POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg';
final _clock = DateTime.fromMillisecondsSinceEpoch(2000000000000);
final _testVerifier = ShopCorrectionReceiptVerifier({_keyId: _publicKey});

void main() {
  test(
    'synthetic owner authorization records cash in and out exactly once',
    () async {
      final database = _database(_testVerifier);
      final authorizer = _SyntheticCashMovementAuthorizer(
        workspaceId: _workspaceId,
        actorId: _ownerId,
      );
      try {
        await _attach(database);
        final shift = await database.openManagedTestCashShift(
          operationId: 'authorized-flow-open',
          operatorLabel: 'Synthetic cashier',
          openingFloatMmk: 10000,
        );
        final cashIn = await database.prepareCashMovementCommand(
          operationId: 'authorized-flow-cash-in',
          shiftId: shift.id,
          kind: 'cash_in',
          amountMmk: 5000,
          reason: 'float_top_up',
        );

        final firstCashIn = await _recordAuthorized(
          database: database,
          authorizer: authorizer,
          command: cashIn,
          authorizationRequestId: '11111111-1111-4111-8111-111111111111',
        );
        final retriedCashIn = await _recordAuthorized(
          database: database,
          authorizer: authorizer,
          command: cashIn,
          authorizationRequestId: '11111111-1111-4111-8111-111111111111',
        );

        expect(retriedCashIn.id, firstCashIn.id);
        expect(authorizer.issuedReceiptCount, 1);

        final changedRetry = await database.prepareCashMovementCommand(
          operationId: cashIn.operationId,
          shiftId: shift.id,
          kind: 'cash_in',
          amountMmk: 6000,
          reason: 'float_top_up',
        );
        await expectLater(
          _recordAuthorized(
            database: database,
            authorizer: authorizer,
            command: changedRetry,
            authorizationRequestId: '11111111-1111-4111-8111-111111111111',
          ),
          throwsStateError,
        );

        final cashOut = await database.prepareCashMovementCommand(
          operationId: 'authorized-flow-cash-out',
          shiftId: shift.id,
          kind: 'cash_out',
          amountMmk: 3000,
          reason: 'petty_cash_expense',
        );
        await _recordAuthorized(
          database: database,
          authorizer: authorizer,
          command: cashOut,
          authorizationRequestId: '22222222-2222-4222-8222-222222222222',
        );

        final review = await database.readCashShiftReview(shift.id);
        expect(review.cashMovementCount, 2);
        expect(review.cashInTotalMmk, 5000);
        expect(review.cashOutTotalMmk, 3000);
        expect(review.expectedCashMmk, 12000);
        expect(await database.readCashMovements(shift.id), hasLength(2));
      } finally {
        await database.close();
      }
    },
  );

  test(
    'synthetic flow fails closed for inactive or foreign identity',
    () async {
      final database = _database(_testVerifier);
      try {
        await _attach(database);
        final shift = await database.openManagedTestCashShift(
          operationId: 'authorized-flow-denied-open',
          operatorLabel: 'Synthetic cashier',
          openingFloatMmk: 10000,
        );
        final command = await database.prepareCashMovementCommand(
          operationId: 'authorized-flow-denied-cash-in',
          shiftId: shift.id,
          kind: 'cash_in',
          amountMmk: 1000,
          reason: 'float_top_up',
        );

        for (final authorizer in [
          _SyntheticCashMovementAuthorizer(
            workspaceId: _workspaceId,
            actorId: 'foreign-owner',
          ),
          _SyntheticCashMovementAuthorizer(
            workspaceId: _workspaceId,
            actorId: _ownerId,
            active: false,
          ),
        ]) {
          await expectLater(
            _recordAuthorized(
              database: database,
              authorizer: authorizer,
              command: command,
              authorizationRequestId: '33333333-3333-4333-8333-333333333333',
            ),
            throwsStateError,
          );
        }

        expect(await database.readCashMovements(shift.id), isEmpty);
        expect(
          (await database.readCashShiftReview(shift.id)).expectedCashMmk,
          10000,
        );
      } finally {
        await database.close();
      }
    },
  );

  test('production key ring rejects the synthetic authorization', () async {
    expect(ShopCorrectionReceiptVerifier.production().hasPinnedKeys, isFalse);
    final database = ShopDatabase.withCorrectionReceiptVerifier(
      executor: NativeDatabase.memory(),
      correctionReceiptVerifier: ShopCorrectionReceiptVerifier.production(),
      testOnlySaleAndCashShiftClock: () => _clock,
    );
    final authorizer = _SyntheticCashMovementAuthorizer(
      workspaceId: _workspaceId,
      actorId: _ownerId,
    );
    try {
      await _attach(database);
      final shift = await database.openManagedTestCashShift(
        operationId: 'authorized-flow-production-open',
        operatorLabel: 'Synthetic cashier',
        openingFloatMmk: 10000,
      );
      final command = await database.prepareCashMovementCommand(
        operationId: 'authorized-flow-production-cash-in',
        shiftId: shift.id,
        kind: 'cash_in',
        amountMmk: 1000,
        reason: 'float_top_up',
      );

      await expectLater(
        _recordAuthorized(
          database: database,
          authorizer: authorizer,
          command: command,
          authorizationRequestId: '44444444-4444-4444-8444-444444444444',
        ),
        throwsStateError,
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

  testWidgets(
    'cashier retries the same reviewed cash-in request and updates shift totals',
    (tester) async {
      tester.view.physicalSize = const Size(390, 1000);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final database = _database(_testVerifier);
      final authorizer = _SyntheticCashMovementAuthorizer(
        workspaceId: _workspaceId,
        actorId: _ownerId,
        authorizationFailures: 1,
      );
      try {
        await _attach(database);
        final shift = await database.openManagedTestCashShift(
          operationId: 'cashier-flow-open',
          operatorLabel: 'Synthetic cashier',
          openingFloatMmk: 10000,
        );
        await tester.pumpWidget(
          MaterialApp(
            home: ShopCashShiftScreen(
              database: database,
              myanmar: false,
              cashMovementAuthorizer: authorizer,
              testOnlyAllowMissingRuntimeScope: true,
            ),
          ),
        );
        await tester.pumpAndSettle();

        await tester.tap(find.byKey(const ValueKey('shop-cash-in')));
        await tester.pumpAndSettle();
        await tester.enterText(
          find.byKey(const ValueKey('shop-cash-movement-amount')),
          '5000',
        );
        await tester.tap(
          find.byKey(const ValueKey('shop-cash-movement-review')),
        );
        await tester.pumpAndSettle();
        await tester.tap(
          find.byKey(const ValueKey('shop-cash-movement-authorize')),
        );
        await tester.pumpAndSettle();

        expect(find.textContaining('authorization is unavailable'), findsOne);
        expect(await database.readCashMovements(shift.id), isEmpty);

        await tester.tap(
          find.byKey(const ValueKey('shop-cash-movement-authorize')),
        );
        await tester.pumpAndSettle();

        final openShift = await database.readOpenCashShift();
        final review = await database.readCashShiftReview(openShift!.id);
        expect(review.cashMovementCount, 1);
        expect(review.cashInTotalMmk, 5000);
        expect(review.cashOutTotalMmk, 0);
        expect(review.expectedCashMmk, 15000);
        expect(authorizer.authorizationRequestIds, hasLength(2));
        expect(authorizer.authorizationRequestIds.toSet(), hasLength(1));
        expect(find.text('Authorized cash in'), findsOneWidget);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump(const Duration(milliseconds: 1));
        await database.close();
      }
    },
  );

  testWidgets('cash movement controls stay absent without authorization', (
    tester,
  ) async {
    final database = _database(_testVerifier);
    try {
      await _attach(database);
      final shift = await database.openManagedTestCashShift(
        operationId: 'cashier-flow-unavailable-open',
        operatorLabel: 'Synthetic cashier',
        openingFloatMmk: 10000,
      );
      await tester.pumpWidget(
        MaterialApp(
          home: ShopCashShiftScreen(
            database: database,
            myanmar: false,
            cashMovementAuthorizer: _SyntheticCashMovementAuthorizer(
              workspaceId: _workspaceId,
              actorId: _ownerId,
              active: false,
            ),
            testOnlyAllowMissingRuntimeScope: true,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('shop-cash-in')), findsNothing);
      expect(find.byKey(const ValueKey('shop-cash-out')), findsNothing);
      expect(await database.readCashMovements(shift.id), isEmpty);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('cash movement controls stay default-dark without capability', (
    tester,
  ) async {
    final database = _database(_testVerifier);
    final authorizer = _SyntheticCashMovementAuthorizer(
      workspaceId: _workspaceId,
      actorId: _ownerId,
    );
    try {
      await _attach(database);
      final shift = await database.openManagedTestCashShift(
        operationId: 'cashier-flow-default-dark-open',
        operatorLabel: 'Synthetic cashier',
        openingFloatMmk: 10000,
      );
      await tester.pumpWidget(
        MaterialApp(
          home: ShopCashShiftScreen(
            database: database,
            myanmar: false,
            cashMovementAuthorizer: authorizer,
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('shop-cash-in')), findsNothing);
      expect(find.byKey(const ValueKey('shop-cash-out')), findsNothing);
      expect(authorizer.authorizationRequestIds, isEmpty);
      expect(await database.readCashMovements(shift.id), isEmpty);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('cashier cannot record cash out above the drawer total', (
    tester,
  ) async {
    final database = _database(_testVerifier);
    try {
      await _attach(database);
      final shift = await database.openManagedTestCashShift(
        operationId: 'cashier-flow-cash-out-open',
        operatorLabel: 'Synthetic cashier',
        openingFloatMmk: 10000,
      );
      await tester.pumpWidget(
        MaterialApp(
          home: ShopCashShiftScreen(
            database: database,
            myanmar: false,
            cashMovementAuthorizer: _SyntheticCashMovementAuthorizer(
              workspaceId: _workspaceId,
              actorId: _ownerId,
            ),
            testOnlyAllowMissingRuntimeScope: true,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('shop-cash-out')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('shop-cash-movement-amount')),
        '12000',
      );
      await tester.tap(find.byKey(const ValueKey('shop-cash-movement-review')));
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey('shop-cash-movement-authorize')),
      );
      await tester.pumpAndSettle();

      expect(
        find.text('Cash out is greater than the recorded drawer cash.'),
        findsOneWidget,
      );
      expect(await database.readCashMovements(shift.id), isEmpty);
      final review = await database.readCashShiftReview(shift.id);
      expect(review.cashOutTotalMmk, 0);
      expect(review.expectedCashMmk, 10000);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('settings opens the authorized cash movement flow', (
    tester,
  ) async {
    final database = _database(_testVerifier);
    try {
      await _attach(database);
      await database.openManagedTestCashShift(
        operationId: 'cashier-settings-flow-open',
        operatorLabel: 'Synthetic cashier',
        openingFloatMmk: 10000,
      );
      await tester.pumpWidget(
        MaterialApp(
          home: ShopSettingsScreen(
            database: database,
            myanmar: false,
            onLanguageChanged: (_) {},
            correctionAuthorizer: _SyntheticCashMovementAuthorizer(
              workspaceId: _workspaceId,
              actorId: _ownerId,
            ),
            testOnlyAllowMissingRuntimeScope: true,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cash shift'));
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('shop-cash-in')), findsOneWidget);
      expect(find.byKey(const ValueKey('shop-cash-out')), findsOneWidget);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('refresh failure clears cached cash movement authority', (
    tester,
  ) async {
    final database = _CloseAfterMovementDatabase();
    final authorizer = _SyntheticCashMovementAuthorizer(
      workspaceId: _workspaceId,
      actorId: _ownerId,
    );
    try {
      await _attach(database);
      await database.openManagedTestCashShift(
        operationId: 'cashier-refresh-failure-open',
        operatorLabel: 'Synthetic cashier',
        openingFloatMmk: 10000,
      );
      await tester.pumpWidget(
        MaterialApp(
          home: ShopCashShiftScreen(
            database: database,
            myanmar: false,
            cashMovementAuthorizer: authorizer,
            testOnlyAllowMissingRuntimeScope: true,
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('shop-cash-in')), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('shop-cash-in')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('shop-cash-movement-amount')),
        '1000',
      );
      await tester.tap(find.byKey(const ValueKey('shop-cash-movement-review')));
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey('shop-cash-movement-authorize')),
      );
      await tester.pumpAndSettle();

      expect(database.closedAfterMovement, isTrue);
      expect(authorizer.authorizationRequestIds, hasLength(1));
      expect(find.textContaining('Could not load this shift'), findsOneWidget);
      expect(find.byKey(const ValueKey('shop-cash-in')), findsNothing);
      expect(find.byKey(const ValueKey('shop-cash-out')), findsNothing);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      if (!database.closedAfterMovement) await database.close();
    }
  });
}

ShopDatabase _database(ShopCorrectionReceiptVerifier verifier) =>
    ShopDatabase.withCorrectionReceiptVerifier(
      executor: NativeDatabase.memory(),
      correctionReceiptVerifier: verifier,
      testOnlySaleAndCashShiftClock: () => _clock,
    );

Future<void> _attach(ShopDatabase database) =>
    database.attachAuthenticatedManagedWorkspace(
      const ShopAuthenticatedWorkspaceSelection(
        workspaceId: _workspaceId,
        actorId: _ownerId,
      ),
    );

Future<ShopCashMovement> _recordAuthorized({
  required ShopDatabase database,
  required ShopCorrectionAuthorizer authorizer,
  required ShopCashMovementCommand command,
  required String authorizationRequestId,
}) async {
  final canAuthorize = await authorizer.canRequestAuthorization(
    workspaceId: _workspaceId,
    requiredActorId: _ownerId,
    capability: 'shop.cash_shift.move',
  );
  if (!canAuthorize) {
    throw StateError('Synthetic owner authorization is unavailable.');
  }
  final result = await authorizer.authorize(
    authorizationRequestId: authorizationRequestId,
    workspaceId: _workspaceId,
    capability: 'shop.cash_shift.move',
    commandDigest: command.commandDigest,
    requestFingerprint: command.requestFingerprint,
  );
  return database.recordCashMovement(
    command: command,
    authorization: result.authorization,
  );
}

/// Test-only issuer. It is intentionally defined in test source and uses a
/// deterministic synthetic key that is absent from the production key ring.
class _SyntheticCashMovementAuthorizer implements ShopCorrectionAuthorizer {
  _SyntheticCashMovementAuthorizer({
    required this.workspaceId,
    required this.actorId,
    this.active = true,
    this.authorizationFailures = 0,
  });

  final String workspaceId;
  final String actorId;
  final bool active;
  int authorizationFailures;
  final Map<String, _IssuedAuthorization> _issued = {};
  final List<String> authorizationRequestIds = [];

  int get issuedReceiptCount => _issued.length;

  @override
  Future<bool> canRequestAuthorization({
    required String workspaceId,
    required String requiredActorId,
    required String capability,
  }) async =>
      active &&
      workspaceId == this.workspaceId &&
      requiredActorId == actorId &&
      capability == 'shop.cash_shift.move';

  @override
  Future<ShopCorrectionAuthorizationResult> authorize({
    required String authorizationRequestId,
    required String workspaceId,
    required String capability,
    required String commandDigest,
    required String requestFingerprint,
  }) async {
    if (!active ||
        workspaceId != this.workspaceId ||
        capability != 'shop.cash_shift.move' ||
        crypto.sha256.convert(utf8.encode(requestFingerprint)).toString() !=
            commandDigest) {
      throw StateError('Synthetic authorization request was rejected.');
    }
    authorizationRequestIds.add(authorizationRequestId);
    if (authorizationFailures > 0) {
      authorizationFailures--;
      throw const ShopCorrectionAuthorizationException(
        'authorization_unavailable',
      );
    }
    final prior = _issued[authorizationRequestId];
    if (prior != null) {
      if (prior.commandDigest != commandDigest) {
        throw StateError('Synthetic authorization request changed on retry.');
      }
      return ShopCorrectionAuthorizationResult(
        authorization: prior.authorization,
        idempotentReplay: true,
        externalWritesPerformed: false,
      );
    }

    final issuedAtMillis = _clock.millisecondsSinceEpoch - 1000;
    final expiresAtMillis =
        issuedAtMillis + const Duration(minutes: 5).inMilliseconds;
    final receiptId = authorizationRequestId;
    final receiptDigest = shopCorrectionAuthorizationReceiptDigest(
      source: 'managed_membership_receipt_v1',
      receiptId: receiptId,
      workspaceId: workspaceId,
      actorId: actorId,
      actorLabel: 'Synthetic owner',
      actorRole: 'owner',
      capability: capability,
      commandDigest: commandDigest,
      finalizationRequestId: authorizationRequestId,
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
          keyId: _keyId,
          receiptDigest: receiptDigest,
        ),
      ),
      keyPair: keyPair,
    );
    final authorization = ShopCorrectionAuthorization(
      contract: shopCorrectionAuthorizationReceiptContract,
      receiptId: receiptId,
      receiptDigest: receiptDigest,
      workspaceId: workspaceId,
      actorId: actorId,
      actorLabel: 'Synthetic owner',
      actorRole: 'owner',
      capability: capability,
      source: 'managed_membership_receipt_v1',
      commandDigest: commandDigest,
      finalizationRequestId: authorizationRequestId,
      finalizedAtMillis: issuedAtMillis,
      issuedAtMillis: issuedAtMillis,
      expiresAtMillis: expiresAtMillis,
      keyId: _keyId,
      signature: base64Url.encode(signature.bytes).replaceAll('=', ''),
    );
    _issued[authorizationRequestId] = _IssuedAuthorization(
      commandDigest: commandDigest,
      authorization: authorization,
    );
    return ShopCorrectionAuthorizationResult(
      authorization: authorization,
      idempotentReplay: false,
      externalWritesPerformed: false,
    );
  }
}

class _IssuedAuthorization {
  const _IssuedAuthorization({
    required this.commandDigest,
    required this.authorization,
  });

  final String commandDigest;
  final ShopCorrectionAuthorization authorization;
}

class _CloseAfterMovementDatabase extends ShopDatabase {
  _CloseAfterMovementDatabase()
    : super.withCorrectionReceiptVerifier(
        executor: NativeDatabase.memory(),
        correctionReceiptVerifier: _testVerifier,
        testOnlySaleAndCashShiftClock: () => _clock,
      );

  bool closedAfterMovement = false;

  @override
  Future<ShopCashMovement> recordCashMovement({
    required ShopCashMovementCommand command,
    required ShopCorrectionAuthorization authorization,
  }) async {
    final movement = await super.recordCashMovement(
      command: command,
      authorization: authorization,
    );
    await close();
    closedAfterMovement = true;
    return movement;
  }
}
