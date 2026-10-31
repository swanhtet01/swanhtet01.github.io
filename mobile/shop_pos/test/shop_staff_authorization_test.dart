import 'dart:convert';
import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_cafe_order_contract.dart';
import 'package:supermega_shop/shop_cafe_kitchen_entitlement.dart';
import 'package:supermega_shop/shop_cafe_order_store.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_staff_authorization.dart';

void main() {
  test('staff command context is fail closed unless explicitly activated', () {
    const unavailable = ShopStaffCommandContext.unavailable();
    expect(unavailable.actorId, isNull);
    expect(
      () => unavailable.authorizer.authorize(
        const ShopStaffCommandAuthorizationRequest(
          workspaceId: 'workspace-a',
          storeRef: 'store-a',
          storeBindingActorId: 'owner-1',
          claimedActorId: 'cashier-1',
          commandId: 'sale-1',
          capability: ShopStaffCapability.counterSale,
          expectedVersion: 0,
        ),
      ),
      throwsA(
        isA<ShopStaffAuthorizationException>().having(
          (error) => error.code,
          'code',
          'shop_staff_authorization_unavailable',
        ),
      ),
    );
    expect(
      () => ShopStaffCommandContext.active(
        actorId: '',
        authorizer: unavailable.authorizer,
      ),
      throwsAssertionError,
    );
  });

  test('role policy separates retail and cafe duties', () {
    expect(
      ShopStaffRolePolicy.allows(
        ShopStaffRole.cashierCounter,
        ShopStaffCapability.counterSale,
      ),
      isTrue,
    );
    expect(
      ShopStaffRolePolicy.allows(
        ShopStaffRole.cashierCounter,
        ShopStaffCapability.stockChange,
      ),
      isFalse,
    );
    expect(
      ShopStaffRolePolicy.allows(
        ShopStaffRole.stockStaff,
        ShopStaffCapability.stockChange,
      ),
      isTrue,
    );
    expect(
      ShopStaffRolePolicy.allows(
        ShopStaffRole.cafeWaiter,
        ShopStaffCapability.cafeOrderWrite,
      ),
      isTrue,
    );
    expect(
      ShopStaffRolePolicy.allows(
        ShopStaffRole.cafeKitchenBar,
        ShopStaffCapability.cafeCashComplete,
      ),
      isFalse,
    );
    expect(
      ShopStaffRolePolicy.allows(
        ShopStaffRole.manager,
        ShopStaffCapability.managementRead,
      ),
      isTrue,
    );
    expect(
      ShopStaffRolePolicy.allows(
        ShopStaffRole.cashierCounter,
        ShopStaffCapability.cashShiftManage,
      ),
      isTrue,
    );
    expect(
      ShopStaffRolePolicy.allows(
        ShopStaffRole.cashierCounter,
        ShopStaffCapability.productDetailsWrite,
      ),
      isFalse,
    );
  });

  test(
    'anonymous single-device Core stock remains offline and durable',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await _seed(database);
        expect(
          await database.changeStock(
            operationId: 'core-receive',
            productId: 'tea',
            kind: 'receive',
            quantity: 2,
            expectedOnHand: 5,
          ),
          7,
        );
        expect(await database.countOutboxOperations(), 2);
      } finally {
        await database.close();
      }
    },
  );

  test('managed stock defaults unavailable with no mutation', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _seedManaged(database);
      final before = await _snapshot(database);
      await expectLater(
        database.changeStock(
          operationId: 'managed-default-denied',
          productId: 'tea',
          kind: 'receive',
          quantity: 2,
          expectedOnHand: 5,
          staffActorId: 'stock-1',
        ),
        throwsA(
          isA<ShopStaffAuthorizationException>().having(
            (error) => error.code,
            'code',
            'shop_staff_authorization_unavailable',
          ),
        ),
      );
      expect(await _snapshot(database), before);
    } finally {
      await database.close();
    }
  });

  test('managed counter sale defaults unavailable with no mutation', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _seedManaged(database);
      final before = await _snapshot(database);
      await expectLater(
        database.recordCashSale(
          operationId: 'managed-counter-default-denied',
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
        ),
        throwsA(
          isA<ShopStaffAuthorizationException>().having(
            (error) => error.code,
            'code',
            'shop_staff_authorization_unavailable',
          ),
        ),
      );
      expect(await _snapshot(database), before);
    } finally {
      await database.close();
    }
  });

  test('managed price edit defaults unavailable with no mutation', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _seedManaged(database);
      final before = await _snapshot(database);
      await expectLater(
        database.updateProductDetails(
          operationId: 'managed-price-default-denied',
          productId: 'tea',
          expectedName: 'Tea',
          expectedCategory: '',
          expectedPriceMmk: 1000,
          expectedBarcode: null,
          name: 'Tea',
          category: '',
          priceMmk: 1200,
          barcode: null,
        ),
        throwsA(
          isA<ShopStaffAuthorizationException>().having(
            (error) => error.code,
            'code',
            'shop_staff_authorization_unavailable',
          ),
        ),
      );
      expect(await _snapshot(database), before);
    } finally {
      await database.close();
    }
  });

  test('managed shift open defaults unavailable with no mutation', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _seedManaged(database);
      final before = await _snapshot(database);
      await expectLater(
        database.openCashShift(
          operationId: 'managed-open-default-denied',
          operatorLabel: 'Cashier',
          openingFloatMmk: 10000,
        ),
        throwsA(
          isA<ShopStaffAuthorizationException>().having(
            (error) => error.code,
            'code',
            'shop_staff_authorization_unavailable',
          ),
        ),
      );
      expect(await _snapshot(database), before);
      expect(await database.readOpenCashShift(), isNull);
    } finally {
      await database.close();
    }
  });

  test('managed shift close defaults unavailable with no mutation', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _seed(database);
      final shift = await database.openCashShift(
        operationId: 'core-shift-before-attach',
        operatorLabel: 'Cashier',
        openingFloatMmk: 10000,
      );
      await database.attachAuthenticatedManagedWorkspace(
        const ShopAuthenticatedWorkspaceSelection(
          workspaceId: 'workspace-a',
          actorId: 'owner-1',
        ),
      );
      final review = await database.readCashShiftReview(shift.id);
      final before = await _snapshot(database);
      await expectLater(
        database.closeCashShift(
          shiftId: shift.id,
          operationId: 'managed-close-default-denied',
          seenSaleCount: review.saleCount,
          seenCashTotalMmk: review.cashSalesTotalMmk,
          countedCashMmk: 10000,
        ),
        throwsA(
          isA<ShopStaffAuthorizationException>().having(
            (error) => error.code,
            'code',
            'shop_staff_authorization_unavailable',
          ),
        ),
      );
      expect(await _snapshot(database), before);
      expect((await database.readOpenCashShift())?.id, shift.id);
    } finally {
      await database.close();
    }
  });

  test(
    'managed retail sale requires cashier or management authority',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await _seedManaged(database);
        final storeRef = await database.readStoreRef();
        final before = await _snapshot(database);
        await expectLater(
          database.recordCashSale(
            operationId: 'waiter-retail-sale-denied',
            lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
            staffActorId: 'waiter-1',
            staffAuthorizer: _authorizer(
              role: ShopStaffRole.cafeWaiter,
              storeRef: storeRef,
              actorId: 'waiter-1',
            ),
          ),
          throwsA(
            isA<ShopStaffAuthorizationException>().having(
              (error) => error.code,
              'code',
              'shop_staff_capability_denied',
            ),
          ),
        );
        expect(await _snapshot(database), before);

        final receipt = await database.recordCashSale(
          operationId: 'cashier-retail-sale',
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
          staffActorId: 'cashier-1',
          staffAuthorizer: _authorizer(
            role: ShopStaffRole.cashierCounter,
            storeRef: storeRef,
            actorId: 'cashier-1',
          ),
        );
        expect(receipt.totalMmk, 1000);
        expect(await database.countSales(), 1);
        expect((await database.readActiveProducts()).single.onHand, 4);
      } finally {
        await database.close();
      }
    },
  );

  test('managed price edit requires management authority', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _seedManaged(database);
      final storeRef = await database.readStoreRef();
      final before = await _snapshot(database);
      Future<void> edit({
        required String operationId,
        required String actorId,
        required ShopStaffRole role,
      }) => database.updateProductDetails(
        operationId: operationId,
        productId: 'tea',
        expectedName: 'Tea',
        expectedCategory: '',
        expectedPriceMmk: 1000,
        expectedBarcode: null,
        name: 'Tea',
        category: '',
        priceMmk: 1200,
        barcode: null,
        staffActorId: actorId,
        staffAuthorizer: _authorizer(
          role: role,
          storeRef: storeRef,
          actorId: actorId,
        ),
      );

      await expectLater(
        edit(
          operationId: 'cashier-price-denied',
          actorId: 'cashier-1',
          role: ShopStaffRole.cashierCounter,
        ),
        throwsA(
          isA<ShopStaffAuthorizationException>().having(
            (error) => error.code,
            'code',
            'shop_staff_capability_denied',
          ),
        ),
      );
      expect(await _snapshot(database), before);
      await edit(
        operationId: 'manager-price-allowed',
        actorId: 'manager-1',
        role: ShopStaffRole.manager,
      );
      expect((await database.readActiveProducts()).single.priceMmk, 1200);
    } finally {
      await database.close();
    }
  });

  test(
    'managed shift close requires cashier or management authority',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await _seedManaged(database);
        final storeRef = await database.readStoreRef();
        final cashier = _authorizer(
          role: ShopStaffRole.cashierCounter,
          storeRef: storeRef,
          actorId: 'cashier-1',
        );
        final shift = await database.openCashShift(
          operationId: 'cashier-shift-open',
          operatorLabel: 'Cashier',
          openingFloatMmk: 10000,
          staffActorId: 'cashier-1',
          staffAuthorizer: cashier,
        );
        final review = await database.readCashShiftReview(shift.id);
        final before = await _snapshot(database);
        await expectLater(
          database.closeCashShift(
            shiftId: shift.id,
            operationId: 'waiter-shift-close-denied',
            seenSaleCount: review.saleCount,
            seenCashTotalMmk: review.cashSalesTotalMmk,
            countedCashMmk: 10000,
            staffActorId: 'waiter-1',
            staffAuthorizer: _authorizer(
              role: ShopStaffRole.cafeWaiter,
              storeRef: storeRef,
              actorId: 'waiter-1',
            ),
          ),
          throwsA(
            isA<ShopStaffAuthorizationException>().having(
              (error) => error.code,
              'code',
              'shop_staff_capability_denied',
            ),
          ),
        );
        expect(await _snapshot(database), before);
        expect((await database.readOpenCashShift())?.id, shift.id);

        final closed = await database.closeCashShift(
          shiftId: shift.id,
          operationId: 'cashier-shift-close',
          seenSaleCount: review.saleCount,
          seenCashTotalMmk: review.cashSalesTotalMmk,
          countedCashMmk: 10000,
          staffActorId: 'cashier-1',
          staffAuthorizer: cashier,
        );
        expect(closed.state, 'closed');
        expect(await database.readOpenCashShift(), isNull);
      } finally {
        await database.close();
      }
    },
  );

  for (final denial
      in <String, _SyntheticStaffAuthorizer Function(String storeRef)>{
        'shop_staff_wrong_workspace': (storeRef) => _authorizer(
          role: ShopStaffRole.stockStaff,
          storeRef: storeRef,
          workspaceId: 'workspace-b',
        ),
        'shop_staff_wrong_store': (_) =>
            _authorizer(role: ShopStaffRole.stockStaff, storeRef: '0' * 64),
        'shop_staff_wrong_store_binding': (storeRef) => _authorizer(
          role: ShopStaffRole.stockStaff,
          storeRef: storeRef,
          storeBindingActorId: 'different-owner',
        ),
        'shop_staff_wrong_actor': (storeRef) => _authorizer(
          role: ShopStaffRole.stockStaff,
          storeRef: storeRef,
          actorId: 'other-stock',
        ),
        'shop_staff_session_stale': (storeRef) => _authorizer(
          role: ShopStaffRole.stockStaff,
          storeRef: storeRef,
          signedSessionGeneration: 4,
          currentSessionGeneration: 5,
        ),
        'shop_staff_session_revoked': (storeRef) => _authorizer(
          role: ShopStaffRole.stockStaff,
          storeRef: storeRef,
          revoked: true,
        ),
        'shop_staff_offline_unavailable': (storeRef) => _authorizer(
          role: ShopStaffRole.stockStaff,
          storeRef: storeRef,
          online: false,
        ),
        'shop_staff_signature_invalid': (storeRef) => _authorizer(
          role: ShopStaffRole.stockStaff,
          storeRef: storeRef,
          signatureValid: false,
        ),
        'shop_staff_capability_denied': (storeRef) =>
            _authorizer(role: ShopStaffRole.cashierCounter, storeRef: storeRef),
      }.entries) {
    test('${denial.key} rejects managed stock without mutation', () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await _seedManaged(database);
        final storeRef = await database.readStoreRef();
        final before = await _snapshot(database);
        await expectLater(
          database.changeStock(
            operationId: denial.key,
            productId: 'tea',
            kind: 'receive',
            quantity: 2,
            expectedOnHand: 5,
            staffActorId: 'stock-1',
            staffAuthorizer: denial.value(storeRef),
          ),
          throwsA(
            isA<ShopStaffAuthorizationException>().having(
              (error) => error.code,
              'code',
              denial.key,
            ),
          ),
        );
        expect(await _snapshot(database), before);
      } finally {
        await database.close();
      }
    });
  }

  test(
    'managed stock queues once, survives restart, and rejects conflict',
    () async {
      final root = await Directory.systemTemp.createTemp('shop-staff-stock-');
      final file = File('${root.path}/shop.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      try {
        await _seedManaged(database);
        final authorizer = _authorizer(
          role: ShopStaffRole.stockStaff,
          storeRef: await database.readStoreRef(),
        );
        expect(
          await database.changeStock(
            operationId: 'managed-receive-1',
            productId: 'tea',
            kind: 'receive',
            quantity: 2,
            expectedOnHand: 5,
            staffActorId: 'stock-1',
            staffAuthorizer: authorizer,
          ),
          7,
        );
        await database.close();
        database = ShopDatabase(NativeDatabase(file));
        expect(
          await database.changeStock(
            operationId: 'managed-receive-1',
            productId: 'tea',
            kind: 'receive',
            quantity: 2,
            expectedOnHand: 5,
            staffActorId: 'stock-1',
            staffAuthorizer: authorizer,
          ),
          7,
        );
        await expectLater(
          database.changeStock(
            operationId: 'managed-receive-1',
            productId: 'tea',
            kind: 'receive',
            quantity: 3,
            expectedOnHand: 5,
            staffActorId: 'stock-1',
            staffAuthorizer: authorizer,
          ),
          throwsA(isA<StateError>()),
        );
        expect((await database.readActiveProducts()).single.onHand, 7);
        expect(await database.countStockMovements(), 2);
        final queued = await database
            .customSelect(
              "SELECT COUNT(*) AS total FROM shop_sync_outbox WHERE operation_id = 'managed-receive-1' AND state = 'pending'",
            )
            .getSingle();
        expect(queued.read<int>('total'), 1);
      } finally {
        await database.close();
        await root.delete(recursive: true);
      }
    },
  );

  test('managed cafe waiter writes order and cashier completes it', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _seedManaged(database);
      final storeRef = await database.readStoreRef();
      final waiterStore = ShopCafeOrderStore(
        database,
        staffActorId: 'waiter-1',
        staffAuthorizer: _authorizer(
          role: ShopStaffRole.cafeWaiter,
          storeRef: storeRef,
          actorId: 'waiter-1',
        ),
      );
      final order = await waiterStore.applyCommand(_cafeCommand(), const {});
      expect(order.ticket.version, 1);
      expect(
        (await waiterStore.applyCommand(
          _cafeCommand(),
          const {},
        )).ticket.version,
        1,
      );
      final beforeConflict = await _snapshot(database);
      await expectLater(
        waiterStore.applyCommand(_cafeCommand(quantity: 2), const {}),
        throwsA(isA<FormatException>()),
      );
      expect(await _snapshot(database), beforeConflict);
      final beforeDenied = await _snapshot(database);
      await expectLater(
        waiterStore.completeCash(
          orderId: 'table-order-1',
          operationId: 'cafe-sale-denied',
          expectedTicketVersion: 1,
          expectedStateRevision: 0,
        ),
        throwsA(
          isA<ShopStaffAuthorizationException>().having(
            (error) => error.code,
            'code',
            'shop_staff_capability_denied',
          ),
        ),
      );
      expect(await _snapshot(database), beforeDenied);

      final cashierStore = ShopCafeOrderStore(
        database,
        staffActorId: 'cashier-1',
        staffAuthorizer: _authorizer(
          role: ShopStaffRole.cashierCounter,
          storeRef: storeRef,
          actorId: 'cashier-1',
        ),
      );
      final receipt = await cashierStore.completeCash(
        orderId: 'table-order-1',
        operationId: 'cafe-sale-1',
        expectedTicketVersion: 1,
        expectedStateRevision: 0,
      );
      expect(receipt.totalMmk, 1000);
      expect(await database.countSales(), 1);
      expect((await database.readActiveProducts()).single.onHand, 4);
    } finally {
      await database.close();
    }
  });

  test(
    'managed cafe cancellation requires active order-writer authority',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await _seedManaged(database);
        final storeRef = await database.readStoreRef();
        final activeWaiter = _authorizer(
          role: ShopStaffRole.cafeWaiter,
          storeRef: storeRef,
          actorId: 'waiter-1',
        );
        final order = await ShopCafeOrderStore(
          database,
          staffActorId: 'waiter-1',
          staffAuthorizer: activeWaiter,
        ).applyCommand(_cafeCommand(), const {});
        final beforeDenied = await _snapshot(database);

        for (final denial in <String, _SyntheticStaffAuthorizer>{
          'shop_staff_session_revoked': _authorizer(
            role: ShopStaffRole.cafeWaiter,
            storeRef: storeRef,
            actorId: 'waiter-1',
            revoked: true,
          ),
          'shop_staff_capability_denied': _authorizer(
            role: ShopStaffRole.cashierCounter,
            storeRef: storeRef,
            actorId: 'cashier-1',
          ),
        }.entries) {
          await expectLater(
            ShopCafeOrderStore(
              database,
              staffActorId: denial.key == 'shop_staff_capability_denied'
                  ? 'cashier-1'
                  : 'waiter-1',
              staffAuthorizer: denial.value,
            ).cancel(
              orderId: order.ticket.id,
              operationId: 'denied-cancel-${denial.key}',
              expectedStateRevision: order.stateRevision,
            ),
            throwsA(
              isA<ShopStaffAuthorizationException>().having(
                (error) => error.code,
                'code',
                denial.key,
              ),
            ),
          );
          expect(await _snapshot(database), beforeDenied);
          expect(
            await database
                .customSelect('SELECT 1 FROM shop_cafe_order_cancellations')
                .get(),
            isEmpty,
          );
        }

        final waiterStore = ShopCafeOrderStore(
          database,
          staffActorId: 'waiter-1',
          staffAuthorizer: activeWaiter,
        );
        final cancelled = await waiterStore.cancel(
          orderId: order.ticket.id,
          operationId: 'managed-cafe-cancel',
          expectedStateRevision: order.stateRevision,
        );
        expect(cancelled.state, 'cancelled');
        expect(
          (await waiterStore.cancel(
            orderId: order.ticket.id,
            operationId: 'managed-cafe-cancel',
            expectedStateRevision: order.stateRevision,
          )).state,
          'cancelled',
        );
        expect(await database.countSales(), 0);
        expect((await database.readActiveProducts()).single.onHand, 5);
        expect(
          await database
              .customSelect('SELECT 1 FROM shop_cafe_order_cancellations')
              .get(),
          hasLength(1),
        );
        expect(
          await database
              .customSelect(
                "SELECT 1 FROM shop_sync_outbox WHERE operation_id = "
                "'managed-cafe-cancel' AND event_type = "
                "'shop.cafe_order.cancelled.v1'",
              )
              .get(),
          hasLength(1),
        );
      } finally {
        await database.close();
      }
    },
  );

  test('managed kitchen status requires the kitchen role', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await _seedManaged(database);
      final storeRef = await database.readStoreRef();
      final order = await ShopCafeOrderStore(
        database,
        kitchenEntitlement: const _AllowKitchenEntitlement(),
        staffActorId: 'waiter-1',
        staffAuthorizer: _authorizer(
          role: ShopStaffRole.cafeWaiter,
          storeRef: storeRef,
          actorId: 'waiter-1',
        ),
      ).applyCommand(_cafeRoutedCommand(), const {});
      final beforeDenied = await _snapshot(database);
      await expectLater(
        ShopCafeOrderStore(
          database,
          kitchenEntitlement: const _AllowKitchenEntitlement(),
          staffActorId: 'waiter-1',
          staffAuthorizer: _authorizer(
            role: ShopStaffRole.cafeWaiter,
            storeRef: storeRef,
            actorId: 'waiter-1',
          ),
        ).advanceKitchenStatus(
          orderId: order.ticket.id,
          lineId: order.ticket.lines.single.id,
          operationId: 'waiter-status-denied',
          expectedTicketVersion: order.ticket.version,
          expectedStatus: 'pending_local',
        ),
        throwsA(
          isA<ShopStaffAuthorizationException>().having(
            (error) => error.code,
            'code',
            'shop_staff_capability_denied',
          ),
        ),
      );
      expect(await _snapshot(database), beforeDenied);

      final kitchenStore = ShopCafeOrderStore(
        database,
        kitchenEntitlement: const _AllowKitchenEntitlement(),
        staffActorId: 'kitchen-1',
        staffAuthorizer: _authorizer(
          role: ShopStaffRole.cafeKitchenBar,
          storeRef: storeRef,
          actorId: 'kitchen-1',
        ),
      );
      final preparing = await kitchenStore.advanceKitchenStatus(
        orderId: order.ticket.id,
        lineId: order.ticket.lines.single.id,
        operationId: 'kitchen-status-allowed',
        expectedTicketVersion: order.ticket.version,
        expectedStatus: 'pending_local',
      );
      expect(
        preparing.kitchenStatusByLine[order.ticket.lines.single.id],
        'preparing_local',
      );
      expect(await database.countSales(), 0);
      expect((await database.readActiveProducts()).single.onHand, 5);
    } finally {
      await database.close();
    }
  });

  test(
    'managed cafe sale replay reauthorizes after restart without mutation',
    () async {
      final root = await Directory.systemTemp.createTemp(
        'shop-staff-cafe-replay-',
      );
      final file = File('${root.path}/shop.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      try {
        await _seedManaged(database);
        final storeRef = await database.readStoreRef();
        await ShopCafeOrderStore(
          database,
          staffActorId: 'waiter-1',
          staffAuthorizer: _authorizer(
            role: ShopStaffRole.cafeWaiter,
            storeRef: storeRef,
            actorId: 'waiter-1',
          ),
        ).applyCommand(_cafeCommand(), const {});
        final validCashier = _authorizer(
          role: ShopStaffRole.cashierCounter,
          storeRef: storeRef,
          actorId: 'cashier-1',
        );
        final receipt =
            await ShopCafeOrderStore(
              database,
              staffActorId: 'cashier-1',
              staffAuthorizer: validCashier,
            ).completeCash(
              orderId: 'table-order-1',
              operationId: 'cafe-sale-replay',
              expectedTicketVersion: 1,
              expectedStateRevision: 0,
            );
        await database.close();

        database = ShopDatabase(NativeDatabase(file));
        final before = await _snapshot(database);
        for (final denial in <String, _SyntheticStaffAuthorizer>{
          'shop_staff_session_revoked': _authorizer(
            role: ShopStaffRole.cashierCounter,
            storeRef: storeRef,
            actorId: 'cashier-1',
            revoked: true,
          ),
          'shop_staff_session_stale': _authorizer(
            role: ShopStaffRole.cashierCounter,
            storeRef: storeRef,
            actorId: 'cashier-1',
            signedSessionGeneration: 6,
            currentSessionGeneration: 7,
          ),
          'shop_staff_wrong_workspace': _authorizer(
            role: ShopStaffRole.cashierCounter,
            storeRef: storeRef,
            actorId: 'cashier-1',
            workspaceId: 'workspace-b',
          ),
        }.entries) {
          await expectLater(
            ShopCafeOrderStore(
              database,
              staffActorId: 'cashier-1',
              staffAuthorizer: denial.value,
            ).completeCash(
              orderId: 'table-order-1',
              operationId: 'cafe-sale-replay',
              expectedTicketVersion: 1,
              expectedStateRevision: 0,
            ),
            throwsA(
              isA<ShopStaffAuthorizationException>().having(
                (error) => error.code,
                'code',
                denial.key,
              ),
            ),
          );
          expect(await _snapshot(database), before);
        }
        final replay =
            await ShopCafeOrderStore(
              database,
              staffActorId: 'cashier-1',
              staffAuthorizer: validCashier,
            ).completeCash(
              orderId: 'table-order-1',
              operationId: 'cafe-sale-replay',
              expectedTicketVersion: 1,
              expectedStateRevision: 0,
            );
        expect(replay.id, receipt.id);
        expect(await _snapshot(database), before);
      } finally {
        await database.close();
        await root.delete(recursive: true);
      }
    },
  );
}

