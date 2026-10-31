import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/main.dart';
import 'package:supermega_shop/shop_database.dart';

void main() {
  testWidgets('duplicate barcode keeps every English add-product entry', (
    tester,
  ) async {
    _usePhoneViewport(tester);
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'existing-tea',
        name: 'Existing tea',
        priceMmk: 2000,
        openingStock: 2,
        barcode: '0012345678905',
      );
      await _openStock(tester, database, myanmar: false);
      await _enterProduct(
        tester,
        name: 'New tea',
        category: 'Drinks',
        barcode: '0012345678905',
        price: '3500',
        stock: '8',
      );
      await tester.tap(find.text('Save product'));
      await tester.pumpAndSettle();

      expect(
        find.text('This barcode already belongs to another product.'),
        findsOneWidget,
      );
      expect(await database.readActiveProducts(), hasLength(1));
      expect(_fieldText(tester, 'shop-product-name'), 'New tea');
      expect(_fieldText(tester, 'shop-product-category'), 'Drinks');
      expect(_fieldText(tester, 'shop-product-barcode'), '0012345678905');
      expect(_fieldText(tester, 'shop-product-price'), '3500');
      expect(_fieldText(tester, 'shop-product-stock'), '8');

      await tester.enterText(
        find.byKey(const ValueKey('shop-product-barcode')),
        '0098765432105',
      );
      await tester.tap(find.text('Save product'));
      await tester.pumpAndSettle();
      final products = await database.readActiveProducts();
      expect(products, hasLength(2));
      expect(
        products.singleWhere((product) => product.name == 'New tea').barcode,
        '0098765432105',
      );
      expect(
        products.singleWhere((product) => product.name == 'New tea').category,
        'Drinks',
      );
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('Myanmar digits and entries survive a recoverable save error', (
    tester,
  ) async {
    _usePhoneViewport(tester);
    final database = _FailOnceAddProductDatabase();
    try {
      await _openStock(tester, database, myanmar: true);
      await _enterProduct(
        tester,
        name: 'လက်ဖက်ခြောက်',
        category: 'အဖျော်ယမကာ',
        barcode: '0099999999999',
        price: '၃၅၀၀',
        stock: '၈',
      );
      await tester.tap(find.text('သိမ်းရန်'));
      await tester.pumpAndSettle();

      expect(
        find.text(
          'ကုန်ပစ္စည်းကို မသိမ်းနိုင်ပါ။ အချက်အလက်များကို စစ်ပြီး ထပ်ကြိုးစားပါ။',
        ),
        findsOneWidget,
      );
      expect(await database.readActiveProducts(), isEmpty);
      expect(_fieldText(tester, 'shop-product-name'), 'လက်ဖက်ခြောက်');
      expect(_fieldText(tester, 'shop-product-category'), 'အဖျော်ယမကာ');
      expect(_fieldText(tester, 'shop-product-barcode'), '0099999999999');
      expect(_fieldText(tester, 'shop-product-price'), '၃၅၀၀');
      expect(_fieldText(tester, 'shop-product-stock'), '၈');

      await tester.tap(find.text('သိမ်းရန်'));
      await tester.pumpAndSettle();
      final product = (await database.readActiveProducts()).single;
      expect(product.name, 'လက်ဖက်ခြောက်');
      expect(product.category, 'အဖျော်ယမကာ');
      expect(product.priceMmk, 3500);
      expect(product.onHand, 8);
      expect(product.barcode, '0099999999999');
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('pending add cannot dismiss or submit twice before commit', (
    tester,
  ) async {
    _usePhoneViewport(tester);
    final database = _ControlledAddProductDatabase();
    try {
      await _openStock(tester, database, myanmar: false);
      await _enterProduct(
        tester,
        name: 'Delayed tea',
        barcode: '0088888888888',
        price: '2500',
        stock: '4',
      );
      await tester.tap(find.text('Save product'));
      await tester.pump();
      await database.started.future;
      expect(database.addCalls, 1);

      final saveButton = find.widgetWithText(FilledButton, 'Save product');
      expect(tester.widget<FilledButton>(saveButton).onPressed, isNull);
      await tester.tap(saveButton, warnIfMissed: false);
      await tester.tapAt(const Offset(2, 2));
      await tester.binding.handlePopRoute();
      await tester.pump();
      expect(database.addCalls, 1);
      expect(find.byKey(const ValueKey('shop-product-name')), findsOneWidget);
      expect(await database.readActiveProducts(), isEmpty);

      database.release.complete();
      await tester.pumpAndSettle();
      expect(database.addCalls, 1);
      expect(find.byKey(const ValueKey('shop-product-name')), findsNothing);
      expect(find.text('Product added to stock.'), findsOneWidget);
      final product = (await database.readActiveProducts()).single;
      expect(product.name, 'Delayed tea');
      expect(product.onHand, 4);
    } finally {
      if (!database.release.isCompleted) database.release.complete();
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });
}

void _usePhoneViewport(WidgetTester tester) {
  tester.view.physicalSize = const Size(390, 800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Future<void> _openStock(
  WidgetTester tester,
  ShopDatabase database, {
  required bool myanmar,
}) async {
  await tester.pumpWidget(
    ShopApp(
      testOnlyAllowMissingRuntimeScope: true,
      database: database,
      authClient: null,
      apiBaseUrl: 'https://app.supermega.dev',
      initialMyanmar: myanmar,
    ),
  );
  await tester.pumpAndSettle();
  await tester.tap(
    find.descendant(
      of: find.byType(NavigationBar),
      matching: find.text(myanmar ? 'လက်ကျန်' : 'Stock'),
    ),
  );
  await tester.pumpAndSettle();
  await tester.tap(find.byKey(const ValueKey('stock-add-product')));
  await tester.pumpAndSettle();
}

Future<void> _enterProduct(
  WidgetTester tester, {
  required String name,
  String category = '',
  required String barcode,
  required String price,
  required String stock,
}) async {
  await tester.enterText(find.byKey(const ValueKey('shop-product-name')), name);
  await tester.enterText(
    find.byKey(const ValueKey('shop-product-category')),
    category,
  );
  await tester.tap(find.byKey(const ValueKey('shop-product-add-barcode')));
  await tester.pumpAndSettle();
  await tester.enterText(
    find.byKey(const ValueKey('shop-product-barcode')),
    barcode,
  );
  await tester.enterText(
    find.byKey(const ValueKey('shop-product-price')),
    price,
  );
  await tester.enterText(
    find.byKey(const ValueKey('shop-product-stock')),
    stock,
  );
}

String _fieldText(WidgetTester tester, String key) =>
    tester.widget<TextFormField>(find.byKey(ValueKey(key))).controller!.text;

class _FailOnceAddProductDatabase extends ShopDatabase {
  _FailOnceAddProductDatabase() : super(NativeDatabase.memory());

  var _shouldFail = true;

  @override
  Future<void> addProduct({
    required String id,
    required String name,
    required int priceMmk,
    required int openingStock,
    String category = '',
    String description = '',
    String? sku,
    String? barcode,
  }) {
    if (_shouldFail) {
      _shouldFail = false;
      throw StateError('synthetic recoverable storage failure');
    }
    return super.addProduct(
      id: id,
      name: name,
      priceMmk: priceMmk,
      openingStock: openingStock,
      category: category,
      description: description,
      sku: sku,
      barcode: barcode,
    );
  }
}

class _ControlledAddProductDatabase extends ShopDatabase {
  _ControlledAddProductDatabase() : super(NativeDatabase.memory());

  final started = Completer<void>();
  final release = Completer<void>();
  var addCalls = 0;

  @override
  Future<void> addProduct({
    required String id,
    required String name,
    required int priceMmk,
    required int openingStock,
    String category = '',
    String description = '',
    String? sku,
    String? barcode,
  }) async {
    addCalls++;
    if (!started.isCompleted) started.complete();
    await release.future;
    return super.addProduct(
      id: id,
      name: name,
      priceMmk: priceMmk,
      openingStock: openingStock,
      category: category,
      description: description,
      sku: sku,
      barcode: barcode,
    );
  }
}
