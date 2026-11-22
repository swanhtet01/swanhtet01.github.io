import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:supermega_shop/main.dart' as shop;
import 'package:supermega_shop/shop_copy.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_runtime_profile.dart';
import 'package:supermega_shop/shop_runtime_scope.dart';

const _tabletProfileId = String.fromEnvironment('SHOP_AVD_PROFILE_ID');

const _locale = String.fromEnvironment(
  'SHOP_FIRST_SALE_LOCALE',
  defaultValue: 'en',
);

void main() {
  final binding = IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('synthetic QA first product and cash sale persist ($_locale)', (
    tester,
  ) async {
    final semantics = tester.ensureSemantics();
    addTearDown(semantics.dispose);

    final myanmar = _locale == 'my';
    var explicitTapCalls = 0;
    var textEntryCalls = 0;
    Future<void> waitFor(Finder finder) async {
      final waiting = Stopwatch()..start();
      while (finder.evaluate().length != 1 &&
          waiting.elapsed < const Duration(seconds: 20)) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(finder, findsOneWidget);
    }

    Future<void> tapOnce(Finder finder) async {
      await waitFor(finder);
      await tester.ensureVisible(finder);
      await tester.pump();
      final target = finder.hitTestable();
      await waitFor(target);
      await tester.tap(target);
      explicitTapCalls += 1;
      await tester.pump();
    }

    Future<void> tapId(String id) => tapOnce(find.bySemanticsIdentifier(id));

    Map<String, Object> viewportSnapshot(Finder anchor) {
      final context = tester.element(anchor);
      final media = MediaQuery.of(context);
      final view = View.of(context);
      return <String, Object>{
        'physicalWidth': view.physicalSize.width.round(),
        'physicalHeight': view.physicalSize.height.round(),
        'logicalWidth': media.size.width,
        'logicalHeight': media.size.height,
        'devicePixelRatio': media.devicePixelRatio,
        'paddingLeft': media.padding.left,
        'paddingTop': media.padding.top,
        'paddingRight': media.padding.right,
        'paddingBottom': media.padding.bottom,
        'viewPaddingLeft': media.viewPadding.left,
        'viewPaddingTop': media.viewPadding.top,
        'viewPaddingRight': media.viewPadding.right,
        'viewPaddingBottom': media.viewPadding.bottom,
        'viewInsetsLeft': media.viewInsets.left,
        'viewInsetsTop': media.viewInsets.top,
        'viewInsetsRight': media.viewInsets.right,
        'viewInsetsBottom': media.viewInsets.bottom,
        'textScaleAt14': media.textScaler.scale(14),
      };
    }

    Future<Map<String, Object>> waitForOrientation(
      Finder anchor, {
      required bool landscape,
      bool reportSetupViewport = false,
    }) async {
      final waiting = Stopwatch()..start();
      var snapshot = viewportSnapshot(anchor);
      // Orientation may be reported before the app window finishes resizing.
      // Keep the existing tablet thresholds inside the bounded wait as well.
      bool matches(Map<String, Object> value) {
        final width = value['logicalWidth']! as num;
        final height = value['logicalHeight']! as num;
        return width.isFinite &&
            height.isFinite &&
            (landscape
                ? width > height && width >= 700 && height >= 600
                : height > width && width >= 600 && height >= 700);
      }

      while (!matches(snapshot) &&
          waiting.elapsed < const Duration(seconds: 20)) {
        await tester.pump(const Duration(milliseconds: 100));
        snapshot = viewportSnapshot(anchor);
      }
      if (reportSetupViewport) {
        debugPrint(
          'SUPERMEGA_TABLET_VIEWPORT_V1:'
          '${jsonEncode(<String, Object>{
            'stage': 'setup_portrait',
            for (final key in const <String>['physicalWidth', 'physicalHeight', 'logicalWidth', 'logicalHeight', 'devicePixelRatio', 'textScaleAt14']) key: snapshot[key]!,
          })}',
        );
      }
      expect(
        matches(snapshot),
        isTrue,
        reason: 'Requested orientation did not reach a tablet-sized app view.',
      );
      return snapshot;
    }

    double expect48DpTarget(Finder finder) {
      final target = finder.hitTestable();
      expect(target, findsOneWidget);
      final size = tester.getSize(target);
      expect(size.width, greaterThanOrEqualTo(48));
      expect(size.height, greaterThanOrEqualTo(48));
      return size.width < size.height ? size.width : size.height;
    }

    Future<Map<String, int>> readPreSaleState(
      String productId,
      Directory documentsRoot,
    ) async {
      final database = ShopDatabase.inPrivateDocuments(documentsRoot);
      try {
        await database.verifyReadyForUse();
        final product = (await database.readActiveProducts()).singleWhere(
          (row) => row.id == productId,
        );
        return <String, int>{
          'sales': await database.countSales(),
          'receipts': (await database.readRecentSales()).length,
          'stock': product.onHand,
        };
      } finally {
        await database.close();
      }
    }

    Future<String> waitForBasketLayout() async {
      final splitBasket = find.byKey(const ValueKey('shop-split-basket'));
      final reviewAction = find.bySemanticsIdentifier('shop.cart.review');
      final waiting = Stopwatch()..start();
      var splitCount = splitBasket.evaluate().length;
      var reviewCount = reviewAction.evaluate().length;
      while (splitCount + reviewCount != 1 &&
          waiting.elapsed < const Duration(seconds: 20)) {
        await tester.pump(const Duration(milliseconds: 100));
        splitCount = splitBasket.evaluate().length;
        reviewCount = reviewAction.evaluate().length;
      }
      expect(splitCount + reviewCount, 1);
      return splitCount == 1 ? 'split' : 'compact';
    }

    Future<Map<String, Object?>> inspectBasket(String layout) async {
      final splitBasket = find.byKey(const ValueKey('shop-split-basket'));
      final compactSheet = find.byKey(const ValueKey('shop-cart-sheet'));
      late final Finder basketRoot;
      double? reviewTargetMinDp;
      if (layout == 'split') {
        basketRoot = splitBasket;
        await waitFor(basketRoot);
        expect(compactSheet, findsNothing);
        expect(find.bySemanticsIdentifier('shop.cart.review'), findsNothing);
      } else {
        expect(layout, 'compact');
        basketRoot = compactSheet;
        if (compactSheet.evaluate().isEmpty) {
          final reviewAction = find.bySemanticsIdentifier('shop.cart.review');
          await waitFor(reviewAction);
          await tester.ensureVisible(reviewAction);
          await waitFor(reviewAction.hitTestable());
          reviewTargetMinDp = expect48DpTarget(reviewAction);
          await tapOnce(reviewAction);
        }
        await waitFor(basketRoot);
      }

      final productName = find.descendant(
        of: basketRoot,
        matching: find.text('Tea'),
      );
      await waitFor(productName);
      expect(productName, findsOneWidget);
      final quantityAndPrice = find.descendant(
        of: basketRoot,
        matching: find.text(
          '${shopMmk(2500, myanmar: myanmar)} × ${shopNumber(1, myanmar: myanmar)}',
        ),
      );
      await waitFor(quantityAndPrice);
      expect(quantityAndPrice, findsOneWidget);
      final summary = find.descendant(
        of: basketRoot,
        matching: find.byKey(const ValueKey('shop-checkout-summary')),
      );
      expect(summary, findsOneWidget);
      final total = find.descendant(
        of: summary,
        matching: find.text(shopMmk(2500, myanmar: myanmar)),
      );
      await waitFor(total);
      expect(total, findsOneWidget);

      final cashAction = find.descendant(
        of: basketRoot,
        matching: find.bySemanticsIdentifier('shop.checkout.cash'),
      );
      await waitFor(cashAction);
      await tester.ensureVisible(cashAction);
      await waitFor(cashAction.hitTestable());
      final cashTargetMinDp = expect48DpTarget(cashAction);
      return <String, Object?>{
        'layout': layout,
        'contents': <String, Object>{
          'productName': 'Tea',
          'quantity': 1,
          'totalMmk': 2500,
        },
        'reviewTargetMinDp': reviewTargetMinDp,
        'cashTargetMinDp': cashTargetMinDp,
      };
    }

    Future<void> enterById(String id, String value) async {
      final wrapper = find.bySemanticsIdentifier(id);
      await waitFor(wrapper);
      final editable = find.descendant(
        of: wrapper,
        matching: find.byType(EditableText),
      );
      expect(editable, findsOneWidget);
      await tester.ensureVisible(editable);
      await tester.enterText(editable, value);
      textEntryCalls += 1;
      await tester.pump();
    }

    expect(Platform.isAndroid, isTrue);
    expect(_tabletProfileId, 'medium_tablet');
    expect(const {'en', 'my'}, contains(_locale));

    final scope = await resolveShopRuntimeScopeForStartup();
    expect(scope.configuration.profile, ShopRuntimeProfile.syntheticQa);
    expect(scope.configuration.profileId, ShopRuntimeConfiguration.qaProfileId);
    expect(
      scope.configuration.platformIdentity,
      'dev.supermega.supermega_shop.qa',
    );
    expect(scope.capabilities.managedAuth, isFalse);
    expect(scope.capabilities.connectedOrders, isFalse);
    expect(scope.capabilities.connectedSite, isFalse);
    expect(scope.capabilities.networkPrinter, isFalse);
    expect(scope.capabilities.externalFileSaving, isFalse);
    expect(
      const bool.fromEnvironment('SHOP_CONNECTED_ORDERS_ENABLED'),
      isFalse,
    );
    expect(const String.fromEnvironment('SUPABASE_URL'), isEmpty);
    expect(const String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY'), isEmpty);
    expect(const String.fromEnvironment('SHOP_API_BASE_URL'), isEmpty);

    expect(
      await ShopDatabase.privateDatabaseFile(scope.documentsRoot).exists(),
      isFalse,
      reason: 'This regression requires a fresh QA data target; never reset an existing store.',
    );

    await scope.preferences.instance.setBool(
      scope.preferences.keys.localeMyanmar,
      myanmar,
    );

    final launchTimer = Stopwatch()..start();
    await shop.main();
    final startNew = find.bySemanticsIdentifier('shop.setup.start-new');
    await waitFor(startNew);
    // Defer to the disposable tablet's real display rotation. The host accepts
    // only these two fixed phase markers; measured view assertions stay below.
    await SystemChrome.setPreferredOrientations(const <DeviceOrientation>[]);
    debugPrint('SUPERMEGA_TABLET_ROTATE_V1:setup_portrait');
    final portraitViewport = await waitForOrientation(
      startNew,
      landscape: false,
      reportSetupViewport: true,
    );
    expect(
      (portraitViewport['logicalHeight']! as num) >= 700 &&
          (portraitViewport['logicalWidth']! as num) >= 600,
      isTrue,
      reason: 'The measured portrait viewport must be tablet-sized.',
    );
    expect(
      (portraitViewport['textScaleAt14']! as num) >= 16,
      isTrue,
      reason: 'The isolated tablet must retain the enlarged-text setting.',
    );
    await tapId('shop.setup.start-new');
    await tapId('shop.setup.start-new.confirm');
    await tapOnce(find.text(shopCopy(myanmar, 'Sell', 'ရောင်းရန်')));
    await tapId('shop.product.empty.add');
    await enterById('shop.product.name', 'Tea');
    await enterById('shop.product.price', '2500');
    await enterById('shop.product.stock', '3');
    await tapId('shop.product.save');
    await waitFor(
      find.byWidgetPredicate((widget) {
        final key = widget.key;
        return key is ValueKey<String> &&
            key.value.startsWith('shop-catalog-row:');
      }),
    );

    // Read the real UI-created row; never seed or write through this handle.
    late final String productId;
    final beforeSale = ShopDatabase.inPrivateDocuments(scope.documentsRoot);
    try {
      await beforeSale.verifyReadyForUse();
      expect(await beforeSale.countSales(), 0);
      final products = await beforeSale.readActiveProducts();
      expect(products, hasLength(1));
      expect(products.single.name, 'Tea');
      expect(products.single.onHand, 3);
      productId = products.single.id;
    } finally {
      await beforeSale.close();
    }

    final productRow = find.byKey(ValueKey('shop-catalog-row:$productId'));
    await tapOnce(productRow);
    final portraitBasketViewport = await waitForOrientation(
      productRow,
      landscape: false,
    );
    expect(
      (portraitBasketViewport['logicalHeight']! as num) >= 700 &&
          (portraitBasketViewport['logicalWidth']! as num) >= 600,
      isTrue,
      reason: 'The measured portrait catalog viewport must be tablet-sized.',
    );
    expect(
      (portraitBasketViewport['textScaleAt14']! as num) >= 16,
      isTrue,
      reason: 'The portrait catalog view must retain enlarged text.',
    );
    final basketLayoutBeforeRotation = await waitForBasketLayout();
    final basketBeforeRotation = await inspectBasket(
      basketLayoutBeforeRotation,
    );
    final beforeRotation = await readPreSaleState(
      productId,
      scope.documentsRoot,
    );
    expect(beforeRotation['sales'], 0);
    expect(beforeRotation['receipts'], 0);
    expect(beforeRotation['stock'], 3);

    // Close only the review sheet before rotating a compact layout. The
    // split-basket and compact-review paths are both inspected independently.
    if (basketLayoutBeforeRotation == 'compact') {
      expect(find.byKey(const ValueKey('shop-cart-sheet')), findsOneWidget);
      expect(await binding.handlePopRoute(), isTrue);
      await tester.pumpAndSettle(
        const Duration(milliseconds: 100),
        EnginePhase.sendSemanticsUpdate,
        const Duration(seconds: 20),
      );
      expect(find.byKey(const ValueKey('shop-cart-sheet')), findsNothing);
    }

    debugPrint('SUPERMEGA_TABLET_ROTATE_V1:basket_landscape');
    final landscapeViewport = await waitForOrientation(
      productRow,
      landscape: true,
    );
    final basketLayoutAfterRotation = await waitForBasketLayout();
    final basketAfterRotation = await inspectBasket(basketLayoutAfterRotation);
    final afterRotation = await readPreSaleState(
      productId,
      scope.documentsRoot,
    );
    expect(afterRotation['sales'], beforeRotation['sales']);
    expect(afterRotation['receipts'], beforeRotation['receipts']);
    expect(afterRotation['stock'], beforeRotation['stock']);
    expect(afterRotation['sales'], 0);
    expect(afterRotation['receipts'], 0);
    expect(afterRotation['stock'], 3);
    expect(
      basketAfterRotation['contents'],
      basketBeforeRotation['contents'],
      reason:
          'The visible basket must retain Tea, quantity 1, total 2,500 MMK.',
    );
    expect(tester.takeException(), isNull);
    expect(
      (landscapeViewport['logicalWidth']! as num) >= 700 &&
          (landscapeViewport['logicalHeight']! as num) >= 600,
      isTrue,
      reason: 'The measured landscape viewport must be tablet-sized.',
    );
    expect(
      (landscapeViewport['textScaleAt14']! as num) >= 16,
      isTrue,
      reason: 'The measured landscape view must retain enlarged text.',
    );

    final reviewTargetMinDpBeforeRotation =
        basketBeforeRotation['reviewTargetMinDp'] as double?;
    final reviewTargetMinDpAfterRotation =
        basketAfterRotation['reviewTargetMinDp'] as double?;
    final cashTargetMinDpBeforeRotation =
        basketBeforeRotation['cashTargetMinDp']! as double;
    final cashTargetMinDpAfterRotation =
        basketAfterRotation['cashTargetMinDp']! as double;
    final cashSale = find.descendant(
      of: basketLayoutAfterRotation == 'split'
          ? find.byKey(const ValueKey('shop-split-basket'))
          : find.byKey(const ValueKey('shop-cart-sheet')),
      matching: find.bySemanticsIdentifier('shop.checkout.cash'),
    );
    await tapOnce(cashSale);
    await tester.pumpAndSettle(
      const Duration(milliseconds: 100),
      EnginePhase.sendSemanticsUpdate,
      const Duration(seconds: 20),
    );
    final cashReceived = find.text(
      shopCopy(myanmar, 'Cash received?', 'ငွေသားရပြီလား။'),
    );
    await waitFor(cashReceived);
    final cashInput = find.byKey(const ValueKey('shop-cash-given'));
    final confirm = find.bySemanticsIdentifier('shop.checkout.cash.confirm');
    await waitFor(confirm);
    await tester.ensureVisible(cashInput);
    await tester.tap(cashInput);
    explicitTapCalls += 1;
    await tester.pump();
    final imeWait = Stopwatch()..start();
    var imeViewport = viewportSnapshot(cashInput);
    while ((imeViewport['viewInsetsBottom']! as num) <= 0 &&
        imeWait.elapsed < const Duration(seconds: 20)) {
      await tester.pump(const Duration(milliseconds: 100));
      imeViewport = viewportSnapshot(cashInput);
    }
    final imeStatus = (imeViewport['viewInsetsBottom']! as num) > 0
        ? 'observed'
        : 'NOT_RUN';
    await tester.enterText(cashInput, '2500');
    textEntryCalls += 1;
    await tester.pumpAndSettle(
      const Duration(milliseconds: 100),
      EnginePhase.sendSemanticsUpdate,
      const Duration(seconds: 20),
    );
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(
      find.text(shopCopy(myanmar, 'Complete sale', 'အတည်ပြုရန်')),
      findsOneWidget,
    );
    await tester.ensureVisible(confirm);
    await waitFor(confirm.hitTestable());
    final confirmTargetMinDp = expect48DpTarget(confirm);
    await tapOnce(confirm);
    await tester.pumpAndSettle(
      const Duration(milliseconds: 100),
      EnginePhase.sendSemanticsUpdate,
      const Duration(seconds: 20),
    );
    await waitFor(find.bySemanticsIdentifier('shop.sale-completion'));
    final firstSaleUiMilliseconds = launchTimer.elapsedMilliseconds;
    expect(tester.takeException(), isNull);

    // A new Drift connection reopens the same app-private database after the
    // UI commit and verifies the durable receipt and its single stock effect.
    late final String savedReceiptId;
    final reopened = ShopDatabase.inPrivateDocuments(scope.documentsRoot);
    try {
      await reopened.verifyReadyForUse();
      expect(await reopened.countSales(), 1);
      final receipts = await reopened.readRecentSales();
      expect(receipts, hasLength(1));
      final receipt = receipts.single;
      savedReceiptId = receipt.id;
      expect(
        find.byKey(ValueKey('shop-sale-completion:$savedReceiptId')),
        findsOneWidget,
      );
      expect(receipt.paymentMethod, 'cash');
      expect(receipt.totalMmk, 2500);
      expect(receipt.cashTenderedMmk, 2500);
      expect(receipt.cashChangeMmk, 0);
      expect(receipt.lines, hasLength(1));
      final line = receipt.lines.single;
      expect(line.productId, productId);
      expect(line.productName, 'Tea');
      expect(line.unitPriceMmk, 2500);
      expect(line.quantity, 1);
      expect(line.lineTotalMmk, 2500);

      final saleEffects = await (reopened.select(
        reopened.shopStockMovements,
      )..where((movement) => movement.saleId.equals(receipt.id))).get();
      expect(saleEffects, hasLength(1));
      expect(saleEffects.single.quantityDelta, -1);
      final products = await reopened.readActiveProducts();
      expect(products, hasLength(1));
      expect(products.single.onHand, 2);
      expect(await reopened.readCounterSaleDraft(), isNull);
    } finally {
      await reopened.close();
    }
    final finalDatabaseAssertionsMilliseconds = launchTimer.elapsedMilliseconds;
    final savedReceiptButton = find.bySemanticsIdentifier(
      'shop.sale-completion.view-receipt',
    );
    await waitFor(savedReceiptButton);
    await tester.ensureVisible(savedReceiptButton);
    await waitFor(savedReceiptButton.hitTestable());
    final receiptTargetMinDp = expect48DpTarget(savedReceiptButton);
    await tapOnce(savedReceiptButton);
    final savedReceiptTitle = find.bySemanticsIdentifier('shop.saved-receipt');
    await waitFor(savedReceiptTitle);
    final receiptDialog = find.ancestor(
      of: savedReceiptTitle,
      matching: find.byType(AlertDialog),
    );
    expect(receiptDialog, findsOneWidget);
    expect(
      find.descendant(
        of: receiptDialog,
        matching: find.byWidgetPredicate(
          (widget) => widget is SelectableText && widget.data == savedReceiptId,
        ),
      ),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: receiptDialog,
        matching: find.text('Tea × ${shopNumber(1, myanmar: myanmar)}'),
      ),
      findsOneWidget,
    );
    final totalRow = find.ancestor(
      of: find.descendant(
        of: receiptDialog,
        matching: find.text(shopCopy(myanmar, 'Total', 'စုစုပေါင်း')),
      ),
      matching: find.byType(Row),
    );
    expect(totalRow, findsOneWidget);
    expect(
      find.descendant(
        of: totalRow,
        matching: find.text(shopMmk(2500, myanmar: myanmar)),
      ),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
    launchTimer.stop();
    binding.reportData = <String, dynamic>{
      'scenario': 'first_product_and_cash_sale',
      'locale': _locale,
      'productSeeded': false,
      'explicitTestTapCalls': explicitTapCalls,
      'textEntryCalls': textEntryCalls,
      'appMainToSaleCompletionMilliseconds': firstSaleUiMilliseconds,
      'appMainToFinalDatabaseAssertionsMilliseconds':
          finalDatabaseAssertionsMilliseconds,
      'appMainToSavedReceiptAssertionsMilliseconds':
          launchTimer.elapsedMilliseconds,
      'savedReceiptUiBoundToPersistedSale': true,
      'newConnectionSameOsProcess': true,
      'osProcessRestartProven': false,
      'merchantAcceptance': 'NOT_RUN',
      'promotionEligible': false,
      'tabletEvidence': <String, Object?>{
        'profileId': _tabletProfileId,
        'portrait': portraitBasketViewport,
        'landscape': landscapeViewport,
        'basketPreservedOnRotation': true,
        'basketLayoutBeforeRotation': basketLayoutBeforeRotation,
        'basketLayoutAfterRotation': basketLayoutAfterRotation,
        'crossLayoutTransferObserved':
            basketLayoutBeforeRotation != basketLayoutAfterRotation,
        'basketContentsBeforeRotation': basketBeforeRotation['contents']!,
        'basketContentsAfterRotation': basketAfterRotation['contents']!,
        'salesBeforeRotation': beforeRotation['sales']!,
        'salesAfterRotation': afterRotation['sales']!,
        'receiptsBeforeRotation': beforeRotation['receipts']!,
        'receiptsAfterRotation': afterRotation['receipts']!,
        'stockBeforeRotation': beforeRotation['stock']!,
        'stockAfterRotation': afterRotation['stock']!,
        'reviewTargetMinDpBeforeRotation': reviewTargetMinDpBeforeRotation,
        'reviewTargetMinDpAfterRotation': reviewTargetMinDpAfterRotation,
        'cashTargetMinDpBeforeRotation': cashTargetMinDpBeforeRotation,
        'cashTargetMinDpAfterRotation': cashTargetMinDpAfterRotation,
        'confirmTargetMinDp': confirmTargetMinDp,
        'receiptTargetMinDp': receiptTargetMinDp,
        'imeStatus': imeStatus,
        'imeViewInsetsBottom': imeViewport['viewInsetsBottom']!,
        'dialogReachable': true,
        'primaryCtaReachable': true,
      },
    };
  });
}
