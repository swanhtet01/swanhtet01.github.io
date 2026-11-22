import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:supermega_shop/main.dart' as shop;
import 'package:supermega_shop/shop_copy.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_runtime_profile.dart';
import 'package:supermega_shop/shop_runtime_scope.dart';

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
    expect(const {'en', 'my'}, contains(_locale));

    final myanmar = _locale == 'my';
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

    await tapOnce(find.byKey(ValueKey('shop-catalog-row:$productId')));
    await tester.pumpAndSettle(
      const Duration(milliseconds: 100),
      EnginePhase.sendSemanticsUpdate,
      const Duration(seconds: 20),
    );
    await tapOnce(
      find.textContaining(shopCopy(myanmar, 'Review sale', 'အရောင်းစစ်ရန်')),
    );
    await tester.pumpAndSettle(
      const Duration(milliseconds: 100),
      EnginePhase.sendSemanticsUpdate,
      const Duration(seconds: 20),
    );

    final cashSale = find.text(shopCopy(myanmar, 'Cash sale', 'ငွေသား'));
    await tester.ensureVisible(cashSale);
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
    await tester.enterText(
      find.byKey(const ValueKey('shop-cash-given')),
      '2500',
    );
    textEntryCalls += 1;
    await tester.pumpAndSettle(
      const Duration(milliseconds: 100),
      EnginePhase.sendSemanticsUpdate,
      const Duration(seconds: 20),
    );
    final confirm = find.text(shopCopy(myanmar, 'Complete sale', 'အတည်ပြုရန်'));
    await tester.ensureVisible(confirm);
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
    await tapId('shop.sale-completion.view-receipt');
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
    };
  });
}