Future<void> _seed(ShopDatabase database) async {
  await database.addProduct(
    id: 'tea',
    name: 'Tea',
    priceMmk: 1000,
    openingStock: 5,
  );
}

Future<void> _seedManaged(ShopDatabase database) async {
  await _seed(database);
  await database.attachAuthenticatedManagedWorkspace(
    const ShopAuthenticatedWorkspaceSelection(
      workspaceId: 'workspace-a',
      actorId: 'owner-1',
    ),
  );
}

CafeOrderCommand _cafeCommand({int quantity = 1}) => CafeOrderCommand(
  id: 'waiter-command-1',
  ticketId: 'table-order-1',
  expectedVersion: 0,
  lines: [
    CafeOrderLine.local(
      id: 'line-1',
      productId: 'tea',
      quantity: quantity,
      baseUnitPriceMmk: 1000,
      remark: 'less sugar',
      modifiers: const [],
    ),
  ],
  serviceContext: const CafeServiceContext(
    areaLabel: 'Front',
    tableLabel: 'T1',
  ),
);

CafeOrderCommand _cafeRoutedCommand() => CafeOrderCommand(
  id: 'waiter-routed-command-1',
  ticketId: 'routed-table-order-1',
  expectedVersion: 0,
  lines: [
    CafeOrderLine(
      id: 'routed-line-1',
      productId: 'tea',
      quantity: 1,
      baseUnitPriceMmk: 1000,
      remark: 'less sugar',
      modifiers: const [],
      preparationStation: 'kitchen',
    ),
  ],
  serviceContext: const CafeServiceContext(
    areaLabel: 'Front',
    tableLabel: 'T1',
  ),
);

