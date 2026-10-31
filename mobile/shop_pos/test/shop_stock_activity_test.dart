import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/stock_screen.dart';

void main() {
  test(
    'recent stock activity is product-scoped, bounded and newest first',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await database.addProduct(
          id: 'rice',
          name: 'Rice',
          priceMmk: 12000,
          openingStock: 5,
        );
        await database.addProduct(
          id: 'tea',
          name: 'Tea',
          priceMmk: 2500,
          openingStock: 9,
        );
        await database.changeStock(
          operationId: 'receive-rice',
          productId: 'rice',
          kind: 'receive',
          quantity: 3,
          expectedOnHand: 5,
        );

        final rows = await database.readRecentStockMovements('rice', limit: 2);
        expect(rows, hasLength(2));
        expect(rows.every((row) => row.productId == 'rice'), isTrue);
        expect(rows.first.id, 'receive-rice:stock');
        await expectLater(
          database.readRecentStockMovements('rice', limit: 0),
          throwsArgumentError,
        );
        await expectLater(
          database.readRecentStockMovements(' ', limit: 2),
          throwsArgumentError,
        );
      } finally {
        await database.close();
      }
    },
  );

  test(
    'recent stock activity discloses and enforces its 20-row bound',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await database.addProduct(
          id: 'busy-sku',
          name: 'Busy item',
          priceMmk: 1000,
          openingStock: 0,
        );
        for (var index = 0; index < 25; index++) {
          await database.changeStock(
            operationId: 'receive-${index.toString().padLeft(2, '0')}',
            productId: 'busy-sku',
            kind: 'receive',
            quantity: 1,
            expectedOnHand: index,
          );
        }

        final rows = await database.readRecentStockMovements('busy-sku');
        expect(rows, hasLength(20));
        expect(rows.first.id, 'receive-24:stock');
        expect(rows.map((row) => row.id), isNot(contains('receive-04:stock')));
        expect(
          rows.map((row) => row.id),
          isNot(contains('catalog.product.created:busy-sku:opening')),
        );
      } finally {
        await database.close();
      }
    },
  );

  testWidgets(
    'stock activity explains immutable retail movements without changing state',
    (tester) async {
      final database = ShopDatabase(NativeDatabase.memory());
      await database.addProduct(
        id: 'rice',
        name: 'Rice',
        priceMmk: 12000,
        openingStock: 5,
        sku: 'RICE-01',
      );
      await database.changeStock(
        operationId: 'receive-rice',
        productId: 'rice',
        kind: 'receive',
        quantity: 3,
        expectedOnHand: 5,
      );
      await database.changeStock(
        operationId: 'count-rice',
        productId: 'rice',
        kind: 'count',
        quantity: 6,
        expectedOnHand: 8,
      );
      await database.recordCashSale(
        operationId: 'sale-rice',
        lines: const [ShopSaleLineInput(productId: 'rice', quantity: 2)],
      );
      final movementCount = await database.countStockMovements();
      final outboxCount = await database.countOutboxOperations();

      await tester.pumpWidget(
        MaterialApp(home: StockScreen(database: database, myanmar: false)),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('stock-more-rice')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('stock-activity-rice')));
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('stock-activity-dialog')), findsOne);
      expect(find.text('Recent stock activity'), findsOne);
      expect(find.text('SKU RICE-01'), findsWidgets);
      expect(find.text('Sale'), findsOne);
      expect(find.text('Physical count'), findsOne);
      expect(find.text('Delivery received'), findsOne);
      expect(find.text('Opening stock'), findsOne);
      expect(find.text('-2'), findsWidgets);
      expect(find.text('+3'), findsOne);
      expect(
        find.text(
          'Shows up to the latest 20 movements. Read-only; it does not change stock.',
        ),
        findsOne,
      );
      expect(await database.countStockMovements(), movementCount);
      expect(await database.countOutboxOperations(), outboxCount);
      expect((await database.readActiveProducts()).single.onHand, 4);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    },
  );

  testWidgets('stock activity has Myanmar labels and remains read-only', (
    tester,
  ) async {
    final database = ShopDatabase(NativeDatabase.memory());
    await database.addProduct(
      id: 'tea',
      name: 'လက်ဖက်ရည်',
      priceMmk: 2500,
      openingStock: 2,
    );

    await tester.pumpWidget(
      MaterialApp(home: StockScreen(database: database, myanmar: true)),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('stock-more-tea')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('stock-activity-tea')));
    await tester.pumpAndSettle();

    expect(find.text('လက်ကျန် နောက်ဆုံးလှုပ်ရှားမှု'), findsOne);
    expect(find.text('အစလက်ကျန်'), findsOne);
    expect(find.text('+၂'), findsOne);
    expect(find.textContaining('၂၀ ခုအထိ'), findsOne);
    expect((await database.readActiveProducts()).single.onHand, 2);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 1));
    await database.close();
  });

  testWidgets(
    'retailer finds stock by SKU or category and isolates the restock queue',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final database = ShopDatabase(NativeDatabase.memory());
      await database.addProduct(
        id: 'tea-case',
        name: 'Tea case',
        category: 'Drinks',
        sku: 'CASE-TEA-12',
        priceMmk: 18000,
        openingStock: 0,
      );
      await database.setReorderLevel(
        productId: 'tea-case',
        expectedReorderLevel: 5,
        reorderLevel: null,
      );
      await database.addProduct(
        id: 'rice',
        name: 'Rice bag',
        category: 'Pantry',
        sku: 'RICE-25KG',
        priceMmk: 65000,
        openingStock: 20,
      );
      await database.setReorderLevel(
        productId: 'rice',
        expectedReorderLevel: 5,
        reorderLevel: 30,
      );
      await database.addProduct(
        id: 'oil',
        name: 'Cooking oil',
        category: 'Pantry',
        sku: 'OIL-1L',
        priceMmk: 7000,
        openingStock: 12,
      );
      await database.setReorderLevel(
        productId: 'oil',
        expectedReorderLevel: 5,
        reorderLevel: null,
      );
      final movements = await database.countStockMovements();
      final outbox = await database.countOutboxOperations();

      await tester.pumpWidget(
        MaterialApp(home: StockScreen(database: database, myanmar: false)),
      );
      await tester.pumpAndSettle();
      final search = find.byKey(const ValueKey('stock-search'));
      expect(find.text('Needs restock · 2'), findsOne);

      await tester.enterText(search, 'CASE-TEA-12');
      await tester.pumpAndSettle();
      expect(find.text('Tea case'), findsOne);
      expect(find.text('Rice bag'), findsNothing);

      await tester.enterText(search, 'Pantry');
      await tester.pumpAndSettle();
      expect(find.text('Rice bag'), findsOne);
      expect(find.text('Cooking oil'), findsOne);
      expect(find.text('Tea case'), findsNothing);

      await tester.enterText(search, '');
      await tester.tap(find.byKey(const ValueKey('stock-restock-filter')));
      await tester.pumpAndSettle();
      expect(find.text('Tea case'), findsOne);
      expect(find.text('Rice bag'), findsOne);
      expect(find.text('Cooking oil'), findsNothing);
      expect(await database.countStockMovements(), movements);
      expect(await database.countOutboxOperations(), outbox);
      expect(
        (await database.readActiveProducts())
            .map((product) => product.onHand)
            .toSet(),
        {0, 12, 20},
      );
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    },
  );

  testWidgets('Myanmar restock filter stays usable on a scaled narrow phone', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 1.5;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final database = ShopDatabase(NativeDatabase.memory());
    await database.addProduct(
      id: 'tea',
      name: 'လက်ဖက်ခြောက်',
      category: 'အဖျော်ယမကာ',
      sku: 'TEA-DRY',
      priceMmk: 3500,
      openingStock: 1,
    );

    await tester.pumpWidget(
      MaterialApp(home: StockScreen(database: database, myanmar: true)),
    );
    await tester.pumpAndSettle();
    expect(find.text('ပြန်မှာရန် · ၁'), findsOne);
    await tester.tap(find.byKey(const ValueKey('stock-restock-filter')));
    await tester.pumpAndSettle();
    expect(find.text('လက်ဖက်ခြောက်'), findsOne);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 1));
    await database.close();
  });

  testWidgets(
    'physical count previews the delta and needs confirmation before mutation',
    (tester) async {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final database = ShopDatabase(NativeDatabase.memory());
      await database.addProduct(
        id: 'rice',
        name: 'Rice',
        priceMmk: 12000,
        openingStock: 20,
      );
      final movementsBefore = await database.countStockMovements();
      final outboxBefore = await database.countOutboxOperations();

      await tester.pumpWidget(
        MaterialApp(home: StockScreen(database: database, myanmar: false)),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('stock-update-rice')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Count'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('stock-change-quantity')),
        '0',
      );
      await tester.pumpAndSettle();
      expect(find.text('After save: 0 on hand · change -20'), findsOne);

      await tester.tap(find.text('Save stock'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('stock-count-confirm')), findsOne);
      expect((await database.readActiveProducts()).single.onHand, 20);
      expect(await database.countStockMovements(), movementsBefore);
      expect(await database.countOutboxOperations(), outboxBefore);

      await tester.tap(find.text('Go back'));
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('stock-count-confirm')), findsNothing);
      expect(find.byType(AlertDialog), findsOne);
      expect((await database.readActiveProducts()).single.onHand, 20);

      await tester.tap(find.text('Save stock'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Save count'));
      await tester.pumpAndSettle();
      expect((await database.readActiveProducts()).single.onHand, 0);
      expect(await database.countStockMovements(), movementsBefore + 1);
      expect(await database.countOutboxOperations(), outboxBefore + 1);
      expect(tester.takeException(), isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    },
  );

  testWidgets('Myanmar physical count warning is readable and cancellable', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 1.5;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final database = ShopDatabase(NativeDatabase.memory());
    await database.addProduct(
      id: 'tea',
      name: 'လက်ဖက်ခြောက်',
      priceMmk: 3500,
      openingStock: 5,
    );
    final movementsBefore = await database.countStockMovements();
    final outboxBefore = await database.countOutboxOperations();

    await tester.pumpWidget(
      MaterialApp(home: StockScreen(database: database, myanmar: true)),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('stock-update-tea')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('ရေတွက်ရန်'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('stock-change-quantity')),
      '၃',
    );
    await tester.pumpAndSettle();
    expect(
      find.text('သိမ်းပြီးနောက် လက်ကျန် ၃ ခု · ပြောင်းလဲမှု -၂'),
      findsOne,
    );
    await tester.tap(find.text('လက်ကျန်သိမ်းရန်'));
    await tester.pumpAndSettle();
    expect(find.text('လက်တွေ့ရေတွက်မှု အတည်ပြုရန်'), findsOne);
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('ပြန်စစ်ရန်'));
    await tester.pumpAndSettle();
    expect((await database.readActiveProducts()).single.onHand, 5);
    expect(await database.countStockMovements(), movementsBefore);
    expect(await database.countOutboxOperations(), outboxBefore);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 1));
    await database.close();
  });
}
