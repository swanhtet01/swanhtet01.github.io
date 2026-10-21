import 'dart:convert';
import 'dart:io';

import 'package:drift/drift.dart' hide isNotNull, isNull;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supermega_shop/main.dart';
import 'package:supermega_shop/printer_services.dart';
import 'package:supermega_shop/recent_sales_screen.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_models.dart';
import 'package:supermega_shop/wallet_setup_screen.dart';

Finder _merchantQrSemantics(String provider) => find.byWidgetPredicate(
  (widget) =>
      widget is Semantics &&
      widget.properties.label == '$provider merchant QR' &&
      widget.properties.image == true,
  description: '$provider merchant QR semantic image',
);

void _usePhoneViewport(WidgetTester tester) {
  tester.view.physicalSize = const Size(390, 800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

void main() {
  testWidgets('Today stays readable and opens Counter in both languages', (
    tester,
  ) async {
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    tester.view.devicePixelRatio = 1;
    for (final width in [320.0, 360.0, 390.0, 820.0, 1200.0]) {
      for (final myanmar in [false, true]) {
        tester.view.physicalSize = Size(width, 800);
        tester.platformDispatcher.textScaleFactorTestValue = width == 320
            ? 1.5
            : width == 360
            ? 1.3
            : 1.0;
        final database = ShopDatabase(NativeDatabase.memory());
        await tester.pumpWidget(
          ShopApp(
            database: database,
            authClient: null,
            apiBaseUrl: 'https://app.supermega.dev',
            initialMyanmar: myanmar,
          ),
        );
        await tester.pumpAndSettle();

        expect(
          tester
              .widget<MaterialApp>(find.byType(MaterialApp))
              .theme
              ?.textTheme
              .bodyMedium
              ?.fontFamily,
          'Inter',
        );
        final theme = tester
            .widget<MaterialApp>(find.byType(MaterialApp))
            .theme!;
        expect(
          theme.appBarTheme.titleTextStyle?.fontFamilyFallback,
          contains('NotoSansMyanmar'),
        );
        expect(
          theme.navigationRailTheme.selectedLabelTextStyle?.fontFamilyFallback,
          contains('NotoSansMyanmar'),
        );
        expect(find.text(myanmar ? 'ယနေ့' : 'Today'), findsWidgets);
        expect(find.text(myanmar ? 'ရောင်းရန်' : 'Sell'), findsOneWidget);
        if (width >= 700) {
          expect(
            find.text(myanmar ? 'ဆက်တင်များ' : 'Settings'),
            findsOneWidget,
          );
        }
        expect(
          find.text(
            myanmar ? 'ပထမကုန်ပစ္စည်းကို ထည့်ပါ' : 'Add your first product',
          ),
          findsOneWidget,
        );
        expect(
          find.text(myanmar ? 'ယနေ့ရောင်းအား' : 'Sales today'),
          findsNothing,
        );
        expect(tester.takeException(), isNull);

        await tester.ensureVisible(
          find.text(
            myanmar ? 'ပထမကုန်ပစ္စည်းကို ထည့်ပါ' : 'Add your first product',
          ),
        );
        await tester.tap(
          find.text(
            myanmar ? 'ပထမကုန်ပစ္စည်းကို ထည့်ပါ' : 'Add your first product',
          ),
        );
        await tester.pumpAndSettle();
        expect(
          find.text(myanmar ? 'ကုန်ပစ္စည်းများ' : 'Products'),
          findsOneWidget,
        );
        expect(find.byType(AlertDialog), findsOneWidget);
        expect(tester.takeException(), isNull);

        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump(const Duration(milliseconds: 1));
        await database.close();
      }
    }
  });

  testWidgets('Today and Sell keep an unfinished basket and refresh sales', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'tea',
        name: 'Tea',
        barcode: '111111',
        priceMmk: 2500,
        openingStock: 3,
      );
      await tester.pumpWidget(
        ShopApp(
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          initialMyanmar: false,
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Sell'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), '111111');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Review sale · 1 · 2,500 MMK'),
        findsOneWidget,
      );

      await tester.tap(find.text('Today'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Review sale'), findsNothing);
      await tester.tap(find.text('Sell'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Review sale · 1 · 2,500 MMK'),
        findsOneWidget,
      );

      await database.recordCashSale(
        operationId: 'outside-counter-sale',
        lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
      );
      await tester.tap(find.text('Today'));
      await tester.pumpAndSettle();
      expect(find.text('2,500 MMK'), findsWidgets);
      expect(find.text('Completed sales'), findsOneWidget);
      await tester.tap(find.text('Sell'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Review sale · 1 · 2,500 MMK'),
        findsOneWidget,
      );
      expect(await database.countSales(), 1);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('compact Today and Stock put recent work and low stock first', (
    tester,
  ) async {
    _usePhoneViewport(tester);
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'high',
        name: 'High stock',
        priceMmk: 2500,
        openingStock: 20,
      );
      await database.addProduct(
        id: 'low',
        name: 'Low stock',
        priceMmk: 1200,
        openingStock: 2,
      );
      await database.recordCashSale(
        operationId: 'recent-sale',
        lines: const [ShopSaleLineInput(productId: 'high', quantity: 1)],
      );
      await tester.pumpWidget(
        ShopApp(
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          initialMyanmar: false,
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester.getTopLeft(find.text('Recent sales')).dy,
        lessThan(tester.getTopLeft(find.text('Lowest stock')).dy),
      );
      await tester.ensureVisible(find.text('View stock'));
      await tester.tap(find.text('View stock'));
      await tester.pumpAndSettle();
      expect(
        tester.getTopLeft(find.text('Low stock')).dy,
        lessThan(tester.getTopLeft(find.text('High stock')).dy),
      );
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('Today counts only completed local sales and actual stock', (
    tester,
  ) async {
    final database = ShopDatabase(NativeDatabase.memory());
    addTearDown(database.close);
    await database.addProduct(
      id: 'tea',
      name: 'Tea',
      priceMmk: 2500,
      openingStock: 6,
    );
    await database.addProduct(
      id: 'water',
      name: 'Water',
      priceMmk: 1200,
      openingStock: 20,
    );
    await database.recordCashSale(
      operationId: 'today-cash-sale',
      lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
    );
    await database.createWalletCheckoutIntent(
      operationId: 'today-pending-wallet',
      merchant: MerchantWalletSetup(
        provider: 'KBZPay',
        merchantPhone: '09123456789',
        officialQrPayload: _testStaticMmqr(),
        issuerConfirmed: true,
      ),
      lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
    );
    await tester.pumpWidget(
      ShopApp(
        database: database,
        authClient: null,
        apiBaseUrl: 'https://app.supermega.dev',
        initialMyanmar: false,
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Sales today'), findsOneWidget);
    expect(find.text('2,500 MMK'), findsWidgets);
    expect(find.text('Completed sales'), findsOneWidget);
    expect(find.text('Low-stock products'), findsOneWidget);
    expect(find.text('Tea · 5'), findsOneWidget);
    expect(find.text('Mobile payment to review'), findsOneWidget);
    expect(find.text('Check stock'), findsOneWidget);
    expect(find.textContaining('vs. yesterday'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Burmese Today and Counter show the same kyat amount', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 800);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 1.5;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final database = ShopDatabase(NativeDatabase.memory());
    addTearDown(database.close);
    await database.addProduct(
      id: 'tea',
      name: 'Tea',
      priceMmk: 2500,
      openingStock: 3,
    );
    await database.recordCashSale(
      operationId: 'burmese-today-sale',
      lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
    );
    await tester.pumpWidget(
      ShopApp(
        database: database,
        authClient: null,
        apiBaseUrl: 'https://app.supermega.dev',
        initialMyanmar: true,
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('၂,၅၀၀ ကျပ်'), findsWidgets);
    expect(find.text('အရောင်းအသစ်'), findsOneWidget);
    await tester.tap(find.text('အရောင်းအသစ်'));
    await tester.pumpAndSettle();
    expect(find.text('၂,၅၀၀ ကျပ်'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 1));
  });

  testWidgets('saved sale reprints without recording another sale', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({
      shopReceiptPrinterHostKey: '192.168.20.9',
    });
    const range = (ip: '192.168.20.10', mask: '255.255.255.248');
    final settings = ReceiptPrinterSettings(
      rangeProvider: () async => range,
      session: VerifiedPrinterSession(),
    );
    final candidate = (await PrinterDiscoveryService(
      rangeProvider: () async => range,
      probe: (host, port) async => host == '192.168.20.9',
    ).scan()).printers.single;
    await settings.saveAfterTest(candidate);

    final database = ShopDatabase(NativeDatabase.memory());
    await database.addProduct(
      id: 'tea',
      name: 'Tea',
      priceMmk: 2500,
      openingStock: 2,
    );
    await database.recordCashSale(
      operationId: 'saved-sale',
      lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
    );
    final sent = <ShopSaleReceipt>[];
    await tester.pumpWidget(
      MaterialApp(
        home: RecentSalesScreen(
          database: database,
          myanmar: false,
          reprintService: ReceiptReprintService(
            settings: settings,
            send: (host, receipt, myanmar) async {
              expect(host, '192.168.20.9');
              expect(myanmar, isFalse);
              sent.add(receipt);
            },
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('2,500 MMK'));
    await tester.pumpAndSettle();
    expect(find.text('Reprint receipt'), findsOneWidget);
    await tester.tap(find.text('Reprint receipt'));
    await tester.pumpAndSettle();

    expect(sent, hasLength(1));
    expect(sent.single.id, 'saved-sale');
    expect(sent.single.lines.single.productName, 'Tea');
    expect(await database.countSales(), 1);
    expect((await database.readActiveProducts()).single.onHand, 1);
    expect(find.text('Receipt sent to printer.'), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await database.close();
  });

  testWidgets('saved printer does not reprint after restart without a retest', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({
      shopReceiptPrinterHostKey: '192.168.20.9',
    });
    final database = ShopDatabase(NativeDatabase.memory());
    await database.addProduct(
      id: 'tea',
      name: 'Tea',
      priceMmk: 2500,
      openingStock: 2,
    );
    await database.recordCashSale(
      operationId: 'saved-sale-after-restart',
      lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
    );
    var sends = 0;
    await tester.pumpWidget(
      MaterialApp(
        home: RecentSalesScreen(
          database: database,
          myanmar: false,
          reprintService: ReceiptReprintService(
            settings: ReceiptPrinterSettings(
              rangeProvider: () async =>
                  (ip: '192.168.20.10', mask: '255.255.255.248'),
              session: VerifiedPrinterSession(),
            ),
            send: (host, receipt, myanmar) async {
              sends++;
            },
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('2,500 MMK'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Reprint receipt'));
    await tester.pumpAndSettle();

    expect(find.text('Find printers'), findsOneWidget);
    expect(sends, 0);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(sends, 0);
    expect(await database.countSales(), 1);
    expect(
      find.text('Test and confirm a printer before reprinting this sale.'),
      findsOneWidget,
    );
    await tester.pumpWidget(const SizedBox());
    await database.close();
  });

  testWidgets('restored Android menu photo waits for fresh cloud consent', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    final photoPath = [
      Directory.systemTemp.path,
      'shop-menu-recovery-missing-${DateTime.now().microsecondsSinceEpoch}.jpg',
    ].join(Platform.pathSeparator);
    final photo = XFile(photoPath);
    final database = ShopDatabase(NativeDatabase.memory());

    await tester.pumpWidget(
      MaterialApp(
        home: ShopHome(
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          myanmar: false,
          onLanguageChanged: (_) {},
          recoverMenuPhoto: () async => photo,
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Menu photo ready to review'), findsOneWidget);
    expect(
      find.text('The camera closed while Shop restarted. Nothing was sent.'),
      findsOneWidget,
    );
    await tester.tap(find.text('Review photo'));
    await tester.pumpAndSettle();
    expect(find.text('Photo ready'), findsOneWidget);
    expect(
      tester.widget<CheckboxListTile>(find.byType(CheckboxListTile)).value,
      isFalse,
    );
    expect(find.text('Review suggestions'), findsNothing);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('Menu photo ready to review'), findsNothing);
    await database.close();
  });

  testWidgets('catalog shows a saved merchant photo and a clean fallback', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    final database = ShopDatabase(NativeDatabase.memory());
    addTearDown(database.close);
    await database.addProduct(
      id: 'tea',
      name: 'Tea',
      priceMmk: 2000,
      openingStock: 5,
    );
    await database.addProduct(
      id: 'water',
      name: 'Water',
      priceMmk: 1000,
      openingStock: 5,
    );
    await database.saveProductThumbnail(
      'tea',
      base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ'
        'AAAADUlEQVR4nGPQyNjxHwAETAJIB09U9wAAAABJRU5ErkJggg==',
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        home: ShopHome(
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          myanmar: false,
          onLanguageChanged: (_) {},
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.descendant(
        of: find.byKey(const ValueKey('shop-product-photo:tea')),
        matching: find.byType(Image),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: find.byKey(const ValueKey('shop-product-photo:water')),
        matching: find.byIcon(Icons.photo_outlined),
      ),
      findsOneWidget,
    );
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 1));
  });

  testWidgets('lost product picker result is saved as a photo, never a menu', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({
      'shop_pending_picker_intent': 'product:tea',
    });
    final image = XFile.fromData(
      base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ'
        'AAAADUlEQVR4nGPQyNjxHwAETAJIB09U9wAAAABJRU5ErkJggg==',
      ),
      mimeType: 'image/png',
      name: 'merchant-photo.png',
    );
    final database = ShopDatabase(NativeDatabase.memory());
    addTearDown(database.close);
    await database.addProduct(
      id: 'tea',
      name: 'Tea',
      priceMmk: 2000,
      openingStock: 5,
    );
    await tester.pumpWidget(
      MaterialApp(
        home: ShopHome(
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          myanmar: false,
          onLanguageChanged: (_) {},
          recoverMenuPhoto: () async => image,
        ),
      ),
    );
    // Pump recovery before querying Drift. Its async write must finish before
    // a concurrent read, and image decoding also needs real async time.
    var photoSaved = false;
    for (var attempt = 0; attempt < 100; attempt++) {
      await tester.pump(const Duration(milliseconds: 50));
      final messageVisible = find
          .text('Product photo saved on this device.')
          .evaluate()
          .isNotEmpty;
      if (messageVisible) {
        photoSaved = true;
        break;
      }
      await tester.runAsync(
        () => Future<void>.delayed(const Duration(milliseconds: 50)),
      );
    }
    expect(photoSaved, isTrue);
    final persisted = await tester.runAsync(() async {
      final lookup = database.readProductThumbnail('tea');
      return lookup.timeout(const Duration(seconds: 1));
    });
    expect(persisted, isNotNull);
    expect(find.text('Menu photo ready to review'), findsNothing);
    final preferences = await SharedPreferences.getInstance();
    expect(preferences.getString('shop_pending_picker_intent'), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 1));
  });

  testWidgets('empty catalog can make a durable cash sale', (tester) async {
    _usePhoneViewport(tester);
    final database = ShopDatabase(NativeDatabase.memory());
    addTearDown(database.close);
    await tester.pumpWidget(
      ShopApp(
        initialCounter: true,
        database: database,
        authClient: null,
        apiBaseUrl: 'https://app.supermega.dev',
        initialMyanmar: false,
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Products'), findsOneWidget);
    expect(find.text('Your catalog is empty'), findsOneWidget);
    expect(find.text('Search name, barcode or SKU'), findsNothing);
    expect(find.text('MAMA Chicken Instant Noodles'), findsNothing);

    await tester.ensureVisible(find.text('Add first product'));
    await tester.tap(find.text('Add first product'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('shop-product-name')),
      'Tea',
    );
    await tester.enterText(
      find.byKey(const ValueKey('shop-product-barcode')),
      '0012345678905',
    );
    await tester.enterText(
      find.byKey(const ValueKey('shop-product-price')),
      '2500',
    );
    await tester.enterText(
      find.byKey(const ValueKey('shop-product-stock')),
      '2',
    );
    await tester.tap(find.text('Save product'));
    await tester.pumpAndSettle();

    expect(find.text('Tea'), findsOneWidget);
    expect(
      (await database.readActiveProducts()).single.barcode,
      '0012345678905',
    );
    await tester.tap(find.byTooltip('Add to sale'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Review sale'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cash sale'));
    await tester.pumpAndSettle();

    expect(find.text('Cash received?'), findsOneWidget);
    expect(find.text('Complete sale'), findsOneWidget);
    expect(await database.countSales(), 0);
    expect((await database.readActiveProducts()).single.onHand, 2);
    await tester.tap(find.text('Back'));
    await tester.pumpAndSettle();
    expect(await database.countSales(), 0);
    await tester.tap(find.text('Cash sale'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Complete sale'));
    await tester.pumpAndSettle();

    expect(await database.countSales(), 1);
    expect((await database.readActiveProducts()).single.onHand, 1);
    await tester.tap(find.byTooltip('More'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Recent sales'));
    await tester.pumpAndSettle();
    expect(find.text('Recent sales'), findsOneWidget);
    expect(find.text('2,500 MMK'), findsOneWidget);
    await tester.tap(find.text('2,500 MMK'));
    await tester.pumpAndSettle();
    expect(find.text('Sale details'), findsOneWidget);
    expect(find.text('Tea × 1'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 1));
  });

  testWidgets('desktop first use shows one focused setup workspace', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(1200, 800);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await tester.pumpWidget(
        ShopApp(
          initialCounter: true,
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          initialMyanmar: false,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Your catalog is empty'), findsOneWidget);
      expect(find.text('Add first product'), findsOneWidget);
      expect(find.text('Import menu photo'), findsOneWidget);
      expect(find.text('Search name, barcode or SKU'), findsNothing);
      expect(find.text('Current sale'), findsNothing);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('tablet landscape opens the basket beside the catalog', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(820, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final database = ShopDatabase(NativeDatabase.memory());
    await database.addProduct(
      id: 'tea',
      name: 'Tea',
      priceMmk: 2500,
      openingStock: 2,
    );
    try {
      await tester.pumpWidget(
        ShopApp(
          initialCounter: true,
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          initialMyanmar: false,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Tea'), findsOneWidget);
      expect(find.text('Current sale'), findsNothing);
      expect(find.text('Search name, barcode or SKU'), findsOneWidget);
      expect(tester.takeException(), isNull);
      expect(
        tester.getSize(find.byTooltip('Add to sale')).height,
        greaterThanOrEqualTo(56),
      );
      await tester.tap(find.byTooltip('Add to sale'));
      await tester.pumpAndSettle();
      expect(find.text('Current sale'), findsOneWidget);
      expect(find.text('Cash sale'), findsOneWidget);
      expect(find.textContaining('Review sale'), findsNothing);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('portrait tablet reveals basket after first item', (
    tester,
  ) async {
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    tester.view.devicePixelRatio = 1;
    for (final width in [800.0, 820.0, 1024.0]) {
      for (final myanmar in [false, true]) {
        tester.view.physicalSize = Size(width, 800);
        final database = ShopDatabase(NativeDatabase.memory());
        await database.addProduct(
          id: 'tea',
          name: 'Tea',
          priceMmk: 2500,
          openingStock: 2,
        );
        await tester.pumpWidget(
          ShopApp(
            database: database,
            authClient: null,
            apiBaseUrl: 'https://app.supermega.dev',
            initialMyanmar: myanmar,
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text(myanmar ? 'ရောင်းရန်' : 'Sell'));
        await tester.pumpAndSettle();
        if (width == 820) {
          final catalog = find.byKey(const ValueKey('shop-split-catalog'));
          final basket = find.byKey(const ValueKey('shop-split-basket'));
          expect(catalog, findsOneWidget);
          expect(basket, findsNothing);
        }
        await tester.tap(
          find.byTooltip(myanmar ? 'အရောင်းထဲထည့်ရန်' : 'Add to sale'),
        );
        await tester.pumpAndSettle();
        if (width == 820) {
          final catalog = find.byKey(const ValueKey('shop-split-catalog'));
          final basket = find.byKey(const ValueKey('shop-split-basket'));
          expect(basket, findsOneWidget);
          final catalogRect = tester.getRect(catalog);
          final basketRect = tester.getRect(basket);
          // The Burmese rail can grow for longer labels while the catalog
          // still has a phone-width, touch-safe pane beside the active basket.
          expect(catalogRect.width, greaterThanOrEqualTo(320));
          expect(basketRect.width, greaterThanOrEqualTo(300));
          expect(catalogRect.right, lessThan(basketRect.left));
        }
        if (width == 800) {
          await tester.tap(
            find.textContaining(myanmar ? 'အရောင်းစစ်ရန်' : 'Review sale'),
          );
          await tester.pumpAndSettle();
        } else if (width == 820) {
          expect(
            find.textContaining(myanmar ? 'အရောင်းစစ်ရန်' : 'Review sale'),
            findsNothing,
          );
        }
        expect(find.text(myanmar ? 'ငွေသား' : 'Cash sale'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump(const Duration(milliseconds: 1));
        await database.close();
      }
    }
  });

  testWidgets(
    'catalog rows and photo controls stay touch-sized at app widths',
    (tester) async {
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      for (final width in [320.0, 360.0, 390.0, 820.0, 1200.0]) {
        for (final myanmar in [false, true]) {
          tester.view.physicalSize = Size(width, 800);
          tester.platformDispatcher.textScaleFactorTestValue = width == 320
              ? 1.5
              : width == 360
              ? 1.3
              : 1.0;
          final database = ShopDatabase(NativeDatabase.memory());
          await database.addProduct(
            id: 'rice',
            name: myanmar
                ? 'ဆန်အိတ် အရည်အသွေးကောင်း ၁၀ ကီလိုဂရမ်'
                : 'Premium rice 10 kg bag',
            priceMmk: 24900,
            openingStock: 3,
          );
          await tester.pumpWidget(
            ShopApp(
              initialCounter: true,
              database: database,
              authClient: null,
              apiBaseUrl: 'https://app.supermega.dev',
              initialMyanmar: myanmar,
            ),
          );
          await tester.pumpAndSettle();

          final addLabel = myanmar ? 'အရောင်းထဲထည့်ရန်' : 'Add to sale';
          final row = find.descendant(
            of: find.byTooltip(addLabel),
            matching: find.byType(ListTile),
          );
          expect(row, findsOneWidget);
          expect(tester.getSize(row).height, greaterThanOrEqualTo(56));
          if (width == 820) {
            expect(
              find.byKey(const ValueKey('shop-split-basket')),
              findsNothing,
            );
          }
          if (width == 320) {
            expect(
              tester
                  .widget<Text>(
                    find.descendant(
                      of: row,
                      matching: find.text(
                        myanmar
                            ? 'ဆန်အိတ် အရည်အသွေးကောင်း ၁၀ ကီလိုဂရမ်'
                            : 'Premium rice 10 kg bag',
                      ),
                    ),
                  )
                  .maxLines,
              3,
            );
          }
          final photoButton = find.descendant(
            of: row,
            matching: find.byKey(const ValueKey('shop-product-photo:rice')),
          );
          expect(photoButton, findsOneWidget);
          expect(tester.getSize(photoButton).width, greaterThanOrEqualTo(48));
          expect(tester.getSize(photoButton).height, greaterThanOrEqualTo(48));
          expect(
            find.text(myanmar ? '၂၄,၉၀၀ ကျပ်' : '24,900 MMK'),
            findsOneWidget,
          );
          expect(tester.takeException(), isNull);

          await tester.tap(row);
          await tester.pumpAndSettle();
          if (width == 820) {
            expect(
              find.byKey(const ValueKey('shop-split-basket')),
              findsOneWidget,
            );
          }
          expect(
            width >= 820
                ? find.text(myanmar ? 'ငွေသား' : 'Cash sale')
                : find.textContaining(
                    myanmar ? 'အရောင်းစစ်ရန်' : 'Review sale',
                  ),
            findsOneWidget,
          );
          expect(tester.takeException(), isNull);

          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump(const Duration(milliseconds: 1));
          await database.close();
        }
      }
    },
  );

  testWidgets('Burmese cash review stays uncommitted until confirmed', (
    tester,
  ) async {
    _usePhoneViewport(tester);
    final database = ShopDatabase(NativeDatabase.memory());
    await database.addProduct(
      id: 'tea',
      name: 'လက်ဖက်ရည်',
      priceMmk: 2500,
      openingStock: 2,
    );
    await tester.pumpWidget(
      ShopApp(
        initialCounter: true,
        database: database,
        authClient: null,
        apiBaseUrl: 'https://app.supermega.dev',
        initialMyanmar: true,
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('အရောင်းထဲထည့်ရန်'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('အရောင်းစစ်ရန်'));
    await tester.pumpAndSettle();
    expect(find.text('၂,၅၀၀ ကျပ် × ၁'), findsOneWidget);
    expect(find.text('၁'), findsOneWidget);
    expect(find.text('မိုဘိုင်းငွေပေးချေမှု'), findsOneWidget);
    await tester.tap(find.text('ငွေသား'));
    await tester.pumpAndSettle();
    expect(find.text('ငွေသားလက်ခံပြီးပြီလား။'), findsOneWidget);
    expect(await database.countSales(), 0);
    await tester.tap(find.text('ပြန်သွားရန်'));
    await tester.pumpAndSettle();
    expect(await database.countSales(), 0);
    await database.close();
  });

  testWidgets('compact Burmese checkout keeps both payment actions visible', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(360, 760);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final database = ShopDatabase(NativeDatabase.memory());
    await database.addProduct(
      id: 'tea',
      name: 'လက်ဖက်ရည်',
      priceMmk: 2500,
      openingStock: 2,
    );
    await tester.pumpWidget(
      ShopApp(
        initialCounter: true,
        database: database,
        authClient: null,
        apiBaseUrl: 'https://app.supermega.dev',
        initialMyanmar: true,
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull, reason: 'initial compact catalog');
    await tester.tap(find.byTooltip('အရောင်းထဲထည့်ရန်'));
    await tester.pumpAndSettle();
    expect(
      tester.takeException(),
      isNull,
      reason: 'compact catalog with basket',
    );
    await tester.tap(find.textContaining('အရောင်းစစ်ရန်'));
    await tester.pumpAndSettle();
    expect(find.text('ငွေသား'), findsOneWidget);
    expect(find.text('မိုဘိုင်းငွေပေးချေမှု'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await database.close();
  });

  testWidgets('cart sheet refreshes a changed product price before cash', (
    tester,
  ) async {
    _usePhoneViewport(tester);
    final database = ShopDatabase(NativeDatabase.memory());
    await database.addProduct(
      id: 'tea',
      name: 'Tea',
      priceMmk: 2500,
      openingStock: 2,
    );
    await tester.pumpWidget(
      ShopApp(
        initialCounter: true,
        database: database,
        authClient: null,
        apiBaseUrl: 'https://app.supermega.dev',
        initialMyanmar: false,
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Add to sale'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Review sale'));
    await tester.pumpAndSettle();
    expect(find.text('2,500 MMK'), findsWidgets);
    await database.customUpdate(
      'UPDATE shop_products SET price_mmk = 3000 WHERE id = ?',
      variables: [const Variable<String>('tea')],
      updates: {database.shopProducts},
    );
    await tester.pumpAndSettle();
    expect(find.text('3,000 MMK'), findsWidgets);
    await tester.tap(find.text('Cash sale'));
    await tester.pumpAndSettle();
    expect(find.text('3,000 MMK'), findsWidgets);
    await tester.tap(find.text('Complete sale'));
    await tester.pumpAndSettle();
    expect(await database.countSales(), 1);
    expect((await database.readActiveProducts()).single.onHand, 1);
    await database.close();
  });

  testWidgets('rapid cash taps open one confirmation and record one sale', (
    tester,
  ) async {
    _usePhoneViewport(tester);
    final database = ShopDatabase(NativeDatabase.memory());
    await database.addProduct(
      id: 'tea',
      name: 'Tea',
      priceMmk: 2500,
      openingStock: 2,
    );
    await tester.pumpWidget(
      ShopApp(
        initialCounter: true,
        database: database,
        authClient: null,
        apiBaseUrl: 'https://app.supermega.dev',
        initialMyanmar: false,
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Add to sale'));
    await tester.pumpAndSettle();
    await tester.tap(find.textContaining('Review sale'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cash sale'));
    await tester.tap(find.text('Cash sale'));
    await tester.pumpAndSettle();
    expect(find.text('Cash received?'), findsOneWidget);
    await tester.tap(find.text('Complete sale'));
    await tester.pumpAndSettle();
    expect(await database.countSales(), 1);
    expect((await database.readActiveProducts()).single.onHand, 1);
    expect(find.text('Cash received?'), findsNothing);
    await database.close();
  });

  testWidgets('unknown barcode creates a product that the next scan adds', (
    tester,
  ) async {
    _usePhoneViewport(tester);
    final database = ShopDatabase(NativeDatabase.memory());
    await database.addProduct(
      id: 'tea',
      name: 'Tea',
      barcode: '9999999999999',
      priceMmk: 2500,
      openingStock: 2,
    );
    await tester.pumpWidget(
      ShopApp(
        initialCounter: true,
        database: database,
        authClient: null,
        apiBaseUrl: 'https://app.supermega.dev',
        initialMyanmar: false,
      ),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), '0012345678905');
    await tester.pumpAndSettle();
    expect(find.text('No matching products'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('shop-add-search-result')));
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<TextFormField>(
            find.byKey(const ValueKey('shop-product-barcode')),
          )
          .controller!
          .text,
      '0012345678905',
    );
    await tester.enterText(
      find.byKey(const ValueKey('shop-product-name')),
      'Rice',
    );
    await tester.enterText(
      find.byKey(const ValueKey('shop-product-price')),
      '12000',
    );
    await tester.enterText(
      find.byKey(const ValueKey('shop-product-stock')),
      '3',
    );
    await tester.tap(find.text('Save product'));
    await tester.pumpAndSettle();

    expect(
      (await database.readActiveProducts())
          .singleWhere((item) => item.name == 'Rice')
          .barcode,
      '0012345678905',
    );
    expect(find.text('Rice'), findsOneWidget);
    await tester.tap(find.byType(TextField));
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    expect(find.textContaining('Review sale'), findsOneWidget);
    await database.close();
  });

  testWidgets('ambiguous barcode never adds an arbitrary product', (
    tester,
  ) async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'tea',
        name: 'Tea',
        barcode: '0012345678905',
        priceMmk: 2500,
        openingStock: 2,
      );
      await database.addProduct(
        id: 'rice',
        name: 'Rice',
        barcode: '0001234567890',
        priceMmk: 12000,
        openingStock: 2,
      );
      // Simulate a legacy/corrupt catalog; new product writes reject duplicates.
      await database.customUpdate(
        'UPDATE shop_products SET barcode = ? WHERE id = ?',
        variables: [
          const Variable<String>('0012345678905'),
          const Variable<String>('rice'),
        ],
        updates: {database.shopProducts},
      );
      await tester.pumpWidget(
        ShopApp(
          initialCounter: true,
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          initialMyanmar: false,
        ),
      );
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), '0012345678905');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      expect(find.textContaining('Review sale'), findsNothing);
      expect(
        find.textContaining('More than one product uses this barcode'),
        findsOneWidget,
      );
      expect(await database.countSales(), 0);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('scanner resolves one exact code and keeps active search ready', (
    tester,
  ) async {
    _usePhoneViewport(tester);
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'tea',
        name: 'Tea',
        sku: 'SKU-1',
        barcode: '111111',
        priceMmk: 2500,
        openingStock: 2,
      );
      await database.addProduct(
        id: 'rice',
        name: 'Rice',
        sku: 'RICE-2',
        barcode: 'SKU-1',
        priceMmk: 5000,
        openingStock: 2,
      );
      await tester.pumpWidget(
        ShopApp(
          initialCounter: true,
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          initialMyanmar: false,
        ),
      );
      await tester.pumpAndSettle();
      final search = find.byType(TextField);

      await tester.enterText(search, 'SKU-1');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      expect(
        find.textContaining('More than one product uses this barcode'),
        findsOneWidget,
      );
      expect(find.textContaining('Review sale'), findsNothing);

      await tester.enterText(search, '999999');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      expect(
        find.textContaining('No exact barcode or SKU match'),
        findsOneWidget,
      );
      expect(find.textContaining('Review sale'), findsNothing);

      await tester.enterText(search, '111111');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      expect(find.textContaining('Review sale · 1'), findsOneWidget);
      expect(tester.widget<TextField>(search).focusNode!.hasFocus, isTrue);

      await tester.enterText(search, 'RICE-2');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      expect(find.textContaining('Review sale · 2'), findsOneWidget);
      expect(tester.widget<TextField>(search).focusNode!.hasFocus, isTrue);
      expect(await database.countSales(), 0);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('cashier can receive and count stock outside the sale screen', (
    tester,
  ) async {
    final database = ShopDatabase(NativeDatabase.memory());
    await database.addProduct(
      id: 'rice',
      name: 'Rice',
      priceMmk: 12000,
      openingStock: 2,
    );
    await tester.pumpWidget(
      ShopApp(
        initialCounter: true,
        database: database,
        authClient: null,
        apiBaseUrl: 'https://app.supermega.dev',
        initialMyanmar: false,
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('More'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Stock'));
    await tester.pumpAndSettle();
    expect(find.text('2 in stock'), findsOneWidget);
    expect(find.text('Reference rice'), findsNothing);

    await tester.tap(find.byKey(const ValueKey('stock-update-rice')));
    await tester.pumpAndSettle();
    expect(find.text('Reference rice'), findsNothing);
    await tester.enterText(
      find.byKey(const ValueKey('stock-change-quantity')),
      '4',
    );
    await tester.tap(find.text('Save stock'));
    await tester.pumpAndSettle();
    expect(find.text('6 in stock'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('stock-update-rice')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Count'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('stock-change-quantity')),
      '3',
    );
    await tester.tap(find.text('Save stock'));
    await tester.pumpAndSettle();
    expect(find.text('3 in stock'), findsOneWidget);
    expect((await database.readActiveProducts()).single.onHand, 3);
    await database.close();
  });

  testWidgets(
    'stock identifies same-name variants and accepts Myanmar digits',
    (tester) async {
      final database = ShopDatabase(NativeDatabase.memory());
      await database.addProduct(
        id: 'rice-small',
        name: 'Rice',
        sku: 'RICE-1',
        barcode: '111111',
        priceMmk: 12000,
        openingStock: 2,
      );
      await database.addProduct(
        id: 'rice-large',
        name: 'Rice',
        sku: 'RICE-2',
        barcode: '222222',
        priceMmk: 18000,
        openingStock: 2,
      );
      await tester.pumpWidget(
        ShopApp(
          initialCounter: true,
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          initialMyanmar: true,
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('နောက်ထပ်'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('လက်ကျန်'));
      await tester.pumpAndSettle();
      expect(find.text('SKU RICE-1 · ဘားကုဒ် 111111'), findsOneWidget);
      expect(find.text('SKU RICE-2 · ဘားကုဒ် 222222'), findsOneWidget);

      await tester.tap(find.byKey(const ValueKey('stock-update-rice-large')));
      await tester.pumpAndSettle();
      expect(find.text('SKU RICE-2 · ဘားကုဒ် 222222'), findsNWidgets(2));
      await tester.enterText(
        find.byKey(const ValueKey('stock-change-quantity')),
        '၄',
      );
      await tester.tap(find.text('လက်ကျန်သိမ်းရန်'));
      await tester.pumpAndSettle();
      final products = await database.readActiveProducts();
      expect(products.singleWhere((item) => item.id == 'rice-small').onHand, 2);
      expect(products.singleWhere((item) => item.id == 'rice-large').onHand, 6);
      await database.close();
    },
  );

  testWidgets('settings keeps language and merchant wallet setup reachable', (
    tester,
  ) async {
    final database = ShopDatabase(NativeDatabase.memory());
    await tester.pumpWidget(
      ShopApp(
        initialCounter: true,
        database: database,
        authClient: null,
        apiBaseUrl: 'https://app.supermega.dev',
        initialMyanmar: false,
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.byTooltip('More'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Settings'));
    await tester.pumpAndSettle();
    tester.view.physicalSize = const Size(320, 720);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('English'), findsOneWidget);
    expect(find.text('မြန်မာ'), findsOneWidget);
    expect(find.text('Mobile money'), findsOneWidget);
    await tester.tap(find.text('မြန်မာ'));
    await tester.pumpAndSettle();
    expect(find.text('ဘာသာစကား'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.ensureVisible(find.text('မိုဘိုင်းငွေပေးချေမှု'));
    await tester.tap(find.text('မိုဘိုင်းငွေပေးချေမှု'));
    await tester.pumpAndSettle();
    expect(find.text('KBZPay'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await database.close();
  });

  testWidgets('editing a merchant QR clears its prior issuer confirmation', (
    tester,
  ) async {
    final database = ShopDatabase(NativeDatabase.memory());
    final revisedPayload = _testStaticMmqr(merchantName: 'REVISED STORE');
    await database.saveWalletSetup(
      MerchantWalletSetup(
        provider: 'KBZPay',
        merchantPhone: '09123456789',
        officialQrPayload: _testStaticMmqr(),
        issuerConfirmed: true,
      ),
    );
    await tester.pumpWidget(
      MaterialApp(home: WalletSetupScreen(database: database, myanmar: false)),
    );
    await tester.pumpAndSettle();

    final qrWidget = find.byType(QrImageView).first;
    await tester.ensureVisible(qrWidget);
    await tester.pumpAndSettle();
    expect(_merchantQrSemantics('KBZPay'), findsOneWidget);
    await tester.enterText(
      find.byKey(const ValueKey('wallet-payload-KBZPay')),
      revisedPayload,
    );
    await tester.pumpAndSettle();

    expect(_merchantQrSemantics('KBZPay'), findsNothing);
    final payloadConfirmation = tester.widget<CheckboxListTile>(
      find.byType(CheckboxListTile).first,
    );
    expect(payloadConfirmation.value, isFalse);
    await tester.tap(find.text('Save payment setup').first);
    await tester.pumpAndSettle();
    final saved = (await database.readWalletSetups()).single;
    expect(saved.officialQrPayload, revisedPayload);
    expect(saved.issuerConfirmed, isFalse);

    await tester.tap(find.byType(CheckboxListTile).first);
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.byType(QrImageView).first);
    await tester.pumpAndSettle();
    expect(_merchantQrSemantics('KBZPay'), findsOneWidget);
    await tester.enterText(
      find.byKey(const ValueKey('wallet-phone-KBZPay')),
      '09987654321',
    );
    await tester.pumpAndSettle();
    expect(_merchantQrSemantics('KBZPay'), findsNothing);
    final phoneConfirmation = tester.widget<CheckboxListTile>(
      find.byType(CheckboxListTile).first,
    );
    expect(phoneConfirmation.value, isFalse);
    await tester.tap(find.text('Save payment setup').first);
    await tester.pumpAndSettle();
    final savedAfterPhoneEdit = (await database.readWalletSetups()).single;
    expect(savedAfterPhoneEdit.merchantPhone, '09987654321');
    expect(savedAfterPhoneEdit.issuerConfirmed, isFalse);
    await database.close();
  });

  testWidgets(
    'wallet QR checkout writes only after the cashier verifies payment',
    (tester) async {
      _usePhoneViewport(tester);
      final database = ShopDatabase(NativeDatabase.memory());
      await database.addProduct(
        id: 'tea',
        name: 'Tea',
        barcode: '0012345678905',
        priceMmk: 2500,
        openingStock: 2,
      );
      await database.saveWalletSetup(
        MerchantWalletSetup(
          provider: 'KBZPay',
          merchantPhone: '09123456789',
          officialQrPayload: _testStaticMmqr(),
          issuerConfirmed: true,
        ),
      );
      await tester.pumpWidget(
        ShopApp(
          initialCounter: true,
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          initialMyanmar: false,
        ),
      );
      await tester.pumpAndSettle();

      await tester.tap(find.byTooltip('Add to sale'));
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('Review sale'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Mobile money'));
      await tester.pumpAndSettle();

      await tester.ensureVisible(find.byType(QrImageView).first);
      await tester.pumpAndSettle();
      expect(find.text('2,500 MMK'), findsWidgets);
      expect(_merchantQrSemantics('KBZPay'), findsOneWidget);
      final pending = await database.readPendingWalletCheckout();
      expect(pending, isNotNull);
      expect(pending!.totalMmk, 2500);
      expect(pending.merchantPhone, '09123456789');
      expect(pending.merchantQrPayload, _testStaticMmqr());
      expect(await database.countSales(), 0);
      final confirmButton = tester.widget<FilledButton>(
        find.widgetWithText(FilledButton, 'Confirm received'),
      );
      expect(confirmButton.onPressed, isNull);

      // Closing the QR does not discard the payment intent. This widget rebuild
      // checks UI recovery only; a separate file-backed test covers disk reopen.
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(find.text('Resume payment'), findsWidgets);
      expect(find.text('Cash sale'), findsNothing);
      expect(find.text('Mobile money'), findsNothing);
      expect(await database.readPendingWalletCheckout(), isNotNull);
      expect(await database.countSales(), 0);
      expect((await database.readActiveProducts()).single.onHand, 2);
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.text('Resume payment'), findsOneWidget);
      final addToSaleRow = find.descendant(
        of: find.byTooltip('Finish the pending payment first'),
        matching: find.byType(ListTile),
      );
      expect(tester.widget<ListTile>(addToSaleRow.first).onTap, isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpWidget(
        ShopApp(
          initialCounter: true,
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          initialMyanmar: false,
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Resume payment'));
      await tester.pumpAndSettle();
      expect(_merchantQrSemantics('KBZPay'), findsOneWidget);

      await tester.ensureVisible(
        find.text('I verified this payment in the wallet app.'),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('I verified this payment in the wallet app.'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirm received'));
      await tester.pumpAndSettle();

      final sale = await database.select(database.shopSales).getSingle();
      expect(sale.paymentMethod, 'kbzpay');
      expect(sale.totalMmk, 2500);
      expect((await database.readActiveProducts()).single.onHand, 1);
      expect(await database.readPendingWalletCheckout(), isNull);
      final intentState = await database
          .customSelect(
            'SELECT state FROM shop_wallet_checkout_intents WHERE operation_id = ?',
            variables: [Variable<String>(sale.operationId)],
          )
          .getSingle();
      expect(intentState.read<String>('state'), 'completed');
      expect(await database.countSales(), 1);
      // Product setup records opening stock; the wallet sale records the
      // second movement when it reduces on-hand quantity.
      expect(await database.countStockMovements(), 2);
      await database.close();
    },
  );

  testWidgets('older wallet intent without a saved QR needs manual check', (
    tester,
  ) async {
    final database = ShopDatabase(NativeDatabase.memory());
    await database.addProduct(
      id: 'tea',
      name: 'Tea',
      barcode: '0012345678905',
      priceMmk: 2500,
      openingStock: 2,
    );
    await database.createWalletCheckoutIntent(
      operationId: 'legacy-wallet',
      merchant: MerchantWalletSetup(
        provider: 'KBZPay',
        merchantPhone: '09123456789',
        officialQrPayload: _testStaticMmqr(),
        issuerConfirmed: true,
      ),
      lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
    );
    // The v4-to-v5 migration preserves the pending basket but cannot recover
    // the QR the older app showed. Simulate its empty migrated snapshot.
    await database.customUpdate(
      'UPDATE shop_wallet_checkout_intents SET merchant_qr_payload = ? '
      'WHERE operation_id = ?',
      variables: [
        const Variable<String>(''),
        const Variable<String>('legacy-wallet'),
      ],
    );
    await tester.pumpWidget(
      ShopApp(
        initialCounter: true,
        database: database,
        authClient: null,
        apiBaseUrl: 'https://app.supermega.dev',
        initialMyanmar: false,
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.text('Resume payment'));
    await tester.pumpAndSettle();

    expect(find.text('Check an earlier wallet payment'), findsOneWidget);
    expect(find.byType(QrImageView), findsNothing);
    expect(await database.countSales(), 0);
    expect(
      tester
          .widget<FilledButton>(
            find.widgetWithText(FilledButton, 'Record verified payment'),
          )
          .onPressed,
      isNull,
    );
    await tester.tap(find.text('Keep pending'));
    await tester.pumpAndSettle();
    expect(await database.readPendingWalletCheckout(), isNotNull);

    await tester.tap(find.text('Resume payment'));
    await tester.pumpAndSettle();
    final check = find.text(
      'I verified the matching payment in the wallet app.',
    );
    await tester.ensureVisible(check);
    await tester.tap(check);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Record verified payment'));
    await tester.pumpAndSettle();

    expect(await database.countSales(), 1);
    expect((await database.readActiveProducts()).single.onHand, 1);
    expect(await database.readPendingWalletCheckout(), isNull);
    await database.close();
  });

  group('offline catalog and sale transactions', () {
    late ShopDatabase database;

    setUp(() {
      database = ShopDatabase(NativeDatabase.memory());
    });

    tearDown(() async {
      await database.close();
    });

    Future<void> addProduct({int stock = 4, String id = 'tea'}) {
      return database.addProduct(
        id: id,
        name: 'Tea',
        barcode: '0012345678905',
        priceMmk: 2500,
        openingStock: stock,
      );
    }

    test(
      'pending wallet checkout survives closing and reopening SQLite',
      () async {
        final directory = await Directory.systemTemp.createTemp(
          'shop-wallet-recovery-',
        );
        final databaseFile = File(
          '${directory.path}${Platform.pathSeparator}shop.sqlite',
        );
        try {
          final firstOpen = ShopDatabase(NativeDatabase(databaseFile));
          try {
            await firstOpen.addProduct(
              id: 'tea',
              name: 'Tea',
              barcode: '0012345678905',
              priceMmk: 2500,
              openingStock: 2,
            );
            final created = await firstOpen.createWalletCheckoutIntent(
              operationId: 'wallet-restart',
              merchant: MerchantWalletSetup(
                provider: 'KBZPay',
                merchantPhone: '09123456789',
                officialQrPayload: _testStaticMmqr(),
                issuerConfirmed: true,
              ),
              lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
            );
            expect(created.state, 'pending');
            expect(await firstOpen.countSales(), 0);
          } finally {
            await firstOpen.close();
          }

          final reopened = ShopDatabase(NativeDatabase(databaseFile));
          try {
            final pending = await reopened.readPendingWalletCheckout();
            expect(pending, isNotNull);
            expect(pending!.operationId, 'wallet-restart');
            expect(pending.totalMmk, 2500);
            expect(pending.merchantPhone, '09123456789');
            expect(pending.merchantQrPayload, _testStaticMmqr());
            expect(pending.lines.single.productName, 'Tea');

            final sale = await reopened.recordSale(
              operationId: pending.operationId,
              paymentMethod: 'kbzpay',
              walletCheckoutOperationId: pending.operationId,
              lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
            );
            expect(sale.totalMmk, 2500);
            expect(await reopened.countSales(), 1);
            expect((await reopened.readActiveProducts()).single.onHand, 1);
            expect(await reopened.readPendingWalletCheckout(), isNull);
          } finally {
            await reopened.close();
          }
        } finally {
          await directory.delete(recursive: true);
        }
      },
    );

    test(
      'a persisted wallet intent blocks a new cash sale during recovery',
      () async {
        await addProduct(stock: 2);
        final pending = await database.createWalletCheckoutIntent(
          operationId: 'wallet-still-open',
          merchant: MerchantWalletSetup(
            provider: 'KBZPay',
            merchantPhone: '09123456789',
            officialQrPayload: _testStaticMmqr(),
            issuerConfirmed: true,
          ),
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
        );

        await expectLater(
          database.recordCashSale(
            operationId: 'cash-during-recovery',
            lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
          ),
          throwsA(isA<StateError>()),
        );
        expect(await database.countSales(), 0);
        expect((await database.readActiveProducts()).single.onHand, 2);
        expect(await database.readPendingWalletCheckout(), isNotNull);

        expect(
          await database.cancelWalletCheckoutIntent(pending.operationId),
          isTrue,
        );
        await database.recordCashSale(
          operationId: 'cash-after-reconciliation',
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
        );
        expect(await database.countSales(), 1);
        expect((await database.readActiveProducts()).single.onHand, 1);
      },
    );

    test(
      'sale, line snapshots, stock movement and outbox commit together',
      () async {
        await addProduct();
        final receipt = await database.recordCashSale(
          operationId: 'sale-1',
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 2)],
        );

        expect(receipt.totalMmk, 5000);
        expect((await database.readActiveProducts()).single.onHand, 2);
        expect(await database.countSales(), 1);
        expect(await database.countStockMovements(), 2);
        expect(await database.countOutboxOperations(), 2);
        final saleLines = await database.select(database.shopSaleLines).get();
        expect(saleLines.single.productName, 'Tea');
        expect(saleLines.single.unitPriceMmk, 2500);
        expect(saleLines.single.quantity, 2);
        final saleEvent = await (database.select(
          database.shopSyncOutbox,
        )..where((row) => row.operationId.equals('sale-1'))).getSingle();
        expect(saleEvent.state, 'pending');
        expect(saleEvent.eventType, 'shop.cash_sale.completed.v1');
      },
    );

    test(
      'verified wallet sale records the provider in the local outbox',
      () async {
        await addProduct();
        final intent = await database.createWalletCheckoutIntent(
          operationId: 'wallet-sale',
          merchant: MerchantWalletSetup(
            provider: 'WavePay',
            merchantPhone: '09987654321',
            officialQrPayload: _testStaticMmqr(),
            issuerConfirmed: true,
          ),
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
        );
        expect(intent.state, 'pending');
        await database.recordSale(
          operationId: 'wallet-sale',
          paymentMethod: 'wavepay',
          walletCheckoutOperationId: 'wallet-sale',
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
        );
        await database.recordSale(
          operationId: 'wallet-sale',
          paymentMethod: 'wavepay',
          walletCheckoutOperationId: 'wallet-sale',
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
        );

        final sale = await database.select(database.shopSales).getSingle();
        final event = await (database.select(
          database.shopSyncOutbox,
        )..where((row) => row.operationId.equals('wallet-sale'))).getSingle();
        expect(sale.paymentMethod, 'wavepay');
        expect(event.eventType, 'shop.mobile_money_sale.completed.v1');
        expect(event.payloadJson, contains('"paymentMethod":"wavepay"'));
        expect((await database.readActiveProducts()).single.onHand, 3);
        expect(await database.countSales(), 1);
      },
    );

    test(
      'replaying the same operation does not decrement stock twice',
      () async {
        await addProduct();
        const lines = [ShopSaleLineInput(productId: 'tea', quantity: 2)];
        final first = await database.recordCashSale(
          operationId: 'sale-retry',
          lines: lines,
        );
        final replay = await database.recordCashSale(
          operationId: 'sale-retry',
          lines: lines,
        );

        expect(replay.id, first.id);
        expect(replay.totalMmk, first.totalMmk);
        expect((await database.readActiveProducts()).single.onHand, 2);
        expect(await database.countSales(), 1);
        expect(await database.countStockMovements(), 2);
      },
    );

    test('rejects reusing an operation ID for a different basket', () async {
      await addProduct();
      await database.recordCashSale(
        operationId: 'sale-conflict',
        lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
      );

      await expectLater(
        database.recordCashSale(
          operationId: 'sale-conflict',
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 2)],
        ),
        throwsA(isA<StateError>()),
      );
      expect((await database.readActiveProducts()).single.onHand, 3);
      expect(await database.countSales(), 1);
    });

    test('insufficient stock rolls back the entire sale transaction', () async {
      await addProduct(stock: 1);

      await expectLater(
        database.recordCashSale(
          operationId: 'sale-no-stock',
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 2)],
        ),
        throwsA(isA<StateError>()),
      );

      expect((await database.readActiveProducts()).single.onHand, 1);
      expect(await database.countSales(), 0);
      expect(await database.countStockMovements(), 1);
      expect(await database.countOutboxOperations(), 1);
    });

    test('barcode stays text and cannot be assigned to two products', () async {
      await addProduct();
      expect(
        (await database.readActiveProducts()).single.barcode,
        '0012345678905',
      );

      await expectLater(
        database.addProduct(
          id: 'second',
          name: 'Coffee',
          barcode: '0012345678905',
          priceMmk: 3500,
          openingStock: 2,
        ),
        throwsA(isA<StateError>()),
      );
      expect(await database.readActiveProducts(), hasLength(1));
    });

    test(
      'reviewed menu batch becomes sellable without losing Burmese details',
      () async {
        final count = await database.importReviewedMenuBatch(
          batchId: 'menu-batch-1',
          products: const [
            MenuDraftInput(
              id: 'menu-rice',
              batchId: 'menu-batch-1',
              category: 'ကုန်စုံ',
              name: 'ဆန်',
              description: 'မြန်မာဆန် ၅ ကီလို',
              priceMmk: 8500,
              sku: 'RICE-5KG',
              barcode: '0001234567890',
              openingStock: 3,
            ),
            MenuDraftInput(
              id: 'menu-tea',
              batchId: 'menu-batch-1',
              category: 'အဖျော်ယမကာ',
              name: 'Tea',
              description: '',
              priceMmk: 1200,
              sku: null,
              barcode: null,
              openingStock: 0,
            ),
          ],
        );

        final products = await database.readActiveProducts();
        final rice = products.singleWhere((item) => item.id == 'menu-rice');
        expect(count, 2);
        expect(rice.name, 'ဆန်');
        expect(rice.category, 'ကုန်စုံ');
        expect(rice.description, 'မြန်မာဆန် ၅ ကီလို');
        expect(rice.sku, 'RICE-5KG');
        expect(rice.barcode, '0001234567890');
        expect(rice.priceMmk, 8500);
        expect(rice.onHand, 3);
        expect(await database.countStockMovements(), 1);
        expect(await database.countOutboxOperations(), 1);
      },
    );

    test(
      'menu import rejects unconfirmed price or stock before writing',
      () async {
        await expectLater(
          database.importReviewedMenuBatch(
            batchId: 'menu-incomplete',
            products: const [
              MenuDraftInput(
                id: 'menu-no-price',
                batchId: 'menu-incomplete',
                category: 'Food',
                name: 'Rice',
                description: '',
                priceMmk: null,
                sku: null,
                barcode: null,
                openingStock: 5,
              ),
            ],
          ),
          throwsA(isA<ArgumentError>()),
        );
        expect(await database.readActiveProducts(), isEmpty);
        expect(await database.countStockMovements(), 0);
        expect(await database.countOutboxOperations(), 0);
      },
    );

    test('menu import batch retry is idempotent', () async {
      const items = [
        MenuDraftInput(
          id: 'menu-tea',
          batchId: 'menu-retry',
          category: 'Drink',
          name: 'Tea',
          description: '',
          priceMmk: 1000,
          sku: null,
          barcode: '0010',
          openingStock: 4,
        ),
      ];
      expect(
        await database.importReviewedMenuBatch(
          batchId: 'menu-retry',
          products: items,
        ),
        1,
      );
      expect(
        await database.importReviewedMenuBatch(
          batchId: 'menu-retry',
          products: items,
        ),
        1,
      );
      expect((await database.readActiveProducts()).single.onHand, 4);
      expect(await database.countStockMovements(), 1);
      expect(await database.countOutboxOperations(), 1);
    });

    test('duplicate menu barcodes reject the whole batch', () async {
      await expectLater(
        database.importReviewedMenuBatch(
          batchId: 'menu-duplicate',
          products: const [
            MenuDraftInput(
              id: 'menu-a',
              batchId: 'menu-duplicate',
              category: 'Food',
              name: 'Rice A',
              description: '',
              priceMmk: 1000,
              sku: null,
              barcode: '0001',
              openingStock: 1,
            ),
            MenuDraftInput(
              id: 'menu-b',
              batchId: 'menu-duplicate',
              category: 'Food',
              name: 'Rice B',
              description: '',
              priceMmk: 1200,
              sku: null,
              barcode: '0001',
              openingStock: 1,
            ),
          ],
        ),
        throwsA(isA<ArgumentError>()),
      );
      expect(await database.readActiveProducts(), isEmpty);
      expect(await database.countOutboxOperations(), 0);
    });
  });
}

String _testStaticMmqr({String merchantName = 'TEST STORE'}) {
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
    field('59', merchantName),
    field('60', 'Yangon'),
    field('64', language),
    '6304',
  ].join();
  final bytes = utf8.encode(body);
  var crc = 0xffff;
  for (final byte in bytes) {
    crc ^= byte << 8;
    for (var bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) != 0 ? ((crc << 1) ^ 0x1021) : crc << 1;
      crc &= 0xffff;
    }
  }
  return '$body${crc.toRadixString(16).toUpperCase().padLeft(4, '0')}';
}
