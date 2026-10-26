// Synthetic Flutter renders for visual review. These are not installed-device
// screenshots and must not be published as hardware acceptance evidence.
import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:ui' as ui;

import 'package:cryptography/cryptography.dart';
import 'package:drift/native.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supermega_shop/camera_barcode_scanner.dart';
import 'package:supermega_shop/main.dart';
import 'package:supermega_shop/printer_services.dart';
import 'package:supermega_shop/shop_cash_shift_screen.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_runtime_profile.dart';
import 'package:supermega_shop/shop_runtime_scope.dart';
import 'package:supermega_shop/shop_startup.dart';
import 'package:unified_esc_pos_printer/unified_esc_pos_printer.dart';

final _capture = Platform.environment['SHOP_VISUAL_CAPTURE'] == '1';
const _captureKey = ValueKey('native-shop-visual-capture');
const _photoFixtureDir = 'test/assets/grocery_photos';
const _visualMemberId = 'mem_56565656565656565656565656565656';
const _visualMemberDisplayCode = '00005656';

String _visualMemberToken() {
  final bytes = List<int>.generate(32, (index) => (56 + index) & 0xff);
  return 'SMC1.${base64Url.encode(bytes).replaceAll('=', '')}';
}

Future<void> _seedVisualMember(ShopDatabase database) async {
  const createdAtMillis = 1_800_000_000_000;
  final token = _visualMemberToken();
  final digest = await Sha256().hash(
    utf8.encode('supermega.shop.member-card.lookup.v1\u0000$token'),
  );
  final digestHex = digest.bytes
      .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
      .join();
  final storeRef = await database.readStoreRef();
  await database.customStatement(
    'INSERT INTO shop_members '
    '(id, store_ref, display_code, status, created_at_millis, updated_at_millis) '
    'VALUES (?, ?, ?, ?, ?, ?)',
    [
      _visualMemberId,
      storeRef,
      _visualMemberDisplayCode,
      'active',
      createdAtMillis,
      createdAtMillis,
    ],
  );
  await database.customStatement(
    'INSERT INTO shop_member_cards '
    '(token_digest, member_id, revision, state, issued_at_millis, '
    'retired_at_millis) VALUES (?, ?, 1, ?, ?, NULL)',
    [digestHex, _visualMemberId, 'active', createdAtMillis],
  );
}

Widget _syntheticCaptureFrame({required bool myanmar, required Widget child}) =>
    Column(
      children: [
        SizedBox(
          height: 26,
          child: ColoredBox(
            color: const Color(0xffe8eef8),
            child: Center(
              child: Text(
                myanmar ? 'သရုပ်ပြ နမူနာဒေတာသာ' : 'ILLUSTRATIVE · SAMPLE DATA',
                textDirection: TextDirection.ltr,
                style: TextStyle(
                  color: const Color(0xff31445f),
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  fontFamily: myanmar ? 'NotoSansMyanmarUI' : 'Inter',
                  fontFamilyFallback: const ['Inter'],
                  letterSpacing: myanmar ? 0 : .4,
                ),
              ),
            ),
          ),
        ),
        Expanded(child: child),
      ],
    );

Widget _syntheticCaptureBoundary({
  required bool myanmar,
  required Widget child,
}) => RepaintBoundary(
  key: _captureKey,
  child: _syntheticCaptureFrame(myanmar: myanmar, child: child),
);

List<Map<String, dynamic>> _groceryFixture() {
  final ledger = jsonDecode(
    File('$_photoFixtureDir/ledger.json').readAsStringSync(),
  ) as Map<String, dynamic>;
  return (ledger['items'] as List<dynamic>).cast<Map<String, dynamic>>();
}

