// Synthetic Flutter renders for visual review. These are not installed-device
// screenshots and must not be published as hardware acceptance evidence.
import 'dart:convert';
import 'dart:io';

import 'package:cryptography/cryptography.dart';
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
const _photoFixtureDir = 'test/assets/grocery_photos';

List<Map<String, dynamic>> _groceryFixture() {
  final ledger = jsonDecode(
    File('$_photoFixtureDir/ledger.json').readAsStringSync(),
  ) as Map<String, dynamic>;
  return (ledger['items'] as List<dynamic>).cast<Map<String, dynamic>>();
}

Future<ShopDatabase> _sampleShop({required bool myanmar}) async {
  final database = ShopDatabase(NativeDatabase.memory());
  // Fixture-only names, prices, stock, and rights-checked photos. The ledger
  // explicitly marks price and stock as illustrative, not live market data.
  for (final item in _groceryFixture()) {
    final id = item['id'] as String;
    await database.addProduct(
      id: id,
      name: item[myanmar ? 'name_my' : 'name_en'] as String,
      priceMmk: item['price_mmk'] as int,
      openingStock: item['opening_stock'] as int,
    );
    final photoPath = '$_photoFixtureDir/${item['thumbnail']}';
    // The always-on fixture test below checks the public validation/write API.
    // Bulk synthetic renders load already-checked bytes without recomputing
    // per-byte PNG CRCs for every language, width, and secondary screen.
    await database.customStatement(
      'INSERT INTO shop_product_images '
      '(product_id, image_png, updated_at_millis) VALUES (?, ?, ?)',
      [id, File(photoPath).readAsBytesSync(), 0],
    );
  }
  await database.recordCashSale(
    operationId: 'synthetic-visual-capture-sale',
    lines: const [ShopSaleLineInput(productId: 'apple', quantity: 1)],
  );
  // The sample sale leaves seven apples. Make the merchant's alert visible in
  // Today and Stock captures without changing checkout or fixture stock.
  await database.setReorderLevel(
    productId: 'apple',
    expectedReorderLevel: 5,
    reorderLevel: 10,
  );
  return database;
}

