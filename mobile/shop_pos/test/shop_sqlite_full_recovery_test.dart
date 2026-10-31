import 'dart:convert';
import 'dart:io';

import 'package:drift/drift.dart' show CouldNotRollBackException;
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_database.dart';

import 'managed_staff_test_support.dart';

void main() {
  test(
    'SQLITE_FULL checkout rolls back completely and retries once after reopen',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'supermega-shop-sqlite-full-',
      );
      final file = File(
        '${directory.path}${Platform.pathSeparator}shop.sqlite',
      );
      ShopDatabase? database;
      try {
        database = ShopDatabase(NativeDatabase(file));
        const productCount = 100;
        final lines = <ShopSaleLineInput>[];
        for (var index = 0; index < productCount; index++) {
          final productId = 'sqlite-full-product-$index';
          await database.addProduct(
            id: productId,
            name: 'SQLite full recovery product $index',
            description: 'Synthetic checkout capacity fixture $index',
            priceMmk: 1000 + index,
            openingStock: 3,
          );
          lines.add(ShopSaleLineInput(productId: productId, quantity: 1));
        }

        final stateBefore = await _checkoutState(database);
        final productsBefore = stateBefore['products']!;
        expect(productsBefore, hasLength(productCount));
        expect(
          productsBefore.every((product) => product['on_hand'] == 3),
          isTrue,
        );

        // Compact away free pages, then prohibit file growth. The 100-line
        // checkout must allocate new b-tree pages and receives real
        // SQLITE_FULL from SQLite rather than a fabricated Dart exception.
        await database.customStatement('VACUUM');
        final pageCount =
            (await database.customSelect('PRAGMA page_count').getSingle())
                .read<int>('page_count');
        final freePages =
            (await database.customSelect('PRAGMA freelist_count').getSingle())
                .read<int>('freelist_count');
        expect(freePages, 0);
        final limitedPages =
            (await database
                    .customSelect('PRAGMA max_page_count = $pageCount')
                    .getSingle())
                .read<int>('max_page_count');
        expect(limitedPages, pageCount);

        Object? failure;
        try {
          await database.recordManagedTestCashSale(
            operationId: 'sqlite-full-checkout',
            lines: lines,
          );
        } catch (error) {
          failure = error;
        }
        expect(failure, isA<CouldNotRollBackException>());
        final rollbackFailure = failure! as CouldNotRollBackException;
        expect(rollbackFailure.cause, isA<SqliteException>());
        expect(
          (rollbackFailure.cause as SqliteException).resultCode,
          13, // SQLITE_FULL.
        );

        expect(await _checkoutState(database), stateBefore);

        await database.close();
        database = ShopDatabase(NativeDatabase(file));
        await database.verifyReadyForUse();
        expect(await _checkoutState(database), stateBefore);

        final receipt = await database.recordManagedTestCashSale(
          operationId: 'sqlite-full-checkout',
          lines: lines,
        );
        expect(receipt.lines, hasLength(productCount));
        expect(
          receipt.lines.map((line) => (line.productId, line.quantity)).toSet(),
          {
            for (var index = 0; index < productCount; index++)
              ('sqlite-full-product-$index', 1),
          },
        );
        final stateAfterSuccess = await _checkoutState(database);
        final productsAfter = stateAfterSuccess['products']!;
        expect(productsAfter, hasLength(productCount));
        expect(
          productsAfter.every((product) => product['on_hand'] == 2),
          isTrue,
        );
        expect(stateAfterSuccess['sales'], hasLength(1));
        expect(
          stateAfterSuccess['sales']!.single['operation_id'],
          'sqlite-full-checkout',
        );
        final saleLines = stateAfterSuccess['saleLines']!;
        expect(saleLines, hasLength(productCount));
        expect(
          saleLines
              .map((line) => (line['product_id'], line['quantity']))
              .toSet(),
          {
            for (var index = 0; index < productCount; index++)
              ('sqlite-full-product-$index', 1),
          },
        );
        final saleMovements = stateAfterSuccess['stockMovements']!
            .where((movement) => movement['sale_id'] == 'sqlite-full-checkout')
            .toList(growable: false);
        expect(saleMovements, hasLength(productCount));
        expect(
          saleMovements.every(
            (movement) =>
                movement['quantity_delta'] == -1 &&
                movement['reason'] == 'cash_sale',
          ),
          isTrue,
        );
        expect(
          saleMovements.map((movement) => movement['product_id']).toSet(),
          {
            for (var index = 0; index < productCount; index++)
              'sqlite-full-product-$index',
          },
        );
        final outboxAfter = stateAfterSuccess['outbox']!;
        expect(outboxAfter, hasLength(stateBefore['outbox']!.length + 1));
        final saleEvent = outboxAfter.singleWhere(
          (event) => event['operation_id'] == 'sqlite-full-checkout',
        );
        expect(saleEvent['event_type'], 'shop.cash_sale.completed.v1');
        expect(saleEvent['state'], 'pending');
        final salePayload = jsonDecode(
          saleEvent['payload_json']! as String,
        ) as Map<String, dynamic>;
        expect(salePayload['saleId'], 'sqlite-full-checkout');
        expect(salePayload['paymentMethod'], 'cash');
        expect(salePayload['totalMmk'], 104950);
        final payloadLines = salePayload['lines']! as List<dynamic>;
        expect(payloadLines, hasLength(productCount));
        expect(
          payloadLines
              .cast<Map<String, dynamic>>()
              .map((line) => (line['productId'], line['quantity']))
              .toSet(),
          {
            for (var index = 0; index < productCount; index++)
              ('sqlite-full-product-$index', 1),
          },
        );

        final replay = await database.recordManagedTestCashSale(
          operationId: 'sqlite-full-checkout',
          lines: lines,
        );
        expect(replay.id, receipt.id);
        expect(await _checkoutState(database), stateAfterSuccess);
      } finally {
        await database?.close();
        if (await directory.exists()) await directory.delete(recursive: true);
      }
    },
  );
}

Future<Map<String, List<Map<String, Object?>>>> _checkoutState(
  ShopDatabase database,
) async {
  Future<List<Map<String, Object?>>> rows(String statement) async =>
      (await database.customSelect(statement).get())
          .map((row) => Map<String, Object?>.from(row.data))
          .toList(growable: false);

  return {
    'products': await rows(
      'SELECT id, name, price_mmk, on_hand, updated_at_millis, archived '
      'FROM shop_products ORDER BY id',
    ),
    'sales': await rows(
      'SELECT id, operation_id, request_fingerprint, total_mmk, '
      'payment_method, created_at_millis FROM shop_sales ORDER BY id',
    ),
    'saleLines': await rows(
      'SELECT id, sale_id, product_id, product_name, unit_price_mmk, '
      'quantity, line_total_mmk FROM shop_sale_lines ORDER BY id',
    ),
    'stockMovements': await rows(
      'SELECT id, sale_id, product_id, quantity_delta, reason, '
      'created_at_millis FROM shop_stock_movements ORDER BY id',
    ),
    'outbox': await rows(
      'SELECT operation_id, event_type, payload_json, state, '
      'created_at_millis FROM shop_sync_outbox ORDER BY operation_id',
    ),
  };
}