Future<ShopDatabase> _sampleShop({required bool myanmar}) async {
  final database = ShopDatabase(NativeDatabase.memory());
  await _seedVisualMember(database);
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

Future<void> _pumpUntilVisible(WidgetTester tester, Finder finder) async {
  for (var attempt = 0; attempt < 200; attempt++) {
    await tester.pump();
    if (finder.evaluate().isNotEmpty) return;
    await tester.runAsync(
      () => Future<void>.delayed(const Duration(milliseconds: 15)),
    );
  }
  throw TestFailure('Expected visual state did not appear: $finder');
}

Future<({Uint8List png, int blocks, int maxRasterDots})> _decodeGsV0Receipt(
  List<int> bytes, {
  required int paperDots,
}) async {
  final rasters = <({int widthBytes, int height, Uint8List data})>[];
  var maxRasterDots = 0;
  for (var index = 0; index + 8 <= bytes.length;) {
    if (bytes[index] != 29 ||
        bytes[index + 1] != 118 ||
        bytes[index + 2] != 48) {
      index++;
      continue;
    }
    if (bytes[index + 3] != 0) {
      throw StateError('Receipt raster has an unexpected density mode.');
    }
    final widthBytes = bytes[index + 4] | (bytes[index + 5] << 8);
    final height = bytes[index + 6] | (bytes[index + 7] << 8);
    final dataLength = widthBytes * height;
    if (index + 8 + dataLength > bytes.length) {
      throw StateError('Truncated GS v 0 receipt image.');
    }
    if (widthBytes > (paperDots + 7) ~/ 8) {
      throw StateError('Receipt raster exceeds the selected printable width.');
    }
    final logicalRasterDots = widthBytes * 8 > paperDots
        ? paperDots
        : widthBytes * 8;
    maxRasterDots = logicalRasterDots > maxRasterDots
        ? logicalRasterDots
        : maxRasterDots;
    final unusedBits = widthBytes * 8 - paperDots;
    if (unusedBits > 0) {
      final unusedMask = (1 << unusedBits) - 1;
      for (var y = 0; y < height; y++) {
        final lastByte = bytes[index + 8 + (y + 1) * widthBytes - 1];
        if ((lastByte & unusedMask) != 0) {
          throw StateError('Receipt raster uses padding beyond paper width.');
        }
      }
    }
    rasters.add((
      widthBytes: widthBytes,
      height: height,
      data: Uint8List.fromList(
        bytes.sublist(index + 8, index + 8 + dataLength),
      ),
    ));
    index += 8 + dataLength;
  }
  if (rasters.isEmpty) throw StateError('Receipt has no GS v 0 raster rows.');
  final height = rasters.fold<int>(0, (total, raster) => total + raster.height);
  final rgba = Uint8List(paperDots * height * 4);
  rgba.fillRange(0, rgba.length, 255);
  var yOffset = 0;
  for (final raster in rasters) {
    for (var y = 0; y < raster.height; y++) {
      for (var byteIndex = 0; byteIndex < raster.widthBytes; byteIndex++) {
        final packed = raster.data[y * raster.widthBytes + byteIndex];
        for (var bit = 0; bit < 8; bit++) {
          if ((packed & (0x80 >> bit)) == 0) continue;
          final x = byteIndex * 8 + bit;
          if (x >= paperDots) continue;
          final pixel = ((yOffset + y) * paperDots + x) * 4;
          rgba[pixel] = 0;
          rgba[pixel + 1] = 0;
          rgba[pixel + 2] = 0;
        }
      }
    }
    yOffset += raster.height;
  }
  final buffer = await ui.ImmutableBuffer.fromUint8List(rgba);
  final descriptor = ui.ImageDescriptor.raw(
    buffer,
    width: paperDots,
    height: height,
    rowBytes: paperDots * 4,
    pixelFormat: ui.PixelFormat.rgba8888,
  );
  final codec = await descriptor.instantiateCodec();
  final image = (await codec.getNextFrame()).image;
  try {
    final png = await image.toByteData(format: ui.ImageByteFormat.png);
    if (png == null) throw StateError('Receipt PNG encoding failed.');
    return (
      png: png.buffer.asUint8List(png.offsetInBytes, png.lengthInBytes),
      blocks: rasters.length,
      maxRasterDots: maxRasterDots,
    );
  } finally {
    image.dispose();
    codec.dispose();
    descriptor.dispose();
    buffer.dispose();
  }
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

  testWidgets(
    'decode actual EN and MY ESC POS receipt bytes for 384 420 and 576 dots',
    skip: !_capture,
    (tester) async {
      await tester.runAsync(() async {
        const receipt = ShopSaleReceipt(
          id: 'synthetic-receipt',
          operationId: 'synthetic-receipt',
          totalMmk: 125000,
          createdAtMillis: 1792722600000,
          paymentMethod: 'cash',
          lines: [
            ShopSaleReceiptLine(
              productName: 'လက်ဖက်ရည် နို့ဆီ ချိုချို',
              unitPriceMmk: 2500,
              quantity: 50,
              lineTotalMmk: 125000,
            ),
          ],
        );
        final profiles = <(String, PaperSize, ReceiptPaperWidth)>[
          ('58-generic-384', PaperSize.mm58, ReceiptPaperWidth.mm58),
          ('58-contract-420', PaperSize.mm58Wide420, ReceiptPaperWidth.mm58),
          ('80-576', PaperSize.mm80, ReceiptPaperWidth.mm80),
        ];
        for (final myanmar in [false, true]) {
          for (final (name, paperSize, paperWidth) in profiles) {
            final ticket = await buildShopReceiptTicket(
              receipt,
              myanmar: myanmar,
              paperWidth: paperWidth,
              rasterPaperSize: paperSize,
            );
            final decoded = await _decodeGsV0Receipt(
              ticket.bytes,
              paperDots: paperSize.widthPixels,
            );
            expect(decoded.blocks, greaterThan(5), reason: '$name/$myanmar');
            expect(
              decoded.maxRasterDots,
              lessThanOrEqualTo(paperSize.widthPixels),
              reason: '$name/$myanmar',
            );
            final locale = myanmar ? 'my' : 'en';
            await File('test/goldens/shop_receipt_${name}_$locale.png')
                .writeAsBytes(decoded.png);
          }
        }
      });
    },
  );

  for (final (width, language) in [
    (390.0, 'en'),
    (390.0, 'my'),
    (820.0, 'en'),
    (820.0, 'my'),
  ]) {
    testWidgets(
      'capture startup and local-store confirmation at ${width.toInt()}px $language',
      skip: !_capture,
      (tester) async {
        tester.view.physicalSize = Size(width, width == 390 ? 844 : 1000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final documents = (await tester.runAsync(
          () => Directory.systemTemp.createTemp('shop-visual-startup-'),
        ))!;
        try {
          await tester.pumpWidget(
            _syntheticCaptureBoundary(
              myanmar: language == 'my',
              child: ShopStartup(
                documents: documents,
                importScratchRoot: documents,
                initialMyanmar: language == 'my',
                allowTestFileAccessWithoutScope: true,
                pickBackup: () async => null,
                buildShop: (_, _) => const SizedBox.shrink(),
              ),
            ),
          );
          final startLabel = language == 'my'
              ? 'Shop အသစ် စတင်ရန်'
              : 'Start new Shop';
          await _pumpUntilVisible(tester, find.text(startLabel));
          expect(find.text(startLabel), findsOneWidget);
          expect(tester.takeException(), isNull);
          await expectLater(
            find.byKey(_captureKey),
            matchesGoldenFile(
              'goldens/shop_startup_${width.toInt()}_$language.png',
            ),
          );
          await tester.tap(find.text(startLabel));
          await tester.pumpAndSettle();
          expect(
            find.text(
              language == 'my' ? 'Shop အသစ် စတင်မလား။' : 'Start a new Shop?',
            ),
            findsOneWidget,
          );
          await expectLater(
            find.byKey(_captureKey),
            matchesGoldenFile(
              'goldens/shop_startup_confirm_${width.toInt()}_$language.png',
            ),
          );
        } finally {
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump(const Duration(milliseconds: 1));
          await tester.runAsync(() => documents.delete(recursive: true));
        }
      },
    );

    testWidgets(
      'capture blocked startup recovery state at ${width.toInt()}px $language',
      skip: !_capture,
      (tester) async {
        tester.view.physicalSize = Size(width, width == 390 ? 844 : 1000);
        tester.view.devicePixelRatio = 1;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        final documents = (await tester.runAsync(
          () => Directory.systemTemp.createTemp('shop-visual-blocked-'),
        ))!;
        ShopDatabase.privateDatabaseFile(documents)
            .writeAsBytesSync(<int>[83, 104, 111, 112]);
        try {
          await tester.pumpWidget(
            _syntheticCaptureBoundary(
              myanmar: language == 'my',
              child: ShopStartup(
                documents: documents,
                importScratchRoot: documents,
                initialMyanmar: language == 'my',
                buildShop: (_, _) => const SizedBox.shrink(),
              ),
            ),
          );
          final blockedCopy = language == 'my'
              ? 'လုံခြုံစွာ မဖွင့်နိုင်သော'
              : 'cannot safely open';
          await _pumpUntilVisible(tester, find.textContaining(blockedCopy));
          expect(find.textContaining(blockedCopy), findsOneWidget);
          expect(tester.takeException(), isNull);
          await expectLater(
            find.byKey(_captureKey),
            matchesGoldenFile(
              'goldens/shop_startup_blocked_${width.toInt()}_$language.png',
            ),
          );
        } finally {
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump(const Duration(milliseconds: 1));
          await tester.runAsync(() => documents.delete(recursive: true));
        }
      },
    );
  }

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
          _syntheticCaptureBoundary(
            myanmar: language == 'my',
            child: ShopApp(
              testOnlyAllowMissingRuntimeScope: true,
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
        expect(tester.widget<TextFormField>(stock).controller!.text, isEmpty);
        expect(barcode, findsNothing);
        final addBarcode = find.byKey(
          const ValueKey('shop-product-add-barcode'),
        );
        expect(addBarcode, findsOneWidget);
        expect(tester.getSize(addBarcode).height, greaterThanOrEqualTo(48));
        expect(
          tester.getTopLeft(name).dy,
          lessThan(tester.getTopLeft(price).dy),
        );
        expect(
          tester.getTopLeft(price).dy,
          lessThan(tester.getTopLeft(stock).dy),
        );
        if (width == 320) {
          final save = find.widgetWithText(
            FilledButton,
            language == 'my' ? 'သိမ်းရန်' : 'Save product',
          );
          final cancel = find.widgetWithText(
            TextButton,
            language == 'my' ? 'မလုပ်တော့ပါ' : 'Cancel',
          );
          expect(tester.getSize(save).width, greaterThanOrEqualTo(230));
          expect(
            tester.getTopLeft(save).dy,
            lessThan(tester.getTopLeft(cancel).dy),
          );
        }
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

  for (final (language, textScale) in [
    ('en', 1.0),
    ('my', 1.0),
    ('en', 1.3),
    ('my', 1.3),
  ]) {
    testWidgets(
      '768px portrait tablet keeps catalog and basket at $language ${textScale}x',
      (tester) async {
        const width = 768.0;
        const height = 1024.0;
        tester.view.physicalSize = const Size(width, height);
        tester.view.devicePixelRatio = 1;
        tester.platformDispatcher.textScaleFactorTestValue = textScale;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        final database = await _sampleShop(myanmar: language == 'my');
        try {
          await tester.pumpWidget(
            _syntheticCaptureBoundary(
              myanmar: language == 'my',
              child: ShopApp(
                testOnlyAllowMissingRuntimeScope: true,
                initialCounter: true,
                database: database,
                authClient: null,
                apiBaseUrl: 'https://example.invalid',
                initialMyanmar: language == 'my',
              ),
            ),
          );
          await tester.pump();
          await tester.pump(const Duration(milliseconds: 500));
          await tester.pumpAndSettle();
          final catalog = find.byKey(const ValueKey('shop-split-catalog'));
          final basket = find.byKey(const ValueKey('shop-split-basket'));
          expect(catalog, findsOneWidget);
          expect(basket, findsOneWidget);
          final catalogBounds = tester.getRect(catalog);
          final basketBounds = tester.getRect(basket);
          expect(catalogBounds.width, greaterThanOrEqualTo(390));
          expect(basketBounds.width, 300);
          expect(catalogBounds.right, lessThan(basketBounds.left));
          expect(basketBounds.right, lessThanOrEqualTo(width));
          final newProduct = find.byKey(
            const ValueKey('shop-new-product-compact'),
          );
          final camera = find.byKey(const ValueKey('shop-camera-scan'));
          final productActions = find.byKey(
            const ValueKey('shop-product-actions'),
          );
          expect(newProduct, findsOneWidget);
          expect(find.text(language == 'my' ? 'အသစ်' : 'New'), findsOneWidget);
          expect(camera, findsOneWidget);
          expect(productActions, findsOneWidget);
          expect(tester.getSize(newProduct).height, greaterThanOrEqualTo(48));
          expect(tester.getSize(camera).height, greaterThanOrEqualTo(48));
          expect(
            tester.getRect(newProduct).left,
            greaterThanOrEqualTo(tester.getRect(camera).right),
          );
          expect(
            tester.getRect(newProduct).right,
            lessThanOrEqualTo(tester.getRect(productActions).left),
          );
          expect(
            (tester.getRect(newProduct).center.dy -
                    tester.getRect(camera).center.dy)
                .abs(),
            lessThan(2),
          );
          expect(tester.takeException(), isNull);
          if (_capture) {
            await _resolveVisibleProductPhotos(tester);
            await expectLater(
              find.byKey(_captureKey),
              matchesGoldenFile(
                'goldens/shop_tablet_sell_768_${language}_${textScale == 1.0 ? 'normal' : 'large'}.png',
              ),
            );
          }

          await tester.tap(
            find
                .byTooltip(
                  language == 'my' ? 'အရောင်းထဲထည့်ရန်' : 'Add to sale',
                )
                .first,
          );
          await tester.pumpAndSettle();
          expect(basket, findsOneWidget);
          expect(
            tester.getRect(basket).top,
            lessThanOrEqualTo(catalogBounds.top + 12),
          );
          final cash = find.widgetWithText(
            FilledButton,
            language == 'my' ? 'ငွေသား' : 'Cash sale',
          );
          expect(cash, findsOneWidget);
          expect(tester.getRect(cash).height, greaterThanOrEqualTo(48));
          expect(tester.getRect(cash).bottom, lessThanOrEqualTo(height));
          expect(tester.takeException(), isNull);
          if (_capture) {
            await expectLater(
              find.byKey(_captureKey),
              matchesGoldenFile(
                'goldens/shop_tablet_checkout_768_${language}_${textScale == 1.0 ? 'normal' : 'large'}.png',
              ),
            );
          }
        } finally {
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump(const Duration(milliseconds: 1));
          await database.close();
        }
      },
    );
  }

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
            _syntheticCaptureBoundary(
              myanmar: language == 'my',
              child: ShopApp(
                testOnlyAllowMissingRuntimeScope: true,
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
          expect(
            find.descendant(
              of: find.byType(AppBar),
              matching: find.text('Shop'),
            ),
            findsOneWidget,
          );
          expect(find.text('SuperMega Shop'), findsNothing);
          expect(find.text('SuperMega ဆိုင်'), findsNothing);
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
          if (width == 820 && language == 'my') {
            final catalog = find.byKey(const ValueKey('shop-split-catalog'));
            final lastProduct = find.byKey(
              const ValueKey('shop-catalog-row:mango'),
            );
            expect(lastProduct, findsOneWidget);
            expect(
              tester.getBottomLeft(lastProduct).dy,
              lessThan(tester.getBottomLeft(catalog).dy - 8),
            );
          }
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

          if (width == 320 || width == 820) {
            final memberSelector = find.byKey(
              const ValueKey('shop-select-member-card'),
            );
            await tester.ensureVisible(memberSelector);
            await tester.tap(memberSelector);
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);
            expect(
              find.text(
                language == 'my'
                    ? 'အသင်းဝင်ကတ်သည် မှတ်တမ်းကိုသာ ခွဲခြားသည်။ ငွေပေးချေမှု မလုပ်နိုင်ပါ။'
                    : 'Member cards identify a record only. They cannot take payment.',
              ),
              findsOneWidget,
            );
            await expectLater(
              find.byKey(_captureKey),
              matchesGoldenFile(
                'goldens/shop_member_dialog_${width.toInt()}_$language.png',
              ),
            );
            await tester.enterText(
              find.byKey(const ValueKey('shop-member-card-input')),
              _visualMemberToken(),
            );
            await tester.tap(
              find.byKey(const ValueKey('shop-member-card-apply')),
            );
            await tester.pumpAndSettle();
            expect(
              find.byKey(const ValueKey('shop-selected-member-card')),
              findsOneWidget,
            );
            await expectLater(
              find.byKey(_captureKey),
              matchesGoldenFile(
                'goldens/shop_member_selected_${width.toInt()}_$language.png',
              ),
            );
          }

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
          await tester.tap(
            find.text(language == 'my' ? 'အတည်ပြုရန်' : 'Complete sale'),
          );
          await tester.pumpAndSettle();
          expect(await database.countSales(), 2);
          expect(tester.takeException(), isNull);
          await expectLater(
            find.byKey(_captureKey),
            matchesGoldenFile(
              'goldens/shop_sale_complete_${width.toInt()}_$language.png',
            ),
          );
          checkpoint('sale complete golden');
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

  for (final (width, height, language) in [
    (320.0, 900.0, 'en'),
    (820.0, 1000.0, 'en'),
    (320.0, 900.0, 'my'),
    (820.0, 1000.0, 'my'),
  ]) {
    testWidgets(
      'capture closed-shift CSV preview at ${width.toInt()}px $language',
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
        final database = await _closedShiftCaptureDatabase(
          myanmar: language == 'my',
        );
        final runtimeRoot = (await tester.runAsync(
          () => Directory.systemTemp.createTemp('shop-visual-qa-runtime-'),
        ))!;
        final supportRoot = Directory('${runtimeRoot.path}/support');
        final temporaryRoot = Directory('${runtimeRoot.path}/temporary');
        await tester.runAsync(() async {
          await supportRoot.create();
          await temporaryRoot.create();
        });
        SharedPreferences.setMockInitialValues({});
        final configuration = ShopRuntimeConfiguration.resolve(
          runtimeProfile: ShopRuntimeConfiguration.qaRuntimeToken,
          qaProfile: ShopRuntimeConfiguration.qaProfileId,
          buildIdentityProfile: ShopRuntimeConfiguration.qaRuntimeToken,
          buildIdentityQaProfile: ShopRuntimeConfiguration.qaProfileId,
          platformIdentity: 'dev.supermega.supermega_shop.qa',
        );
        final runtimeScope = (await tester.runAsync(
          () => ShopRuntimeScope.resolve(
            ShopRuntimeProfile.syntheticQa,
            configuration: configuration,
            supportProvider: () async => supportRoot,
            temporaryProvider: () async => temporaryRoot,
            preferencesProvider: SharedPreferences.getInstance,
          ),
        ))!;
        try {
          await tester.pumpWidget(
            _syntheticCaptureBoundary(
              myanmar: language == 'my',
              child: ShopApp(
                testOnlyAllowMissingRuntimeScope: true,
                database: database,
                authClient: null,
                apiBaseUrl: 'https://example.invalid',
                initialMyanmar: language == 'my',
              ),
            ),
          );
          await tester.pumpAndSettle();
          final navigator = tester.state<NavigatorState>(
            find.byType(Navigator).first,
          );
          unawaited(
            navigator.push<void>(
              MaterialPageRoute<void>(
                builder: (_) => ShopCashShiftScreen(
                  database: database,
                  myanmar: language == 'my',
                  runtimeScope: runtimeScope,
                ),
              ),
            ),
          );
          await tester.pump();
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await expectLater(
            find.byKey(_captureKey),
            matchesGoldenFile(
              'goldens/shop_shift_export_${width.toInt()}_$language.png',
            ),
          );
          final label = language == 'my'
              ? 'ပိတ်ပြီးတာဝန်ချိန် CSV ထုတ်မည်'
              : 'Export closed shift (CSV)';
          final shiftScroll = find
              .descendant(
                of: find.byType(ShopCashShiftScreen),
                matching: find.byType(Scrollable),
              )
              .first;
          await tester.scrollUntilVisible(
            find.text(label),
            260,
            scrollable: shiftScroll,
          );
          await tester.tap(find.widgetWithText(OutlinedButton, label));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await expectLater(
            find.byKey(_captureKey),
            matchesGoldenFile(
              'goldens/shop_shift_export_preview_${width.toInt()}_$language.png',
            ),
          );
        } finally {
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump(const Duration(milliseconds: 1));
          await database.close();
          await tester.runAsync(() => runtimeRoot.delete(recursive: true));
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
            _syntheticCaptureBoundary(
              myanmar: language == 'my',
              child: ShopApp(
                testOnlyAllowMissingRuntimeScope: true,
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
          expect(find.textContaining('Customer A'), findsOneWidget);
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
            _syntheticCaptureBoundary(
              myanmar: language == 'my',
              child: MaterialApp(
                debugShowCheckedModeBanner: false,
                theme: ThemeData(
                  fontFamily: language == 'my' ? 'NotoSansMyanmarUI' : 'Inter',
                  fontFamilyFallback: const ['Inter'],
                ),
                home: CameraBarcodeScanner(
                  myanmar: language == 'my',
                  testOnlyAllowMissingRuntimeScope: true,
                  cameraViewBuilder: (context, onScanned, onError) =>
                      ColoredBox(
                        color: const Color(0xff20252a),
                        child: Center(
                          child: Text(
                            language == 'my'
                                ? 'ကင်မရာ သရုပ်ပြမြင်ကွင်း'
                                : 'Synthetic camera preview',
                            style: const TextStyle(color: Colors.white70),
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
            _syntheticCaptureBoundary(
              myanmar: language == 'my',
              child: ShopApp(
                testOnlyAllowMissingRuntimeScope: true,
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

Future<ShopDatabase> _closedShiftCaptureDatabase({
  required bool myanmar,
}) async {
  final database = ShopDatabase(NativeDatabase.memory());
  await database.addProduct(
    id: 'tea-export-visual',
    name: myanmar ? 'လက်ဖက်ရည်' : 'Tea',
    priceMmk: 2500,
    openingStock: 4,
  );
  final shift = await database.openCashShift(
    operationId: 'visual-export-open',
    operatorLabel: myanmar ? 'မေ' : 'May',
    openingFloatMmk: 10000,
  );
  await database.recordCashSale(
    operationId: 'visual-export-sale',
    lines: const [
      ShopSaleLineInput(productId: 'tea-export-visual', quantity: 2),
    ],
  );
  final review = await database.readCashShiftReview(shift.id);
  await database.closeCashShift(
    shiftId: shift.id,
    operationId: 'visual-export-close',
    seenSaleCount: review.saleCount,
    seenCashTotalMmk: review.cashSalesTotalMmk,
    countedCashMmk: review.expectedCashMmk,
  );
  return database;
}
