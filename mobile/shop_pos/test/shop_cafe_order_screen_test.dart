import 'dart:async';
import 'dart:convert';

import 'package:drift/drift.dart' show Variable;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_cafe_order_screen.dart';
import 'package:supermega_shop/shop_cafe_order_contract.dart';
import 'package:supermega_shop/shop_cafe_kitchen_entitlement.dart';
import 'package:supermega_shop/shop_cafe_order_store.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_models.dart';

class _FailNextCafeCatalogReadDatabase extends ShopDatabase {
  _FailNextCafeCatalogReadDatabase() : super(NativeDatabase.memory());

  bool failNextCatalogRead = false;

  @override
  Future<List<ShopProduct>> readActiveProducts() async {
    if (failNextCatalogRead) {
      failNextCatalogRead = false;
      throw StateError('synthetic cafe catalog read failure');
    }
    return super.readActiveProducts();
  }
}

class _DelayedCafeCatalogReadDatabase extends ShopDatabase {
  _DelayedCafeCatalogReadDatabase() : super(NativeDatabase.memory());

  var readCalls = 0;
  var delayReads = false;
  final allowReads = Completer<void>();

  @override
  Future<List<ShopProduct>> readActiveProducts() async {
    readCalls += 1;
    if (delayReads) await allowReads.future;
    return super.readActiveProducts();
  }
}