class _AllowKitchenEntitlement implements ShopCafeKitchenEntitlement {
  const _AllowKitchenEntitlement();

  @override
  bool get allowsKitchenDispatch => true;

  @override
  void requireKitchenDispatch({
    required String orderId,
    required String commandId,
  }) {}
}

_SyntheticStaffAuthorizer _authorizer({
  required ShopStaffRole role,
  required String storeRef,
  String workspaceId = 'workspace-a',
  String storeBindingActorId = 'owner-1',
  String actorId = 'stock-1',
  int signedSessionGeneration = 7,
  int currentSessionGeneration = 7,
  bool revoked = false,
  bool online = true,
  bool signatureValid = true,
}) => _SyntheticStaffAuthorizer(
  workspaceId: workspaceId,
  storeRef: storeRef,
  storeBindingActorId: storeBindingActorId,
  actorId: actorId,
  role: role,
  signedSessionGeneration: signedSessionGeneration,
  currentSessionGeneration: currentSessionGeneration,
  revoked: revoked,
  online: online,
  signatureValid: signatureValid,
);

class _SyntheticStaffAuthorizer implements ShopStaffCommandAuthorizer {
  const _SyntheticStaffAuthorizer({
    required this.workspaceId,
    required this.storeRef,
    required this.storeBindingActorId,
    required this.actorId,
    required this.role,
    required this.signedSessionGeneration,
    required this.currentSessionGeneration,
    required this.revoked,
    required this.online,
    required this.signatureValid,
  });

