// Synthetic Flutter renders for visual review. These are not installed-device
// screenshots and must not be published as hardware acceptance evidence.
import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
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
            await tester.tap(find.byIcon(icon).first);
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
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

          await tester.tap(find.byIcon(Icons.point_of_sale_outlined).first);
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
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
}