void main() {
  const premiumKitchen = _AllowKitchenEntitlement();

  Future<ShopDatabase> readyDatabase() async {
    final database = ShopDatabase(NativeDatabase.memory());
    await database.addProduct(
      id: 'coffee',
      name: 'Coffee',
      priceMmk: 3000,
      openingStock: 5,
    );
    return database;
  }

  Future<void> openScreen(
    WidgetTester tester,
    ShopDatabase database, {
    bool myanmar = false,
    ShopCafeKitchenEntitlement kitchenEntitlement = premiumKitchen,
    List<CafeModifierSnapshot> modifiers = shopCafePreparationModifiers,
  }) async {
    await tester.pumpWidget(
      MaterialApp(
        home: ShopCafeOrderScreen(
          database: database,
          myanmar: myanmar,
          modifiers: modifiers,
          kitchenEntitlement: kitchenEntitlement,
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> pumpUntilVisible(WidgetTester tester, Finder finder) async {
    for (
      var attempt = 0;
      attempt < 20 && finder.evaluate().isEmpty;
      attempt++
    ) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(finder, findsOneWidget);
  }

  Future<void> addLine(
    WidgetTester tester, {
    bool modifier = false,
    String remark = '',
    String area = '',
    String table = '',
    String station = 'kitchen',
  }) async {
    await tester.tap(find.byKey(const ValueKey('cafe-new-order')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const ValueKey('cafe-product:coffee')));
    await tester.pumpAndSettle();
    if (area.isNotEmpty) {
      await tester.enterText(
        find.byKey(const ValueKey('cafe-area-label')),
        area,
      );
    }
    if (table.isNotEmpty) {
      await tester.enterText(
        find.byKey(const ValueKey('cafe-table-label')),
        table,
      );
    }
    if (station == 'bar') {
      await tester.tap(find.byKey(const ValueKey('cafe-preparation-station')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Bar').last);
      await tester.pumpAndSettle();
    }
    if (modifier) {
      await tester.tap(find.byKey(const ValueKey('cafe-modifier:no-sugar@1')));
    }
    if (remark.isNotEmpty) {
      await tester.enterText(find.byKey(const ValueKey('cafe-remark')), remark);
    }
    await tester.tap(find.byKey(const ValueKey('cafe-add-line-confirm')));
    await tester.pumpAndSettle();
  }

  testWidgets(
    'catalog read failure keeps cafe orders unchanged and allows a retry',
    (tester) async {
      final database = _FailNextCafeCatalogReadDatabase();
      try {
        await database.addProduct(
          id: 'coffee',
          name: 'Coffee',
          priceMmk: 3000,
          openingStock: 5,
        );
        await openScreen(tester, database);
        final stockBefore = (await database.readActiveProducts()).single.onHand;
        final movementsBefore = await database.countStockMovements();
        final outboxBefore = await database.countOutboxOperations();
        database.failNextCatalogRead = true;

        await tester.tap(find.byKey(const ValueKey('cafe-new-order')));
        await tester.pumpAndSettle();

        expect(find.byKey(const ValueKey('cafe-error')), findsOneWidget);
        expect(
          find.text('Products could not be read. Try New order again.'),
          findsOneWidget,
        );
        expect(find.byKey(const ValueKey('cafe-product:coffee')), findsNothing);
        expect(await ShopCafeOrderStore(database).readActive(), isEmpty);
        expect(await database.countSales(), 0);
        expect(await database.countStockMovements(), movementsBefore);
        expect(await database.countOutboxOperations(), outboxBefore);
        expect(
          (await database.readActiveProducts()).single.onHand,
          stockBefore,
        );
        expect(tester.takeException(), isNull);

        await tester.tap(find.byKey(const ValueKey('cafe-new-order')));
        await tester.pumpAndSettle();
        expect(
          find.byKey(const ValueKey('cafe-product:coffee')),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump(const Duration(milliseconds: 1));
        await database.close();
      }
    },
  );

  testWidgets('rapid New order taps open only one product picker', (
    tester,
  ) async {
    final database = _DelayedCafeCatalogReadDatabase();
    try {
      await database.addProduct(
        id: 'coffee',
        name: 'Coffee',
        priceMmk: 3000,
        openingStock: 5,
      );
      await openScreen(tester, database);
      final stockBefore = (await database.readActiveProducts()).single.onHand;
      final readsBefore = database.readCalls;
      final movementsBefore = await database.countStockMovements();
      final outboxBefore = await database.countOutboxOperations();
      database.delayReads = true;

      final newOrder = find.byKey(const ValueKey('cafe-new-order'));
      await tester.tap(newOrder);
      await tester.tap(newOrder);
      await tester.pump();

      expect(database.readCalls, readsBefore + 1);
      database.delayReads = false;
      database.allowReads.complete();
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('cafe-product:coffee')), findsOneWidget);
      expect(await ShopCafeOrderStore(database).readActive(), isEmpty);
      expect(await database.countSales(), 0);
      expect(await database.countStockMovements(), movementsBefore);
      expect(await database.countOutboxOperations(), outboxBefore);
      expect((await database.readActiveProducts()).single.onHand, stockBefore);
      expect(tester.takeException(), isNull);
    } finally {
      database.delayReads = false;
      if (!database.allowReads.isCompleted) database.allowReads.complete();
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets(
    'Myanmar cashier finds open and held orders without changing shop state',
    (tester) async {
      final database = await readyDatabase();
      try {
        final store = ShopCafeOrderStore(database);
        await store.applyCommand(
          CafeOrderCommand(
            id: 'search-create-a',
            ticketId: 'search-order-a',
            expectedVersion: 0,
            serviceContext: const CafeServiceContext(
              areaLabel: 'Ground floor',
              tableLabel: 'T-04',
            ),
            lines: [
              CafeOrderLine.local(
                id: 'search-line-a',
                productId: 'coffee',
                quantity: 1,
                baseUnitPriceMmk: 3000,
                remark: 'iced',
                modifiers: const [],
              ),
            ],
          ),
          const {},
        );
        final second = await store.applyCommand(
          CafeOrderCommand(
            id: 'search-create-b',
            ticketId: 'search-order-b',
            expectedVersion: 0,
            serviceContext: const CafeServiceContext(
              areaLabel: 'အပေါ်ထပ်',
              tableLabel: 'T-09',
            ),
            lines: [
              CafeOrderLine.local(
                id: 'search-line-b',
                productId: 'coffee',
                quantity: 1,
                baseUnitPriceMmk: 3000,
                remark: 'သကြားမထည့်',
                modifiers: const [],
              ),
            ],
          ),
          const {},
        );
        await store.hold(
          orderId: second.ticket.id,
          operationId: 'search-hold-b',
          expectedStateRevision: second.stateRevision,
        );
        final outboxBefore = await database.countOutboxOperations();
        final stockBefore = (await database.readActiveProducts()).single.onHand;

        await openScreen(tester, database, myanmar: true);
        expect(
          find.byKey(const ValueKey('cafe-order:search-order-a')),
          findsOneWidget,
        );
        expect(
          find.byKey(const ValueKey('cafe-order:search-order-b')),
          findsOneWidget,
        );

        await tester.enterText(
          find.byKey(const ValueKey('cafe-order-search')),
          'T-09',
        );
        await tester.pumpAndSettle();
        expect(
          find.byKey(const ValueKey('cafe-order:search-order-a')),
          findsNothing,
        );
        expect(
          find.byKey(const ValueKey('cafe-order:search-order-b')),
          findsOneWidget,
        );

        await tester.enterText(
          find.byKey(const ValueKey('cafe-order-search')),
          'ခဏသိမ်း',
        );
        await tester.pumpAndSettle();
        expect(
          find.byKey(const ValueKey('cafe-order:search-order-b')),
          findsOneWidget,
        );
        await tester.enterText(
          find.byKey(const ValueKey('cafe-order-search')),
          'မတွေ့နိုင်သောစားပွဲ',
        );
        await tester.pumpAndSettle();
        expect(
          find.byKey(const ValueKey('cafe-order-search-empty')),
          findsOneWidget,
        );
        await tester.tap(
          find.byKey(const ValueKey('cafe-order-search-empty-clear')),
        );
        await tester.pumpAndSettle();
        expect(
          find.byKey(const ValueKey('cafe-order:search-order-a')),
          findsOneWidget,
        );
        expect(
          find.byKey(const ValueKey('cafe-order:search-order-b')),
          findsOneWidget,
        );
        expect(await database.countOutboxOperations(), outboxBefore);
        expect(await database.countSales(), 0);
        expect(
          (await database.readActiveProducts()).single.onHand,
          stockBefore,
        );
      } finally {
        await database.close();
      }
    },
  );

  testWidgets('persists table identity and local bar ticket routing', (
    tester,
  ) async {
    final database = await readyDatabase();
    try {
      await openScreen(tester, database);
      await addLine(
        tester,
        area: 'Ground floor',
        table: 'T-04',
        station: 'bar',
        remark: 'warm',
      );

      expect(find.textContaining('Area: Ground floor'), findsOneWidget);
      expect(find.textContaining('Table: T-04'), findsOneWidget);
      expect(find.textContaining('Bar · #1 · Pending locally'), findsOneWidget);
      final row = await database
          .customSelect('SELECT ticket_json FROM shop_cafe_orders')
          .getSingle();
      final json = row.read<String>('ticket_json');
      expect(json, contains('"areaLabel":"Ground floor"'));
      expect(json, contains('"tableLabel":"T-04"'));
      expect(json, contains('"preparationStation":"bar"'));
    } finally {
      await database.close();
    }
  });

  testWidgets('advances local kitchen status without changing sale or stock', (
    tester,
  ) async {
    final database = await readyDatabase();
    try {
      await openScreen(tester, database);
      await addLine(tester, station: 'bar', remark: 'warm');
      final stockBefore = (await database.readActiveProducts()).single.onHand;
      final order = (await ShopCafeOrderStore(
        database,
        kitchenEntitlement: premiumKitchen,
      ).readActive()).single;
      final lineId = order.ticket.lines.single.id;
      final button = find.byKey(ValueKey('cafe-kitchen-advance:$lineId'));

      expect(find.textContaining('Pending locally'), findsOneWidget);
      await tester.tap(button);
      await tester.pumpAndSettle();
      expect(find.textContaining('Preparing locally'), findsOneWidget);
      expect(find.text('Ready'), findsOneWidget);

      await tester.tap(button);
      await tester.pumpAndSettle();
      expect(find.textContaining('Ready locally'), findsOneWidget);
      expect(find.text('Served'), findsOneWidget);

      await tester.tap(button);
      await tester.pumpAndSettle();
      expect(find.textContaining('Served locally'), findsOneWidget);
      expect(button, findsNothing);
      expect(await database.countSales(), 0);
      expect((await database.readActiveProducts()).single.onHand, stockBefore);
      await database.verifyReadyForUse();

      await tester.pumpWidget(const SizedBox());
      await openScreen(tester, database, myanmar: true);
      expect(find.textContaining('စက်အတွင်း ပို့ပြီး'), findsOneWidget);
    } finally {
      await database.close();
    }
  });

  testWidgets(
    'moves a table without changing lines kitchen identity or money',
    (tester) async {
      final database = await readyDatabase();
      try {
        await openScreen(tester, database);
        await addLine(
          tester,
          area: 'Ground floor',
          table: 'T-04',
          station: 'bar',
          remark: 'warm',
        );
        final before = await database
            .customSelect(
              'SELECT id, ticket_version, ticket_json, total_mmk '
              'FROM shop_cafe_orders',
            )
            .getSingle();
        final orderId = before.read<String>('id');
        final stockBefore = (await database.readActiveProducts()).single.onHand;
        final movementsBefore = await database.countStockMovements();
        final outboxBefore = await database.countOutboxOperations();
        final ticketBefore = (await ShopCafeOrderStore(
          database,
          kitchenEntitlement: premiumKitchen,
        ).read(orderId))!;
        final dispatchBefore = ticketBefore.kitchenDispatchLines.single;

        await tester.tap(find.byKey(ValueKey('cafe-move:$orderId')));
        await tester.pumpAndSettle();
        expect(
          tester
              .widget<FilledButton>(
                find.byKey(const ValueKey('cafe-move-confirm')),
              )
              .onPressed,
          isNull,
        );
        await tester.enterText(
          find.byKey(const ValueKey('cafe-move-table')),
          'T-09',
        );
        await tester.pump();
        expect(
          tester
              .widget<FilledButton>(
                find.byKey(const ValueKey('cafe-move-confirm')),
              )
              .onPressed,
          isNotNull,
        );
        await tester.tap(find.byKey(const ValueKey('cafe-move-confirm')));
        await tester.pumpAndSettle();

        expect(find.textContaining('Area: Ground floor'), findsOneWidget);
        expect(find.textContaining('Table: T-09'), findsOneWidget);
        expect(
          find.textContaining('Bar · #1 · Pending locally'),
          findsOneWidget,
        );
        final moved = (await ShopCafeOrderStore(
          database,
          kitchenEntitlement: premiumKitchen,
        ).read(orderId))!;
        expect(moved.ticket.version, before.read<int>('ticket_version') + 1);
        expect(
          moved.ticket.lines.map((line) => line.toJson()).toList(),
          ticketBefore.ticket.lines.map((line) => line.toJson()).toList(),
        );
        expect(moved.ticket.serviceContext?.areaLabel, 'Ground floor');
        expect(moved.ticket.serviceContext?.tableLabel, 'T-09');
        expect(moved.totalMmk, before.read<int>('total_mmk'));
        expect(
          moved.kitchenDispatchLines.single.ticketId,
          dispatchBefore.ticketId,
        );
        expect(
          moved.kitchenDispatchLines.single.sequence,
          dispatchBefore.sequence,
        );
        expect(await database.countOutboxOperations(), outboxBefore + 1);
        expect(await database.countSales(), 0);
        expect(await database.countStockMovements(), movementsBefore);
        expect(
          (await database.readActiveProducts()).single.onHand,
          stockBefore,
        );

        await tester.pumpWidget(const SizedBox());
        await openScreen(tester, database);
        expect(find.textContaining('Table: T-09'), findsOneWidget);
        expect(
          find.textContaining('Bar · #1 · Pending locally'),
          findsOneWidget,
        );
      } finally {
        await database.close();
      }
    },
  );

  testWidgets(
    'edits an open line without duplicating its kitchen ticket or stock',
    (tester) async {
      final database = await readyDatabase();
      try {
        await openScreen(tester, database);
        await addLine(
          tester,
          area: 'Ground floor',
          table: 'T-04',
          station: 'bar',
          remark: 'warm',
        );
        final before = (await ShopCafeOrderStore(
          database,
          kitchenEntitlement: premiumKitchen,
        ).readActive()).single;
        final line = before.ticket.lines.single;
        final dispatch = before.kitchenDispatchLines.single;
        final stockBefore = (await database.readActiveProducts()).single.onHand;
        final movementsBefore = await database.countStockMovements();

        await tester.tap(find.byKey(ValueKey('cafe-edit-line:${line.id}')));
        await tester.pumpAndSettle();
        expect(
          tester
              .widget<DropdownButtonFormField<String>>(
                find.byKey(const ValueKey('cafe-preparation-station')),
              )
              .onChanged,
          isNull,
        );
        await tester.enterText(
          find.byKey(const ValueKey('cafe-line-quantity')),
          '၂',
        );
        await tester.tap(
          find.byKey(const ValueKey('cafe-modifier:no-sugar@1')),
        );
        await tester.enterText(
          find.byKey(const ValueKey('cafe-remark')),
          'very warm',
        );
        await tester.tap(find.byKey(const ValueKey('cafe-add-line-confirm')));
        await tester.pumpAndSettle();

        final updated = (await ShopCafeOrderStore(
          database,
          kitchenEntitlement: premiumKitchen,
        ).read(before.ticket.id))!;
        expect(updated.ticket.version, before.ticket.version + 1);
        expect(updated.ticket.lines, hasLength(1));
        expect(updated.ticket.lines.single.id, line.id);
        expect(updated.ticket.lines.single.quantity, 2);
        expect(updated.ticket.lines.single.remark, 'very warm');
        expect(updated.ticket.lines.single.modifiers.single.id, 'no-sugar');
        expect(updated.totalMmk, 6000);
        expect(updated.kitchenDispatchLines.single.ticketId, dispatch.ticketId);
        expect(updated.kitchenDispatchLines.single.sequence, dispatch.sequence);
        expect(updated.kitchenDispatchLines.single.preparationStation, 'bar');
        expect(await database.countSales(), 0);
        expect(await database.countStockMovements(), movementsBefore);
        expect(
          (await database.readActiveProducts()).single.onHand,
          stockBefore,
        );
        expect(find.textContaining('Coffee · No sugar × 2'), findsOneWidget);

        await tester.pumpWidget(const SizedBox());
        await openScreen(tester, database);
        expect(find.textContaining('Coffee · No sugar × 2'), findsOneWidget);
        await tester.tap(
          find.byKey(ValueKey('cafe-complete:${before.ticket.id}')),
        );
        await tester.pumpAndSettle();
        await tester.tap(
          find.byKey(const ValueKey('cafe-complete-cash-confirm')),
        );
        await tester.pumpAndSettle();
        expect(await database.countSales(), 1);
        expect((await database.readActiveProducts()).single.onHand, 3);
      } finally {
        await tester.pumpWidget(const SizedBox());
        await database.close();
      }
    },
  );

  testWidgets(
    'started kitchen item explains why its quantity stays unchanged in EN and MY',
    (tester) async {
      for (final scenario in [
        (
          myanmar: false,
          message: 'This item is already being prepared. Keep it unchanged, or cancel the order and tell the kitchen or bar directly.',
        ),
        (
          myanmar: true,
          message: 'ဤပစ္စည်းကို စတင်ပြင်ဆင်နေပြီးဖြစ်သည်။ မပြောင်းဘဲထားပါ သို့မဟုတ် မှာစာကို ပယ်ဖျက်ပြီး မီးဖိုချောင် သို့မဟုတ် ဘားကို တိုက်ရိုက်အသိပေးပါ။',
        ),
      ]) {
        final database = await readyDatabase();
        try {
          final store = ShopCafeOrderStore(
            database,
            kitchenEntitlement: premiumKitchen,
          );
          final suffix = scenario.myanmar ? 'my' : 'en';
          final created = await store.applyCommand(
            CafeOrderCommand(
              id: 'screen-started-create-$suffix',
              ticketId: 'screen-started-order-$suffix',
              expectedVersion: 0,
              lines: [
                CafeOrderLine(
                  id: 'screen-started-line-$suffix',
                  productId: 'coffee',
                  quantity: 1,
                  baseUnitPriceMmk: 3000,
                  remark: '',
                  modifiers: const [],
                  preparationStation: 'bar',
                ),
              ],
            ),
            const {},
          );
          final line = created.ticket.lines.single;
          await store.advanceKitchenStatus(
            orderId: created.ticket.id,
            lineId: line.id,
            operationId: 'screen-started-$suffix',
            expectedTicketVersion: created.ticket.version,
            expectedStatus: 'pending_local',
          );
          final outboxBefore = await database.countOutboxOperations();
          await openScreen(tester, database, myanmar: scenario.myanmar);

          await tester.tap(find.byKey(ValueKey('cafe-edit-line:${line.id}')));
          await tester.pumpAndSettle();
          await tester.enterText(
            find.byKey(const ValueKey('cafe-line-quantity')),
            scenario.myanmar ? '၂' : '2',
          );
          await tester.tap(find.byKey(const ValueKey('cafe-add-line-confirm')));
          await tester.pumpAndSettle();

          expect(find.byKey(const ValueKey('cafe-error')), findsOneWidget);
          expect(find.text(scenario.message), findsOneWidget);
          final unchanged = await store.read(created.ticket.id);
          expect(unchanged?.ticket.version, created.ticket.version);
          expect(unchanged?.ticket.lines.single.quantity, 1);
          expect(unchanged?.kitchenStatusByLine[line.id], 'preparing_local');
          expect(await database.countOutboxOperations(), outboxBefore);
          expect(await database.countSales(), 0);
          expect((await database.readActiveProducts()).single.onHand, 5);
        } finally {
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump();
          await database.close();
        }
      }
    },
  );

  testWidgets(
    'editing one line preserves retired modifiers on every saved line',
    (tester) async {
      final database = await readyDatabase();
      const retired = CafeModifierSnapshot(
        id: 'retired-size',
        version: 1,
        labelEn: 'Old large',
        labelMy: 'အကြီး အဟောင်း',
        priceDeltaMmk: 500,
      );
      const otherRetired = CafeModifierSnapshot(
        id: 'retired-milk',
        version: 1,
        labelEn: 'Old milk',
        labelMy: 'နို့ အဟောင်း',
        priceDeltaMmk: 300,
      );
      const currentVersion = CafeModifierSnapshot(
        id: 'retired-size',
        version: 2,
        labelEn: 'New large',
        labelMy: 'အကြီး အသစ်',
        priceDeltaMmk: 600,
      );
      final store = ShopCafeOrderStore(
        database,
        kitchenEntitlement: premiumKitchen,
      );
      try {
        final created = await store.applyCommand(
          CafeOrderCommand(
            id: 'retired-modifier-create',
            ticketId: 'retired-modifier-order',
            expectedVersion: 0,
            lines: [
              CafeOrderLine(
                id: 'retired-one',
                productId: 'coffee',
                quantity: 1,
                baseUnitPriceMmk: 3000,
                remark: 'warm',
                preparationStation: 'bar',
                modifiers: const [retired],
              ),
              CafeOrderLine(
                id: 'retired-two',
                productId: 'coffee',
                quantity: 1,
                baseUnitPriceMmk: 3000,
                remark: '',
                preparationStation: 'kitchen',
                modifiers: const [otherRetired],
              ),
            ],
          ),
          {retired.key: retired, otherRetired.key: otherRetired},
        );
        final stockBefore = (await database.readActiveProducts()).single.onHand;
        final movementsBefore = await database.countStockMovements();
        await openScreen(tester, database, modifiers: const [currentVersion]);
        await tester.tap(
          find.byKey(const ValueKey('cafe-edit-line:retired-one')),
        );
        await tester.pumpAndSettle();
        expect(find.text('Old large'), findsOneWidget);
        expect(find.text('Saved with this order'), findsOneWidget);
        expect(
          tester
              .widget<CheckboxListTile>(
                find.byKey(const ValueKey('cafe-modifier:retired-size@1')),
              )
              .value,
          isTrue,
        );
        expect(
          tester
              .widget<CheckboxListTile>(
                find.byKey(const ValueKey('cafe-modifier:retired-size@2')),
              )
              .value,
          isFalse,
        );
        await tester.enterText(
          find.byKey(const ValueKey('cafe-line-quantity')),
          '2',
        );
        await tester.enterText(
          find.byKey(const ValueKey('cafe-remark')),
          'extra warm',
        );
        await tester.tap(find.byKey(const ValueKey('cafe-add-line-confirm')));
        await tester.pumpAndSettle();

        final updated = (await store.read(created.ticket.id))!;
        expect(updated.ticket.lines, hasLength(2));
        expect(updated.ticket.lines.first.quantity, 2);
        expect(updated.ticket.lines.first.remark, 'extra warm');
        expect(
          updated.ticket.lines.first.modifiers.single.toJson(),
          retired.toJson(),
        );
        expect(
          updated.ticket.lines.last.modifiers.single.toJson(),
          otherRetired.toJson(),
        );
        expect(updated.totalMmk, 10300);
        expect(await database.countSales(), 0);
        expect(await database.countStockMovements(), movementsBefore);
        expect(
          (await database.readActiveProducts()).single.onHand,
          stockBefore,
        );
      } finally {
        await tester.pumpWidget(const SizedBox());
        await database.close();
      }
    },
  );

  testWidgets('conflicting current modifier cannot rewrite a saved snapshot', (
    tester,
  ) async {
    final database = await readyDatabase();
    const persisted = CafeModifierSnapshot(
      id: 'size',
      version: 1,
      labelEn: 'Large',
      labelMy: 'အကြီး',
      priceDeltaMmk: 500,
    );
    const conflicting = CafeModifierSnapshot(
      id: 'size',
      version: 1,
      labelEn: 'Large',
      labelMy: 'အကြီး',
      priceDeltaMmk: 900,
    );
    final store = ShopCafeOrderStore(
      database,
      kitchenEntitlement: premiumKitchen,
    );
    try {
      final created = await store.applyCommand(
        CafeOrderCommand(
          id: 'modifier-conflict-create',
          ticketId: 'modifier-conflict-order',
          expectedVersion: 0,
          lines: [
            CafeOrderLine(
              id: 'modifier-conflict-line',
              productId: 'coffee',
              quantity: 1,
              baseUnitPriceMmk: 3000,
              remark: '',
              preparationStation: 'kitchen',
              modifiers: const [persisted],
            ),
          ],
        ),
        {persisted.key: persisted},
      );
      final outboxBefore = await database.countOutboxOperations();
      await openScreen(tester, database, modifiers: const [conflicting]);
      await tester.tap(
        find.byKey(const ValueKey('cafe-edit-line:modifier-conflict-line')),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('cafe-line-quantity')), findsNothing);
      expect(find.byKey(const ValueKey('cafe-error')), findsOneWidget);
      final unchanged = (await store.read(created.ticket.id))!;
      expect(unchanged.ticket.version, created.ticket.version);
      expect(
        unchanged.ticket.lines.single.modifiers.single.toJson(),
        persisted.toJson(),
      );
      expect(await database.countOutboxOperations(), outboxBefore);
      expect(await database.countSales(), 0);
      expect((await database.readActiveProducts()).single.onHand, 5);
    } finally {
      await tester.pumpWidget(const SizedBox());
      await database.close();
    }
  });

  testWidgets('legacy v19 order renders without invented kitchen status', (
    tester,
  ) async {
    final database = await readyDatabase();
    try {
      await ShopCafeOrderStore(
        database,
        kitchenEntitlement: premiumKitchen,
      ).applyCommand(
        CafeOrderCommand(
          id: 'legacy-screen-command',
          ticketId: 'legacy-screen-order',
          expectedVersion: 0,
          lines: [
            CafeOrderLine.fromJson({
              'id': 'legacy-coffee',
              'productId': 'coffee',
              'quantity': 1,
              'baseUnitPriceMmk': 3000,
              'remark': '',
              'modifiers': <Object>[],
            }),
          ],
        ),
        const {},
      );
      await openScreen(tester, database);
      expect(find.text('Coffee'), findsOneWidget);
      expect(
        find.byKey(const ValueKey('cafe-kitchen-ticket:legacy-coffee')),
        findsNothing,
      );
      expect(
        find.byKey(const ValueKey('cafe-complete:legacy-screen-order')),
        findsOneWidget,
      );
    } finally {
      await database.close();
    }
  });

  testWidgets('open cafe order renders its saved product name snapshot', (
    tester,
  ) async {
    final database = await readyDatabase();
    try {
      await ShopCafeOrderStore(database).applyCommand(
        CafeOrderCommand(
          id: 'snapshot-screen-command',
          ticketId: 'snapshot-screen-order',
          expectedVersion: 0,
          lines: [
            CafeOrderLine.local(
              id: 'snapshot-coffee',
              productId: 'coffee',
              productName: 'Tea',
              quantity: 1,
              baseUnitPriceMmk: 3000,
              remark: '',
              modifiers: const [],
            ),
          ],
        ),
        const {},
      );
      await openScreen(tester, database);

      expect(find.text('Tea'), findsOneWidget);
      expect(find.text('Coffee'), findsNothing);
      expect(
        find.byKey(const ValueKey('cafe-complete:snapshot-screen-order')),
        findsOneWidget,
      );
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await database.close();
    }
  });

  testWidgets(
    'creates distinct same-product lines then holds resumes and reopens',
    (tester) async {
      final database = await readyDatabase();
      try {
        await openScreen(tester, database);
        await addLine(tester, modifier: true, remark: 'warm');
        final order =
            (await database
                    .customSelect('SELECT id FROM shop_cafe_orders')
                    .getSingle())
                .read<String>('id');

        await tester.tap(find.byKey(ValueKey('cafe-add-line:$order')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const ValueKey('cafe-product:coffee')));
        await tester.pumpAndSettle();
        await tester.enterText(
          find.byKey(const ValueKey('cafe-remark')),
          'cold',
        );
        await tester.tap(find.byKey(const ValueKey('cafe-add-line-confirm')));
        await tester.pumpAndSettle();

        final row = await database
            .customSelect(
              'SELECT ticket_version, total_mmk FROM shop_cafe_orders',
            )
            .getSingle();
        expect(row.read<int>('ticket_version'), 2);
        expect(row.read<int>('total_mmk'), 6000);
        final lines = await database
            .customSelect(
              r"SELECT json_array_length(ticket_json, '$.lines') AS count "
              'FROM shop_cafe_orders',
            )
            .getSingle();
        expect(lines.read<int>('count'), 2);

        await tester.tap(find.byKey(ValueKey('cafe-hold-resume:$order')));
        await tester.pumpAndSettle();
        expect(find.text('Held'), findsOneWidget);

        await tester.pumpWidget(const SizedBox());
        await openScreen(tester, database);
        expect(find.text('Held'), findsOneWidget);
        await tester.tap(find.byKey(ValueKey('cafe-hold-resume:$order')));
        await tester.pumpAndSettle();
        expect(find.text('Open'), findsOneWidget);
      } finally {
        await database.close();
      }
    },
  );

  testWidgets(
    'cancels a routed single-item order without sale payment or stock effects',
    (tester) async {
      final database = await readyDatabase();
      try {
        await openScreen(tester, database);
        await addLine(tester, remark: 'cancel this');
        final order =
            (await database
                    .customSelect('SELECT id FROM shop_cafe_orders')
                    .getSingle())
                .read<String>('id');
        final stockBefore = (await database.readActiveProducts()).single.onHand;
        final movementsBefore = await database.countStockMovements();

        await tester.tap(find.byKey(ValueKey('cafe-cancel-order:$order')));
        await tester.pumpAndSettle();
        expect(find.text('Cancel entire order?'), findsOneWidget);
        expect(find.textContaining('does not confirm'), findsOneWidget);
        await tester.tap(find.text('Keep order'));
        await tester.pumpAndSettle();
        expect(find.byKey(ValueKey('cafe-order:$order')), findsOneWidget);

        await tester.tap(find.byKey(ValueKey('cafe-cancel-order:$order')));
        await tester.pumpAndSettle();
        await tester.tap(
          find.byKey(const ValueKey('cafe-cancel-order-confirm')),
        );
        await pumpUntilVisible(
          tester,
          find.byKey(const ValueKey('cafe-kitchen-cancel-followup')),
        );

        expect(find.byKey(ValueKey('cafe-order:$order')), findsNothing);
        expect(
          find.textContaining('Kitchen or bar was not notified automatically'),
          findsOneWidget,
        );
        final stored = await ShopCafeOrderStore(database).read(order);
        expect(stored?.state, 'cancelled');
        expect(stored?.ticket.lines, hasLength(1));
        expect(stored?.kitchenDispatchLines, isNotEmpty);
        expect(await database.countSales(), 0);
        expect(await database.countStockMovements(), movementsBefore);
        expect(
          (await database.readActiveProducts()).single.onHand,
          stockBefore,
        );
        expect(
          await database
              .customSelect(
                "SELECT 1 FROM shop_sync_outbox WHERE event_type = "
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

  testWidgets('shows the order cancellation confirmation in Myanmar', (
    tester,
  ) async {
    final database = await readyDatabase();
    try {
      await openScreen(
        tester,
        database,
        myanmar: true,
        kitchenEntitlement: const ShopCafeKitchenEntitlementUnavailable(),
      );
      await addLine(tester);
      final order =
          (await database
                  .customSelect('SELECT id FROM shop_cafe_orders')
                  .getSingle())
              .read<String>('id');
      await tester.tap(find.byKey(ValueKey('cafe-cancel-order:$order')));
      await tester.pumpAndSettle();
      expect(find.text('မှာစာတစ်ခုလုံး ပယ်ဖျက်မည်လား'), findsOneWidget);
      expect(find.text('မှာစာပယ်ဖျက်မည်'), findsOneWidget);
      expect(find.textContaining('လက်ကျန်ပြောင်းလဲမှု'), findsOneWidget);
    } finally {
      await database.close();
    }
  });

  testWidgets('shows the routed cancellation follow-up in Myanmar', (
    tester,
  ) async {
    final database = await readyDatabase();
    try {
      await openScreen(tester, database, myanmar: true);
      await addLine(tester);
      final order =
          (await database
                  .customSelect('SELECT id FROM shop_cafe_orders')
                  .getSingle())
              .read<String>('id');
      await tester.tap(find.byKey(ValueKey('cafe-cancel-order:$order')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('cafe-cancel-order-confirm')));
      await pumpUntilVisible(
        tester,
        find.byKey(const ValueKey('cafe-kitchen-cancel-followup')),
      );
      expect(
        find.textContaining('အလိုအလျောက် အသိပေးထားခြင်းမရှိပါ'),
        findsOneWidget,
      );
    } finally {
      await database.close();
    }
  });

  testWidgets(
    'removes one mistaken line without recording a sale or changing stock',
    (tester) async {
      final database = await readyDatabase();
      try {
        await openScreen(tester, database);
        await addLine(tester, remark: 'keep');
        final order =
            (await database
                    .customSelect('SELECT id FROM shop_cafe_orders')
                    .getSingle())
                .read<String>('id');
        await tester.tap(find.byKey(ValueKey('cafe-add-line:$order')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const ValueKey('cafe-product:coffee')));
        await tester.pumpAndSettle();
        await tester.enterText(
          find.byKey(const ValueKey('cafe-remark')),
          'remove',
        );
        await tester.tap(find.byKey(const ValueKey('cafe-add-line-confirm')));
        await tester.pumpAndSettle();

        final before = await ShopCafeOrderStore(database).read(order);
        final removeLine = before!.ticket.lines.singleWhere(
          (line) => line.remark == 'remove',
        );
        final stockBefore = (await database.readActiveProducts()).single.onHand;
        final movementsBefore = await database.countStockMovements();
        final outboxBefore = await database.countOutboxOperations();

        await tester.tap(
          find.byKey(ValueKey('cafe-remove-line:${removeLine.id}')),
        );
        await tester.pumpAndSettle();
        expect(find.textContaining('kitchen history'), findsOneWidget);
        await tester.tap(
          find.byKey(const ValueKey('cafe-remove-line-confirm')),
        );
        await tester.pumpAndSettle();

        final after = await ShopCafeOrderStore(database).read(order);
        expect(after!.ticket.lines, hasLength(1));
        expect(after.ticket.lines.single.remark, 'keep');
        expect(after.totalMmk, 3000);
        expect(await database.countSales(), 0);
        expect(
          (await database.readActiveProducts()).single.onHand,
          stockBefore,
        );
        expect(await database.countStockMovements(), movementsBefore);
        expect(await database.countOutboxOperations(), outboxBefore + 1);
        expect(
          find.byKey(
            ValueKey('cafe-remove-line:${after.ticket.lines.single.id}'),
          ),
          findsNothing,
        );
      } finally {
        await database.close();
      }
    },
  );

  testWidgets(
    'removes a retired modifier line while preserving its kitchen audit',
    (tester) async {
      final database = await readyDatabase();
      const persisted = CafeModifierSnapshot(
        id: 'size',
        version: 1,
        labelEn: 'Large',
        labelMy: 'အကြီး',
        priceDeltaMmk: 500,
      );
      const conflicting = CafeModifierSnapshot(
        id: 'size',
        version: 1,
        labelEn: 'Large',
        labelMy: 'အကြီး',
        priceDeltaMmk: 900,
      );
      final store = ShopCafeOrderStore(
        database,
        kitchenEntitlement: premiumKitchen,
      );
      try {
        final created = await store.applyCommand(
          CafeOrderCommand(
            id: 'remove-retired-create',
            ticketId: 'remove-retired-order',
            expectedVersion: 0,
            lines: [
              CafeOrderLine(
                id: 'keep-line',
                productId: 'coffee',
                quantity: 1,
                baseUnitPriceMmk: 3000,
                remark: 'keep',
                preparationStation: 'kitchen',
                modifiers: const [],
              ),
              CafeOrderLine(
                id: 'remove-retired-line',
                productId: 'coffee',
                quantity: 1,
                baseUnitPriceMmk: 3000,
                remark: 'remove',
                preparationStation: 'kitchen',
                modifiers: const [persisted],
              ),
            ],
          ),
          {persisted.key: persisted},
        );
        final stockBefore = (await database.readActiveProducts()).single.onHand;
        final movementsBefore = await database.countStockMovements();
        final outboxBefore = await database.countOutboxOperations();

        await openScreen(tester, database, modifiers: const [conflicting]);
        await tester.tap(
          find.byKey(const ValueKey('cafe-remove-line:remove-retired-line')),
        );
        await tester.pumpAndSettle();
        await tester.tap(
          find.byKey(const ValueKey('cafe-remove-line-confirm')),
        );
        await tester.pumpAndSettle();

        final after = await store.read(created.ticket.id);
        expect(after!.ticket.lines.map((line) => line.id), ['keep-line']);
        expect(after.totalMmk, 3000);
        expect(await database.countSales(), 0);
        expect(
          (await database.readActiveProducts()).single.onHand,
          stockBefore,
        );
        expect(await database.countStockMovements(), movementsBefore);
        expect(await database.countOutboxOperations(), outboxBefore + 1);
        final auditRows = await database
            .customSelect(
              "SELECT payload_json FROM shop_sync_outbox WHERE event_type = "
              "'shop.cafe_kitchen_dispatch.recorded.v1'",
            )
            .get();
        expect(
          auditRows.any(
            (row) => row
                .read<String>('payload_json')
                .contains('remove-retired-line'),
          ),
          isTrue,
        );
      } finally {
        await database.close();
      }
    },
  );

  testWidgets(
    'cash completion is guarded from duplicate taps and preserves invariants',
    (tester) async {
      final database = await readyDatabase();
      try {
        await openScreen(tester, database);
        await addLine(tester);
        final order =
            (await database
                    .customSelect('SELECT id FROM shop_cafe_orders')
                    .getSingle())
                .read<String>('id');
        final outboxBefore = await database.countOutboxOperations();
        final stockMovementsBefore = await database.countStockMovements();

        await tester.tap(find.byKey(ValueKey('cafe-complete:$order')));
        await tester.pumpAndSettle();
        final confirm = find.byKey(
          const ValueKey('cafe-complete-cash-confirm'),
        );
        await tester.tap(confirm);
        await tester.tap(confirm, warnIfMissed: false);
        await tester.pumpAndSettle();

        expect(await database.countSales(), 1);
        expect((await database.readActiveProducts()).single.onHand, 4);
        expect(await database.countStockMovements(), stockMovementsBefore + 1);
        expect(await database.countOutboxOperations(), outboxBefore + 1);
        expect(find.text('Sale saved'), findsOneWidget);
      } finally {
        await database.close();
      }
    },
  );

  testWidgets('cafe cash tender rejects short cash and shows exact change', (
    tester,
  ) async {
    final database = await readyDatabase();
    try {
      await openScreen(tester, database);
      await addLine(tester);
      final order =
          (await database
                  .customSelect('SELECT id FROM shop_cafe_orders')
                  .getSingle())
              .read<String>('id');

      await tester.tap(find.byKey(ValueKey('cafe-complete:$order')));
      await tester.pumpAndSettle();
      final cashGiven = find.byKey(const ValueKey('cafe-cash-given'));
      expect(cashGiven, findsOneWidget);
      final outboxBefore = await database.countOutboxOperations();

      await tester.enterText(cashGiven, '2000');
      await tester.pumpAndSettle();
      expect(
        find.text('Cash given is less than the amount due.'),
        findsOneWidget,
      );
      expect(
        tester
            .widget<FilledButton>(
              find.byKey(const ValueKey('cafe-complete-cash-confirm')),
            )
            .onPressed,
        isNull,
      );
      expect(await database.countSales(), 0);
      expect((await database.readActiveProducts()).single.onHand, 5);
      expect(await database.countOutboxOperations(), outboxBefore);
      expect(
        (await database
                .customSelect(
                  'SELECT state FROM shop_cafe_orders WHERE id = ?',
                  variables: [Variable<String>(order)],
                )
                .getSingle())
            .read<String>('state'),
        'open',
      );

      await tester.enterText(cashGiven, '3,000');
      await tester.pumpAndSettle();
      expect(find.text('Enter a valid amount.'), findsOneWidget);
      expect(
        tester
            .widget<FilledButton>(
              find.byKey(const ValueKey('cafe-complete-cash-confirm')),
            )
            .onPressed,
        isNull,
      );
      expect(await database.countSales(), 0);
      expect((await database.readActiveProducts()).single.onHand, 5);
      expect(await database.countOutboxOperations(), outboxBefore);
      expect(
        (await database
                .customSelect(
                  'SELECT state FROM shop_cafe_orders WHERE id = ?',
                  variables: [Variable<String>(order)],
                )
                .getSingle())
            .read<String>('state'),
        'open',
      );

      await tester.enterText(cashGiven, '5000');
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('cafe-cash-change')), findsOneWidget);
      expect(find.text('2,000 MMK'), findsOneWidget);
      await tester.tap(
        find.byKey(const ValueKey('cafe-complete-cash-confirm')),
      );
      await tester.pumpAndSettle();

      expect(await database.countSales(), 1);
      expect((await database.readActiveProducts()).single.onHand, 4);
      expect(find.textContaining('Change 2,000 MMK'), findsOneWidget);
    } finally {
      await database.close();
    }
  });

  testWidgets(
    'cafe cash tender accepts Myanmar digits and shows Myanmar change',
    (tester) async {
      final database = await readyDatabase();
      try {
        await openScreen(tester, database, myanmar: true);
        await addLine(tester);
        final order =
            (await database
                    .customSelect('SELECT id FROM shop_cafe_orders')
                    .getSingle())
                .read<String>('id');

        await tester.tap(find.byKey(ValueKey('cafe-complete:$order')));
        await tester.pumpAndSettle();
        await tester.enterText(
          find.byKey(const ValueKey('cafe-cash-given')),
          '၅၀၀၀',
        );
        await tester.pumpAndSettle();
        expect(find.text('၂,၀၀၀ ကျပ်'), findsOneWidget);
        await tester.tap(
          find.byKey(const ValueKey('cafe-complete-cash-confirm')),
        );
        await tester.pumpAndSettle();

        expect(await database.countSales(), 1);
        expect(find.textContaining('ပြန်အမ်းငွေ ၂,၀၀၀ ကျပ်'), findsOneWidget);
      } finally {
        await database.close();
      }
    },
  );

  testWidgets(
    'pending wallet blocks cafe cash clearly in English and Myanmar',
    (tester) async {
      final database = await readyDatabase();
      try {
        await database.createWalletCheckoutIntent(
          operationId: 'screen-wallet-pending',
          merchant: MerchantWalletSetup(
            provider: 'KBZPay',
            merchantPhone: null,
            officialQrPayload: _syntheticStaticMmqr(),
            issuerConfirmed: true,
          ),
          lines: const [ShopSaleLineInput(productId: 'coffee', quantity: 1)],
        );
        await openScreen(tester, database);
        await addLine(tester);
        final order =
            (await database
                    .customSelect('SELECT id FROM shop_cafe_orders')
                    .getSingle())
                .read<String>('id');
        final outboxBefore = await database.countOutboxOperations();

        await tester.tap(find.byKey(ValueKey('cafe-complete:$order')));
        await tester.pumpAndSettle();
        await tester.tap(
          find.byKey(const ValueKey('cafe-complete-cash-confirm')),
        );
        await tester.pumpAndSettle();

        expect(
          find.text(
            'Finish or cancel the pending mobile payment before taking cash.',
          ),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);

        await tester.pumpWidget(const SizedBox.shrink());
        await openScreen(tester, database, myanmar: true);
        await tester.tap(find.byKey(ValueKey('cafe-complete:$order')));
        await tester.pumpAndSettle();
        await tester.tap(
          find.byKey(const ValueKey('cafe-complete-cash-confirm')),
        );
        await tester.pumpAndSettle();

        expect(
          find.text(
            'ငွေသားမယူမီ ဆိုင်းငံ့နေသော မိုဘိုင်းငွေပေးချေမှုကို ပြီးစီးပါ သို့မဟုတ် ပယ်ဖျက်ပါ။',
          ),
          findsOneWidget,
        );
        expect(await database.countSales(), 0);
        expect((await database.readActiveProducts()).single.onHand, 5);
        expect(await database.countOutboxOperations(), outboxBefore);
        expect(
          (await database.readPendingWalletCheckout())?.operationId,
          'screen-wallet-pending',
        );
        expect(
          await database.readPendingCashCheckout(
            checkoutKind: 'cafe',
            subjectId: order,
          ),
          isNull,
        );
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump(const Duration(milliseconds: 1));
        await database.close();
      }
    },
  );

  testWidgets(
    'stale stock failure changes no sale stock proof or outbox state',
    (tester) async {
      final database = await readyDatabase();
      try {
        await openScreen(tester, database);
        await addLine(tester);
        final order =
            (await database
                    .customSelect('SELECT id FROM shop_cafe_orders')
                    .getSingle())
                .read<String>('id');
        await database.customUpdate(
          "UPDATE shop_products SET on_hand = 0 WHERE id = 'coffee'",
        );
        final outboxBefore = await database.countOutboxOperations();
        final movementsBefore = await database.countStockMovements();

        await tester.tap(find.byKey(ValueKey('cafe-complete:$order')));
        await tester.pumpAndSettle();
        await tester.tap(
          find.byKey(const ValueKey('cafe-complete-cash-confirm')),
        );
        await tester.pumpAndSettle();

        expect(find.byKey(const ValueKey('cafe-error')), findsOneWidget);
        expect(
          find.text(
            'Coffee has 0 in stock, but this order needs 1. '
            'Edit or remove the item before taking cash.',
          ),
          findsOneWidget,
        );
        expect(await database.countSales(), 0);
        expect(await database.countStockMovements(), movementsBefore);
        expect(await database.countOutboxOperations(), outboxBefore);
        expect(
          (await database
                  .customSelect('SELECT state FROM shop_cafe_orders')
                  .getSingle())
              .read<String>('state'),
          'open',
        );
      } finally {
        await database.close();
      }
    },
  );

  testWidgets(
    'combined modifier lines name the stock shortage without any effects',
    (tester) async {
      final database = await readyDatabase();
      try {
        await database.customUpdate(
          "UPDATE shop_products SET on_hand = 1 WHERE id = 'coffee'",
        );
        await openScreen(tester, database);
        await addLine(tester);
        final order =
            (await database
                    .customSelect('SELECT id FROM shop_cafe_orders')
                    .getSingle())
                .read<String>('id');

        await tester.tap(find.byKey(ValueKey('cafe-add-line:$order')));
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const ValueKey('cafe-product:coffee')));
        await tester.pumpAndSettle();
        await tester.tap(
          find.byKey(const ValueKey('cafe-modifier:no-sugar@1')),
        );
        await tester.tap(find.byKey(const ValueKey('cafe-add-line-confirm')));
        await tester.pumpAndSettle();

        final outboxBefore = await database.countOutboxOperations();
        final movementsBefore = await database.countStockMovements();
        await tester.tap(find.byKey(ValueKey('cafe-complete:$order')));
        await tester.pumpAndSettle();
        await tester.tap(
          find.byKey(const ValueKey('cafe-complete-cash-confirm')),
        );
        await tester.pumpAndSettle();

        expect(
          find.text(
            'Coffee has 1 in stock, but this order needs 2. '
            'Edit or remove the item before taking cash.',
          ),
          findsOneWidget,
        );
        expect(await database.countSales(), 0);
        expect(await database.countStockMovements(), movementsBefore);
        expect(await database.countOutboxOperations(), outboxBefore);
        expect((await database.readActiveProducts()).single.onHand, 1);
        expect(
          (await database
                  .customSelect(
                    'SELECT state FROM shop_cafe_orders WHERE id = ?',
                    variables: [Variable<String>(order)],
                  )
                  .getSingle())
              .read<String>('state'),
          'open',
        );
      } finally {
        await database.close();
      }
    },
  );

  testWidgets('Myanmar stock shortage gives an actionable local message', (
    tester,
  ) async {
    final database = await readyDatabase();
    try {
      await openScreen(tester, database, myanmar: true);
      await addLine(tester);
      final order =
          (await database
                  .customSelect('SELECT id FROM shop_cafe_orders')
                  .getSingle())
              .read<String>('id');
      await database.customUpdate(
        "UPDATE shop_products SET on_hand = 0 WHERE id = 'coffee'",
      );

      await tester.tap(find.byKey(ValueKey('cafe-complete:$order')));
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey('cafe-complete-cash-confirm')),
      );
      await tester.pumpAndSettle();

      expect(
        find.textContaining(
          'Coffee လက်ကျန် ၀ ခုသာရှိပြီး ဤမှာစာတွင် ၁ ခုလိုပါသည်။',
        ),
        findsOneWidget,
      );
      expect(await database.countSales(), 0);
      expect((await database.readActiveProducts()).single.onHand, 0);
    } finally {
      await database.close();
    }
  });

  testWidgets('stale screen version fails closed without a partial mutation', (
    tester,
  ) async {
    final database = await readyDatabase();
    final store = ShopCafeOrderStore(
      database,
      kitchenEntitlement: premiumKitchen,
    );
    try {
      final first = CafeOrderLine(
        id: 'first',
        productId: 'coffee',
        quantity: 1,
        baseUnitPriceMmk: 3000,
        remark: '',
        modifiers: const [],
      );
      final created = await store.applyCommand(
        CafeOrderCommand(
          id: 'create',
          ticketId: 'cafe-stale',
          expectedVersion: 0,
          lines: [first],
        ),
        const {},
      );
      await openScreen(tester, database);
      final second = CafeOrderLine(
        id: 'second',
        productId: 'coffee',
        quantity: 1,
        baseUnitPriceMmk: 3000,
        remark: 'external',
        modifiers: const [],
      );
      await store.applyCommand(
        CafeOrderCommand(
          id: 'external-update',
          ticketId: created.ticket.id,
          expectedVersion: 1,
          lines: [first, second],
        ),
        const {},
      );
      final outboxBefore = await database.countOutboxOperations();
      final stockBefore = (await database.readActiveProducts()).single.onHand;

      await tester.tap(find.byKey(const ValueKey('cafe-add-line:cafe-stale')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('cafe-product:coffee')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('cafe-add-line-confirm')));
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('cafe-error')), findsOneWidget);
      final unchanged = await store.read('cafe-stale');
      expect(unchanged?.ticket.version, 2);
      expect(unchanged?.ticket.lines, hasLength(2));
      expect(await database.countSales(), 0);
      expect((await database.readActiveProducts()).single.onHand, stockBefore);
      expect(await database.countOutboxOperations(), outboxBefore);
    } finally {
      await database.close();
    }
  });

  testWidgets('Myanmar labels and scaled touch controls remain accessible', (
    tester,
  ) async {
    final database = await readyDatabase();
    try {
      tester.view.physicalSize = const Size(390, 844);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpWidget(
        MediaQuery(
          data: const MediaQueryData(textScaler: TextScaler.linear(1.3)),
          child: MaterialApp(
            home: ShopCafeOrderScreen(database: database, myanmar: true),
            // This existing accessibility case exercises routed order controls.
            // Production still defaults to fail-closed entitlement.
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('ကော်ဖီဆိုင် မှာစာများ'), findsOneWidget);
      expect(find.text('မှာစာသစ်'), findsOneWidget);
      expect(
        tester.getSize(find.byKey(const ValueKey('cafe-new-order'))).height,
        greaterThanOrEqualTo(48),
      );
      expect(tester.takeException(), isNull);
    } finally {
      await database.close();
    }
  });

  testWidgets('valid short persisted order IDs render without crashing', (
    tester,
  ) async {
    final database = await readyDatabase();
    try {
      await ShopCafeOrderStore(
        database,
        kitchenEntitlement: premiumKitchen,
      ).applyCommand(
        CafeOrderCommand(
          id: 'create-short',
          ticketId: 'o-1',
          expectedVersion: 0,
          lines: [
            CafeOrderLine(
              id: 'line',
              productId: 'coffee',
              quantity: 1,
              baseUnitPriceMmk: 3000,
              remark: '',
              modifiers: const [],
            ),
          ],
        ),
        const {},
      );
      await openScreen(tester, database);
      expect(find.text('Order o-1'), findsOneWidget);
      expect(tester.takeException(), isNull);
    } finally {
      await database.close();
    }
  });

  testWidgets('Core cashier creates a basic cafe order without kitchen route', (
    tester,
  ) async {
    final database = await readyDatabase();
    try {
      await openScreen(
        tester,
        database,
        kitchenEntitlement: const ShopCafeKitchenEntitlementUnavailable(),
      );
      await tester.tap(find.byKey(const ValueKey('cafe-new-order')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('cafe-product:coffee')));
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('cafe-kitchen-entitlement-unavailable')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('cafe-preparation-station')),
        findsNothing,
      );
      await tester.tap(find.byKey(const ValueKey('cafe-add-line-confirm')));
      await tester.pumpAndSettle();

      final json =
          (await database
                  .customSelect('SELECT ticket_json FROM shop_cafe_orders')
                  .getSingle())
              .read<String>('ticket_json');
      expect(json, isNot(contains('preparationStation')));
      expect(find.textContaining('Pending locally'), findsNothing);
    } finally {
      await database.close();
    }
  });

  testWidgets('Core cashier splits whole local lines into two unpaid bills', (
    tester,
  ) async {
    final database = await readyDatabase();
    try {
      await ShopCafeOrderStore(database).applyCommand(
        CafeOrderCommand(
          id: 'screen-split-create',
          ticketId: 'screen-split-source',
          expectedVersion: 0,
          serviceContext: const CafeServiceContext(
            areaLabel: 'Ground floor',
            tableLabel: 'T-03',
          ),
          lines: [
            CafeOrderLine.local(
              id: 'screen-split-1',
              productId: 'coffee',
              quantity: 1,
              baseUnitPriceMmk: 3000,
              remark: '',
              modifiers: const [],
            ),
            CafeOrderLine.local(
              id: 'screen-split-2',
              productId: 'coffee',
              quantity: 1,
              baseUnitPriceMmk: 3000,
              remark: 'take away',
              modifiers: const [],
            ),
          ],
        ),
        const {},
      );
      final stockBefore = (await database.readActiveProducts()).single.onHand;
      await openScreen(
        tester,
        database,
        kitchenEntitlement: const ShopCafeKitchenEntitlementUnavailable(),
      );

      await tester.tap(
        find.byKey(const ValueKey('cafe-split:screen-split-source')),
      );
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Each bill must be paid separately'),
        findsOneWidget,
      );
      await tester.tap(
        find.byKey(const ValueKey('cafe-split-line:screen-split-2')),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('cafe-split-confirm')));
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('cafe-split-success')), findsOneWidget);
      expect(
        find.textContaining('Take payment for each bill separately'),
        findsOneWidget,
      );
      expect(
        await database
            .customSelect('SELECT COUNT(*) AS count FROM shop_cafe_orders')
            .map((row) => row.read<int>('count'))
            .getSingle(),
        2,
      );
      expect(await database.countSales(), 0);
      expect((await database.readActiveProducts()).single.onHand, stockBefore);
      expect(
        find.byKey(const ValueKey('cafe-split:screen-split-source')),
        findsNothing,
      );
    } finally {
      await database.close();
    }
  });

  testWidgets('Myanmar cashier splits one whole unit from a local quantity', (
    tester,
  ) async {
    final database = await readyDatabase();
    try {
      await ShopCafeOrderStore(database).applyCommand(
        CafeOrderCommand(
          id: 'screen-quantity-split-create',
          ticketId: 'screen-quantity-split-source',
          expectedVersion: 0,
          lines: [
            CafeOrderLine.local(
              id: 'screen-quantity-split-line',
              productId: 'coffee',
              quantity: 3,
              baseUnitPriceMmk: 3000,
              remark: 'less ice',
              modifiers: const [],
            ),
          ],
        ),
        const {},
      );
      final stockBefore = (await database.readActiveProducts()).single.onHand;
      await openScreen(
        tester,
        database,
        myanmar: true,
        kitchenEntitlement: const ShopCafeKitchenEntitlementUnavailable(),
      );

      await tester.tap(
        find.byKey(const ValueKey('cafe-split:screen-quantity-split-source')),
      );
      await tester.pumpAndSettle();
      expect(
        find.byKey(
          const ValueKey('cafe-split-quantity:screen-quantity-split-line'),
        ),
        findsOneWidget,
      );
      await tester.tap(
        find.byKey(
          const ValueKey('cafe-split-increase:screen-quantity-split-line'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('1 / 3'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('cafe-split-confirm')));
      await tester.pumpAndSettle();

      final orders = await ShopCafeOrderStore(database).readActive();
      final source = orders.singleWhere(
        (order) => order.ticket.id == 'screen-quantity-split-source',
      );
      final destination = orders.singleWhere(
        (order) => order.ticket.id != 'screen-quantity-split-source',
      );
      expect(source.ticket.lines.single.quantity, 2);
      expect(destination.ticket.lines.single.quantity, 1);
      expect(source.totalMmk + destination.totalMmk, 9000);
      expect(await database.countSales(), 0);
      expect((await database.readActiveProducts()).single.onHand, stockBefore);

      await tester.pump(const Duration(seconds: 5));
      await tester.pumpAndSettle();
      final undo = find.byKey(
        const ValueKey('cafe-unsplit:screen-quantity-split-source'),
      );
      await tester.drag(find.byType(ListView), const Offset(0, -400));
      await tester.pumpAndSettle();
      expect(undo, findsOneWidget);
      await tester.tap(undo);
      await tester.pumpAndSettle();
      expect(find.textContaining('ငွေမချေရသေး'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('cafe-unsplit-confirm')));
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('cafe-unsplit-success')),
        findsOneWidget,
      );
      final restored = await ShopCafeOrderStore(database).readActive();
      expect(restored, hasLength(1));
      expect(restored.single.ticket.lines.single.quantity, 3);
      expect(restored.single.totalMmk, 9000);
      expect(await database.countSales(), 0);
      expect((await database.readActiveProducts()).single.onHand, stockBefore);
    } finally {
      await database.close();
    }
  });

  testWidgets('Myanmar Core copy clearly keeps basic cafe order available', (
    tester,
  ) async {
    final database = await readyDatabase();
    try {
      await openScreen(
        tester,
        database,
        myanmar: true,
        kitchenEntitlement: const ShopCafeKitchenEntitlementUnavailable(),
      );
      await tester.tap(find.byKey(const ValueKey('cafe-new-order')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('cafe-product:coffee')));
      await tester.pumpAndSettle();
      expect(find.textContaining('အခြေခံမှာစာသာ သုံးနိုင်သည်'), findsOneWidget);
      expect(find.textContaining('Premium'), findsOneWidget);
    } finally {
      await database.close();
    }
  });

  testWidgets('revoked authority fails below UI and saves no routed order', (
    tester,
  ) async {
    final database = await readyDatabase();
    try {
      await openScreen(
        tester,
        database,
        kitchenEntitlement: const _RejectKitchenEntitlement(),
      );
      await addLine(tester);
      expect(find.byKey(const ValueKey('cafe-error')), findsOneWidget);
      expect(find.textContaining('verified Premium access'), findsOneWidget);
      expect(
        await database
            .customSelect('SELECT COUNT(*) AS count FROM shop_cafe_orders')
            .map((row) => row.read<int>('count'))
            .getSingle(),
        0,
      );
    } finally {
      await database.close();
    }
  });
}

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

class _RejectKitchenEntitlement implements ShopCafeKitchenEntitlement {
  const _RejectKitchenEntitlement();

  @override
  bool get allowsKitchenDispatch => true;

  @override
  void requireKitchenDispatch({
    required String orderId,
    required String commandId,
  }) {
    throw const ShopCafeKitchenEntitlementException(
      'shop_cafe_kitchen_entitlement_revoked',
    );
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
