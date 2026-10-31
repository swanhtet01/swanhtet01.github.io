import 'dart:convert';
import 'dart:io';

import 'package:drift/isolate.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sqlite3/sqlite3.dart';
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_cafe_order_contract.dart';
import 'package:supermega_shop/shop_cafe_order_store.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_models.dart';

void main() {
  test('empty v1 store migrates through strict schemas to v22', () async {
    final root = await Directory.systemTemp.createTemp('shop-cash-v1-');
    final file = File('${root.path}/shop.sqlite');
    final raw = sqlite3.open(file.path);
    try {
      raw.execute('PRAGMA user_version = 1');
    } finally {
      raw.close();
    }

    var database = ShopDatabase(NativeDatabase(file));
    try {
      await database.verifyReadyForUse();
      await database.addProduct(
        id: 'v1-rice',
        name: 'V1 rice',
        priceMmk: 4000,
        openingStock: 2,
      );
      final receipt = await database.recordCashSale(
        operationId: 'v1-cash-sale',
        lines: const [ShopSaleLineInput(productId: 'v1-rice', quantity: 1)],
        cashTenderedMmk: 5000,
      );
      expect(receipt.cashTenderedMmk, 5000);
      expect(receipt.cashChangeMmk, 1000);

      final snapshot = File('${root.path}/snapshot.sqlite');
      await database.exportVerifiedLocalSnapshot(snapshot);
      ShopBackup.verifySnapshot(snapshot);
      await database.close();

      database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      final reopened = (await database.readRecentSales()).single;
      expect(reopened.cashTenderedMmk, 5000);
      expect(reopened.cashChangeMmk, 1000);
      expect((await database.readActiveProducts()).single.onHand, 1);
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test('v21 cash sale migrates to v22 with unknown legacy tender', () async {
    final root = await Directory.systemTemp.createTemp('shop-cash-v21-');
    final file = File('${root.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    try {
      await database.addProduct(
        id: 'legacy-rice',
        name: 'Legacy rice',
        priceMmk: 4000,
        openingStock: 2,
      );
      await database.recordCashSale(
        operationId: 'legacy-cash-sale',
        lines: const [ShopSaleLineInput(productId: 'legacy-rice', quantity: 1)],
      );
      await database.customStatement(
        'ALTER TABLE shop_sales DROP COLUMN cash_tendered_mmk',
      );
      final legacySaleColumns =
          (await database.customSelect('PRAGMA table_info(shop_sales)').get())
              .map((row) => row.read<String>('name'))
              .toSet();
      expect(
        legacySaleColumns,
        shopBaseTableColumnsForVersion(21)['shop_sales'],
      );
      await database.customStatement('PRAGMA user_version = 21');
      await database.close();

      database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      final receipt = (await database.readRecentSales()).single;
      expect(database.schemaVersion, 22);
      expect(receipt.cashTenderedMmk, isNull);
      expect(receipt.cashChangeMmk, isNull);
      expect((await database.readActiveProducts()).single.onHand, 1);
      expect(await database.countSales(), 1);
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test('v20 store migrates to an empty verified pending-cash schema', () async {
    final root = await Directory.systemTemp.createTemp('shop-cash-v20-');
    final file = File('${root.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    try {
      await database.countSales();
      await database.customStatement(
        'ALTER TABLE shop_sales DROP COLUMN cash_tendered_mmk',
      );
      for (final entry
          in shopPendingCashCheckoutSchemaDefinitionsV21().entries
              .toList()
              .reversed) {
        final type = shopSchemaObjectTypeForDefinition(entry.value);
        await database.customStatement(
          'DROP ${type == 'table'
              ? 'TABLE'
              : type == 'index'
              ? 'INDEX'
              : 'TRIGGER'} IF EXISTS ${entry.key}',
        );
      }
      await database.customStatement('PRAGMA user_version = 20');
      await database.close();
      database = ShopDatabase(NativeDatabase(file));
      await database.verifyReadyForUse();
      final objects = await database
          .customSelect(
            "SELECT name FROM sqlite_master WHERE name LIKE 'shop_pending_cash_checkouts%'",
          )
          .get();
      expect(
        objects.map((row) => row.read<String>('name')).toSet(),
        shopPendingCashCheckoutSchemaDefinitionsV21().keys.toSet(),
      );
      expect(
        await database.readPendingCashCheckout(
          checkoutKind: 'counter',
          subjectId: 'missing',
        ),
        isNull,
      );
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test('counter cash intent survives restart, blocks shift close, and commits once', () async {
    final root = await Directory.systemTemp.createTemp('shop-pending-counter-');
    final file = File('${root.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    try {
      await database.addProduct(
        id: 'rice',
        name: 'Rice',
        priceMmk: 4000,
        openingStock: 10,
      );
      await database.saveCounterSaleDraft(
        operationId: 'counter-cash-1',
        quantities: const {'rice': 2},
      );
      final shift = await database.openCashShift(
        operationId: 'shift-open-1',
        operatorLabel: 'May',
        openingFloatMmk: 10000,
      );
      final begins = await Future.wait([
        for (var index = 0; index < 24; index++)
          database.beginPendingCashCheckout(
            operationId: 'counter-cash-1',
            checkoutKind: 'counter',
            subjectId: 'counter-cash-1',
          ),
      ]);
      expect(begins.map((intent) => intent.operationId).toSet(), {
        'counter-cash-1',
      });
      expect(begins.map((intent) => intent.capturedShiftId).toSet(), {
        shift.id,
      });

      final review = await database.readCashShiftReview(shift.id);
      await expectLater(
        database.closeCashShift(
          shiftId: shift.id,
          operationId: 'close-while-cash-pending',
          seenSaleCount: review.saleCount,
          seenCashTotalMmk: review.cashSalesTotalMmk,
          countedCashMmk: 10000,
        ),
        throwsA(anything),
      );
      expect((await database.readOpenCashShift())?.id, shift.id);

      await database.close();
      database = ShopDatabase(NativeDatabase(file));
      final recovered = await database.readPendingCashCheckout(
        checkoutKind: 'counter',
        subjectId: 'counter-cash-1',
      );
      expect(recovered?.capturedShiftId, shift.id);
      expect(
        (await database.readCounterSaleDraft())?.operationId,
        'counter-cash-1',
      );

      final receipt = await database.recordCashSale(
        operationId: 'counter-cash-1',
        lines: const [ShopSaleLineInput(productId: 'rice', quantity: 2)],
        requirePendingCashCheckout: true,
      );
      await database.close();
      database = ShopDatabase(NativeDatabase(file));
      final replay = await database.recordCashSale(
        operationId: 'counter-cash-1',
        lines: const [ShopSaleLineInput(productId: 'rice', quantity: 2)],
        requirePendingCashCheckout: true,
      );
      expect(replay.id, receipt.id);
      expect(await database.countSales(), 1);
      expect((await database.readActiveProducts()).single.onHand, 8);
      expect(
        await database.readPendingCashCheckout(
          checkoutKind: 'counter',
          subjectId: 'counter-cash-1',
        ),
        isNull,
      );
      expect(await database.readCounterSaleDraft(), isNull);
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test(
    'captured no-shift intent rejects a newly opened shift until cancelled',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await database.addProduct(
          id: 'tea',
          name: 'Tea',
          priceMmk: 2500,
          openingStock: 5,
        );
        await database.saveCounterSaleDraft(
          operationId: 'counter-no-shift',
          quantities: const {'tea': 1},
        );
        final pending = await database.beginPendingCashCheckout(
          operationId: 'counter-no-shift',
          checkoutKind: 'counter',
          subjectId: 'counter-no-shift',
        );
        expect(pending.capturedShiftId, isNull);
        await database.openCashShift(
          operationId: 'later-shift',
          operatorLabel: 'May',
          openingFloatMmk: 0,
        );
        await expectLater(
          database.recordCashSale(
            operationId: 'counter-no-shift',
            lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
            requirePendingCashCheckout: true,
          ),
          throwsA(isA<ShopCashShiftChangedException>()),
        );
        expect(await database.countSales(), 0);
        expect((await database.readActiveProducts()).single.onHand, 5);
        await database.cancelPendingCashCheckout(
          checkoutKind: 'counter',
          subjectId: 'counter-no-shift',
        );
        expect(
          (await database.readCounterSaleDraft())?.operationId,
          'counter-no-shift',
        );
      } finally {
        await database.close();
      }
    },
  );

  test('counter intent rejects changed lines and wallet coexistence', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'juice',
        name: 'Juice',
        priceMmk: 1500,
        openingStock: 5,
      );
      await database.saveCounterSaleDraft(
        operationId: 'bound-counter',
        quantities: const {'juice': 1},
      );
      await database.beginPendingCashCheckout(
        operationId: 'bound-counter',
        checkoutKind: 'counter',
        subjectId: 'bound-counter',
      );
      await expectLater(
        database.recordCashSale(
          operationId: 'bound-counter',
          lines: const [ShopSaleLineInput(productId: 'juice', quantity: 2)],
          requirePendingCashCheckout: true,
        ),
        throwsA(isA<StateError>()),
      );
      await expectLater(
        database.createWalletCheckoutIntent(
          operationId: 'bound-counter',
          merchant: MerchantWalletSetup(
            provider: 'KBZPay',
            merchantPhone: null,
            officialQrPayload: _syntheticStaticMmqr(),
            issuerConfirmed: true,
          ),
          lines: const [ShopSaleLineInput(productId: 'juice', quantity: 1)],
        ),
        throwsA(isA<StateError>()),
      );
      expect(await database.countSales(), 0);
      expect((await database.readActiveProducts()).single.onHand, 5);
    } finally {
      await database.close();
    }
  });

  test('stock count preserves quantities in pending counter and cafe cash checkouts', () async {
    final root = await Directory.systemTemp.createTemp(
      'shop-pending-cash-stock-',
    );
    final file = File('${root.path}/shop.sqlite');
    var database = ShopDatabase(NativeDatabase(file));
    try {
      await database.addProduct(
        id: 'pending-cash-tea',
        name: 'Tea',
        priceMmk: 2000,
        openingStock: 5,
      );
      await database.saveCounterSaleDraft(
        operationId: 'pending-counter-sale',
        quantities: const {'pending-cash-tea': 2},
      );
      await database.beginPendingCashCheckout(
        operationId: 'pending-counter-sale',
        checkoutKind: 'counter',
        subjectId: 'pending-counter-sale',
      );

      var cafeStore = ShopCafeOrderStore(database);
      final cafeOrder = await cafeStore.applyCommand(
        CafeOrderCommand(
          id: 'pending-cafe-create',
          ticketId: 'pending-cafe-order',
          expectedVersion: 0,
          lines: [
            CafeOrderLine.local(
              id: 'pending-cafe-line',
              productId: 'pending-cash-tea',
              quantity: 1,
              baseUnitPriceMmk: 2000,
              remark: '',
              modifiers: const [],
            ),
          ],
        ),
        const {},
      );
      await database.beginPendingCashCheckout(
        operationId: 'pending-cafe-sale',
        checkoutKind: 'cafe',
        subjectId: cafeOrder.ticket.id,
      );

      final movementsBefore = await database.countStockMovements();
      final outboxBefore = await database.countOutboxOperations();
      await expectLater(
        database.changeStock(
          operationId: 'count-below-pending-cash',
          productId: 'pending-cash-tea',
          kind: 'count',
          quantity: 2,
          expectedOnHand: 5,
        ),
        throwsA(isA<StateError>()),
      );
      expect((await database.readActiveProducts()).single.onHand, 5);
      expect(await database.countStockMovements(), movementsBefore);
      expect(await database.countOutboxOperations(), outboxBefore);

      expect(
        await database.changeStock(
          operationId: 'count-at-pending-cash-total',
          productId: 'pending-cash-tea',
          kind: 'count',
          quantity: 3,
          expectedOnHand: 5,
        ),
        3,
      );
      final movementsAfterSafeCount = await database.countStockMovements();
      final outboxAfterSafeCount = await database.countOutboxOperations();
      await database.close();

      database = ShopDatabase(NativeDatabase(file));
      cafeStore = ShopCafeOrderStore(database);
      expect((await database.readActiveProducts()).single.onHand, 3);
      expect(await database.countStockMovements(), movementsAfterSafeCount);
      expect(await database.countOutboxOperations(), outboxAfterSafeCount);
      expect(
        await database.readPendingCashCheckout(
          checkoutKind: 'counter',
          subjectId: 'pending-counter-sale',
        ),
        isNotNull,
      );
      expect(
        await database.readPendingCashCheckout(
          checkoutKind: 'cafe',
          subjectId: cafeOrder.ticket.id,
        ),
        isNotNull,
      );
      final counterReceipt = await database.recordCashSale(
        operationId: 'pending-counter-sale',
        lines: const [
          ShopSaleLineInput(productId: 'pending-cash-tea', quantity: 2),
        ],
        requirePendingCashCheckout: true,
      );
      final cafeReceipt = await cafeStore.completeCash(
        orderId: cafeOrder.ticket.id,
        operationId: 'pending-cafe-sale',
        expectedTicketVersion: cafeOrder.ticket.version,
        expectedStateRevision: cafeOrder.stateRevision,
        requirePendingCashCheckout: true,
      );
      expect(counterReceipt.totalMmk, 4000);
      expect(cafeReceipt.totalMmk, 2000);
      expect(await database.countSales(), 2);
      expect((await database.readActiveProducts()).single.onHand, 0);
      expect(await database.countStockMovements(), movementsAfterSafeCount + 2);
      expect(await database.countOutboxOperations(), outboxAfterSafeCount + 2);
      await database.close();

      database = ShopDatabase(NativeDatabase(file));
      cafeStore = ShopCafeOrderStore(database);
      final counterReplay = await database.recordCashSale(
        operationId: 'pending-counter-sale',
        lines: const [
          ShopSaleLineInput(productId: 'pending-cash-tea', quantity: 2),
        ],
        requirePendingCashCheckout: true,
      );
      final cafeReplay = await cafeStore.completeCash(
        orderId: cafeOrder.ticket.id,
        operationId: 'pending-cafe-sale',
        expectedTicketVersion: cafeOrder.ticket.version,
        expectedStateRevision: cafeOrder.stateRevision,
        requirePendingCashCheckout: true,
      );
      expect(counterReplay.id, counterReceipt.id);
      expect(cafeReplay.id, cafeReceipt.id);
      expect(await database.countSales(), 2);
      expect((await database.readActiveProducts()).single.onHand, 0);
      expect(await database.countStockMovements(), movementsAfterSafeCount + 2);
      expect(await database.countOutboxOperations(), outboxAfterSafeCount + 2);
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test('closed captured shift fails runtime and backup verification', () async {
    final root = await Directory.systemTemp.createTemp('shop-cash-corrupt-');
    final file = File('${root.path}/shop.sqlite');
    final database = ShopDatabase(NativeDatabase(file));
    try {
      await database.addProduct(
        id: 'milk',
        name: 'Milk',
        priceMmk: 2000,
        openingStock: 2,
      );
      await database.saveCounterSaleDraft(
        operationId: 'corrupt-counter',
        quantities: const {'milk': 1},
      );
      final shift = await database.openCashShift(
        operationId: 'corrupt-shift',
        operatorLabel: 'May',
        openingFloatMmk: 0,
      );
      await database.beginPendingCashCheckout(
        operationId: 'corrupt-counter',
        checkoutKind: 'counter',
        subjectId: 'corrupt-counter',
      );
      await database.customStatement(
        'DROP TRIGGER shop_pending_cash_checkouts_shift_freeze',
      );
      await database.customStatement(
        "UPDATE shop_cash_shifts SET state = 'closed', "
        "close_operation_id = 'tampered-close', closed_at_millis = 1, "
        'cash_sales_count = 0, cash_sales_total_mmk = 0, '
        'wallet_sales_count = 0, wallet_sales_total_mmk = 0, '
        'expected_cash_mmk = 0, counted_cash_mmk = 0, difference_mmk = 0, '
        'review_sale_count = 0, review_cash_total_mmk = 0, '
        'review_cash_reversal_count = 0, review_cash_drawer_outflow_mmk = 0, '
        'cash_reversal_count = 0, cash_reversal_total_mmk = 0, '
        'cash_drawer_outflow_mmk = 0, cash_movement_count = 0, '
        'cash_in_total_mmk = 0, cash_out_total_mmk = 0, '
        'review_cash_movement_count = 0, review_cash_in_total_mmk = 0, '
        'review_cash_out_total_mmk = 0 WHERE id = ?',
        [shift.id],
      );
      await database.customStatement(shopPendingCashCheckoutShiftFreezeV21Sql);
      await expectLater(
        database.verifyReadyForUse(),
        throwsA(isA<StateError>()),
      );
      await database.close();
      expect(
        () => ShopBackup.verifySnapshot(file),
        throwsA(isA<FormatException>()),
      );
    } finally {
      await database.close();
      await root.delete(recursive: true);
    }
  });

  test(
    'cafe cash intent survives restart and completes the order once',
    () async {
      final root = await Directory.systemTemp.createTemp('shop-pending-cafe-');
      final file = File('${root.path}/shop.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      try {
        await database.addProduct(
          id: 'coffee',
          name: 'Coffee',
          priceMmk: 3000,
          openingStock: 10,
        );
        var store = ShopCafeOrderStore(database);
        final order = await store.applyCommand(
          CafeOrderCommand(
            id: 'cafe-create-1',
            ticketId: 'cafe-order-1',
            expectedVersion: 0,
            lines: [
              CafeOrderLine.local(
                id: 'coffee-line-1',
                productId: 'coffee',
                quantity: 2,
                baseUnitPriceMmk: 3000,
                remark: '',
                modifiers: const [],
              ),
            ],
          ),
          const {},
        );
        final shift = await database.openCashShift(
          operationId: 'cafe-shift-open',
          operatorLabel: 'May',
          openingFloatMmk: 0,
        );
        final pending = await database.beginPendingCashCheckout(
          operationId: 'cafe-sale-1',
          checkoutKind: 'cafe',
          subjectId: order.ticket.id,
        );
        expect(pending.capturedShiftId, shift.id);

        await database.close();
        database = ShopDatabase(NativeDatabase(file));
        store = ShopCafeOrderStore(database);
        final recovered = await store.read(order.ticket.id);
        expect(recovered?.state, 'open');
        final receipt = await store.completeCash(
          orderId: order.ticket.id,
          operationId: pending.operationId,
          expectedTicketVersion: order.ticket.version,
          expectedStateRevision: order.stateRevision,
          requirePendingCashCheckout: true,
        );
        await database.close();
        database = ShopDatabase(NativeDatabase(file));
        store = ShopCafeOrderStore(database);
        final replay = await store.completeCash(
          orderId: order.ticket.id,
          operationId: pending.operationId,
          expectedTicketVersion: order.ticket.version,
          expectedStateRevision: order.stateRevision,
          requirePendingCashCheckout: true,
        );
        expect(replay.id, receipt.id);
        expect(await database.countSales(), 1);
        expect((await database.readActiveProducts()).single.onHand, 8);
        expect((await store.read(order.ticket.id))?.state, 'completed');
        expect(
          await database.readPendingCashCheckout(
            checkoutKind: 'cafe',
            subjectId: order.ticket.id,
          ),
          isNull,
        );
      } finally {
        await database.close();
        await root.delete(recursive: true);
      }
    },
  );

  test(
    'wallet and cafe cash attempts cannot coexist in either order',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await database.addProduct(
          id: 'exclusive-coffee',
          name: 'Coffee',
          priceMmk: 3000,
          openingStock: 5,
        );
        final store = ShopCafeOrderStore(database);
        final order = await store.applyCommand(
          CafeOrderCommand(
            id: 'exclusive-order-create',
            ticketId: 'exclusive-order',
            expectedVersion: 0,
            lines: [
              CafeOrderLine.local(
                id: 'exclusive-line',
                productId: 'exclusive-coffee',
                quantity: 1,
                baseUnitPriceMmk: 3000,
                remark: '',
                modifiers: const [],
              ),
            ],
          ),
          const {},
        );
        await database.createWalletCheckoutIntent(
          operationId: 'wallet-first',
          merchant: MerchantWalletSetup(
            provider: 'KBZPay',
            merchantPhone: null,
            officialQrPayload: _syntheticStaticMmqr(),
            issuerConfirmed: true,
          ),
          lines: const [
            ShopSaleLineInput(productId: 'exclusive-coffee', quantity: 1),
          ],
        );

        await expectLater(
          database.beginPendingCashCheckout(
            operationId: 'cafe-cash-after-wallet',
            checkoutKind: 'cafe',
            subjectId: order.ticket.id,
          ),
          throwsA(
            isA<StateError>().having(
              (error) => error.message,
              'message',
              contains('pending wallet'),
            ),
          ),
        );
        expect(
          await database.readPendingCashCheckout(
            checkoutKind: 'cafe',
            subjectId: order.ticket.id,
          ),
          isNull,
        );
        expect(
          (await database.readPendingWalletCheckout())?.operationId,
          'wallet-first',
        );
        final cashRetryErrors = await Future.wait([
          for (var index = 0; index < 16; index++)
            () async {
              try {
                await database.beginPendingCashCheckout(
                  operationId: 'cafe-cash-wallet-race-$index',
                  checkoutKind: 'cafe',
                  subjectId: order.ticket.id,
                );
                return null;
              } catch (error) {
                return error;
              }
            }(),
        ]);
        expect(
          cashRetryErrors,
          everyElement(
            isA<StateError>().having(
              (error) => error.message,
              'message',
              contains('pending wallet'),
            ),
          ),
        );

        await database.cancelWalletCheckoutIntent('wallet-first');
        expect(await database.readPendingWalletCheckout(), isNull);
        final cash = await database.beginPendingCashCheckout(
          operationId: 'cafe-cash-first',
          checkoutKind: 'cafe',
          subjectId: order.ticket.id,
        );
        expect(cash.operationId, 'cafe-cash-first');

        await expectLater(
          database.createWalletCheckoutIntent(
            operationId: 'wallet-after-cafe',
            merchant: MerchantWalletSetup(
              provider: 'WavePay',
              merchantPhone: null,
              officialQrPayload: _syntheticStaticMmqr(),
              issuerConfirmed: true,
            ),
            lines: const [
              ShopSaleLineInput(productId: 'exclusive-coffee', quantity: 1),
            ],
          ),
          throwsA(
            isA<StateError>().having(
              (error) => error.message,
              'message',
              contains('pending cash'),
            ),
          ),
        );
        expect(await database.readPendingWalletCheckout(), isNull);
        expect(
          (await database.readPendingCashCheckout(
            checkoutKind: 'cafe',
            subjectId: order.ticket.id,
          ))?.operationId,
          'cafe-cash-first',
        );
        final walletRetryErrors = await Future.wait([
          for (var index = 0; index < 16; index++)
            () async {
              try {
                await database.createWalletCheckoutIntent(
                  operationId: 'wallet-cash-race-$index',
                  merchant: MerchantWalletSetup(
                    provider: index.isEven ? 'KBZPay' : 'WavePay',
                    merchantPhone: null,
                    officialQrPayload: _syntheticStaticMmqr(),
                    issuerConfirmed: true,
                  ),
                  lines: const [
                    ShopSaleLineInput(
                      productId: 'exclusive-coffee',
                      quantity: 1,
                    ),
                  ],
                );
                return null;
              } catch (error) {
                return error;
              }
            }(),
        ]);
        expect(
          walletRetryErrors,
          everyElement(
            isA<StateError>().having(
              (error) => error.message,
              'message',
              contains('pending cash'),
            ),
          ),
        );
        expect(await database.countSales(), 0);
        expect((await database.readActiveProducts()).single.onHand, 5);
        expect((await store.read(order.ticket.id))?.state, 'open');
      } finally {
        await database.close();
      }
    },
  );

  test('separate database writers serialize simultaneous wallet and cafe cash starts', () async {
    final root = await Directory.systemTemp.createTemp(
      'shop-payment-writer-race-',
    );
    final file = File('${root.path}/shop.sqlite');
    final initializer = ShopDatabase(NativeDatabase(file));
    try {
      await initializer.addProduct(
        id: 'writer-race-coffee',
        name: 'Coffee',
        priceMmk: 3000,
        openingStock: 20,
      );
      final initializerStore = ShopCafeOrderStore(initializer);
      for (var round = 0; round < 8; round++) {
        await initializerStore.applyCommand(
          CafeOrderCommand(
            id: 'writer-race-create-$round',
            ticketId: 'writer-race-order-$round',
            expectedVersion: 0,
            lines: [
              CafeOrderLine.local(
                id: 'writer-race-line-$round',
                productId: 'writer-race-coffee',
                quantity: 1,
                baseUnitPriceMmk: 3000,
                remark: '',
                modifiers: const [],
              ),
            ],
          ),
          const {},
        );
      }
      await initializer.close();
      final walletDatabase = ShopDatabase(
        NativeDatabase.createInBackground(file),
      );
      final cashDatabase = ShopDatabase(
        NativeDatabase.createInBackground(file),
      );
      try {
        await walletDatabase.verifyReadyForUse();
        await cashDatabase.verifyReadyForUse();

        for (var round = 0; round < 8; round++) {
          Future<String> startWallet() async {
            try {
              await walletDatabase.createWalletCheckoutIntent(
                operationId: 'writer-race-wallet-$round',
                merchant: MerchantWalletSetup(
                  provider: round.isEven ? 'KBZPay' : 'WavePay',
                  merchantPhone: null,
                  officialQrPayload: _syntheticStaticMmqr(),
                  issuerConfirmed: true,
                ),
                lines: const [
                  ShopSaleLineInput(
                    productId: 'writer-race-coffee',
                    quantity: 1,
                  ),
                ],
              );
              return 'wallet';
            } catch (error, stackTrace) {
              final cause = error is DriftRemoteException
                  ? error.remoteCause
                  : error;
              if (cause is StateError &&
                  cause.message.toString().contains('pending cash')) {
                return 'wallet-business-rejected';
              }
              if (cause is SqliteException &&
                  (cause.resultCode == 5 || cause.resultCode == 6)) {
                return 'wallet-sqlite-busy';
              }
              Error.throwWithStackTrace(error, stackTrace);
            }
          }

          Future<String> startCash() async {
            try {
              await cashDatabase.beginPendingCashCheckout(
                operationId: 'writer-race-cash-$round',
                checkoutKind: 'cafe',
                subjectId: 'writer-race-order-$round',
              );
              return 'cash';
            } catch (error, stackTrace) {
              final cause = error is DriftRemoteException
                  ? error.remoteCause
                  : error;
              if (cause is StateError &&
                  cause.message.toString().contains('pending wallet')) {
                return 'cash-business-rejected';
              }
              if (cause is SqliteException &&
                  (cause.resultCode == 5 || cause.resultCode == 6)) {
                return 'cash-sqlite-busy';
              }
              Error.throwWithStackTrace(error, stackTrace);
            }
          }

          final outcomes = await Future.wait(
            round.isEven
                ? [startWallet(), startCash()]
                : [startCash(), startWallet()],
          );
          expect(
            outcomes.where(
              (outcome) => outcome == 'wallet' || outcome == 'cash',
            ),
            hasLength(1),
            reason:
                'round $round must commit exactly one payment intent: $outcomes',
          );
          expect(
            outcomes.where(
              (outcome) =>
                  outcome.endsWith('-business-rejected') ||
                  outcome.endsWith('-sqlite-busy'),
            ),
            hasLength(1),
            reason:
                'round $round loser must fail only for an opposing intent or SQLite contention: $outcomes',
          );
          final wallet = await walletDatabase.readPendingWalletCheckout();
          final cash = await cashDatabase.readPendingCashCheckout(
            checkoutKind: 'cafe',
            subjectId: 'writer-race-order-$round',
          );
          expect(
            [wallet, cash].where((intent) => intent != null),
            hasLength(1),
            reason: 'round $round must not persist overlapping intents',
          );
          if (wallet != null) {
            expect(
              await walletDatabase.cancelWalletCheckoutIntent(
                wallet.operationId,
              ),
              isTrue,
            );
          }
          if (cash != null) {
            await cashDatabase.cancelPendingCashCheckout(
              checkoutKind: 'cafe',
              subjectId: 'writer-race-order-$round',
            );
          }
          expect(await walletDatabase.readPendingWalletCheckout(), isNull);
          expect(
            await cashDatabase.readPendingCashCheckout(
              checkoutKind: 'cafe',
              subjectId: 'writer-race-order-$round',
            ),
            isNull,
          );
        }
        expect(await walletDatabase.countSales(), 0);
        expect((await walletDatabase.readActiveProducts()).single.onHand, 20);
      } finally {
        await walletDatabase.close();
        await cashDatabase.close();
      }
    } finally {
      await initializer.close();
      await root.delete(recursive: true);
    }
  });

  test('encrypted backup restores a pending counter cash attempt', () async {
    final root = await Directory.systemTemp.createTemp('shop-pending-backup-');
    final source = ShopDatabase(NativeDatabase.memory());
    final archive = File('${root.path}/pending.smbak');
    final restoredFile = File('${root.path}/restored.sqlite');
    try {
      await source.addProduct(
        id: 'snack',
        name: 'Snack',
        priceMmk: 1000,
        openingStock: 3,
      );
      await source.saveCounterSaleDraft(
        operationId: 'backup-counter-cash',
        quantities: const {'snack': 1},
      );
      await source.beginPendingCashCheckout(
        operationId: 'backup-counter-cash',
        checkoutKind: 'counter',
        subjectId: 'backup-counter-cash',
      );
      await ShopBackup.exportEncrypted(
        database: source,
        archive: archive,
        password: 'correct horse battery staple',
        scratchRoot: root,
      );
      await ShopBackup.restoreIntoEmptyDatabase(
        archive: archive,
        target: restoredFile,
        password: 'correct horse battery staple',
      );
      ShopBackup.verifySnapshot(restoredFile);
      final restored = ShopDatabase(NativeDatabase(restoredFile));
      try {
        final pending = await restored.readPendingCashCheckout(
          checkoutKind: 'counter',
          subjectId: 'backup-counter-cash',
        );
        expect(pending?.operationId, 'backup-counter-cash');
        expect(
          (await restored.readCounterSaleDraft())?.operationId,
          pending?.operationId,
        );
      } finally {
        await restored.close();
      }
    } finally {
      await source.close();
      await root.delete(recursive: true);
    }
  });
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