  final String workspaceId;
  final String storeRef;
  final String storeBindingActorId;
  final String actorId;
  final ShopStaffRole role;
  final int signedSessionGeneration;
  final int currentSessionGeneration;
  final bool revoked;
  final bool online;
  final bool signatureValid;

  @override
  void authorize(ShopStaffCommandAuthorizationRequest request) {
    if (!online) _deny('shop_staff_offline_unavailable');
    if (!signatureValid) _deny('shop_staff_signature_invalid');
    if (request.workspaceId != workspaceId) {
      _deny('shop_staff_wrong_workspace');
    }
    if (request.storeRef != storeRef) _deny('shop_staff_wrong_store');
    if (request.storeBindingActorId != storeBindingActorId) {
      _deny('shop_staff_wrong_store_binding');
    }
    if (request.claimedActorId != actorId) _deny('shop_staff_wrong_actor');
    if (revoked) _deny('shop_staff_session_revoked');
    if (signedSessionGeneration != currentSessionGeneration) {
      _deny('shop_staff_session_stale');
    }
    if (!ShopStaffRolePolicy.allows(role, request.capability)) {
      _deny('shop_staff_capability_denied');
    }
  }

  Never _deny(String code) => throw ShopStaffAuthorizationException(code);
}

Future<Map<String, Object?>> _snapshot(ShopDatabase database) async {
  final product = (await database.readActiveProducts()).single;
  final rows = await database
      .customSelect(
        'SELECT '
        '(SELECT COUNT(*) FROM shop_sales) AS sales, '
        '(SELECT COUNT(*) FROM shop_cafe_orders) AS cafe_orders, '
        '(SELECT COUNT(*) FROM shop_cafe_order_state_events) AS cafe_state_events, '
        '(SELECT state FROM shop_cafe_orders ORDER BY id LIMIT 1) AS cafe_state, '
        '(SELECT COUNT(*) FROM shop_stock_movements) AS stock_movements, '
        '(SELECT COUNT(*) FROM shop_sync_outbox) AS outbox',
      )
      .getSingle();
  return {
    'onHand': product.onHand,
    'sales': rows.read<int>('sales'),
    'cafeOrders': rows.read<int>('cafe_orders'),
    'cafeStateEvents': rows.read<int>('cafe_state_events'),
    'cafeState': rows.readNullable<String>('cafe_state'),
    'stockMovements': rows.read<int>('stock_movements'),
    'outbox': rows.read<int>('outbox'),
    'product': jsonEncode({
      'id': product.id,
      'name': product.name,
      'price': product.priceMmk,
    }),
  };
}
