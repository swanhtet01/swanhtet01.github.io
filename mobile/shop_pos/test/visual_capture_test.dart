// Synthetic Flutter renders for visual review. These are not installed-device
// screenshots and must not be published as hardware acceptance evidence.
import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/camera_barcode_scanner.dart';
import 'package:supermega_shop/main.dart';
import 'package:supermega_shop/shop_database.dart';

final _capture = Platform.environment['SHOP_VISUAL_CAPTURE'] == '1';
const _captureKey = ValueKey('native-shop-visual-capture');

Future<ShopDatabase> _sampleShop({required bool myanmar}) async {
  final database = ShopDatabase(NativeDatabase.memory());
  // Display copy belongs to this synthetic fixture, not merchant catalog data.
  for (final (id, englishName, myanmarName, price, stock) in [
    (
      'mama',
      'MAMA Chicken Instant Noodles',
      'MAMA ကြက်သား အမြန်ခေါက်ဆွဲ',
      2950,
      8,
    ),
    ('kaung', 'KAUNG 90 Days Rice', 'KAUNG ရက် ၉၀ ဆန်', 12450, 34),
    ('alpine', 'ALPINE Drinking Water', 'ALPINE သောက်ရေသန့်', 5700, 21),
    ('baydar', 'BAYDAR Laundry Detergent', 'BAYDAR အဝတ်လျှော်ဆပ်ပြာ', 5900, 13),
    ('zess', 'ZESS Sugar Crackers', 'ZESS သကြား ကရက်ကာ', 8000, 14),
  ]) {
    await database.addProduct(
      id: id,
      name: myanmar ? myanmarName : englishName,
      priceMmk: price,
      openingStock: stock,
    );
  }
  await database.recordCashSale(
    operationId: 'synthetic-visual-capture-sale',
    lines: const [ShopSaleLineInput(productId: 'mama', quantity: 1)],
  );
  // The sample sale leaves seven packs. Make the merchant's alert visible in
  // Today and Stock captures without changing checkout or fixture stock.
  await database.setReorderLevel(
    productId: 'mama',
    expectedReorderLevel: 5,
    reorderLevel: 10,
  );
  return database;
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUpAll(() async {
    if (!_capture) return;
    await Directory('test/goldens').create(recursive: true);
    // Widget tests otherwise paint Material icons with the Ahem test font,
    // making valid app icons look like missing-glyph boxes in review images.
    final materialIconsPath = Platform.environment['SHOP_MATERIAL_ICONS_FONT'];
    if (materialIconsPath == null || !File(materialIconsPath).existsSync()) {
      throw StateError(
        'SHOP_MATERIAL_ICONS_FONT must name the Flutter SDK icon font.',
      );
    }
    final materialIcons = FontLoader('MaterialIcons')
      ..addFont(
        File(materialIconsPath).readAsBytes().then(ByteData.sublistView),
      );
    final inter = FontLoader('Inter')
      ..addFont(rootBundle.load('assets/fonts/Inter/Inter-Variable.ttf'));
    final myanmar = FontLoader('NotoSansMyanmar')
      ..addFont(
        rootBundle.load(
          'assets/fonts/NotoSansMyanmar/NotoSansMyanmar-Variable.ttf',
        ),
      );
    final myanmarUi = FontLoader('NotoSansMyanmarUI')
      ..addFont(
        rootBundle.load(
          'assets/fonts/NotoSansMyanmarUI/NotoSansMyanmarUI-Regular.ttf',
        ),
      )
      ..addFont(
        rootBundle.load(
          'assets/fonts/NotoSansMyanmarUI/NotoSansMyanmarUI-SemiBold.ttf',
        ),
      )
      ..addFont(
        rootBundle.load(
          'assets/fonts/NotoSansMyanmarUI/NotoSansMyanmarUI-Bold.ttf',
        ),
      );
    await Future.wait([
      materialIcons.load(),
      inter.load(),
      myanmar.load(),
      myanmarUi.load(),
    ]);
  });

  for (final (width, height, language) in [
    (320.0, 800.0, 'en'),
    (390.0, 844.0, 'en'),
    (820.0, 1000.0, 'en'),
    (1200.0, 900.0, 'en'),
    (390.0, 844.0, 'my'),
    (820.0, 1000.0, 'my'),
    (320.0, 800.0, 'my'),
  ]) {
    testWidgets(
      'capture Today and Sell at ${width.toInt()}px $language',
      skip: !_capture,
      (tester) async {
        tester.view.physicalSize = Size(width, height);
        tester.view.devicePixelRatio = 1;
        if (width == 320) {
          tester.platformDispatcher.textScaleFactorTestValue = 1.5;
        }
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        final database = await _sampleShop(myanmar: language == 'my');
        try {
          await tester.pumpWidget(
            RepaintBoundary(
              key: _captureKey,
              child: ShopApp(
                database: database,
                authClient: null,
                apiBaseUrl: 'https://example.invalid',
                initialMyanmar: language == 'my',
              ),
            ),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await expectLater(
            find.byKey(_captureKey),
            matchesGoldenFile(
              'goldens/shop_today_${width.toInt()}_$language.png',
            ),
          );

          for (final (icon, screen) in [
            (Icons.receipt_long_outlined, 'sales'),
            (Icons.inventory_2_outlined, 'stock'),
            (Icons.settings_outlined, 'settings'),
          ]) {
            final Finder navigation;
            if (width >= 1100) {
              navigation = find.byType(NavigationRail);
            } else if (icon == Icons.settings_outlined) {
              navigation = find.byType(AppBar);
            } else {
              navigation = find.byType(NavigationBar);
            }
            final destination = find.descendant(
              of: navigation,
              matching: find.byIcon(icon),
            );
            await tester.tap(destination.first);
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
            if (screen == 'stock') {
              expect(
                find.textContaining(
                  language == 'my' ? 'ပြန်မှာရန်: ၁၀ ခု' : 'Reorder at 10',
                ),
                findsOneWidget,
              );
            }
            await expectLater(
              find.byKey(_captureKey),
              matchesGoldenFile(
                'goldens/shop_${screen}_${width.toInt()}_$language.png',
              ),
            );
            // pageBack() looks for the English "Back" tooltip and misses the
            // localized Material back control in a Burmese route.
            expect(await tester.binding.handlePopRoute(), isTrue);
            await tester.pumpAndSettle();
          }

          final Finder saleNavigation;
          if (width >= 1100) {
            saleNavigation = find.byType(NavigationRail);
          } else {
            saleNavigation = find.byType(NavigationBar);
          }
          final saleDestination = find.descendant(
            of: saleNavigation,
            matching: find.byIcon(Icons.point_of_sale_outlined),
          );
          await tester.tap(saleDestination.first);
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          if (width == 320 || width == 820) {
            final camera = find.byKey(const ValueKey('shop-camera-scan'));
            expect(camera, findsOneWidget);
            final bounds = tester.getRect(camera);
            expect(bounds.left, greaterThanOrEqualTo(0));
            expect(bounds.right, lessThanOrEqualTo(width));
            expect(bounds.height, greaterThanOrEqualTo(48));
            expect(tester.widget<IconButton>(camera).onPressed, isNotNull);
          }
          await expectLater(
            find.byKey(_captureKey),
            matchesGoldenFile(
              'goldens/shop_sell_${width.toInt()}_$language.png',
            ),
          );

          final product = find
              .byTooltip(language == 'my' ? 'အရောင်းထဲထည့်ရန်' : 'Add to sale')
              .first;
          await tester.ensureVisible(product);
          await tester.tap(product);
          await tester.pumpAndSettle();
          // A realistic tablet/desktop basket exposes line spacing and the
          // checkout hierarchy better than a single-item fixture.
          if (width >= 820) {
            final extraProducts = language == 'my'
                ? ['BAYDAR အဝတ်လျှော်ဆပ်ပြာ', 'MAMA ကြက်သား အမြန်ခေါက်ဆွဲ']
                : ['BAYDAR Laundry Detergent', 'MAMA Chicken Instant Noodles'];
            for (final name in extraProducts) {
              final nextProduct = find.text(name).first;
              await tester.ensureVisible(nextProduct);
              await tester.tap(nextProduct);
              await tester.pumpAndSettle();
            }
          }
          final hasPersistentBasket = find
              .byKey(const ValueKey('shop-split-basket'))
              .evaluate()
              .isNotEmpty;
          if (!hasPersistentBasket) {
            await tester.tap(find.byIcon(Icons.shopping_basket_outlined).first);
            await tester.pumpAndSettle();
          }
          final cashButton = find.text(
            language == 'my' ? 'ငွေသား' : 'Cash sale',
          );
          if (width <= 390) {
            expect(tester.getBottomLeft(cashButton).dy, lessThan(height));
          }
          expect(tester.takeException(), isNull);
          await expectLater(
            find.byKey(_captureKey),
            matchesGoldenFile(
              'goldens/shop_checkout_${width.toInt()}_$language.png',
            ),
          );

          await tester.ensureVisible(cashButton);
          await tester.tap(cashButton);
          await tester.pumpAndSettle();
          await tester.enterText(
            find.byKey(const ValueKey('shop-cash-given')),
            language == 'my' ? '၂၀၀၀၀' : '20000',
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await expectLater(
            find.byKey(_captureKey),
            matchesGoldenFile(
              'goldens/shop_cash_${width.toInt()}_$language.png',
            ),
          );
        } finally {
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump(const Duration(milliseconds: 1));
          await database.close();
        }
      },
    );
  }

  for (final (width, language) in [
    (320.0, 'en'),
    (320.0, 'my'),
    (820.0, 'en'),
    (820.0, 'my'),
  ]) {
    testWidgets(
      'capture synthetic camera scanner at ${width.toInt()}px $language',
      skip: !_capture,
      (tester) async {
        tester.view.physicalSize = Size(width, 900);
        tester.view.devicePixelRatio = 1;
        if (width == 320) {
          tester.platformDispatcher.textScaleFactorTestValue = 1.5;
        }
        final previousPlatform = debugDefaultTargetPlatformOverride;
        debugDefaultTargetPlatformOverride = TargetPlatform.android;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        try {
          await tester.pumpWidget(
            RepaintBoundary(
              key: _captureKey,
              child: MaterialApp(
                home: CameraBarcodeScanner(
                  myanmar: language == 'my',
                  cameraViewBuilder: (context, onScanned, onError) =>
                      const ColoredBox(
                        color: Color(0xff20252a),
                        child: Center(
                          child: Text(
                            'Synthetic camera preview',
                            style: TextStyle(color: Colors.white70),
                          ),
                        ),
                      ),
                ),
              ),
            ),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await expectLater(
            find.byKey(_captureKey),
            matchesGoldenFile(
              'goldens/shop_camera_${width.toInt()}_$language.png',
            ),
          );
        } finally {
          debugDefaultTargetPlatformOverride = previousPlatform;
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump(const Duration(milliseconds: 1));
        }
      },
    );
  }

  for (final (width, height, language) in [
    (320.0, 800.0, 'en'),
    (320.0, 800.0, 'my'),
    (820.0, 1000.0, 'en'),
    (820.0, 1000.0, 'my'),
  ]) {
    testWidgets(
      'capture wallet setup at ${width.toInt()}px $language',
      skip: !_capture,
      (tester) async {
        tester.view.physicalSize = Size(width, height);
        tester.view.devicePixelRatio = 1;
        if (width == 320) {
          tester.platformDispatcher.textScaleFactorTestValue = 1.5;
        }
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        final database = await _sampleShop(myanmar: language == 'my');
        try {
          await tester.pumpWidget(
            RepaintBoundary(
              key: _captureKey,
              child: ShopApp(
                database: database,
                authClient: null,
                apiBaseUrl: 'https://example.invalid',
                initialMyanmar: false,
              ),
            ),
          );
          await tester.pumpAndSettle();
          await tester.tap(
            find.descendant(
              of: find.byType(AppBar),
              matching: find.byIcon(Icons.settings_outlined),
            ).first,
          );
          await tester.pumpAndSettle();
          if (language == 'my') {
            await tester.tap(find.text('မြန်မာ'));
            await tester.pumpAndSettle();
          }
          final walletEntry = find.text(
            language == 'my' ? 'မိုဘိုင်းငွေပေးချေမှု' : 'Mobile money',
          );
          await tester.ensureVisible(walletEntry);
          await tester.tap(walletEntry);
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await expectLater(
            find.byKey(_captureKey),
            matchesGoldenFile(
              'goldens/shop_wallet_${width.toInt()}_$language.png',
            ),
          );

          await tester.tap(
            find.byKey(const ValueKey('wallet-provider-KBZPay')),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await expectLater(
            find.byKey(_captureKey),
            matchesGoldenFile(
              'goldens/shop_wallet_edit_${width.toInt()}_$language.png',
            ),
          );
        } finally {
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump(const Duration(milliseconds: 1));
          await database.close();
        }
      },
    );
  }
}