Future<void> _resolveVisibleProductPhotos(WidgetTester tester) async {
  final images = tester.widgetList<Image>(find.byType(Image)).toList();
  expect(images, isNotEmpty);
  final context = tester.element(find.byKey(_captureKey));
  // Image.memory decodes outside the widget test's fake clock. A settled frame
  // can still contain empty image slots unless those providers are resolved.
  final resolved = await tester.runAsync(() async {
    await Future.wait([
      for (final image in images) precacheImage(image.image, context),
    ]);
    return true;
  });
  expect(resolved, isTrue);
  await tester.pumpAndSettle();
  final rendered = tester.widgetList<RawImage>(find.byType(RawImage)).toList();
  expect(rendered, isNotEmpty);
  expect(rendered.every((image) => image.image != null), isTrue);
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test(
    'grocery photo fixture is pinned and safe for the local catalog',
    () async {
      final items = _groceryFixture();
      final database = ShopDatabase(NativeDatabase.memory());
      addTearDown(database.close);
      expect(items.length, 5);
      expect(items.map((item) => item['id']).toSet().length, 5);
      for (final item in items) {
        final photoPath = '$_photoFixtureDir/${item['thumbnail']}';
        final photo = await File(photoPath).readAsBytes();
        expect(ShopDatabase.isValidProductThumbnail(photo), isTrue);
        final digest = await Sha256().hash(photo);
        final actualSha256 = digest.bytes
            .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
            .join();
        expect(
          actualSha256,
          item['thumbnail_sha256'],
          reason: item['id'] as String,
        );
        expect(
          item['source_page'],
          startsWith('https://commons.wikimedia.org/wiki/File:'),
        );
        expect(item['reuse_basis'], isNotEmpty);
        expect(item['name_en'], isNotEmpty);
        expect(item['name_my'], isNotEmpty);
        // No ancillary EXIF, location, color, or software metadata in derivatives.
        var offset = 8;
        final chunks = <String>[];
        while (offset + 12 <= photo.length) {
          final length =
              (photo[offset] << 24) |
              (photo[offset + 1] << 16) |
              (photo[offset + 2] << 8) |
              photo[offset + 3];
          chunks.add(ascii.decode(photo.sublist(offset + 4, offset + 8)));
          offset += length + 12;
        }
        expect(chunks.first, 'IHDR');
        expect(chunks.last, 'IEND');
        expect(chunks.every({'IHDR', 'IDAT', 'IEND'}.contains), isTrue);
        final id = item['id'] as String;
        await database.addProduct(
          id: id,
          name: item['name_en'] as String,
          priceMmk: item['price_mmk'] as int,
          openingStock: item['opening_stock'] as int,
        );
        await database.saveProductThumbnail(id, photo);
        expect(await database.readProductThumbnail(id), orderedEquals(photo));
      }
    },
  );

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

  testWidgets('first product keeps required fields first and a scan visible', (
    tester,
  ) async {
    for (final (width, language) in [
      (320.0, 'en'),
      (320.0, 'my'),
      (820.0, 'en'),
      (820.0, 'my'),
    ]) {
      tester.view.physicalSize = Size(width, width == 320 ? 800 : 1000);
      tester.view.devicePixelRatio = 1;
      tester.platformDispatcher.textScaleFactorTestValue = width == 320
          ? 1.5
          : 1.0;
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await tester.pumpWidget(
          RepaintBoundary(
            key: _captureKey,
            child: ShopApp(
              initialCounter: true,
              database: database,
              authClient: null,
              apiBaseUrl: 'https://example.invalid',
              initialMyanmar: language == 'my',
            ),
          ),
        );
        await tester.pumpAndSettle();
        final firstProduct = find.text(
          language == 'my' ? 'ပထမကုန်ပစ္စည်းထည့်ရန်' : 'Add first product',
        );
        await tester.ensureVisible(firstProduct);
        await tester.tap(firstProduct);
        await tester.pumpAndSettle();

        final name = find.byKey(const ValueKey('shop-product-name'));
        final price = find.byKey(const ValueKey('shop-product-price'));
        final stock = find.byKey(const ValueKey('shop-product-stock'));
        final barcode = find.byKey(const ValueKey('shop-product-barcode'));
        expect(name, findsOneWidget);
        expect(price, findsOneWidget);
        expect(stock, findsOneWidget);
        expect(barcode, findsOneWidget);
        expect(
          tester.getTopLeft(name).dy,
          lessThan(tester.getTopLeft(price).dy),
        );
        expect(
          tester.getTopLeft(price).dy,
          lessThan(tester.getTopLeft(stock).dy),
        );
        expect(
          tester.getTopLeft(stock).dy,
          lessThan(tester.getTopLeft(barcode).dy),
        );
        expect(tester.takeException(), isNull);
        if (_capture) {
          await expectLater(
            find.byKey(_captureKey),
            matchesGoldenFile(
              'goldens/shop_first_product_${width.toInt()}_$language.png',
            ),
          );
        }

        await tester.tap(
          find.text(language == 'my' ? 'မလုပ်တော့ပါ' : 'Cancel'),
        );
        await tester.pumpAndSettle();
        final scanInput = find.byType(TextField).first;
        await tester.enterText(scanInput, '0012345678905');
        await tester.testTextInput.receiveAction(TextInputAction.done);
        await tester.pumpAndSettle();
        expect(find.byType(AlertDialog), findsOneWidget);
        expect(
          tester.widget<TextFormField>(barcode).controller!.text,
          '0012345678905',
        );
        expect(
          tester.getTopLeft(name).dy,
          lessThan(tester.getTopLeft(barcode).dy),
        );
        expect(
          tester.getTopLeft(barcode).dy,
          lessThan(tester.getTopLeft(price).dy),
        );
        expect(await database.countSales(), 0);
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump(const Duration(milliseconds: 1));
        await database.close();
      }
    }
    tester.view.resetPhysicalSize();
    tester.view.resetDevicePixelRatio();
    tester.platformDispatcher.clearTextScaleFactorTestValue();
  });

  for (final (width, height, language) in [
    (320.0, 800.0, 'en'),
    (390.0, 844.0, 'en'),
    (820.0, 1000.0, 'en'),
    (1200.0, 900.0, 'en'),
    (390.0, 844.0, 'my'),
    (820.0, 1000.0, 'my'),
    (1200.0, 900.0, 'my'),
    (320.0, 800.0, 'my'),
  ]) {
    testWidgets(
      'capture Today and Sell at ${width.toInt()}px $language',
      skip: !_capture,
      (tester) async {
        final elapsed = Stopwatch()..start();
        void checkpoint(String stage) {
          debugPrint(
            '[visual ${width.toInt()} $language] '
            '${elapsed.elapsedMilliseconds}ms $stage',
          );
        }

        checkpoint('start');
        tester.view.physicalSize = Size(width, height);
        tester.view.devicePixelRatio = 1;
        if (width == 320) {
          tester.platformDispatcher.textScaleFactorTestValue = 1.5;
        }
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        checkpoint('fixture start');
        final database = await _sampleShop(myanmar: language == 'my');
        checkpoint('fixture ready');
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
          checkpoint('widget pumped');
          await tester.pumpAndSettle();
          checkpoint('today settled');
          expect(tester.takeException(), isNull);
          checkpoint('today golden start');
          await expectLater(
            find.byKey(_captureKey),
            matchesGoldenFile(
              'goldens/shop_today_${width.toInt()}_$language.png',
            ),
          );
          checkpoint('today golden complete');

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
            checkpoint('$screen settled');
            expect(tester.takeException(), isNull);
            if (screen == 'stock') {
              expect(
                find.textContaining(
                  language == 'my' ? 'ပြန်မှာရန်: ၁၀ ခု' : 'Reorder at 10',
                ),
                findsOneWidget,
              );
              expect(
                find.byKey(const ValueKey('stock-photo-apple')),
                findsOneWidget,
              );
              await _resolveVisibleProductPhotos(tester);
            }
            await expectLater(
              find.byKey(_captureKey),
              matchesGoldenFile(
                'goldens/shop_${screen}_${width.toInt()}_$language.png',
              ),
            );
            checkpoint('$screen golden complete');
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
          checkpoint('sell settled');
          expect(tester.takeException(), isNull);
          expect(
            find.byKey(const ValueKey('shop-product-photo:apple')),
            findsOneWidget,
          );
          await _resolveVisibleProductPhotos(tester);
          checkpoint('sell photos decoded');
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
          checkpoint('sell golden complete');

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
                ? ['ငှက်ပျောသီး (တစ်ဖီး)', 'သရက်သီး (တစ်လုံး)']
                : ['Bananas (bunch)', 'Mango (each)'];
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
          checkpoint('checkout golden complete');

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
          checkpoint('cash golden complete');
        } finally {
          checkpoint('cleanup start');
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump(const Duration(milliseconds: 1));
          await database.close();
          checkpoint('cleanup complete');
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
      'capture held and stock-changed sale at ${width.toInt()}px $language',
      skip: !_capture,
      (tester) async {
        final height = width == 320 ? 800.0 : 1000.0;
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
          await database.saveCounterSaleDraft(
            operationId: 'synthetic-held-sale',
            quantities: const {'apple': 6},
          );
          await database.holdCounterSaleDraft(
            id: 'synthetic-held-ticket',
            name: 'Customer A',
            operationId: 'synthetic-held-sale',
          );
          await database.recordCashSale(
            operationId: 'synthetic-other-sale',
            lines: const [ShopSaleLineInput(productId: 'apple', quantity: 2)],
          );
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
          await tester.tap(
            find
                .descendant(
                  of: find.byType(NavigationBar),
                  matching: find.byIcon(Icons.point_of_sale_outlined),
                )
                .first,
          );
          await tester.pumpAndSettle();
          await _resolveVisibleProductPhotos(tester);
          await tester.tap(find.byKey(const ValueKey('shop-held-sales-open')));
          await tester.pumpAndSettle();
          expect(find.text('Customer A'), findsOneWidget);
          expect(tester.takeException(), isNull);
          await expectLater(
            find.byKey(_captureKey),
            matchesGoldenFile(
              'goldens/shop_held_${width.toInt()}_$language.png',
            ),
          );
          await tester.tap(
            find.byKey(
              const ValueKey('shop-held-reopen:synthetic-held-ticket'),
            ),
          );
          await tester.pumpAndSettle();
          if (width < 820) {
            await tester.tap(
              find.textContaining(
                language == 'my' ? 'အရောင်းစစ်ရန်' : 'Review sale',
              ),
            );
            await tester.pumpAndSettle();
          }
          expect(
            find.text(
              language == 'my'
                  ? 'လက်ကျန်ပြောင်းသွားပါသည်။ ငွေမရှင်းမီ ရနိုင်သည့်အရေအတွက်နှင့် အရောင်းကို ကိုက်ညီအောင်ပြင်ပါ။'
                  : 'Stock changed. Match this sale to available quantities before payment.',
            ),
            findsOneWidget,
          );
          expect(tester.takeException(), isNull);
          await expectLater(
            find.byKey(_captureKey),
            matchesGoldenFile(
              'goldens/shop_held_review_${width.toInt()}_$language.png',
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
                debugShowCheckedModeBanner: false,
                theme: ThemeData(
                  fontFamily: language == 'my' ? 'NotoSansMyanmarUI' : 'Inter',
                  fontFamilyFallback: const ['Inter'],
                ),
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
                initialMyanmar: language == 'my',
              ),
            ),
          );
          await tester.pumpAndSettle();
          await tester.tap(
            find
                .descendant(
                  of: find.byType(AppBar),
                  matching: find.byIcon(Icons.settings_outlined),
                )
                .first,
          );
          await tester.pumpAndSettle();
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
