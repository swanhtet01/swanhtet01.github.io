import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:cryptography/cryptography.dart';
import 'package:drift/drift.dart' hide isNotNull, isNull;
import 'package:drift/native.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:supermega_shop/camera_barcode_scanner.dart';
import 'package:supermega_shop/connected_orders_screen.dart';
import 'package:supermega_shop/main.dart';
import 'package:supermega_shop/menu_import_screen.dart';
import 'package:supermega_shop/printer_setup_screen.dart';
import 'package:supermega_shop/printer_services.dart';
import 'package:supermega_shop/recent_sales_screen.dart';
import 'package:supermega_shop/shop_copy.dart';
import 'package:supermega_shop/shop_correction_authorization_service.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_models.dart';
import 'package:supermega_shop/shop_runtime_profile.dart';
import 'package:supermega_shop/shop_today_screen.dart';
import 'package:supermega_shop/stock_screen.dart';
import 'package:supermega_shop/wallet_setup_screen.dart';

const _widgetCorrectionKeyId = 'shop-test-2026';
const _widgetCorrectionPublicKey =
    'A6EHv_POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg';
final _widgetCorrectionReceiptVerifier = ShopCorrectionReceiptVerifier({
  _widgetCorrectionKeyId: _widgetCorrectionPublicKey,
});

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

Future<int> _settleStock(WidgetTester tester) => tester.pumpAndSettle(
  const Duration(milliseconds: 100),
  EnginePhase.sendSemanticsUpdate,
  const Duration(seconds: 5),
);

void main() {
  test(
    'ShopHome injected callbacks require an explicit missing-scope seam',
    () {
      final database = ShopDatabase(NativeDatabase.memory());
      addTearDown(database.close);

      expect(
        () => ShopHome(
          database: database,
          authClient: null,
          apiBaseUrl: 'https://example.invalid',
          myanmar: false,
          onLanguageChanged: (_) {},
          runtimeCapabilities: ShopRuntimeCapabilities.production,
          cameraViewBuilder: (_, _, _) => const SizedBox(),
          receiptPrintSender: (_, _, _) async {},
        ),
        throwsStateError,
      );
    },
  );

  testWidgets('an injected camera view cannot bypass a missing scope', (
    tester,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: CameraBarcodeScanner(
          myanmar: false,
          cameraViewBuilder: (_, _, _) => const SizedBox(),
        ),
      ),
    );

    expect(tester.takeException(), isA<StateError>());
  });

  test('every routed capability screen rejects a missing runtime scope', () {
    final database = ShopDatabase(NativeDatabase.memory());
    addTearDown(database.close);

    final constructors = <Widget Function()>[
      () => ShopApp(
        database: database,
        authClient: null,
        apiBaseUrl: 'https://example.invalid',
        initialMyanmar: false,
      ),
      () => ShopSettingsScreen(
        database: database,
        myanmar: false,
        onLanguageChanged: (_) {},
      ),
      () => ConnectedOrdersScreen(
        myanmar: false,
        authClient: null,
        apiBaseUrl: 'https://example.invalid',
      ),
      () => MenuImportScreen(
        database: database,
        authClient: null,
        apiBaseUrl: 'https://example.invalid',
        myanmar: false,
      ),
      () => PrinterSetupScreen(myanmar: false),
      () => RecentSalesScreen(database: database, myanmar: false),
    ];

    for (final construct in constructors) {
      expect(construct, throwsStateError);
    }
  });

  for (final myanmar in [false, true]) {
    testWidgets(
      'cashier holds and reopens a local sale in ${myanmar ? 'MY' : 'EN'}',
      (tester) async {
        _usePhoneViewport(tester);
        final database = ShopDatabase(NativeDatabase.memory());
        try {
          await database.addProduct(
            id: 'tea',
            name: 'Tea',
            priceMmk: 2500,
            openingStock: 3,
          );
          await tester.pumpWidget(
            MaterialApp(
              home: ShopHome(
                testOnlyAllowMissingRuntimeScope: true,
                database: database,
                authClient: null,
                apiBaseUrl: 'https://example.invalid',
                myanmar: myanmar,
                onLanguageChanged: (_) {},
              ),
            ),
          );
          await tester.pumpAndSettle();
          await tester.tap(find.byKey(const ValueKey('shop-catalog-row:tea')));
          await tester.pumpAndSettle();
          final original = await database.readCounterSaleDraft();
          expect(original?.quantities, {'tea': 1});
          await tester.tap(
            find.textContaining(myanmar ? 'အရောင်းစစ်ရန်' : 'Review sale'),
          );
          await tester.pumpAndSettle();
          expect(
            find.text(myanmar ? 'အရောင်း ခဏသိမ်း' : 'Hold sale'),
            findsOneWidget,
          );
          await tester.ensureVisible(
            find.byKey(const ValueKey('shop-hold-sale')),
          );
          await tester.tap(find.byKey(const ValueKey('shop-hold-sale')));
          await tester.pumpAndSettle();
          await tester.enterText(
            find.byKey(const ValueKey('shop-held-sale-name')),
            'Customer A',
          );
          await tester.pumpAndSettle();
          await tester.tap(
            find.byKey(const ValueKey('shop-held-sale-confirm')),
          );
          await tester.pumpAndSettle();
          expect(await database.readCounterSaleDraft(), isNull);
          expect(
            (await database.readHeldSaleTickets()).single.draft.operationId,
            original!.operationId,
          );
          expect((await database.readActiveProducts()).single.onHand, 3);
          expect(await database.countSales(), 0);

          await tester.tap(find.byKey(const ValueKey('shop-held-sales-open')));
          await tester.pumpAndSettle();
          expect(find.textContaining('Customer A'), findsOneWidget);
          final ticket = (await database.readHeldSaleTickets()).single;
          await tester.tap(
            find.byKey(ValueKey('shop-held-reopen:${ticket.id}')),
          );
          await tester.pumpAndSettle();
          expect(
            (await database.readCounterSaleDraft())?.operationId,
            original.operationId,
          );
          expect(await database.readHeldSaleTickets(), isEmpty);
          expect(tester.takeException(), isNull);
        } finally {
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump(const Duration(milliseconds: 1));
          await database.close();
        }
      },
    );
  }

  testWidgets('held-sale picker fits a 320px phone at enlarged text', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 800);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 1.5;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'tea',
        name: 'Tea',
        priceMmk: 2500,
        openingStock: 3,
      );
      await database.saveCounterSaleDraft(
        operationId: 'held-compact',
        quantities: const {'tea': 1},
      );
      await database.holdCounterSaleDraft(
        id: 'compact-ticket',
        name: 'Customer May',
        operationId: 'held-compact',
      );
      await tester.pumpWidget(
        MaterialApp(
          home: ShopHome(
            testOnlyAllowMissingRuntimeScope: true,
            database: database,
            authClient: null,
            apiBaseUrl: 'https://example.invalid',
            myanmar: true,
            onLanguageChanged: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('shop-held-sales-open')));
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('shop-held-reopen:compact-ticket')),
        findsOneWidget,
      );
      final resumeLabel = find.byKey(
        const ValueKey('shop-held-resume-label:compact-ticket'),
      );
      expect(resumeLabel, findsOneWidget);
      expect(find.textContaining('ပြန်ဖွင့်'), findsOneWidget);
      expect(
        tester
            .getSize(
              find.byKey(const ValueKey('shop-held-reopen:compact-ticket')),
            )
            .height,
        greaterThanOrEqualTo(48),
      );
      expect(tester.takeException(), isNull);
      await tester.tap(
        find.byKey(const ValueKey('shop-held-reopen:compact-ticket')),
      );
      await tester.pumpAndSettle();
      expect(
        (await database.readCounterSaleDraft())?.operationId,
        'held-compact',
      );
      expect(await database.readHeldSaleTickets(), isEmpty);
      await tester.ensureVisible(find.textContaining('အရောင်းစစ်ရန်'));
      await tester.tap(find.textContaining('အရောင်းစစ်ရန်'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byKey(const ValueKey('shop-hold-sale')));
      expect(find.text('အရောင်း ခဏသိမ်း'), findsOneWidget);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('reopened held sale waits when another sale used its stock', (
    tester,
  ) async {
    _usePhoneViewport(tester);
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'tea',
        name: 'Tea',
        priceMmk: 2500,
        openingStock: 4,
      );
      await database.saveCounterSaleDraft(
        operationId: 'held-stock-a',
        quantities: const {'tea': 3},
      );
      await database.holdCounterSaleDraft(
        id: 'held-stock-ticket',
        name: 'Customer A',
        operationId: 'held-stock-a',
      );
      await database.recordSale(
        operationId: 'other-customer',
        paymentMethod: 'cash',
        lines: const [ShopSaleLineInput(productId: 'tea', quantity: 2)],
      );
      await tester.pumpWidget(
        MaterialApp(
          home: ShopHome(
            testOnlyAllowMissingRuntimeScope: true,
            database: database,
            authClient: null,
            apiBaseUrl: 'https://example.invalid',
            myanmar: false,
            onLanguageChanged: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('shop-held-sales-open')));
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey('shop-held-reopen:held-stock-ticket')),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('Review sale'));
      await tester.pumpAndSettle();
      expect(find.text('Only 2 available'), findsOneWidget);
      expect(
        find.text(
          'Stock changed. Match this sale to available quantities before payment.',
        ),
        findsOneWidget,
      );
      final matchStock = find.byKey(
        const ValueKey('shop-match-available-stock'),
      );
      expect(matchStock, findsOneWidget);
      final primaryFocus = FocusManager.instance.primaryFocus;
      expect(primaryFocus?.context, isNotNull);
      expect(
        find.ancestor(
          of: find.byElementPredicate(
            (element) => element == primaryFocus!.context,
          ),
          matching: matchStock,
        ),
        findsOneWidget,
      );
      expect(
        find.text('Sale restored. Review changed items before checkout.'),
        findsNothing,
      );
      expect(
        tester
            .widget<FilledButton>(
              find.ancestor(
                of: find.text('Cash sale'),
                matching: find.byType(FilledButton),
              ),
            )
            .onPressed,
        isNull,
      );
      expect(await database.countSales(), 1);
      await tester.tap(find.text('Match available stock'));
      await tester.pumpAndSettle();
      expect((await database.readCounterSaleDraft())?.quantities, {'tea': 2});
      expect(
        tester
            .widget<FilledButton>(
              find.ancestor(
                of: find.text('Cash sale'),
                matching: find.byType(FilledButton),
              ),
            )
            .onPressed,
        isNotNull,
      );
      expect(await database.countSales(), 1);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('Windows scanner focus returns after switching tasks', (
    tester,
  ) async {
    final previousPlatform = debugDefaultTargetPlatformOverride;
    debugDefaultTargetPlatformOverride = TargetPlatform.windows;
    tester.view.physicalSize = const Size(1200, 900);
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
          testOnlyAllowMissingRuntimeScope: true,
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          initialMyanmar: false,
        ),
      );
      await tester.pumpAndSettle();

      Future<void> visit(String label) async {
        await tester.tap(
          find.descendant(
            of: find.byType(NavigationRail),
            matching: find.text(label),
          ),
        );
        await tester.pumpAndSettle();
      }

      await visit('Sell');
      expect(find.byKey(const ValueKey('shop-camera-scan')), findsNothing);
      expect(
        tester
            .widget<EditableText>(find.byType(EditableText))
            .focusNode
            .hasFocus,
        isTrue,
      );
      await visit('Sales');
      await visit('Sell');
      expect(
        tester
            .widget<EditableText>(find.byType(EditableText))
            .focusNode
            .hasFocus,
        isTrue,
      );
      await visit('Settings');
      expect(find.byType(ShopSettingsScreen), findsOneWidget);
      await tester.pageBack();
      await tester.pumpAndSettle();
      expect(
        tester
            .widget<EditableText>(find.byType(EditableText))
            .focusNode
            .hasFocus,
        isTrue,
      );
      tester.testTextInput.enterText('111111');
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      expect((await database.readCounterSaleDraft())?.quantities, {'tea': 1});
      expect(tester.takeException(), isNull);
    } finally {
      debugDefaultTargetPlatformOverride = previousPlatform;
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('camera frames add one known barcode to the offline sale draft', (
    tester,
  ) async {
    _usePhoneViewport(tester);
    final previousPlatform = debugDefaultTargetPlatformOverride;
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'tea',
        name: 'Tea',
        barcode: '0012345678905',
        priceMmk: 2500,
        openingStock: 3,
      );
      await tester.pumpWidget(
        MaterialApp(
          home: ShopHome(
            testOnlyAllowMissingRuntimeScope: true,
            database: database,
            authClient: null,
            apiBaseUrl: 'https://example.invalid',
            myanmar: false,
            onLanguageChanged: (_) {},
            runtimeCapabilities: ShopRuntimeCapabilities.production,
            cameraViewBuilder: (context, onScanned, onError) => Center(
              child: FilledButton(
                key: const ValueKey('fake-camera-detect'),
                onPressed: () {
                  onScanned('0012345678905');
                  onScanned('0012345678905');
                },
                child: const Text('Detect'),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('shop-camera-scan')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('fake-camera-detect')));
      await tester.pumpAndSettle();
      expect((await database.readCounterSaleDraft())?.quantities, {'tea': 1});
      expect(await database.countSales(), 0);
      expect(tester.takeException(), isNull);
    } finally {
      debugDefaultTargetPlatformOverride = previousPlatform;
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('unknown camera barcode opens Add product with its code', (
    tester,
  ) async {
    _usePhoneViewport(tester);
    final previousPlatform = debugDefaultTargetPlatformOverride;
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await tester.pumpWidget(
        MaterialApp(
          home: ShopHome(
            testOnlyAllowMissingRuntimeScope: true,
            database: database,
            authClient: null,
            apiBaseUrl: 'https://example.invalid',
            myanmar: false,
            onLanguageChanged: (_) {},
            runtimeCapabilities: ShopRuntimeCapabilities.production,
            cameraViewBuilder: (context, onScanned, onError) => Center(
              child: FilledButton(
                key: const ValueKey('fake-camera-detect'),
                onPressed: () => onScanned('SKU-NEW-1'),
                child: const Text('Detect'),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('shop-camera-scan')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('fake-camera-detect')));
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsOneWidget);
      expect(
        tester
            .widget<TextFormField>(
              find.byKey(const ValueKey('shop-product-barcode')),
            )
            .controller!
            .text,
        'SKU-NEW-1',
      );
      expect(await database.readCounterSaleDraft(), isNull);
      expect(await database.countSales(), 0);
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(await database.readCounterSaleDraft(), isNull);
      expect(tester.takeException(), isNull);
    } finally {
      debugDefaultTargetPlatformOverride = previousPlatform;
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('camera member card scan stays out of product creation', (
    tester,
  ) async {
    _usePhoneViewport(tester);
    final previousPlatform = debugDefaultTargetPlatformOverride;
    debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      const memberToken = 'SMC1.AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8';
      await tester.pumpWidget(
        MaterialApp(
          home: ShopHome(
            testOnlyAllowMissingRuntimeScope: true,
            database: database,
            authClient: null,
            apiBaseUrl: 'https://example.invalid',
            myanmar: false,
            onLanguageChanged: (_) {},
            runtimeCapabilities: ShopRuntimeCapabilities.production,
            cameraViewBuilder: (context, onScanned, onError) => Center(
              child: FilledButton(
                key: const ValueKey('fake-camera-member-detect'),
                onPressed: () => onScanned(memberToken),
                child: const Text('Detect member'),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('shop-camera-scan')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('fake-camera-member-detect')));
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsNothing);
      expect(
        find.text('Use Add member in checkout for member cards.'),
        findsOneWidget,
      );
      expect(await database.readActiveProducts(), isEmpty);
      expect(await database.readCounterSaleDraft(), isNull);
      expect(await database.countSales(), 0);
      expect(tester.takeException(), isNull);
    } finally {
      debugDefaultTargetPlatformOverride = previousPlatform;
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('cancel and camera denial return to Sell without a sale write', (
    tester,
  ) async {
    _usePhoneViewport(tester);
    final previousPlatform = debugDefaultTargetPlatformOverride;
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await tester.pumpWidget(
        MaterialApp(
          home: ShopHome(
            testOnlyAllowMissingRuntimeScope: true,
            database: database,
            authClient: null,
            apiBaseUrl: 'https://example.invalid',
            myanmar: false,
            onLanguageChanged: (_) {},
            runtimeCapabilities: ShopRuntimeCapabilities.production,
            cameraViewBuilder: (context, onScanned, onError) => Center(
              child: FilledButton(
                key: const ValueKey('fake-camera-deny'),
                onPressed: () =>
                    onError(MobileScannerErrorCode.permissionDenied),
                child: const Text('Deny camera'),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('shop-camera-scan')));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Cancel scan'));
      await tester.pumpAndSettle();
      expect(find.text('Products'), findsOneWidget);
      expect(await database.readCounterSaleDraft(), isNull);

      await tester.tap(find.byKey(const ValueKey('shop-camera-scan')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('fake-camera-deny')));
      await tester.pumpAndSettle();
      expect(
        find.text('Camera access was denied. No item was added.'),
        findsOneWidget,
      );
      await tester.tap(find.text('Return to Sell'));
      await tester.pumpAndSettle();
      expect(find.text('Products'), findsOneWidget);
      expect(await database.readCounterSaleDraft(), isNull);
      expect(await database.countSales(), 0);
      expect(tester.takeException(), isNull);
    } finally {
      debugDefaultTargetPlatformOverride = previousPlatform;
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets(
    'task shell preserves sale and selected navigation at each size',
    (tester) async {
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      tester.view.devicePixelRatio = 1;
      const english = ['Today', 'Sell', 'Sales', 'Stock'];
      const burmese = ['ယနေ့', 'ရောင်းရန်', 'အရောင်း', 'လက်ကျန်'];
      for (final width in [320.0, 820.0, 1200.0]) {
        for (final myanmar in [false, true]) {
          tester.view.physicalSize = Size(width, 900);
          tester.platformDispatcher.textScaleFactorTestValue = width == 320
              ? 1.3
              : 1.0;
          final labels = myanmar ? burmese : english;
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
                testOnlyAllowMissingRuntimeScope: true,
                database: database,
                authClient: null,
                apiBaseUrl: 'https://app.supermega.dev',
                initialMyanmar: myanmar,
              ),
            );
            await tester.pumpAndSettle();
            expect(tester.takeException(), isNull);

            Future<void> select(int index) async {
              final navigation = width >= 1100
                  ? find.byType(NavigationRail)
                  : find.byType(NavigationBar);
              expect(navigation, findsOneWidget);
              await tester.tap(
                find.descendant(
                  of: navigation,
                  matching: find.text(labels[index]),
                ),
              );
              await tester.pumpAndSettle();
              if (width >= 1100) {
                expect(
                  tester.widget<NavigationRail>(navigation).selectedIndex,
                  index,
                );
              } else {
                expect(
                  tester.widget<NavigationBar>(navigation).selectedIndex,
                  index,
                );
              }
              if (index == 1) {
                expect(
                  find.text(myanmar ? 'ကုန်ပစ္စည်းများ' : 'Products'),
                  findsOneWidget,
                );
              } else {
                expect(
                  find.descendant(
                    of: find.byType(ShopTaskPageHeader),
                    matching: find.text(labels[index]),
                  ),
                  findsOneWidget,
                );
              }
              expect(tester.takeException(), isNull);
            }

            await select(1);
            await tester.enterText(find.byType(TextField).first, '111111');
            await tester.testTextInput.receiveAction(TextInputAction.done);
            await tester.pumpAndSettle();
            expect((await database.readCounterSaleDraft())?.quantities, {
              'tea': 1,
            });
            await select(3);
            expect(find.byKey(const ValueKey('stock-search')), findsOneWidget);
            await select(2);
            expect(find.byType(RecentSalesScreen), findsOneWidget);
            await select(0);
            await select(1);
            expect((await database.readCounterSaleDraft())?.quantities, {
              'tea': 1,
            });
            expect(await database.countSales(), 0);
            if (width >= 1100) {
              await tester.tap(
                find.descendant(
                  of: find.byType(NavigationRail),
                  matching: find.text(myanmar ? 'ဆက်တင်များ' : 'Settings'),
                ),
              );
              await tester.pumpAndSettle();
              expect(find.byType(ShopSettingsScreen), findsOneWidget);
              Navigator.of(tester.element(find.byType(ShopSettingsScreen)))
                  .pop();
              await tester.pumpAndSettle();
              expect(
                tester
                    .widget<NavigationRail>(find.byType(NavigationRail))
                    .selectedIndex,
                1,
              );
              expect(tester.takeException(), isNull);
            }
          } finally {
            await tester.pumpWidget(const SizedBox.shrink());
            await tester.pump(const Duration(milliseconds: 1));
            await database.close();
          }
        }
      }
    },
  );

  testWidgets('Stock adds a product without switching tasks or making a sale', (
    tester,
  ) async {
    _usePhoneViewport(tester);
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await tester.pumpWidget(
        ShopApp(
          testOnlyAllowMissingRuntimeScope: true,
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          initialMyanmar: false,
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.descendant(
          of: find.byType(NavigationBar),
          matching: find.text('Stock'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('No products yet'), findsOneWidget);
      await tester.tap(find.byKey(const ValueKey('stock-add-product')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('shop-product-name')),
        'Tea 500 g',
      );
      expect(find.byKey(const ValueKey('shop-product-barcode')), findsNothing);
      await tester.tap(find.byKey(const ValueKey('shop-product-add-barcode')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('shop-product-barcode')),
        '1234567890123',
      );
      await tester.enterText(
        find.byKey(const ValueKey('shop-product-price')),
        '3500',
      );
      await tester.enterText(
        find.byKey(const ValueKey('shop-product-stock')),
        '8',
      );
      await tester.tap(find.text('Save product'));
      await tester.pumpAndSettle();
      expect(find.text('Tea 500 g'), findsOneWidget);
      expect(find.byKey(const ValueKey('stock-add-product')), findsOneWidget);
      expect((await database.readActiveProducts()).single.onHand, 8);
      expect(await database.countSales(), 0);
      await tester.tap(
        find.descendant(
          of: find.byType(NavigationBar),
          matching: find.text('Sell'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Tea 500 g'), findsOneWidget);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

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
            testOnlyAllowMissingRuntimeScope: true,
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
          myanmar ? 'NotoSansMyanmarUI' : 'Inter',
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
        expect(
          find.descendant(of: find.byType(AppBar), matching: find.text('Shop')),
          findsOneWidget,
        );
        expect(find.text('SuperMega Shop'), findsNothing);
        expect(find.text('SuperMega ဆိုင်'), findsNothing);
        expect(find.text(myanmar ? 'ရောင်းရန်' : 'Sell'), findsOneWidget);
        if (width >= 1100) {
          expect(
            find.text(myanmar ? 'ဆက်တင်များ' : 'Settings'),
            findsOneWidget,
          );
        } else {
          expect(
            find.byTooltip(myanmar ? 'ဆက်တင်များ' : 'Settings'),
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
          find.text(myanmar ? 'ယနေ့အသားတင်ရောင်းအား' : 'Net sales today'),
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
          testOnlyAllowMissingRuntimeScope: true,
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
      expect(find.text('Sales recorded'), findsOneWidget);
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

  testWidgets('compact Today shows one low-stock action and recent sales', (
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
          testOnlyAllowMissingRuntimeScope: true,
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          initialMyanmar: false,
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Recent sales'), findsOneWidget);
      expect(find.text('Check stock'), findsOneWidget);
      expect(
        tester.getTopLeft(find.text('Check stock')).dy,
        lessThan(tester.getTopLeft(find.text('Recent sales')).dy),
      );
      expect(
        tester.getTopLeft(find.text('Net sales today')).dy,
        lessThan(tester.getTopLeft(find.text('Recent sales')).dy),
      );
      expect(find.text('Stock to check'), findsNothing);
      await tester.ensureVisible(find.text('Check stock'));
      await tester.tap(find.text('Check stock'));
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

  for (final width in [320.0, 390.0]) {
    for (final myanmar in [false, true]) {
      testWidgets(
        '${width.toInt()}px ${myanmar ? 'Burmese' : 'English'} Today puts totals and stock action above navigation',
        (tester) async {
          tester.view.physicalSize = Size(width, 800);
          tester.view.devicePixelRatio = 1;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          final database = ShopDatabase(NativeDatabase.memory());
          try {
            await database.addProduct(
              id: 'tea',
              name: 'Tea',
              priceMmk: 2500,
              openingStock: 2,
            );
            await database.recordCashSale(
              operationId: 'compact-today-sale',
              lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
            );
            await tester.pumpWidget(
              ShopApp(
                testOnlyAllowMissingRuntimeScope: true,
                database: database,
                authClient: null,
                apiBaseUrl: 'https://example.invalid',
                initialMyanmar: myanmar,
              ),
            );
            await tester.pumpAndSettle();

            final navigationTop = tester
                .getTopLeft(find.byType(NavigationBar))
                .dy;
            for (final label in [
              myanmar ? 'ယနေ့အသားတင်ရောင်းအား' : 'Net sales today',
              myanmar ? 'မှတ်တမ်းတင်ထားသောအရောင်း' : 'Sales recorded',
              myanmar ? 'လက်ကျန်နည်း' : 'Low stock',
              myanmar ? 'လက်ကျန်စစ်ရန်' : 'Check stock',
            ]) {
              expect(find.text(label), findsOneWidget);
              expect(
                tester.getBottomRight(find.text(label)).dy,
                lessThan(navigationTop),
              );
            }
            final stockAction = find.byTooltip(
              myanmar ? 'လက်ကျန်ဖွင့်ရန်' : 'Open stock',
            );
            expect(
              tester.getSize(stockAction).height,
              greaterThanOrEqualTo(44),
            );
            expect(
              find.text(myanmar ? 'အရောင်းအသစ်' : 'New sale'),
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
    }
  }

  testWidgets('320px Burmese Today keeps a large sale readable', (
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
      id: 'mama',
      name: 'MAMA ကြက်သား အမြန်ခေါက်ဆွဲ',
      priceMmk: 12450000,
      openingStock: 8,
    );
    await database.recordCashSale(
      operationId: 'today-narrow-burmese-sale',
      lines: const [ShopSaleLineInput(productId: 'mama', quantity: 1)],
    );
    await tester.pumpWidget(
      ShopApp(
        testOnlyAllowMissingRuntimeScope: true,
        database: database,
        authClient: null,
        apiBaseUrl: 'https://example.invalid',
        initialMyanmar: true,
      ),
    );
    await tester.pumpAndSettle();

    final salesTotal = find.textContaining('၁၂,၄၅၀,၀၀၀').first;
    expect(
      tester.getBottomRight(salesTotal).dy,
      lessThan(tester.getTopLeft(find.byType(NavigationBar)).dy),
    );
    final latestItem = find.textContaining('MAMA ကြက်သား');
    expect(latestItem, findsOneWidget);
    expect(
      tester.getTopLeft(salesTotal).dy,
      lessThan(tester.getTopLeft(latestItem).dy),
    );
    await tester.ensureVisible(latestItem);
    await tester.pumpAndSettle();
    expect(find.byTooltip('အရောင်းကြည့်ရန်'), findsOneWidget);
    expect(find.textContaining('၁၂,၄၅၀,၀၀၀'), findsWidgets);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Today follows each product alert rather than a fixed five', (
    tester,
  ) async {
    _usePhoneViewport(tester);
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'custom',
        name: 'Custom alert',
        priceMmk: 1000,
        openingStock: 8,
      );
      await database.addProduct(
        id: 'disabled',
        name: 'Alert off',
        priceMmk: 1000,
        openingStock: 2,
      );
      await database.setReorderLevel(
        productId: 'custom',
        expectedReorderLevel: 5,
        reorderLevel: 10,
      );
      await database.setReorderLevel(
        productId: 'disabled',
        expectedReorderLevel: 5,
        reorderLevel: null,
      );
      await tester.pumpWidget(
        ShopApp(
          testOnlyAllowMissingRuntimeScope: true,
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          initialMyanmar: false,
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Check stock'), findsOneWidget);
      expect(find.textContaining('Custom alert · 8'), findsOneWidget);
      expect(find.textContaining('Alert off · 2'), findsNothing);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('stock alert setting works in English and Burmese', (
    tester,
  ) async {
    for (final myanmar in [false, true]) {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await database.addProduct(
          id: 'rice',
          name: 'Rice',
          priceMmk: 12000,
          openingStock: 8,
        );
        await tester.pumpWidget(
          MaterialApp(
            home: StockScreen(database: database, myanmar: myanmar),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const ValueKey('stock-update-rice')));
        await tester.pumpAndSettle();
        expect(
          find.text(myanmar ? '၅ ခုနှင့်အောက်' : 'At 5 units or less'),
          findsOneWidget,
        );
        await tester.tap(find.byKey(const ValueKey('stock-alert-edit')));
        await tester.pumpAndSettle();
        expect(find.byType(AlertDialog), findsOneWidget);
        expect(
          find.text(myanmar ? 'ပိတ်ရန် ဗလာထားပါ။' : 'Leave empty to turn off.'),
          findsOneWidget,
        );
        await tester.enterText(
          find.byKey(const ValueKey('reorder-level-input')),
          myanmar ? '၁၀' : '10',
        );
        await tester.tap(find.text(myanmar ? 'လက်ကျန်သိမ်းရန်' : 'Save stock'));
        await tester.pumpAndSettle();
        expect(
          find.text(
            myanmar
                ? 'သတိပေးချက်ပြောင်းလဲမှုကို အရင်သိမ်းပါ။'
                : 'Save the alert change first.',
          ),
          findsOneWidget,
        );
        expect((await database.readActiveProducts()).single.reorderLevel, 5);
        await tester.tap(
          find.text(myanmar ? 'သတိပေးချက်သိမ်းရန်' : 'Save alert'),
        );
        await tester.pumpAndSettle();
        expect((await database.readActiveProducts()).single.reorderLevel, 10);
        expect((await database.readActiveProducts()).single.onHand, 8);
        expect(await database.countStockMovements(), 1);
        await tester.tap(find.byKey(const ValueKey('stock-alert-edit')));
        await tester.pumpAndSettle();
        await tester.enterText(
          find.byKey(const ValueKey('reorder-level-input')),
          '',
        );
        await tester.tap(
          find.text(myanmar ? 'သတိပေးချက်သိမ်းရန်' : 'Save alert'),
        );
        await tester.pumpAndSettle();
        expect(
          (await database.readActiveProducts()).single.reorderLevel,
          isNull,
        );
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump(const Duration(milliseconds: 1));
        await database.close();
      }
    }
  });

  testWidgets('stock counts use Burmese digits on tablet', (tester) async {
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(820, 800);
    final database = ShopDatabase(NativeDatabase.memory());
    addTearDown(database.close);
    await database.addProduct(
      id: 'rice',
      name: 'Rice',
      priceMmk: 12000,
      openingStock: 8,
    );
    await database.addProduct(
      id: 'tea',
      name: 'Tea',
      priceMmk: 2500,
      openingStock: 4,
    );
    await tester.pumpWidget(
      MaterialApp(home: StockScreen(database: database, myanmar: true)),
    );
    await tester.pumpAndSettle();
    expect(find.text('ကုန်ပစ္စည်း ၂ မျိုး'), findsOneWidget);
    await tester.enterText(find.byKey(const ValueKey('stock-search')), 'Rice');
    await tester.pumpAndSettle();
    expect(find.text('ကိုက်ညီမှု ၁ ခု'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 1));
  });

  testWidgets(
    'Stock shows only active low-stock thresholds on phone and tablet',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      for (final (width, myanmar) in [(320.0, true), (820.0, false)]) {
        tester.view.physicalSize = Size(width, 900);
        final database = ShopDatabase(NativeDatabase.memory());
        try {
          await database.addProduct(
            id: 'low',
            name: 'Low item',
            priceMmk: 3000,
            openingStock: 3,
          );
          await database.addProduct(
            id: 'healthy',
            name: 'Healthy item',
            priceMmk: 4000,
            openingStock: 8,
          );
          await tester.pumpWidget(
            MaterialApp(
              home: StockScreen(database: database, myanmar: myanmar),
            ),
          );
          await tester.pumpAndSettle();
          expect(
            find.text(myanmar ? 'ပြန်မှာရန်: ၅ ခု' : 'Reorder at 5'),
            findsOneWidget,
          );
          expect(tester.takeException(), isNull);
        } finally {
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump(const Duration(milliseconds: 1));
          await database.close();
        }
      }
    },
  );

  testWidgets('Stock puts a reorder item before a lower healthy count', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 1.5;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'healthy',
        name: 'Healthy item',
        priceMmk: 3000,
        openingStock: 2,
      );
      await database.addProduct(
        id: 'needs-order',
        name: 'Needs order',
        priceMmk: 3000,
        openingStock: 20,
      );
      await database.addProduct(
        id: 'out',
        name: 'Out of stock',
        priceMmk: 3000,
        openingStock: 0,
      );
      await database.setReorderLevel(
        productId: 'healthy',
        expectedReorderLevel: 5,
        reorderLevel: null,
      );
      await database.setReorderLevel(
        productId: 'needs-order',
        expectedReorderLevel: 5,
        reorderLevel: 30,
      );
      await database.setReorderLevel(
        productId: 'out',
        expectedReorderLevel: 5,
        reorderLevel: null,
      );
      await tester.pumpWidget(
        MaterialApp(home: StockScreen(database: database, myanmar: false)),
      );
      await tester.pumpAndSettle();
      expect(
        tester.getTopLeft(find.byKey(const ValueKey('stock-row-out'))).dy,
        lessThan(
          tester
              .getTopLeft(find.byKey(const ValueKey('stock-row-needs-order')))
              .dy,
        ),
      );
      expect(
        tester
            .getTopLeft(find.byKey(const ValueKey('stock-row-needs-order')))
            .dy,
        lessThan(
          tester.getTopLeft(find.byKey(const ValueKey('stock-row-healthy'))).dy,
        ),
      );
      expect(find.text('20 in stock'), findsOneWidget);
      expect(find.text('0 in stock'), findsOneWidget);
      expect(find.text('Reorder at 30'), findsOneWidget);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('unfinished sale opens from Today after app restart', (
    tester,
  ) async {
    _usePhoneViewport(tester);
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'tea',
        name: 'Tea',
        barcode: '111111',
        priceMmk: 2500,
        openingStock: 3,
      );
      await database.saveCounterSaleDraft(
        operationId: 'counter-before-restart',
        quantities: const {'tea': 2},
      );
      await tester.pumpWidget(
        ShopApp(
          testOnlyAllowMissingRuntimeScope: true,
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          initialMyanmar: false,
        ),
      );
      await tester.pumpAndSettle();
      expect((await database.readCounterSaleDraft())?.quantities, {'tea': 2});
      expect((await database.readActiveProducts()).single.onHand, 3);
      expect(await database.countSales(), 0);

      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump();
      await tester.pumpWidget(
        ShopApp(
          testOnlyAllowMissingRuntimeScope: true,
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          initialMyanmar: false,
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Continue sale'), findsOneWidget);
      expect(find.text('New sale'), findsNothing);
      expect(find.text('Unfinished sale'), findsNothing);
      await tester.tap(find.text('Continue sale'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Review sale · 2 · 5,000 MMK'),
        findsOneWidget,
      );
      expect(
        find.text('Unfinished sale restored on this device.'),
        findsNothing,
      );
      await tester.tap(find.textContaining('Review sale · 2 · 5,000 MMK'));
      await tester.pumpAndSettle();
      final restoredNotice = find.text(
        'Unfinished sale restored on this device.',
      );
      expect(restoredNotice, findsOneWidget);
      Navigator.of(tester.element(restoredNotice)).pop();
      await tester.pumpAndSettle();
      expect(restoredNotice, findsNothing);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('Burmese tablet Today continues one saved sale', (tester) async {
    tester.view.physicalSize = const Size(820, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'water',
        name: 'ရေသန့်',
        priceMmk: 1500,
        openingStock: 5,
      );
      await database.saveCounterSaleDraft(
        operationId: 'burmese-saved-sale',
        quantities: const {'water': 2},
      );
      await tester.pumpWidget(
        ShopApp(
          testOnlyAllowMissingRuntimeScope: true,
          database: database,
          authClient: null,
          apiBaseUrl: 'https://example.invalid',
          initialMyanmar: true,
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('အရောင်းဆက်ရန်'), findsOneWidget);
      expect(find.text('အရောင်းအသစ်'), findsNothing);
      expect(find.text('မပြီးသေးသော အရောင်း'), findsNothing);
      await tester.tap(find.text('အရောင်းဆက်ရန်'));
      await tester.pumpAndSettle();
      // A tablet resumes into the visible two-pane basket, while phones use
      // the bottom Review sale action to open the same sale.
      expect(find.byKey(const ValueKey('shop-split-basket')), findsOneWidget);
      expect(find.text('လက်ရှိအရောင်း'), findsOneWidget);
      expect(find.textContaining('၃,၀၀၀'), findsWidgets);
      expect(find.text('ငွေသား'), findsOneWidget);
      expect((await database.readCounterSaleDraft())?.quantities, {'water': 2});
      expect(await database.countSales(), 0);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('mixed saved basket blocks payment until item removed', (
    tester,
  ) async {
    _usePhoneViewport(tester);
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'tea',
        name: 'Tea',
        priceMmk: 2500,
        openingStock: 3,
      );
      await database.addProduct(
        id: 'water',
        name: 'Water',
        priceMmk: 1200,
        openingStock: 4,
      );
      await database.saveCounterSaleDraft(
        operationId: 'mixed-before-restart',
        quantities: const {'tea': 1, 'water': 1},
      );
      await database.customUpdate(
        'UPDATE shop_products SET archived = 1 WHERE id = ?',
        variables: [const Variable<String>('water')],
        updates: {database.shopProducts},
      );
      await tester.pumpWidget(
        ShopApp(
          testOnlyAllowMissingRuntimeScope: true,
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          initialMyanmar: false,
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('Continue sale'));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('Review sale · 2 · Check items'),
        findsOneWidget,
      );
      await tester.tap(find.textContaining('Review sale · 2 · Check items'));
      await tester.pumpAndSettle();
      expect(
        find.text(
          'Stock changed. Match this sale to available quantities before payment.',
        ),
        findsOneWidget,
      );
      expect(find.text('Check items'), findsOneWidget);
      expect(
        tester
            .widget<FilledButton>(
              find.ancestor(
                of: find.text('Cash sale'),
                matching: find.byType(FilledButton),
              ),
            )
            .onPressed,
        isNull,
      );
      expect(
        tester
            .widget<OutlinedButton>(
              find.ancestor(
                of: find.text('Mobile money'),
                matching: find.byType(OutlinedButton),
              ),
            )
            .onPressed,
        isNull,
      );
      expect(await database.countSales(), 0);
      await tester.tap(find.text('Match available stock'));
      await tester.pumpAndSettle();
      expect((await database.readCounterSaleDraft())?.quantities, {'tea': 1});
      expect(
        find.text(
          'Stock changed. Match this sale to available quantities before payment.',
        ),
        findsNothing,
      );
      expect(
        tester
            .widget<FilledButton>(
              find.ancestor(
                of: find.text('Cash sale'),
                matching: find.byType(FilledButton),
              ),
            )
            .onPressed,
        isNotNull,
      );
      expect(await database.countSales(), 0);
      expect((await database.readActiveProducts()).single.onHand, 3);
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
      lines: const [ShopSaleLineInput(productId: 'water', quantity: 1)],
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
        testOnlyAllowMissingRuntimeScope: true,
        database: database,
        authClient: null,
        apiBaseUrl: 'https://app.supermega.dev',
        initialMyanmar: false,
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Net sales today'), findsOneWidget);
    expect(find.text('1,200 MMK'), findsNWidgets(2));
    expect(find.text('Sales recorded'), findsOneWidget);
    expect(find.text('Low-stock products'), findsNothing);
    expect(find.text('Stock to check'), findsNothing);
    expect(find.text('Mobile payment to review'), findsOneWidget);
    expect(find.text('Check stock'), findsNothing);
    expect(find.textContaining('vs. yesterday'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('tablet Today keeps sales metrics in one row', (tester) async {
    tester.view.physicalSize = const Size(820, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'water',
        name: 'Water',
        priceMmk: 1200,
        openingStock: 20,
      );
      await database.recordCashSale(
        operationId: 'tablet-today-sale',
        lines: const [ShopSaleLineInput(productId: 'water', quantity: 1)],
      );
      await tester.pumpWidget(
        ShopApp(
          testOnlyAllowMissingRuntimeScope: true,
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          initialMyanmar: false,
        ),
      );
      await tester.pumpAndSettle();
      final salesY = tester.getTopLeft(find.text('Net sales today')).dy;
      final completedY = tester.getTopLeft(find.text('Sales recorded')).dy;
      expect((salesY - completedY).abs(), lessThan(4));
      expect(tester.getTopLeft(find.text('New sale')).dx, greaterThan(500));
      expect(find.text('Check stock'), findsNothing);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('tablet Today aligns a configured stock alert with sales', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(820, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'water',
        name: 'Water',
        priceMmk: 1200,
        openingStock: 7,
      );
      await database.setReorderLevel(
        productId: 'water',
        expectedReorderLevel: 5,
        reorderLevel: 10,
      );
      await database.recordCashSale(
        operationId: 'tablet-stock-alert-sale',
        lines: const [ShopSaleLineInput(productId: 'water', quantity: 1)],
      );
      await tester.pumpWidget(
        ShopApp(
          testOnlyAllowMissingRuntimeScope: true,
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          initialMyanmar: false,
        ),
      );
      await tester.pumpAndSettle();
      final salesY = tester.getTopLeft(find.text('Net sales today')).dy;
      final completedY = tester.getTopLeft(find.text('Sales recorded')).dy;
      final stockY = tester.getTopLeft(find.text('Low-stock products')).dy;
      expect((salesY - completedY).abs(), lessThan(4));
      expect((salesY - stockY).abs(), lessThan(4));
      expect(find.text('Check stock'), findsOneWidget);
      expect(tester.takeException(), isNull);

      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await tester.pumpWidget(
        ShopApp(
          testOnlyAllowMissingRuntimeScope: true,
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          initialMyanmar: true,
        ),
      );
      await tester.pumpAndSettle();
      double cardBottom(String label) {
        final metricCard = find.ancestor(
          of: find.text(label),
          matching: find.byType(Card),
        );
        return tester.getBottomLeft(metricCard).dy;
      }

      final burmeseSalesBottom = cardBottom('ယနေ့အသားတင်ရောင်းအား');
      expect(
        (burmeseSalesBottom - cardBottom('မှတ်တမ်းတင်ထားသောအရောင်း')).abs(),
        lessThan(4),
      );
      expect(
        (burmeseSalesBottom - cardBottom('လက်ကျန်နည်းသော ကုန်ပစ္စည်းများ'))
            .abs(),
        lessThan(4),
      );
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
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
        testOnlyAllowMissingRuntimeScope: true,
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

  testWidgets('receipt list leads with items and filters offline', (
    tester,
  ) async {
    final database = ShopDatabase(NativeDatabase.memory());
    await database.addProduct(
      id: 'tea',
      name: 'Tea',
      priceMmk: 2500,
      openingStock: 1,
    );
    await database.addProduct(
      id: 'rice',
      name: 'Rice',
      priceMmk: 5000,
      openingStock: 1,
    );
    await database.recordCashSale(
      operationId: 'tea-sale',
      lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
    );
    await database.recordCashSale(
      operationId: 'rice-sale',
      lines: const [ShopSaleLineInput(productId: 'rice', quantity: 1)],
    );
    await tester.pumpWidget(
      MaterialApp(
        home: RecentSalesScreen(
          testOnlyAllowMissingRuntimeScope: true,
          database: database,
          myanmar: false,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Tea'), findsOneWidget);
    expect(find.text('Rice'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'TEA');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pumpAndSettle();
    expect(find.text('Tea'), findsOneWidget);
    expect(find.text('Rice'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
    await database.close();
  });

  testWidgets('sale correction action stays default-dark without authority', (
    tester,
  ) async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'dark-tea',
        name: 'Tea',
        priceMmk: 2500,
        openingStock: 1,
      );
      await database.recordCashSale(
        operationId: 'dark-sale',
        lines: const [ShopSaleLineInput(productId: 'dark-tea', quantity: 1)],
      );
      await tester.pumpWidget(
        MaterialApp(
          home: RecentSalesScreen(
            testOnlyAllowMissingRuntimeScope: true,
            database: database,
            myanmar: false,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('2,500 MMK'));
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('shop-sale-correct')), findsNothing);
      expect(find.text('Reprint receipt'), findsOneWidget);

      await tester.tap(find.text('Close'));
      await tester.pumpAndSettle();
      await _attachWidgetWorkspace(database);
      final unavailableAuthorizer = _WidgetCorrectionAuthorizer(
        available: false,
      );
      await tester.pumpWidget(
        MaterialApp(
          home: RecentSalesScreen(
            testOnlyAllowMissingRuntimeScope: true,
            database: database,
            myanmar: false,
            correctionAuthorizer: unavailableAuthorizer,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('2,500 MMK'));
      await tester.pumpAndSettle();

      expect(find.byKey(const ValueKey('shop-sale-correct')), findsNothing);
      expect(unavailableAuthorizer.lastWorkspaceId, 'workspace-widget-test');
      expect(unavailableAuthorizer.lastRequiredActorId, 'owner-widget-test');
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await database.close();
    }
  });

  for (final myanmar in const [false, true]) {
    testWidgets(
      'authorized ${myanmar ? 'Burmese' : 'English'} correction opens and cancels without mutation',
      (tester) async {
        if (myanmar) {
          tester.view.physicalSize = const Size(320, 900);
          tester.view.devicePixelRatio = 1;
          tester.platformDispatcher.textScaleFactorTestValue = 1.5;
          addTearDown(tester.view.resetPhysicalSize);
          addTearDown(tester.view.resetDevicePixelRatio);
          addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        }
        final database = ShopDatabase(NativeDatabase.memory());
        final authorizer = _WidgetCorrectionAuthorizer(available: true);
        try {
          await _attachWidgetWorkspace(database);
          await database.addProduct(
            id: 'cancel-tea-$myanmar',
            name: 'Tea',
            priceMmk: 2500,
            openingStock: 1,
          );
          final sale = await database.recordCashSale(
            operationId: 'cancel-sale-$myanmar',
            lines: [
              ShopSaleLineInput(productId: 'cancel-tea-$myanmar', quantity: 1),
            ],
          );
          await tester.pumpWidget(
            MaterialApp(
              theme: ThemeData(
                fontFamily: myanmar ? 'NotoSansMyanmarUI' : 'Inter',
                fontFamilyFallback: myanmar
                    ? const ['NotoSansMyanmar', 'Inter']
                    : const ['NotoSansMyanmarUI', 'NotoSansMyanmar'],
              ),
              home: RecentSalesScreen(
                testOnlyAllowMissingRuntimeScope: true,
                database: database,
                myanmar: myanmar,
                correctionAuthorizer: authorizer,
              ),
            ),
          );
          await tester.pumpAndSettle();
          await tester.tap(find.text(myanmar ? '၂,၅၀၀ ကျပ်' : '2,500 MMK'));
          await tester.pumpAndSettle();
          await tester.tap(find.byKey(const ValueKey('shop-sale-correct')));
          await tester.pumpAndSettle();

          expect(
            find.text(myanmar ? 'အရောင်းပြင်ဆင်ရန်' : 'Correct sale'),
            findsOneWidget,
          );
          expect(
            find.textContaining(
              myanmar
                  ? 'မူလအရောင်းနှင့် စျေးနှုန်းများ'
                  : 'original sale and prices remain',
            ),
            findsOneWidget,
          );
          await tester.tap(
            find.byKey(const ValueKey('shop-correction-cancel')),
          );
          await tester.pumpAndSettle();

          expect(await database.readSaleReversalForSale(sale.id), isNull);
          expect(authorizer.authorizeCalls, 0);
          expect(authorizer.lastWorkspaceId, 'workspace-widget-test');
          expect(authorizer.lastRequiredActorId, 'owner-widget-test');
        } finally {
          await tester.pumpWidget(const SizedBox.shrink());
          await database.close();
        }
      },
    );
  }

  testWidgets('authorized cash correction records once and reloads the sale', (
    tester,
  ) async {
    final database = ShopDatabase.withCorrectionReceiptVerifier(
      executor: NativeDatabase.memory(),
      correctionReceiptVerifier: _widgetCorrectionReceiptVerifier,
      testOnlyAllowUnconsumedAuthorization: true,
    );
    final authorizer = _WidgetCorrectionAuthorizer(
      available: true,
      authorize:
          ({
            required authorizationRequestId,
            required workspaceId,
            required capability,
            required commandDigest,
            required requestFingerprint,
          }) async => ShopCorrectionAuthorizationResult(
            authorization: await _widgetCorrectionAuthorization(
              commandDigest,
              capability: capability,
              receiptId: 'widget-correction-flow-receipt',
            ),
            idempotentReplay: false,
            externalWritesPerformed: true,
          ),
    );
    try {
      await _attachWidgetWorkspace(database);
      await database.addProduct(
        id: 'correct-tea',
        name: 'Tea',
        priceMmk: 2500,
        openingStock: 2,
      );
      await database.openCashShift(
        operationId: 'correct-shift',
        operatorLabel: 'Owner',
        openingFloatMmk: 5000,
      );
      final sale = await database.recordCashSale(
        operationId: 'correct-sale',
        lines: const [ShopSaleLineInput(productId: 'correct-tea', quantity: 1)],
      );
      final outboxCountBeforeCorrection = await database
          .countOutboxOperations();
      await tester.pumpWidget(
        MaterialApp(
          home: RecentSalesScreen(
            testOnlyAllowMissingRuntimeScope: true,
            database: database,
            myanmar: false,
            correctionAuthorizer: authorizer,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('2,500 MMK'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('shop-sale-correct')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('shop-correction-reason')),
        'Customer returned the full sale',
      );
      await tester.tap(
        find.byKey(const ValueKey('shop-correction-restock-all')),
      );
      final cashReturn = find.byKey(
        const ValueKey('shop-correction-cash-return'),
      );
      await tester.ensureVisible(cashReturn);
      await tester.tap(cashReturn);
      final review = find.byKey(const ValueKey('shop-correction-review'));
      await tester.ensureVisible(review);
      await tester.tap(review);
      await tester.pumpAndSettle();
      final authorize = find.byKey(const ValueKey('shop-correction-authorize'));
      await tester.ensureVisible(authorize);
      await tester.tap(authorize);
      await tester.tap(authorize);
      await tester.pumpAndSettle();

      expect(authorizer.authorizeCalls, 1);
      expect(await database.readSaleReversalForSale(sale.id), isNotNull);
      expect((await database.readActiveProducts()).single.onHand, 2);
      expect(
        await database.countOutboxOperations(),
        outboxCountBeforeCorrection + 1,
      );
      expect(
        find.text(
          'Sale corrected. The original sale remains in the audit record.',
        ),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await database.close();
    }
  });

  testWidgets('denied owner authorization leaves the sale unchanged', (
    tester,
  ) async {
    final database = ShopDatabase(NativeDatabase.memory());
    final authorizer = _WidgetCorrectionAuthorizer(
      available: true,
      authorize:
          ({
            required authorizationRequestId,
            required workspaceId,
            required capability,
            required commandDigest,
            required requestFingerprint,
          }) async => throw const ShopCorrectionAuthorizationException(
            'owner_authorization_required',
          ),
    );
    try {
      await _attachWidgetWorkspace(database);
      await database.addProduct(
        id: 'denied-tea',
        name: 'Tea',
        priceMmk: 2500,
        openingStock: 2,
      );
      await database.openCashShift(
        operationId: 'denied-shift',
        operatorLabel: 'Owner',
        openingFloatMmk: 5000,
      );
      final sale = await database.recordCashSale(
        operationId: 'denied-sale',
        lines: const [ShopSaleLineInput(productId: 'denied-tea', quantity: 1)],
      );
      final outboxCountBeforeCorrection = await database
          .countOutboxOperations();
      await tester.pumpWidget(
        MaterialApp(
          home: RecentSalesScreen(
            testOnlyAllowMissingRuntimeScope: true,
            database: database,
            myanmar: false,
            correctionAuthorizer: authorizer,
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('2,500 MMK'));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('shop-sale-correct')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('shop-correction-reason')),
        'Owner review is required',
      );
      final noRestock = find.byKey(
        const ValueKey('shop-correction-restock-none'),
      );
      await tester.ensureVisible(noRestock);
      await tester.tap(noRestock);
      final cashReturn = find.byKey(
        const ValueKey('shop-correction-cash-return'),
      );
      await tester.ensureVisible(cashReturn);
      await tester.tap(cashReturn);
      final review = find.byKey(const ValueKey('shop-correction-review'));
      await tester.ensureVisible(review);
      await tester.tap(review);
      await tester.pumpAndSettle();
      final authorize = find.byKey(const ValueKey('shop-correction-authorize'));
      await tester.ensureVisible(authorize);
      await tester.tap(authorize);
      await tester.pumpAndSettle();

      expect(
        find.text(
          'This correction requires authorization from the workspace owner.',
        ),
        findsOneWidget,
      );
      expect(await database.readSaleReversalForSale(sale.id), isNull);
      expect((await database.readActiveProducts()).single.onHand, 1);
      expect(
        await database.countOutboxOperations(),
        outboxCountBeforeCorrection,
      );
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await database.close();
    }
  });

  testWidgets('large Burmese sale total fits enlarged phone and tablet views', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 1.5;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'expensive',
        name: 'High value item',
        priceMmk: 1000000000,
        openingStock: 1,
      );
      await database.recordCashSale(
        operationId: 'large-burmese-sale',
        lines: const [ShopSaleLineInput(productId: 'expensive', quantity: 1)],
      );
      for (final width in [320.0, 820.0]) {
        tester.view.physicalSize = Size(width, 900);
        await tester.pumpWidget(
          MaterialApp(
            home: RecentSalesScreen(
              testOnlyAllowMissingRuntimeScope: true,
              database: database,
              myanmar: true,
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('၁,၀၀၀,၀၀၀,၀၀၀ ကျပ်'), findsOneWidget);
        expect(tester.takeException(), isNull);
      }
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('recent sales dates stay in Burmese when the host uses English', (
    tester,
  ) async {
    final database = ShopDatabase(NativeDatabase.memory());
    await database.addProduct(
      id: 'tea',
      name: 'Tea',
      priceMmk: 2500,
      openingStock: 1,
    );
    await database.addProduct(
      id: 'coffee',
      name: 'Coffee',
      priceMmk: 3000,
      openingStock: 1,
    );
    await database.recordCashSale(
      operationId: 'burmese-date',
      lines: const [
        ShopSaleLineInput(productId: 'tea', quantity: 1),
        ShopSaleLineInput(productId: 'coffee', quantity: 1),
      ],
    );
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('en'),
        home: RecentSalesScreen(
          testOnlyAllowMissingRuntimeScope: true,
          database: database,
          myanmar: true,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining(' +၁'), findsOneWidget);
    expect(
      find.textContaining(
        RegExp(r'[၀-၉]{2}/[၀-၉]{2}/[၀-၉]{4} [၀-၉]{2}:[၀-၉]{2}'),
      ),
      findsOneWidget,
    );
    expect(find.textContaining('AM'), findsNothing);
    expect(find.textContaining('PM'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
    await database.close();
  });

  testWidgets(
    'reversal activity and original sale keep distinct audit timestamps',
    (tester) async {
      _usePhoneViewport(tester);
      final soldAt = DateTime(2026, 10, 20, 9, 15).millisecondsSinceEpoch;
      final reversedAt = DateTime(2026, 10, 22, 17, 40).millisecondsSinceEpoch;
      final database = _RecentSalesFixtureDatabase([
        ShopSaleReceipt(
          id: 'timestamp-sale',
          operationId: 'timestamp-sale-operation',
          totalMmk: 2500,
          createdAtMillis: soldAt,
          paymentMethod: 'cash',
          lines: const [
            ShopSaleReceiptLine(
              id: 'timestamp-sale-line',
              productId: 'timestamp-tea',
              productName: 'Tea',
              unitPriceMmk: 2500,
              quantity: 1,
              lineTotalMmk: 2500,
            ),
          ],
          reversal: ShopSaleReversal(
            id: 'timestamp-reversal',
            operationId: 'timestamp-reversal-operation',
            saleId: 'timestamp-sale',
            originalTotalMmk: 2500,
            originalPaymentMethod: 'cash',
            originalCreatedAtMillis: soldAt,
            restockItems: false,
            reason: 'Audit timestamp fixture',
            paymentResolution: 'cash_returned_now',
            cashDrawerDeltaMmk: -2500,
            authorizedActorId: 'owner-timestamp-fixture',
            authorizedActorLabel: 'Timestamp fixture owner',
            authorizationReceiptId: 'timestamp-fixture-receipt',
            authorizationProofKind:
                shopCorrectionAuthorizationProofKindSignedV2,
            createdAtMillis: reversedAt,
            lines: const [],
          ),
        ),
      ]);
      try {
        await tester.pumpWidget(
          MaterialApp(
            home: RecentSalesScreen(
              testOnlyAllowMissingRuntimeScope: true,
              database: database,
              myanmar: false,
            ),
          ),
        );
        await tester.pumpAndSettle();

        final screenContext = tester.element(find.byType(RecentSalesScreen));
        final localizations = MaterialLocalizations.of(screenContext);
        String compactTimestamp(int millis) {
          final date = DateTime.fromMillisecondsSinceEpoch(millis).toLocal();
          return '${localizations.formatShortDate(date)} '
              '${localizations.formatTimeOfDay(TimeOfDay.fromDateTime(date))}';
        }

        String fullTimestamp(int millis) {
          final date = DateTime.fromMillisecondsSinceEpoch(millis).toLocal();
          return '${localizations.formatMediumDate(date)} '
              '${localizations.formatTimeOfDay(TimeOfDay.fromDateTime(date))}';
        }

        final reversedLabel = 'Reversed ${compactTimestamp(reversedAt)}';
        final soldLabel = 'Sold ${compactTimestamp(soldAt)}';
        expect(find.text(reversedLabel), findsOneWidget);
        expect(find.text(soldLabel), findsOneWidget);
        final colors = Theme.of(screenContext).colorScheme;
        expect(
          tester.widget<Text>(find.text(reversedLabel)).style?.color,
          colors.error,
        );
        expect(
          tester.widget<Text>(find.text(reversedLabel)).style?.fontWeight,
          FontWeight.w700,
        );
        expect(
          tester.widget<Text>(find.text(soldLabel)).style?.color,
          colors.onSurfaceVariant,
        );

        await tester.tap(find.text('2,500 MMK'));
        await tester.pumpAndSettle();
        expect(
          find.text('Original sale: ${fullTimestamp(soldAt)}'),
          findsOneWidget,
        );
        expect(
          find.text('Reversed: ${fullTimestamp(reversedAt)}'),
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

  for (final myanmar in const [false, true]) {
    testWidgets('migrated correction evidence is explicitly unverified in '
        '${myanmar ? 'Burmese' : 'English'}', (tester) async {
      _usePhoneViewport(tester);
      final recordedAt = DateTime(2026, 10, 22, 17, 40).millisecondsSinceEpoch;
      final database = _RecentSalesFixtureDatabase([
        ShopSaleReceipt(
          id: 'legacy-proof-sale',
          operationId: 'legacy-proof-sale-operation',
          totalMmk: 2500,
          createdAtMillis: recordedAt - 1000,
          paymentMethod: 'kbzpay',
          lines: const [
            ShopSaleReceiptLine(
              id: 'legacy-proof-sale-line',
              productId: 'legacy-proof-tea',
              productName: 'Tea',
              unitPriceMmk: 2500,
              quantity: 1,
              lineTotalMmk: 2500,
            ),
          ],
          reversal: ShopSaleReversal(
            id: 'legacy-proof-reversal',
            operationId: 'legacy-proof-reversal-operation',
            saleId: 'legacy-proof-sale',
            originalTotalMmk: 2500,
            originalPaymentMethod: 'kbzpay',
            originalCreatedAtMillis: recordedAt - 1000,
            restockItems: false,
            reason: 'Migrated audit fixture',
            paymentResolution: 'external_pending',
            cashDrawerDeltaMmk: 0,
            authorizedActorId: 'owner-legacy-fixture',
            authorizedActorLabel: 'Legacy fixture owner',
            authorizationReceiptId: 'legacy-fixture-receipt',
            authorizationProofKind:
                shopCorrectionAuthorizationProofKindLegacyV1,
            createdAtMillis: recordedAt,
            walletReconciliationOutcome: 'money_returned',
            walletEvidenceReference: 'Legacy provider reference',
            walletReconciledActorLabel: 'Legacy fixture owner',
            walletReconciledAtMillis: recordedAt + 1000,
            walletReconciliationProofKind:
                shopCorrectionAuthorizationProofKindLegacyV1,
            lines: const [],
          ),
        ),
      ]);
      try {
        await tester.pumpWidget(
          MaterialApp(
            home: RecentSalesScreen(
              testOnlyAllowMissingRuntimeScope: true,
              database: database,
              myanmar: myanmar,
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text(myanmar ? '၂,၅၀၀ ကျပ်' : '2,500 MMK'));
        await tester.pumpAndSettle();

        expect(
          find.text(
            myanmar
                ? 'ပြင်ဆင်မှုခွင့်ပြုချက်: မှတ်တမ်းဟောင်းမှ ပြောင်းရွှေ့ထားပြီး ဆာဗာခွင့်ပြုချက်ကို အတည်မပြုထားပါ။'
                : 'Correction authorization: Migrated record — server authorization unverified.',
          ),
          findsOneWidget,
        );
        expect(
          find.text(
            myanmar
                ? 'Wallet စာရင်းညှိခြင်း ခွင့်ပြုချက်: မှတ်တမ်းဟောင်းမှ ပြောင်းရွှေ့ထားပြီး ဆာဗာခွင့်ပြုချက်ကို အတည်မပြုထားပါ။'
                : 'Wallet reconciliation authorization: Migrated record — server authorization unverified.',
          ),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump(const Duration(milliseconds: 1));
        await database.close();
      }
    });
  }

  testWidgets(
    'production-null test seam shows printer without creating transport',
    (tester) async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await tester.pumpWidget(
          ShopApp(
            testOnlyAllowMissingRuntimeScope: true,
            database: database,
            authClient: null,
            apiBaseUrl: 'https://example.invalid',
            initialMyanmar: false,
            runtimeCapabilities: ShopRuntimeCapabilities.production,
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
        await tester.tap(find.text('Receipt printer'));
        await tester.pumpAndSettle();
        expect(find.text('Find printers'), findsOneWidget);
        await tester.tap(find.text('Find printers'));
        await tester.pumpAndSettle();
        expect(
          find.text('Printer access is unavailable in this preview.'),
          findsOneWidget,
        );
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await database.close();
      }
    },
  );

  testWidgets('synthetic QA hides external printer settings', (tester) async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await tester.pumpWidget(
        ShopApp(
          testOnlyAllowMissingRuntimeScope: true,
          database: database,
          authClient: null,
          apiBaseUrl: '',
          initialMyanmar: false,
          runtimeCapabilities: ShopRuntimeCapabilities.syntheticQa,
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.text('Synthetic QA data · not a customer store'),
        findsOneWidget,
      );
      await tester.tap(
        find
            .descendant(
              of: find.byType(AppBar),
              matching: find.byIcon(Icons.settings_outlined),
            )
            .first,
      );
      await tester.pumpAndSettle();
      expect(find.text('Receipt printer'), findsNothing);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await database.close();
    }
  });

  testWidgets(
    'cash reversal reports net and audit detail without ordinary reprint',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      final database = ShopDatabase.withCorrectionReceiptVerifier(
        executor: NativeDatabase.memory(),
        correctionReceiptVerifier: _widgetCorrectionReceiptVerifier,
        testOnlyAllowUnconsumedAuthorization: true,
      );
      try {
        await _attachWidgetWorkspace(database);
        await database.addProduct(
          id: 'reversed-tea',
          name: 'Tea',
          priceMmk: 2500,
          openingStock: 2,
        );
        await database.openCashShift(
          operationId: 'reversed-shift',
          operatorLabel: 'May',
          openingFloatMmk: 5000,
        );
        final sale = await database.recordCashSale(
          operationId: 'reversed-sale',
          lines: const [
            ShopSaleLineInput(productId: 'reversed-tea', quantity: 1),
          ],
        );
        final command = await database.previewFullSaleReversal(
          operationId: 'reversed-sale-correction',
          saleId: sale.id,
          restockItems: true,
          reason: 'Customer returned the full sale',
          confirmCashReturned: true,
        );
        await database.recordAuthorizedFullSaleReversal(
          command: command,
          authorization: await _widgetCorrectionAuthorization(
            command.commandDigest,
            capability: 'shop.sale.reverse',
            receiptId: 'widget-cash-reversal-receipt',
          ),
        );

        await tester.pumpWidget(
          ShopApp(
            testOnlyAllowMissingRuntimeScope: true,
            database: database,
            authClient: null,
            apiBaseUrl: 'https://app.supermega.dev',
            initialMyanmar: false,
          ),
        );
        await tester.pumpAndSettle();
        expect(find.text('Net sales today'), findsOneWidget);
        expect(find.text('Gross recorded: 2,500 MMK'), findsOneWidget);
        expect(find.text('Reversals today'), findsOneWidget);
        expect(find.text('1 · 2,500 MMK'), findsOneWidget);

        await tester.pumpWidget(
          MaterialApp(
            home: RecentSalesScreen(
              testOnlyAllowMissingRuntimeScope: true,
              database: database,
              myanmar: false,
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('2,500 MMK'));
        await tester.pumpAndSettle();
        expect(find.text('Reversed — original sale retained'), findsOneWidget);
        expect(
          find.text('Reason: Customer returned the full sale'),
          findsOneWidget,
        );
        expect(find.text('Recorded actor: Widget test owner'), findsOneWidget);
        expect(
          find.text('All original quantities were returned to stock.'),
          findsOneWidget,
        );
        expect(find.text('Reprint receipt'), findsNothing);
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump(const Duration(milliseconds: 1));
        await database.close();
      }
    },
  );

  testWidgets(
    'wallet reversal never presents local pending as money returned',
    (tester) async {
      final database = ShopDatabase.withCorrectionReceiptVerifier(
        executor: NativeDatabase.memory(),
        correctionReceiptVerifier: _widgetCorrectionReceiptVerifier,
        testOnlyAllowUnconsumedAuthorization: true,
      );
      try {
        await _attachWidgetWorkspace(database);
        await database.addProduct(
          id: 'wallet-reversed-water',
          name: 'Water',
          priceMmk: 1000,
          openingStock: 2,
        );
        const lines = [
          ShopSaleLineInput(productId: 'wallet-reversed-water', quantity: 1),
        ];
        await database.createWalletCheckoutIntent(
          operationId: 'widget-wallet-sale',
          merchant: MerchantWalletSetup(
            provider: 'KBZPay',
            merchantPhone: null,
            officialQrPayload: _testStaticMmqr(),
            issuerConfirmed: true,
          ),
          lines: lines,
        );
        final sale = await database.recordSale(
          operationId: 'widget-wallet-sale',
          lines: lines,
          paymentMethod: 'kbzpay',
          walletCheckoutOperationId: 'widget-wallet-sale',
        );
        final command = await database.previewFullSaleReversal(
          operationId: 'widget-wallet-reversal',
          saleId: sale.id,
          restockItems: false,
          reason: 'Duplicate local record',
          confirmCashReturned: false,
        );
        await database.recordAuthorizedFullSaleReversal(
          command: command,
          authorization: await _widgetCorrectionAuthorization(
            command.commandDigest,
            capability: 'shop.sale.reverse',
            receiptId: 'widget-wallet-reversal-receipt',
          ),
        );

        await tester.pumpWidget(
          MaterialApp(
            home: RecentSalesScreen(
              testOnlyAllowMissingRuntimeScope: true,
              database: database,
              myanmar: false,
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('1,000 MMK'));
        await tester.pumpAndSettle();
        expect(
          find.text(
            'Wallet reconciliation pending. No outgoing money return has been verified.',
          ),
          findsOneWidget,
        );
        expect(find.textContaining('Money returned was'), findsNothing);
        expect(find.text('Reprint receipt'), findsNothing);
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump(const Duration(milliseconds: 1));
        await database.close();
      }
    },
  );

  for (final outcome in const ['money_returned', 'payment_not_received']) {
    testWidgets('confirmed wallet $outcome shows its evidence-backed outcome', (
      tester,
    ) async {
      final database = ShopDatabase.withCorrectionReceiptVerifier(
        executor: NativeDatabase.memory(),
        correctionReceiptVerifier: _widgetCorrectionReceiptVerifier,
        testOnlyAllowUnconsumedAuthorization: true,
      );
      try {
        await _attachWidgetWorkspace(database);
        final operationPrefix = 'widget-wallet-$outcome';
        final productId = '$operationPrefix-water';
        await database.addProduct(
          id: productId,
          name: 'Water',
          priceMmk: 1000,
          openingStock: 2,
        );
        final lines = [ShopSaleLineInput(productId: productId, quantity: 1)];
        await database.createWalletCheckoutIntent(
          operationId: '$operationPrefix-sale',
          merchant: MerchantWalletSetup(
            provider: 'KBZPay',
            merchantPhone: null,
            officialQrPayload: _testStaticMmqr(),
            issuerConfirmed: true,
          ),
          lines: lines,
        );
        final sale = await database.recordSale(
          operationId: '$operationPrefix-sale',
          lines: lines,
          paymentMethod: 'kbzpay',
          walletCheckoutOperationId: '$operationPrefix-sale',
        );
        final reversalCommand = await database.previewFullSaleReversal(
          operationId: '$operationPrefix-reversal',
          saleId: sale.id,
          restockItems: false,
          reason: 'Correct the full wallet sale',
          confirmCashReturned: false,
        );
        final reversal = await database.recordAuthorizedFullSaleReversal(
          command: reversalCommand,
          authorization: await _widgetCorrectionAuthorization(
            reversalCommand.commandDigest,
            capability: 'shop.sale.reverse',
            receiptId: '$operationPrefix-reversal-receipt',
          ),
        );
        final evidenceReference = 'Provider case $outcome';
        final reconciliationCommand = await database
            .previewWalletReconciliation(
              operationId: '$operationPrefix-reconciliation',
              reversalId: reversal.id,
              outcome: outcome,
              evidenceReference: evidenceReference,
            );
        final reconciled = await database.recordAuthorizedWalletReconciliation(
          command: reconciliationCommand,
          authorization: await _widgetCorrectionAuthorization(
            reconciliationCommand.commandDigest,
            capability: 'shop.sale.reconcile_wallet',
            receiptId: '$operationPrefix-reconciliation-receipt',
          ),
        );

        await tester.pumpWidget(
          MaterialApp(
            home: RecentSalesScreen(
              testOnlyAllowMissingRuntimeScope: true,
              database: database,
              myanmar: false,
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text('1,000 MMK'));
        await tester.pumpAndSettle();

        final moneyReturnedCopy =
            'Money returned was separately confirmed with provider evidence.';
        final paymentNotReceivedCopy =
            'The original wallet payment was separately confirmed not received; no money return was recorded.';
        final expectedCopy = outcome == 'money_returned'
            ? moneyReturnedCopy
            : paymentNotReceivedCopy;
        final unexpectedCopy = outcome == 'money_returned'
            ? paymentNotReceivedCopy
            : moneyReturnedCopy;
        expect(find.text(expectedCopy), findsOneWidget);
        expect(find.text(unexpectedCopy), findsNothing);
        expect(
          find.text('Evidence reference: $evidenceReference'),
          findsOneWidget,
        );
        expect(find.text('Recorded actor: Widget test owner'), findsOneWidget);

        final screenContext = tester.element(find.byType(RecentSalesScreen));
        final localizations = MaterialLocalizations.of(screenContext);
        final reconciledAt = DateTime.fromMillisecondsSinceEpoch(
          reconciled.walletReconciledAtMillis!,
        ).toLocal();
        final reconciledTimestamp =
            '${localizations.formatMediumDate(reconciledAt)} '
            '${localizations.formatTimeOfDay(TimeOfDay.fromDateTime(reconciledAt))}';
        expect(
          find.text('Reconciled: $reconciledTimestamp · Widget test owner'),
          findsOneWidget,
        );
        expect(
          find.textContaining('Wallet reconciliation pending.'),
          findsNothing,
        );
        expect(find.text('Reprint receipt'), findsNothing);
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump(const Duration(milliseconds: 1));
        await database.close();
      }
    });
  }

  testWidgets('saved sale reprints without recording another sale', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({
      shopReceiptPrinterHostKey: '192.168.20.9',
    });
    const range = (ip: '192.168.20.10', mask: '255.255.255.248');
    final settings = ReceiptPrinterSettings(
      testOnlyAllowMissingRuntimeScope: true,
      rangeProvider: () async => range,
      session: VerifiedPrinterSession(),
    );
    final candidate = (await PrinterDiscoveryService(
      rangeProvider: () async => range,
      probe: (host, port) async => host == '192.168.20.9',
      testOnlyAllowMissingRuntimeScope: true,
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
          testOnlyAllowMissingRuntimeScope: true,
          database: database,
          myanmar: false,
          reprintService: ReceiptReprintService(
            settings: settings,
            send: (host, receipt, myanmar) async {
              expect(host, '192.168.20.9');
              expect(myanmar, isFalse);
              sent.add(receipt);
            },
            testOnlyAllowMissingRuntimeScope: true,
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

  testWidgets(
    'ambiguous printer delivery never retries or mutates sale until operator retry',
    (tester) async {
      SharedPreferences.setMockInitialValues({});
      _usePhoneViewport(tester);
      const range = (ip: '192.168.20.10', mask: '255.255.255.248');
      final settings = ReceiptPrinterSettings(
        testOnlyAllowMissingRuntimeScope: true,
        rangeProvider: () async => range,
        session: VerifiedPrinterSession(),
      );
      final candidate = (await PrinterDiscoveryService(
        rangeProvider: () async => range,
        probe: (host, port) async => host == '192.168.20.9',
        testOnlyAllowMissingRuntimeScope: true,
      ).scan()).printers.single;
      await settings.saveAfterTest(candidate);

      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await database.addProduct(
          id: 'tea-ambiguous-print',
          name: 'Tea',
          priceMmk: 2500,
          openingStock: 2,
        );
        final stockMovementsBefore = await database.countStockMovements();
        final outboxBefore = await database.countOutboxOperations();
        final sentReceiptIds = <String>[];
        await tester.pumpWidget(
          MaterialApp(
            home: ShopHome(
              testOnlyAllowMissingRuntimeScope: true,
              database: database,
              authClient: null,
              apiBaseUrl: 'https://example.invalid',
              myanmar: false,
              onLanguageChanged: (_) {},
              runtimeCapabilities: ShopRuntimeCapabilities.production,
              receiptPrinterSettings: settings,
              receiptPrintSender: (host, receipt, myanmar) async {
                expect(host, '192.168.20.9');
                sentReceiptIds.add(receipt.id);
                if (sentReceiptIds.length == 1) {
                  throw SocketException(
                    'connection closed after an ambiguous write',
                  );
                }
              },
            ),
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(
          find.byKey(const ValueKey('shop-catalog-row:tea-ambiguous-print')),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.textContaining('Review sale'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Cash sale'));
        await tester.pumpAndSettle();
        if (find.text('Cash received?').evaluate().isEmpty) {
          await tester.tap(find.text('Cash sale'));
          await tester.pumpAndSettle();
        }
        await tester.tap(find.text('Complete sale'));
        await tester.pumpAndSettle();

        expect(sentReceiptIds, hasLength(1));
        expect(find.textContaining('printing unconfirmed'), findsOneWidget);
        expect(find.textContaining('receipt may have printed'), findsOneWidget);
        expect(find.textContaining('check paper before retry'), findsOneWidget);
        expect(await database.countSales(), 1);
        expect((await database.readActiveProducts()).single.onHand, 1);
        expect(await database.countStockMovements(), stockMovementsBefore + 1);
        expect(await database.countOutboxOperations(), outboxBefore + 1);

        await tester.tap(find.text('Retry print'));
        await tester.pumpAndSettle();
        expect(sentReceiptIds, hasLength(2));
        expect(sentReceiptIds.toSet(), hasLength(1));
        expect(find.text('Receipt sent to printer.'), findsOneWidget);
        expect(await database.countSales(), 1);
        expect((await database.readActiveProducts()).single.onHand, 1);
        expect(await database.countStockMovements(), stockMovementsBefore + 1);
        expect(await database.countOutboxOperations(), outboxBefore + 1);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump(const Duration(milliseconds: 1));
        await database.close();
      }
    },
  );

  testWidgets('ambiguous reprint tells cashier to check paper first', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({
      shopReceiptPrinterHostKey: '192.168.20.9',
    });
    const range = (ip: '192.168.20.10', mask: '255.255.255.248');
    final settings = ReceiptPrinterSettings(
      testOnlyAllowMissingRuntimeScope: true,
      rangeProvider: () async => range,
      session: VerifiedPrinterSession(),
    );
    final candidate = (await PrinterDiscoveryService(
      rangeProvider: () async => range,
      probe: (host, port) async => host == '192.168.20.9',
      testOnlyAllowMissingRuntimeScope: true,
    ).scan()).printers.single;
    await settings.saveAfterTest(candidate);
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'tea-reprint-ambiguous',
        name: 'Tea',
        priceMmk: 2500,
        openingStock: 2,
      );
      await database.recordCashSale(
        operationId: 'sale-reprint-ambiguous',
        lines: const [
          ShopSaleLineInput(productId: 'tea-reprint-ambiguous', quantity: 1),
        ],
      );
      var sends = 0;
      await tester.pumpWidget(
        MaterialApp(
          home: RecentSalesScreen(
            testOnlyAllowMissingRuntimeScope: true,
            database: database,
            myanmar: false,
            reprintService: ReceiptReprintService(
              settings: settings,
              send: (host, receipt, myanmar) async {
                sends++;
                throw const SocketException(
                  'connection closed after an ambiguous write',
                );
              },
              testOnlyAllowMissingRuntimeScope: true,
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.text('2,500 MMK'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Reprint receipt'));
      await tester.pumpAndSettle();
      expect(sends, 1);
      expect(find.textContaining('Printing is unconfirmed'), findsOneWidget);
      expect(find.textContaining('may have printed'), findsOneWidget);
      expect(find.textContaining('Check the paper'), findsOneWidget);
      expect(await database.countSales(), 1);
      expect((await database.readActiveProducts()).single.onHand, 1);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('cash change is visible while printer delivery is pending', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    _usePhoneViewport(tester);
    const range = (ip: '192.168.20.10', mask: '255.255.255.248');
    final settings = ReceiptPrinterSettings(
      testOnlyAllowMissingRuntimeScope: true,
      rangeProvider: () async => range,
      session: VerifiedPrinterSession(),
    );
    final candidate = (await PrinterDiscoveryService(
      rangeProvider: () async => range,
      probe: (host, port) async => host == '192.168.20.9',
      testOnlyAllowMissingRuntimeScope: true,
    ).scan()).printers.single;
    await settings.saveAfterTest(candidate);
    final printerReply = Completer<void>();
    var sendStarted = false;
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'rice-slow-print',
        name: 'Rice',
        priceMmk: 13500,
        openingStock: 2,
      );
      await tester.pumpWidget(
        MaterialApp(
          home: ShopHome(
            testOnlyAllowMissingRuntimeScope: true,
            database: database,
            authClient: null,
            apiBaseUrl: 'https://example.invalid',
            myanmar: false,
            onLanguageChanged: (_) {},
            runtimeCapabilities: ShopRuntimeCapabilities.production,
            receiptPrinterSettings: settings,
            receiptPrintSender: (host, receipt, myanmar) async {
              sendStarted = true;
              await printerReply.future;
            },
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey('shop-catalog-row:rice-slow-print')),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('Review sale'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cash sale'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('shop-cash-given')),
        '20000',
      );
      await tester.testTextInput.receiveAction(TextInputAction.done);
      for (var attempt = 0; attempt < 20 && !sendStarted; attempt++) {
        await tester.pump(const Duration(milliseconds: 10));
      }
      expect(sendStarted, isTrue);
      expect(find.textContaining('change 6,500 MMK'), findsOneWidget);
      expect(find.textContaining('checking printer'), findsOneWidget);
      expect(await database.countSales(), 1);
      expect((await database.readActiveProducts()).single.onHand, 1);

      printerReply.complete();
      await tester.pumpAndSettle();
      expect(find.textContaining('change 6,500 MMK'), findsOneWidget);
      expect(find.textContaining('receipt sent'), findsOneWidget);
      expect(await database.countSales(), 1);
      expect((await database.readActiveProducts()).single.onHand, 1);
    } finally {
      if (!printerReply.isCompleted) printerReply.complete();
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
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
          testOnlyAllowMissingRuntimeScope: true,
          database: database,
          myanmar: false,
          reprintService: ReceiptReprintService(
            settings: ReceiptPrinterSettings(
              testOnlyAllowMissingRuntimeScope: true,
              rangeProvider: () async =>
                  (ip: '192.168.20.10', mask: '255.255.255.248'),
              session: VerifiedPrinterSession(),
            ),
            send: (host, receipt, myanmar) async {
              sends++;
            },
            testOnlyAllowMissingRuntimeScope: true,
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
          testOnlyAllowMissingRuntimeScope: true,
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          myanmar: false,
          onLanguageChanged: (_) {},
          runtimeCapabilities: ShopRuntimeCapabilities.production,
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

  testWidgets('menu-photo consent reads in one language on a small phone', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 800);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 1.3;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    for (final myanmar in [false, true]) {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await tester.pumpWidget(
          MaterialApp(
            home: MenuImportScreen(
              testOnlyAllowMissingRuntimeScope: true,
              database: database,
              authClient: null,
              apiBaseUrl: 'https://example.invalid',
              myanmar: myanmar,
            ),
          ),
        );
        await tester.pumpAndSettle();
        expect(
          find.textContaining(
            myanmar
                ? 'အက်ပ်ဒေတာဘေ့စ်တွင် မသိမ်းပါ'
                : 'not kept in the app database',
          ),
          findsOneWidget,
        );
        expect(
          find.textContaining(
            myanmar
                ? 'အွန်လိုင်း ဉာဏ်ရည်တုစနစ်သို့ ပေးပို့ရန်'
                : 'send this photo to cloud AI',
          ),
          findsOneWidget,
        );
        if (myanmar) {
          expect(find.textContaining('Cloud'), findsNothing);
          expect(find.textContaining('App database'), findsNothing);
        }
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await database.close();
      }
    }
  });

  testWidgets('catalog shows a real photo without empty media placeholders', (
    tester,
  ) async {
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 800);
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
          testOnlyAllowMissingRuntimeScope: true,
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          myanmar: false,
          onLanguageChanged: (_) {},
          runtimeCapabilities: ShopRuntimeCapabilities.production,
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
    final teaMedia = find.byKey(const ValueKey('shop-product-media:tea'));
    expect(tester.getSize(teaMedia).width, tester.getSize(teaMedia).height);
    expect(
      tester
          .widget<Image>(
            find.descendant(of: teaMedia, matching: find.byType(Image)),
          )
          .fit,
      BoxFit.contain,
    );
    expect(
      find.byKey(const ValueKey('shop-product-photo:water')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey('shop-product-media:water')),
      findsNothing,
    );
    for (final width in [390.0, 820.0]) {
      tester.view.physicalSize = Size(width, 800);
      await tester.pumpAndSettle();
      expect(
        tester.getTopLeft(find.text('Tea')).dx,
        greaterThan(tester.getTopLeft(find.text('Water')).dx),
      );
      expect(tester.takeException(), isNull);
    }
    await tester.tap(find.byKey(const ValueKey('shop-product-actions')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Edit product photos'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('shop-photo-manage:tea')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('shop-photo-manage:tea')));
    await tester.pumpAndSettle();
    expect(find.text('Choose photo'), findsOneWidget);
    Navigator.of(tester.element(find.text('Choose photo'))).pop();
    await tester.pumpAndSettle();
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 1));
  });

  testWidgets('Burmese narrow catalog only reserves media when needed', (
    tester,
  ) async {
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(320, 800);
    tester.platformDispatcher.textScaleFactorTestValue = 1.5;
    SharedPreferences.setMockInitialValues({});
    final database = ShopDatabase(NativeDatabase.memory());
    addTearDown(database.close);
    await database.addProduct(
      id: 'rice',
      name: 'ရက် ၉၀ ဆန်အိတ် ၁၀ ကီလိုဂရမ်',
      priceMmk: 24900,
      openingStock: 3,
    );
    await database.addProduct(
      id: 'water',
      name: 'ALPINE သောက်ရေသန့် ၁ လီတာ',
      priceMmk: 1500,
      openingStock: 8,
    );
    await tester.pumpWidget(
      ShopApp(
        testOnlyAllowMissingRuntimeScope: true,
        initialCounter: true,
        database: database,
        authClient: null,
        apiBaseUrl: 'https://app.supermega.dev',
        initialMyanmar: true,
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.byWidgetPredicate(
        (widget) =>
            widget is TextField &&
            widget.decoration?.hintText == 'ရှာ / စကင်ဖတ်',
      ),
      findsOneWidget,
    );
    expect(find.byKey(const ValueKey('shop-product-media:rice')), findsNothing);
    expect(
      find.byKey(const ValueKey('shop-product-media:water')),
      findsNothing,
    );
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(milliseconds: 1));
    await database.saveProductThumbnail(
      'rice',
      base64Decode(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ'
        'AAAADUlEQVR4nGPQyNjxHwAETAJIB09U9wAAAABJRU5ErkJggg==',
      ),
    );
    await tester.pumpWidget(
      ShopApp(
        testOnlyAllowMissingRuntimeScope: true,
        initialCounter: true,
        database: database,
        authClient: null,
        apiBaseUrl: 'https://app.supermega.dev',
        initialMyanmar: true,
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('shop-product-photo:rice')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('shop-product-media:water')),
      findsNothing,
    );
    expect(
      tester.getTopLeft(find.text('ရက် ၉၀ ဆန်အိတ် ၁၀ ကီလိုဂရမ်')).dx,
      greaterThan(tester.getTopLeft(find.text('ALPINE သောက်ရေသန့် ၁ လီတာ')).dx),
    );
    expect(tester.takeException(), isNull);
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
          testOnlyAllowMissingRuntimeScope: true,
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          myanmar: false,
          onLanguageChanged: (_) {},
          runtimeCapabilities: ShopRuntimeCapabilities.production,
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

  for (final myanmar in [false, true]) {
    testWidgets(
      'empty ${myanmar ? 'MY' : 'EN'} catalog scans a first product without a sale',
      (tester) async {
        _usePhoneViewport(tester);
        final database = ShopDatabase(NativeDatabase.memory());
        addTearDown(database.close);
        await tester.pumpWidget(
          ShopApp(
            testOnlyAllowMissingRuntimeScope: true,
            initialCounter: true,
            database: database,
            authClient: null,
            apiBaseUrl: 'https://app.supermega.dev',
            initialMyanmar: myanmar,
          ),
        );
        await tester.pumpAndSettle();

        final search = find.byKey(const ValueKey('shop-sale-search-field'));
        expect(
          tester.widget<TextField>(search).decoration?.hintText,
          myanmar ? 'ဘားကုဒ် ဖတ်ပါ' : 'Scan a barcode',
        );
        await tester.enterText(search, '0012345678905');
        await tester.testTextInput.receiveAction(TextInputAction.done);
        await tester.pumpAndSettle();
        expect(find.byType(AlertDialog), findsOneWidget);
        expect(
          tester
              .widget<TextFormField>(
                find.byKey(const ValueKey('shop-product-barcode')),
              )
              .controller!
              .text,
          '0012345678905',
        );
        await tester.tap(find.text(myanmar ? 'မလုပ်တော့ပါ' : 'Cancel'));
        await tester.pumpAndSettle();
        expect(await database.readActiveProducts(), isEmpty);
        expect(await database.readCounterSaleDraft(), isNull);

        await tester.testTextInput.receiveAction(TextInputAction.done);
        await tester.pumpAndSettle();
        expect(find.byType(AlertDialog), findsOneWidget);
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
        await tester.tap(find.text(myanmar ? 'သိမ်းရန်' : 'Save product'));
        await tester.pumpAndSettle();
        final products = await database.readActiveProducts();
        expect(products, hasLength(1));
        expect(products.single.barcode, '0012345678905');
        expect(await database.readCounterSaleDraft(), isNull);

        await tester.enterText(search, '0012345678905');
        await tester.testTextInput.receiveAction(TextInputAction.done);
        await tester.pumpAndSettle();
        expect((await database.readCounterSaleDraft())?.quantities, {
          products.single.id: 1,
        });
        expect(await database.countSales(), 0);
        expect((await database.readActiveProducts()).single.onHand, 3);
        expect(tester.takeException(), isNull);
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump(const Duration(milliseconds: 1));
      },
    );
  }

  testWidgets('empty catalog can make a durable cash sale', (tester) async {
    _usePhoneViewport(tester);
    final database = ShopDatabase(NativeDatabase.memory());
    addTearDown(database.close);
    await tester.pumpWidget(
      ShopApp(
        testOnlyAllowMissingRuntimeScope: true,
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
    expect(
      tester.widget<TextField>(find.byType(TextField)).decoration?.hintText,
      'Scan a barcode',
    );
    expect(find.text('MAMA Chicken Instant Noodles'), findsNothing);

    await tester.ensureVisible(find.text('Add first product'));
    await tester.tap(find.text('Add first product'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('shop-product-name')),
      'Tea',
    );
    expect(find.byKey(const ValueKey('shop-product-barcode')), findsNothing);
    await tester.tap(find.byKey(const ValueKey('shop-product-add-barcode')));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('shop-product-barcode')),
      '0012345678905',
    );
    await tester.enterText(
      find.byKey(const ValueKey('shop-product-price')),
      '2500',
    );
    await tester.tap(find.text('Save product'));
    await tester.pumpAndSettle();
    expect(find.text('Enter a whole stock count.'), findsOneWidget);
    expect(await database.readActiveProducts(), isEmpty);
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
          testOnlyAllowMissingRuntimeScope: true,
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
      expect(
        tester.widget<TextField>(find.byType(TextField)).decoration?.hintText,
        'Scan a barcode',
      );
      expect(find.text('Current sale'), findsNothing);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('one-item phone basket does not fill the screen', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
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
          testOnlyAllowMissingRuntimeScope: true,
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

      expect(find.text('Current sale'), findsOneWidget);
      expect(find.text('Cash sale'), findsOneWidget);
      expect(
        tester.getSize(find.byKey(const ValueKey('shop-cart-sheet'))).height,
        lessThan(550),
      );
      expect(tester.getBottomLeft(find.text('Cash sale')).dy, lessThan(800));
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('tablet landscape keeps the basket beside the catalog', (
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
          testOnlyAllowMissingRuntimeScope: true,
          initialCounter: true,
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          initialMyanmar: false,
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Tea'), findsOneWidget);
      expect(find.text('Current sale'), findsOneWidget);
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

  testWidgets('portrait tablet keeps basket beside catalog', (tester) async {
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    tester.view.devicePixelRatio = 1;
    for (final width in [768.0, 800.0, 820.0, 1024.0]) {
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
            testOnlyAllowMissingRuntimeScope: true,
            database: database,
            authClient: null,
            apiBaseUrl: 'https://app.supermega.dev',
            initialMyanmar: myanmar,
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(find.text(myanmar ? 'ရောင်းရန်' : 'Sell'));
        await tester.pumpAndSettle();
        if (width <= 820) {
          final catalog = find.byKey(const ValueKey('shop-split-catalog'));
          final basket = find.byKey(const ValueKey('shop-split-basket'));
          expect(catalog, findsOneWidget);
          expect(basket, findsOneWidget);
          expect(tester.getSize(catalog).height, lessThan(500));
        }
        await tester.tap(
          find.byTooltip(myanmar ? 'အရောင်းထဲထည့်ရန်' : 'Add to sale'),
        );
        await tester.pumpAndSettle();
        if (width <= 820) {
          final catalog = find.byKey(const ValueKey('shop-split-catalog'));
          final basket = find.byKey(const ValueKey('shop-split-basket'));
          expect(basket, findsOneWidget);
          final catalogRect = tester.getRect(catalog);
          final basketRect = tester.getRect(basket);
          // Tablet navigation stays below the counter, leaving two
          // touch-safe panes beside the active basket.
          expect(catalogRect.width, greaterThanOrEqualTo(320));
          expect(basketRect.width, greaterThanOrEqualTo(300));
          expect(catalogRect.right, lessThan(basketRect.left));
          if (myanmar) {
            final title = find.text('လက်ရှိအရောင်း');
            final hold = find.byKey(const ValueKey('shop-hold-sale'));
            expect(title, findsOneWidget);
            expect(hold, findsOneWidget);
            expect(tester.getSize(title).height, lessThan(42));
            expect(tester.widget<TextButton>(hold).onPressed, isNotNull);
            expect(
              tester.getRect(title).overlaps(tester.getRect(hold)),
              isFalse,
            );
          }
        }
        if (width <= 820) {
          expect(
            find.textContaining(myanmar ? 'အရောင်းစစ်ရန်' : 'Review sale'),
            findsNothing,
          );
        }
        expect(find.text(myanmar ? 'ငွေသား' : 'Cash sale'), findsOneWidget);
        await tester.tap(
          find.byTooltip(myanmar ? 'တစ်ခုထပ်ထည့်ရန်' : 'Add one'),
        );
        await tester.pumpAndSettle();
        final lineTotal = tester.widget<Text>(
          find.byKey(const ValueKey('shop-cart-line-total:tea')),
        );
        expect(lineTotal.data, myanmar ? '၅,၀၀၀ ကျပ်' : '5,000 MMK');
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
              testOnlyAllowMissingRuntimeScope: true,
              initialCounter: true,
              database: database,
              authClient: null,
              apiBaseUrl: 'https://app.supermega.dev',
              initialMyanmar: myanmar,
            ),
          );
          await tester.pumpAndSettle();

          if (width == 320) {
            final newProductLabel = myanmar ? 'ကုန်ပစ္စည်းအသစ်' : 'New product';
            expect(find.text(newProductLabel), findsNothing);
            await tester.tap(
              find.byKey(const ValueKey('shop-product-actions')),
            );
            await tester.pumpAndSettle();
            await tester.tap(find.text(newProductLabel));
            await tester.pumpAndSettle();
            expect(
              find.byKey(const ValueKey('shop-product-name')),
              findsOneWidget,
            );
            Navigator.of(
              tester.element(find.byKey(const ValueKey('shop-product-name'))),
            ).pop();
            await tester.pumpAndSettle();
          }

          final addLabel = myanmar ? 'အရောင်းထဲထည့်ရန်' : 'Add to sale';
          final row = find.byKey(const ValueKey('shop-catalog-row:rice'));
          expect(row, findsOneWidget);
          expect(find.byTooltip(addLabel), findsOneWidget);
          expect(tester.getSize(row).height, greaterThanOrEqualTo(56));
          if (width == 820) {
            expect(
              find.byKey(const ValueKey('shop-split-basket')),
              findsOneWidget,
            );
          } else if (width == 1200) {
            expect(
              find.byKey(const ValueKey('shop-split-basket')),
              findsOneWidget,
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
              2,
            );
            final addAffordance = find.byKey(
              const ValueKey('shop-add-affordance:rice'),
            );
            expect(
              find.descendant(
                of: addAffordance,
                matching: find.text(myanmar ? 'ထည့်' : 'Add'),
              ),
              findsOneWidget,
            );
            expect(
              tester.getSize(addAffordance).height,
              greaterThanOrEqualTo(44),
            );
          }
          expect(
            find.byKey(const ValueKey('shop-product-photo:rice')),
            findsNothing,
          );
          expect(
            find.byKey(const ValueKey('shop-product-media:rice')),
            findsNothing,
          );
          expect(
            find.text(myanmar ? '၂၄,၉၀၀ ကျပ်' : '24,900 MMK'),
            findsOneWidget,
          );
          if (width <= 390) {
            final name = find.descendant(
              of: row,
              matching: find.text(
                myanmar
                    ? 'ဆန်အိတ် အရည်အသွေးကောင်း ၁၀ ကီလိုဂရမ်'
                    : 'Premium rice 10 kg bag',
              ),
            );
            final price = find.descendant(
              of: row,
              matching: find.text(myanmar ? '၂၄,၉၀၀ ကျပ်' : '24,900 MMK'),
            );
            final stock = find.descendant(
              of: row,
              matching: find.text(myanmar ? '၃ ကျန်' : '3 left'),
            );
            expect(tester.getTopLeft(price).dx, tester.getTopLeft(name).dx);
            if (width == 390) {
              expect(tester.getTopLeft(stock).dx, tester.getTopLeft(name).dx);
            } else {
              expect(
                tester.getTopLeft(stock).dx,
                tester
                    .getTopLeft(
                      find.byKey(const ValueKey('shop-add-affordance:rice')),
                    )
                    .dx,
              );
            }
            expect(
              tester
                  .getTopLeft(
                    find.byKey(const ValueKey('shop-add-affordance:rice')),
                  )
                  .dx,
              greaterThan(tester.getTopRight(name).dx),
            );
          }
          expect(tester.takeException(), isNull);

          // The labeled target and the rest of the row both add the product.
          await tester.tap(
            width == 320
                ? find.byKey(const ValueKey('shop-add-affordance:rice'))
                : row,
          );
          await tester.pumpAndSettle();
          expect(find.text('Choose photo'), findsNothing);
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
          if (width >= 820) {
            await tester.tap(
              find.byTooltip(myanmar ? 'တစ်ခုထပ်ထည့်ရန်' : 'Add one'),
            );
            await tester.pumpAndSettle();
            expect(
              tester
                  .widget<Text>(
                    find.byKey(const ValueKey('shop-cart-line-total:rice')),
                  )
                  .data,
              myanmar ? '၄၉,၈၀၀ ကျပ်' : '49,800 MMK',
            );
          }
          expect(tester.takeException(), isNull);

          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump(const Duration(milliseconds: 1));
          await database.close();
        }
      }
    },
  );

  testWidgets('320px Burmese Sell shows three rows and scrolls to a fourth', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(320, 800);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 1.5;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      for (final (id, name, price) in [
        ('water', 'ALPINE သောက်ရေသန့်', 5700),
        ('soap', 'BAYDAR အဝတ်လျှော်ဆပ်ပြာ', 5900),
        ('rice', 'KAUNG ရန်ကုန် ဆန်', 12450),
        ('noodles', 'MAMA ကြက်သား အမြန်ခေါက်ဆွဲ', 2950),
      ]) {
        await database.addProduct(
          id: id,
          name: name,
          priceMmk: price,
          openingStock: 20,
        );
      }
      await database.saveProductThumbnail(
        'water',
        base64Decode(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ'
          'AAAADUlEQVR4nGPQyNjxHwAETAJIB09U9wAAAABJRU5ErkJggg==',
        ),
      );
      await tester.pumpWidget(
        ShopApp(
          testOnlyAllowMissingRuntimeScope: true,
          database: database,
          authClient: null,
          apiBaseUrl: 'https://example.invalid',
          initialMyanmar: true,
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(
        find.descendant(
          of: find.byType(NavigationBar),
          matching: find.text('ရောင်းရန်'),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('ကုန်ပစ္စည်းများ'), findsOneWidget);
      expect(
        tester.getSize(find.byType(TextField).first).height,
        greaterThanOrEqualTo(44),
      );
      expect(
        find.descendant(
          of: find.byType(ShopTaskPageHeader),
          matching: find.text('ရောင်းရန်'),
        ),
        findsNothing,
      );
      final thirdRow = find.byKey(const ValueKey('shop-catalog-row:rice'));
      final fourthRow = find.byKey(const ValueKey('shop-catalog-row:noodles'));
      expect(
        find.byKey(const ValueKey('shop-product-photo:water')),
        findsOneWidget,
      );
      expect(thirdRow, findsOneWidget);
      final navigationTop = tester.getTopLeft(find.byType(NavigationBar)).dy;
      expect(tester.getBottomLeft(thirdRow).dy, lessThan(navigationTop));
      await tester.scrollUntilVisible(
        fourthRow,
        120,
        scrollable: find
            .ancestor(of: thirdRow, matching: find.byType(Scrollable))
            .first,
      );
      await tester.pumpAndSettle();
      expect(fourthRow, findsOneWidget);
      expect(tester.getBottomLeft(fourthRow).dy, lessThan(navigationTop + 1));
      expect(tester.getSize(thirdRow).height, greaterThanOrEqualTo(44));
      expect(
        tester
            .getSize(find.byKey(const ValueKey('shop-add-affordance:rice')))
            .height,
        greaterThanOrEqualTo(44),
      );
      expect(
        find.descendant(of: fourthRow, matching: find.text('ထည့်')),
        findsOneWidget,
      );
      expect(
        tester
            .widget<Text>(
              find.descendant(
                of: thirdRow,
                matching: find.text('KAUNG ရန်ကုန် ဆန်'),
              ),
            )
            .semanticsLabel,
        'KAUNG ရန်ကုန် ဆန်',
      );
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

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
        testOnlyAllowMissingRuntimeScope: true,
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
    expect(find.text('ငွေသားရပြီလား။'), findsOneWidget);
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
        testOnlyAllowMissingRuntimeScope: true,
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
        testOnlyAllowMissingRuntimeScope: true,
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
    expect(find.text('Cash received?'), findsNothing);
    expect(await database.countSales(), 0);
    await tester.tap(find.text('Cash sale'));
    await tester.pumpAndSettle();
    expect(find.text('Cash received?'), findsOneWidget);
    expect(find.text('3,000 MMK'), findsWidgets);
    await tester.tap(find.text('Complete sale'));
    await tester.pumpAndSettle();
    expect(await database.countSales(), 1);
    expect((await database.readActiveProducts()).single.onHand, 1);
    await database.close();
  });

  testWidgets('reopened held sale reviews a renamed and repriced item', (
    tester,
  ) async {
    _usePhoneViewport(tester);
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'tea',
        name: 'Tea',
        priceMmk: 2500,
        openingStock: 2,
      );
      await database.saveCounterSaleDraft(
        operationId: 'held-rename',
        quantities: const {'tea': 1},
      );
      await database.holdCounterSaleDraft(
        id: 'held-rename-ticket',
        name: 'Customer May',
        operationId: 'held-rename',
      );
      final stockMovementsBefore = await database.countStockMovements();
      final heldBefore = (await database.readHeldSaleTickets()).single.draft;
      expect(heldBefore.productNames, {'tea': 'Tea'});
      expect(heldBefore.unitPricesMmk, {'tea': 2500});
      await database.updateProductDetails(
        operationId: 'rename-held-tea',
        productId: 'tea',
        expectedName: 'Tea',
        expectedPriceMmk: 2500,
        expectedBarcode: null,
        name: 'Tea large',
        priceMmk: 3000,
        barcode: null,
      );
      final heldAfterEdit = (await database.readHeldSaleTickets()).single.draft;
      expect(heldAfterEdit.productNames, {'tea': 'Tea'});
      expect(heldAfterEdit.unitPricesMmk, {'tea': 2500});
      expect((await database.readActiveProducts()).single.onHand, 2);
      expect(await database.countStockMovements(), stockMovementsBefore);
      await tester.pumpWidget(
        MaterialApp(
          home: ShopHome(
            testOnlyAllowMissingRuntimeScope: true,
            database: database,
            authClient: null,
            apiBaseUrl: 'https://example.invalid',
            myanmar: false,
            onLanguageChanged: (_) {},
          ),
        ),
      );
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('shop-held-sales-open')));
      await tester.pumpAndSettle();
      await tester.tap(
        find.byKey(const ValueKey('shop-held-reopen:held-rename-ticket')),
      );
      await tester.pumpAndSettle();
      expect((await database.readCounterSaleDraft())?.productNames, {
        'tea': 'Tea',
      });
      expect((await database.readCounterSaleDraft())?.unitPricesMmk, {
        'tea': 2500,
      });
      await tester.tap(find.textContaining('Review sale'));
      await tester.pumpAndSettle();
      expect(find.text('Tea large'), findsWidgets);
      expect(find.text('3,000 MMK'), findsWidgets);
      expect(
        find.text('Sale restored. Review changed items before checkout.'),
        findsOneWidget,
      );
      await tester.ensureVisible(find.text('Cash sale'));
      await tester.pumpAndSettle();
      expect(find.text('Cash sale').hitTestable(), findsOneWidget);
      await tester.tap(find.text('Cash sale'));
      await tester.pumpAndSettle();
      expect(find.text('Cash received?'), findsNothing);
      expect(await database.countSales(), 0);
      expect((await database.readCounterSaleDraft())?.productNames, {
        'tea': 'Tea large',
      });
      expect((await database.readCounterSaleDraft())?.unitPricesMmk, {
        'tea': 3000,
      });
      expect((await database.readActiveProducts()).single.onHand, 2);
      expect(await database.countStockMovements(), stockMovementsBefore);
      await tester.ensureVisible(find.text('Cash sale'));
      await tester.pumpAndSettle();
      expect(find.text('Cash sale').hitTestable(), findsOneWidget);
      await tester.tap(find.text('Cash sale'));
      await tester.pumpAndSettle();
      expect(find.text('Cash received?'), findsOneWidget);
      await tester.tap(find.text('Complete sale'));
      await tester.pumpAndSettle();
      final sale = await database.select(database.shopSaleLines).getSingle();
      expect(sale.productName, 'Tea large');
      expect(sale.unitPriceMmk, 3000);
      expect(await database.countSales(), 1);
      expect((await database.readActiveProducts()).single.onHand, 1);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  test(
    'cash commit rejects offsetting line-price changes at the same total',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await database.addProduct(
          id: 'a',
          name: 'A',
          priceMmk: 2000,
          openingStock: 2,
        );
        await database.addProduct(
          id: 'b',
          name: 'B',
          priceMmk: 3000,
          openingStock: 2,
        );
        await database.updateProductDetails(
          operationId: 'edit-a-price',
          productId: 'a',
          expectedName: 'A',
          expectedPriceMmk: 2000,
          expectedBarcode: null,
          name: 'A',
          priceMmk: 2500,
          barcode: null,
        );
        await database.updateProductDetails(
          operationId: 'edit-b-price',
          productId: 'b',
          expectedName: 'B',
          expectedPriceMmk: 3000,
          expectedBarcode: null,
          name: 'B',
          priceMmk: 2500,
          barcode: null,
        );
        final salesBefore = await database.countSales();
        final stockBefore = await database.countStockMovements();
        await expectLater(
          database.recordSale(
            operationId: 'offset-price-sale',
            paymentMethod: 'cash',
            lines: const [
              ShopSaleLineInput(productId: 'a', quantity: 1),
              ShopSaleLineInput(productId: 'b', quantity: 1),
            ],
            expectedTotalMmk: 5000,
            expectedUnitPricesMmk: const {'a': 2000, 'b': 3000},
          ),
          throwsStateError,
        );
        expect(await database.countSales(), salesBefore);
        expect(await database.countStockMovements(), stockBefore);
        expect(
          (await database.readActiveProducts()).every((p) => p.onHand == 2),
          isTrue,
        );
      } finally {
        await database.close();
      }
    },
  );

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
        testOnlyAllowMissingRuntimeScope: true,
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

  testWidgets('clearing an unfinished sale requires confirmation', (
    tester,
  ) async {
    _usePhoneViewport(tester);
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'tea-clear',
        name: 'Tea',
        priceMmk: 2500,
        openingStock: 2,
      );
      await tester.pumpWidget(
        ShopApp(
          testOnlyAllowMissingRuntimeScope: true,
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

      await tester.tap(find.byTooltip('Add one'));
      await tester.tap(find.byKey(const ValueKey('shop-clear-sale')));
      await tester.pumpAndSettle();
      expect(find.text('Clear current sale?'), findsOneWidget);
      expect(find.textContaining('2 items will be removed'), findsOneWidget);
      final addOneButton = find.ancestor(
        of: find.byTooltip('Add one'),
        matching: find.byType(IconButton),
      );
      expect(tester.widget<IconButton>(addOneButton).onPressed, isNull);
      expect(
        find.textContaining('Saved sales and stock will not change.'),
        findsOneWidget,
      );
      await tester.tap(find.text('Keep sale'));
      await tester.pumpAndSettle();
      expect((await database.readCounterSaleDraft())?.quantities, {
        'tea-clear': 2,
      });
      expect(await database.countSales(), 0);
      expect((await database.readActiveProducts()).single.onHand, 2);

      await tester.tap(find.byKey(const ValueKey('shop-clear-sale')));
      await tester.pumpAndSettle();
      await tester.tap(find.byKey(const ValueKey('shop-clear-sale-confirm')));
      await tester.pumpAndSettle();
      expect(await database.readCounterSaleDraft(), isNull);
      expect(await database.countSales(), 0);
      expect((await database.readActiveProducts()).single.onHand, 2);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets(
    'cash tender shows change and a short payment cannot record a sale',
    (tester) async {
      _usePhoneViewport(tester);
      final database = ShopDatabase(NativeDatabase.memory());
      await database.addProduct(
        id: 'rice',
        name: 'Rice',
        priceMmk: 13500,
        openingStock: 2,
      );
      await tester.pumpWidget(
        ShopApp(
          testOnlyAllowMissingRuntimeScope: true,
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
      await tester.pumpAndSettle();

      expect(await database.countSales(), 0);
      expect(
        tester
            .widget<EditableText>(
              find.descendant(
                of: find.byKey(const ValueKey('shop-cash-given')),
                matching: find.byType(EditableText),
              ),
            )
            .focusNode
            .hasFocus,
        isTrue,
      );
      await tester.enterText(
        find.byKey(const ValueKey('shop-cash-given')),
        '20000',
      );
      await tester.pumpAndSettle();
      expect(find.text('Change'), findsOneWidget);
      expect(find.text('6,500 MMK'), findsOneWidget);
      expect(await database.countSales(), 0);

      await tester.enterText(
        find.byKey(const ValueKey('shop-cash-given')),
        '12000',
      );
      await tester.pumpAndSettle();
      expect(
        find.text('Cash given is less than the amount due.'),
        findsOneWidget,
      );
      final confirm = find.ancestor(
        of: find.text('Complete sale'),
        matching: find.byType(FilledButton),
      );
      expect(tester.widget<FilledButton>(confirm).onPressed, isNull);
      expect(await database.countSales(), 0);
      expect((await database.readActiveProducts()).single.onHand, 2);

      await tester.enterText(
        find.byKey(const ValueKey('shop-cash-given')),
        '20000',
      );
      await tester.pumpAndSettle();
      expect(tester.widget<FilledButton>(confirm).onPressed, isNotNull);
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      expect(find.textContaining('change 6,500 MMK'), findsOneWidget);
      expect(await database.countSales(), 1);
      expect((await database.readActiveProducts()).single.onHand, 1);
      await database.close();
    },
  );

  for (final myanmar in [false, true]) {
    testWidgets(
      'dedicated member card selection links one cash sale in ${myanmar ? 'MY' : 'EN'}',
      (tester) async {
        _usePhoneViewport(tester);
        final database = ShopDatabase(NativeDatabase.memory());
        const memberId = 'mem_11111111111111111111111111111111';
        final memberToken = _widgetMemberToken(1);
        await _seedWidgetMember(
          database,
          memberId: memberId,
          displayCode: '00001234',
          token: memberToken,
        );
        await database.addProduct(
          id: 'rice-member',
          name: 'Rice',
          priceMmk: 2500,
          openingStock: 2,
        );
        await tester.pumpWidget(
          ShopApp(
            testOnlyAllowMissingRuntimeScope: true,
            initialCounter: true,
            database: database,
            authClient: null,
            apiBaseUrl: 'https://app.supermega.dev',
            initialMyanmar: myanmar,
          ),
        );
        await tester.pumpAndSettle();
        await tester.tap(
          find.byTooltip(myanmar ? 'အရောင်းထဲထည့်ရန်' : 'Add to sale'),
        );
        await tester.pumpAndSettle();
        await tester.tap(
          find.textContaining(myanmar ? 'အရောင်းစစ်ရန်' : 'Review sale'),
        );
        await tester.pumpAndSettle();

        final selector = find.byKey(const ValueKey('shop-select-member-card'));
        await tester.ensureVisible(selector);
        await tester.tap(selector);
        await tester.pumpAndSettle();
        await tester.enterText(
          find.byKey(const ValueKey('shop-member-card-input')),
          _widgetMemberToken(9),
        );
        await tester.tap(find.byKey(const ValueKey('shop-member-card-apply')));
        await tester.pumpAndSettle();
        expect(
          find.text(
            myanmar
                ? 'ဤအသင်းဝင်ကတ်ကို မသိပါ၊ အစားထိုးထားပါသည် သို့မဟုတ် ပိတ်ထားပါသည်။'
                : 'This member card is unknown, replaced or revoked.',
          ),
          findsOneWidget,
        );
        expect(await database.countSales(), 0);

        await tester.enterText(
          find.byKey(const ValueKey('shop-member-card-input')),
          memberToken,
        );
        await tester.tap(find.byKey(const ValueKey('shop-member-card-apply')));
        await tester.pumpAndSettle();
        expect(
          find.byKey(const ValueKey('shop-selected-member-card')),
          findsOneWidget,
        );
        expect(find.text('00001234'), findsOneWidget);

        await tester.tap(find.text(myanmar ? 'ငွေသား' : 'Cash sale'));
        await tester.pumpAndSettle();
        await tester.tap(find.text(myanmar ? 'အတည်ပြုရန်' : 'Complete sale'));
        await tester.pumpAndSettle();
        final sale = (await database.readRecentSales()).single;
        expect(sale.member?.memberId, memberId);
        expect(await database.countSales(), 1);
        expect((await database.readActiveProducts()).single.onHand, 1);
        await database.close();
      },
    );
  }

  testWidgets(
    'member selection is cleared when a sale is held before the next walk-in checkout',
    (tester) async {
      _usePhoneViewport(tester);
      final database = ShopDatabase(NativeDatabase.memory());
      final memberToken = _widgetMemberToken(21);
      try {
        await _seedWidgetMember(
          database,
          memberId: 'mem_21212121212121212121212121212121',
          displayCode: '00000021',
          token: memberToken,
        );
        await database.addProduct(
          id: 'held-member-rice',
          name: 'Rice',
          priceMmk: 1000,
          openingStock: 3,
        );
        await tester.pumpWidget(
          ShopApp(
            testOnlyAllowMissingRuntimeScope: true,
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
        await tester.tap(find.byKey(const ValueKey('shop-select-member-card')));
        await tester.pumpAndSettle();
        await tester.enterText(
          find.byKey(const ValueKey('shop-member-card-input')),
          memberToken,
        );
        await tester.tap(find.byKey(const ValueKey('shop-member-card-apply')));
        await tester.pumpAndSettle();
        expect(
          find.byKey(const ValueKey('shop-selected-member-card')),
          findsOneWidget,
        );
        await tester.ensureVisible(
          find.byKey(const ValueKey('shop-hold-sale')),
        );
        await tester.tap(find.byKey(const ValueKey('shop-hold-sale')));
        await tester.pumpAndSettle();
        await tester.enterText(
          find.byKey(const ValueKey('shop-held-sale-name')),
          'Member A',
        );
        await tester.pumpAndSettle();
        await tester.tap(find.byKey(const ValueKey('shop-held-sale-confirm')));
        await tester.pumpAndSettle();
        if (find
            .byKey(const ValueKey('shop-hold-sale'))
            .evaluate()
            .isNotEmpty) {
          await tester.binding.handlePopRoute();
          await tester.pumpAndSettle();
        }
        await tester.ensureVisible(
          find.byKey(const ValueKey('shop-held-sales-open')),
        );
        await tester.tap(find.byKey(const ValueKey('shop-held-sales-open')));
        await tester.pumpAndSettle();
        final heldId = (await database.readHeldSaleTickets()).single.id;
        await tester.tap(find.byKey(ValueKey('shop-held-reopen:$heldId')));
        await tester.pumpAndSettle();
        await tester.ensureVisible(find.textContaining('Review sale'));
        await tester.tap(find.textContaining('Review sale'));
        await tester.pumpAndSettle();
        expect(
          find.byKey(const ValueKey('shop-selected-member-card')),
          findsNothing,
        );
        await tester.tap(find.text('Cash sale'));
        await tester.pumpAndSettle();
        await tester.tap(find.text('Complete sale'));
        await tester.pumpAndSettle();
        final sale = (await database.readRecentSales()).single;
        expect(sale.member, isNull);
        expect(await database.readHeldSaleTickets(), isEmpty);
        expect((await database.readActiveProducts()).single.onHand, 2);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump(const Duration(milliseconds: 1));
        await database.close();
      }
    },
  );

  testWidgets('cancelling a member wallet intent restores a walk-in basket', (
    tester,
  ) async {
    _usePhoneViewport(tester);
    final database = ShopDatabase(NativeDatabase.memory());
    final memberToken = _widgetMemberToken(24);
    try {
      await _seedWidgetMember(
        database,
        memberId: 'mem_24242424242424242424242424242424',
        displayCode: '00000024',
        token: memberToken,
      );
      await database.addProduct(
        id: 'wallet-member-tea',
        name: 'Tea',
        priceMmk: 2500,
        openingStock: 2,
      );
      await database.saveWalletSetup(
        MerchantWalletSetup(
          provider: 'KBZPay',
          merchantPhone: null,
          officialQrPayload: _testStaticMmqr(),
          issuerConfirmed: true,
        ),
      );
      await tester.pumpWidget(
        ShopApp(
          testOnlyAllowMissingRuntimeScope: true,
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
      await tester.tap(find.byKey(const ValueKey('shop-select-member-card')));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('shop-member-card-input')),
        memberToken,
      );
      await tester.tap(find.byKey(const ValueKey('shop-member-card-apply')));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Mobile money'));
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('shop-pending-wallet-member')),
        findsWidgets,
      );
      expect(
        (await database.readPendingWalletCheckout())?.member?.displayCode,
        '00000024',
      );
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('I checked: no payment arrived').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancel checkout'));
      await tester.pumpAndSettle();
      expect(await database.readPendingWalletCheckout(), isNull);
      expect(
        find.byKey(const ValueKey('shop-selected-member-card')),
        findsNothing,
      );
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      await tester.tap(find.textContaining('Review sale'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cash sale'));
      await tester.pumpAndSettle();
      if (find.text('Complete sale').evaluate().isEmpty) {
        await tester.tap(find.text('Cash sale'));
        await tester.pumpAndSettle();
      }
      await tester.tap(find.text('Complete sale'));
      await tester.pumpAndSettle();
      final sale = (await database.readRecentSales()).single;
      expect(sale.member, isNull);
      expect(await database.countSales(), 1);
      expect((await database.readActiveProducts()).single.onHand, 1);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  for (final myanmar in [false, true]) {
    testWidgets(
      'member selector fits 320px at 1.5x and accepts a Tab scan in ${myanmar ? 'MY' : 'EN'}',
      (tester) async {
        tester.view.physicalSize = const Size(320, 900);
        tester.view.devicePixelRatio = 1;
        tester.platformDispatcher.textScaleFactorTestValue = 1.5;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        final database = ShopDatabase(NativeDatabase.memory());
        final token = _widgetMemberToken(myanmar ? 23 : 22);
        try {
          await _seedWidgetMember(
            database,
            memberId: myanmar
                ? 'mem_23232323232323232323232323232323'
                : 'mem_22222222222222222222222222222222',
            displayCode: myanmar ? '00000023' : '00000022',
            token: token,
          );
          await database.addProduct(
            id: 'compact-member-rice',
            name: 'Rice',
            priceMmk: 1000,
            openingStock: 2,
          );
          await tester.pumpWidget(
            ShopApp(
              testOnlyAllowMissingRuntimeScope: true,
              initialCounter: true,
              database: database,
              authClient: null,
              apiBaseUrl: 'https://app.supermega.dev',
              initialMyanmar: myanmar,
            ),
          );
          await tester.pumpAndSettle();
          await tester.tap(
            find.byTooltip(myanmar ? 'အရောင်းထဲထည့်ရန်' : 'Add to sale'),
          );
          await tester.pumpAndSettle();
          await tester.tap(
            find.textContaining(myanmar ? 'အရောင်းစစ်ရန်' : 'Review sale'),
          );
          await tester.pumpAndSettle();
          final selector = find.byKey(
            const ValueKey('shop-select-member-card'),
          );
          await tester.ensureVisible(selector);
          expect(tester.getSize(selector).height, greaterThanOrEqualTo(48));
          await tester.tap(selector);
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await tester.enterText(
            find.byKey(const ValueKey('shop-member-card-input')),
            token,
          );
          await tester.sendKeyDownEvent(LogicalKeyboardKey.tab);
          await tester.sendKeyUpEvent(LogicalKeyboardKey.tab);
          await tester.pumpAndSettle();
          final layoutError = tester.takeException();
          expect(layoutError, isNull);
          expect(
            find.byKey(const ValueKey('shop-selected-member-card')),
            findsOneWidget,
          );
          final cash = find.widgetWithText(
            FilledButton,
            myanmar ? 'ငွေသား' : 'Cash sale',
          );
          final wallet = find.widgetWithText(
            OutlinedButton,
            myanmar ? 'မိုဘိုင်းငွေပေးချေမှု' : 'Mobile money',
          );
          await tester.ensureVisible(wallet);
          expect(tester.getSize(cash).height, greaterThanOrEqualTo(48));
          expect(tester.getSize(wallet).height, greaterThanOrEqualTo(48));
          await tester.tap(
            find.byTooltip(myanmar ? 'အသင်းဝင်ဖယ်ရန်' : 'Remove member'),
          );
          await tester.pumpAndSettle();
          expect(
            find.byKey(const ValueKey('shop-selected-member-card')),
            findsNothing,
          );
          expect(await database.countSales(), 0);
        } finally {
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump(const Duration(milliseconds: 1));
          await database.close();
        }
      },
    );
  }

  testWidgets('member-card token in product search cannot become a product', (
    tester,
  ) async {
    _usePhoneViewport(tester);
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'member-namespace-control',
        name: 'Control',
        priceMmk: 100,
        openingStock: 1,
      );
      await tester.pumpWidget(
        ShopApp(
          testOnlyAllowMissingRuntimeScope: true,
          initialCounter: true,
          database: database,
          authClient: null,
          apiBaseUrl: 'https://app.supermega.dev',
          initialMyanmar: false,
        ),
      );
      await tester.pumpAndSettle();
      await tester.enterText(
        find.byKey(const ValueKey('shop-sale-search-field')),
        _widgetMemberToken(24),
      );
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsNothing);
      expect((await database.readActiveProducts()).length, 1);
      expect(await database.readCounterSaleDraft(), isNull);
      expect(await database.countSales(), 0);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets(
    'Burmese cash confirmation labels the optional tender and change',
    (tester) async {
      _usePhoneViewport(tester);
      final database = ShopDatabase(NativeDatabase.memory());
      await database.addProduct(
        id: 'rice',
        name: 'Rice',
        priceMmk: 13500,
        openingStock: 2,
      );
      await tester.pumpWidget(
        ShopApp(
          testOnlyAllowMissingRuntimeScope: true,
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
      await tester.tap(find.text('ငွေသား'));
      await tester.pumpAndSettle();
      expect(find.text('ပေးငွေ'), findsOneWidget);
      expect(find.text('မထည့်လည်းရ'), findsOneWidget);
      await tester.enterText(
        find.byKey(const ValueKey('shop-cash-given')),
        '၂၀၀၀၀',
      );
      await tester.pumpAndSettle();
      expect(find.text('ပြန်အမ်းငွေ'), findsOneWidget);
      expect(find.text('၆,၅၀၀ ကျပ်'), findsOneWidget);
      expect(await database.countSales(), 0);
      await database.close();
    },
  );

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
        testOnlyAllowMissingRuntimeScope: true,
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
    expect(find.byType(AlertDialog), findsOneWidget);
    expect((await database.readActiveProducts()).length, 1);
    expect(
      tester
          .widget<TextFormField>(
            find.byKey(const ValueKey('shop-product-barcode')),
          )
          .controller!
          .text,
      '0012345678905',
    );
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsNothing);
    expect((await database.readActiveProducts()).length, 1);
    expect(
      tester.widget<TextField>(find.byType(TextField)).controller!.text,
      '0012345678905',
    );
    expect(
      tester.widget<TextField>(find.byType(TextField)).focusNode!.hasFocus,
      isTrue,
    );
    await tester.testTextInput.receiveAction(TextInputAction.done);
    await tester.pumpAndSettle();
    expect(find.byType(AlertDialog), findsOneWidget);
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
    expect(
      tester.widget<TextField>(find.byType(TextField)).focusNode!.hasFocus,
      isTrue,
    );
    await tester.enterText(find.byType(TextField), '0012345678905');
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
          testOnlyAllowMissingRuntimeScope: true,
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
          testOnlyAllowMissingRuntimeScope: true,
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

      await tester.enterText(search, 'NO-MATCH');
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

  testWidgets(
    'scan field keeps leading zeros and handles submitted CR LF Tab and repeats',
    (tester) async {
      _usePhoneViewport(tester);
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await database.addProduct(
          id: 'tea-wedge',
          name: 'Tea',
          barcode: '0012345678905',
          priceMmk: 2500,
          openingStock: 3,
        );
        await tester.pumpWidget(
          ShopApp(
            testOnlyAllowMissingRuntimeScope: true,
            initialCounter: true,
            database: database,
            authClient: null,
            apiBaseUrl: 'https://app.supermega.dev',
            initialMyanmar: false,
          ),
        );
        await tester.pumpAndSettle();
        final search = find.byKey(const ValueKey('shop-sale-search-field'));
        await tester.tap(search);

        // A submitted CR/LF string is normalized as one scan. This simulates
        // the field value, not physical HID delivery, and preserves zeros.
        await tester.enterText(search, '0012345678905\r\n');
        await tester.testTextInput.receiveAction(TextInputAction.done);

        // A consecutive, separately triggered Tab scan is intentional quantity
        // two. Both durable draft writes must remain serialized.
        await tester.enterText(search, '0012345678905');
        await tester.sendKeyEvent(LogicalKeyboardKey.tab);
        await tester.pumpAndSettle();
        expect(find.textContaining('Review sale · 2'), findsOneWidget);
        expect(tester.widget<TextField>(search).focusNode!.hasFocus, isTrue);
        expect(await database.countSales(), 0);
        expect((await database.readActiveProducts()).single.onHand, 3);

        // Empty Tab remains normal keyboard traversal; manual search can be
        // focused again and never commits a sale or changes stock.
        await tester.sendKeyEvent(LogicalKeyboardKey.tab);
        await tester.pump();
        expect(tester.widget<TextField>(search).focusNode!.hasFocus, isFalse);
        expect(FocusManager.instance.primaryFocus, isNotNull);
        expect(
          FocusManager.instance.primaryFocus,
          isNot(same(tester.widget<TextField>(search).focusNode)),
        );
        await tester.tap(search);
        await tester.enterText(search, 'Tea');
        await tester.sendKeyEvent(LogicalKeyboardKey.tab);
        await tester.pump();
        expect(tester.widget<TextField>(search).controller!.text, 'Tea');
        expect(tester.widget<TextField>(search).focusNode!.hasFocus, isFalse);

        // An unknown numeric scan candidate stays available for manual lookup
        // and consumes its configured Tab terminator without changing stock.
        await tester.tap(search);
        await tester.enterText(search, '0099999999999');
        await tester.sendKeyEvent(LogicalKeyboardKey.tab);
        await tester.pumpAndSettle();
        expect(
          tester.widget<TextField>(search).controller!.text,
          '0099999999999',
        );
        expect(find.byType(AlertDialog), findsOneWidget);
        expect(
          tester
              .widget<TextFormField>(
                find.byKey(const ValueKey('shop-product-barcode')),
              )
              .controller!
              .text,
          '0099999999999',
        );
        await tester.tap(find.text('Cancel'));
        await tester.pumpAndSettle();
        expect(find.byType(AlertDialog), findsNothing);
        await tester.tap(search);
        expect(tester.widget<TextField>(search).focusNode!.hasFocus, isTrue);
        expect(await database.countSales(), 0);
        expect((await database.readActiveProducts()).single.onHand, 3);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump(const Duration(milliseconds: 1));
        await database.close();
      }
    },
  );

  testWidgets('cashier can receive and count stock outside the sale screen', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(820, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final database = ShopDatabase(NativeDatabase.memory());
    await database.addProduct(
      id: 'rice',
      name: 'Rice',
      priceMmk: 12000,
      openingStock: 2,
    );
    await tester.pumpWidget(
      ShopApp(
        testOnlyAllowMissingRuntimeScope: true,
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
    expect(find.text('Adjust stock'), findsOneWidget);

    await tester.tap(find.byKey(const ValueKey('stock-update-rice')));
    await tester.pumpAndSettle();
    expect(find.text('Receive'), findsOneWidget);
    expect(find.text('Count'), findsOneWidget);
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect((await database.readActiveProducts()).single.onHand, 2);

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

  test('editing a catalog item preserves stock and prior receipts', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'apple',
        name: 'Red apple',
        priceMmk: 2800,
        openingStock: 3,
        barcode: '111111',
      );
      await database.addProduct(
        id: 'banana',
        name: 'Banana',
        priceMmk: 2500,
        openingStock: 3,
        barcode: '222222',
      );
      final receipt = await database.recordCashSale(
        operationId: 'sold-before-edit',
        lines: const [ShopSaleLineInput(productId: 'apple', quantity: 1)],
      );
      final movementCount = await database.countStockMovements();
      final outboxCount = await database.countOutboxOperations();
      Future<void> edit({
        required String operationId,
        required String expectedName,
        required int expectedPrice,
        required String? expectedBarcode,
        required String name,
        required int price,
        required String? barcode,
      }) => database.updateProductDetails(
        operationId: operationId,
        productId: 'apple',
        expectedName: expectedName,
        expectedPriceMmk: expectedPrice,
        expectedBarcode: expectedBarcode,
        name: name,
        priceMmk: price,
        barcode: barcode,
      );
      await edit(
        operationId: 'edit-apple',
        expectedName: 'Red apple',
        expectedPrice: 2800,
        expectedBarcode: '111111',
        name: 'Apple 1 pc',
        price: 3200,
        barcode: '333333',
      );
      final apple = (await database.readActiveProducts()).singleWhere(
        (product) => product.id == 'apple',
      );
      expect(apple.name, 'Apple 1 pc');
      expect(apple.priceMmk, 3200);
      expect(apple.barcode, '333333');
      expect(apple.onHand, 2);
      expect(await database.countStockMovements(), movementCount);
      expect(await database.countOutboxOperations(), outboxCount + 1);
      expect(receipt.lines.single.productName, 'Red apple');
      expect(receipt.lines.single.unitPriceMmk, 2800);
      await edit(
        operationId: 'edit-apple',
        expectedName: 'Red apple',
        expectedPrice: 2800,
        expectedBarcode: '111111',
        name: 'Apple 1 pc',
        price: 3200,
        barcode: '333333',
      );
      expect(await database.countOutboxOperations(), outboxCount + 1);
      await expectLater(
        edit(
          operationId: 'duplicate-barcode',
          expectedName: 'Apple 1 pc',
          expectedPrice: 3200,
          expectedBarcode: '333333',
          name: 'Apple 1 pc',
          price: 3500,
          barcode: '222222',
        ),
        throwsStateError,
      );
      await expectLater(
        edit(
          operationId: 'stale-edit',
          expectedName: 'Red apple',
          expectedPrice: 2800,
          expectedBarcode: '111111',
          name: 'Stale apple',
          price: 2900,
          barcode: '444444',
        ),
        throwsStateError,
      );
      expect(
        (await database.readActiveProducts())
            .singleWhere((product) => product.id == 'apple')
            .priceMmk,
        3200,
      );
      expect(await database.countOutboxOperations(), outboxCount + 1);
    } finally {
      await database.close();
    }
  });

  test('cash commit rejects an unreviewed rename at the same price', () async {
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'tea',
        name: 'Tea',
        priceMmk: 2500,
        openingStock: 2,
      );
      await database.updateProductDetails(
        operationId: 'rename-for-cash',
        productId: 'tea',
        expectedName: 'Tea',
        expectedPriceMmk: 2500,
        expectedBarcode: null,
        name: 'Tea large',
        priceMmk: 2500,
        barcode: null,
      );
      final stockMovements = await database.countStockMovements();
      await expectLater(
        database.recordSale(
          operationId: 'cash-before-rename-review',
          paymentMethod: 'cash',
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
          expectedTotalMmk: 2500,
          expectedUnitPricesMmk: const {'tea': 2500},
          expectedProductNames: const {'tea': 'Tea'},
        ),
        throwsStateError,
      );
      expect(await database.countSales(), 0);
      expect(await database.countStockMovements(), stockMovements);
      expect((await database.readActiveProducts()).single.onHand, 2);
    } finally {
      await database.close();
    }
  });

  test(
    'pending wallet intent keeps its product snapshot after catalog edit',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await database.addProduct(
          id: 'tea',
          name: 'Tea',
          priceMmk: 2500,
          openingStock: 2,
        );
        await database.createWalletCheckoutIntent(
          operationId: 'wallet-before-edit',
          merchant: MerchantWalletSetup(
            provider: 'KBZPay',
            merchantPhone: '09123456789',
            officialQrPayload: _testStaticMmqr(),
            issuerConfirmed: true,
          ),
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
        );
        await database.updateProductDetails(
          operationId: 'edit-after-wallet',
          productId: 'tea',
          expectedName: 'Tea',
          expectedPriceMmk: 2500,
          expectedBarcode: null,
          name: 'Tea large',
          priceMmk: 3000,
          barcode: null,
        );
        final intent = (await database.readPendingWalletCheckout())!;
        expect(intent.totalMmk, 2500);
        expect(intent.lines.single.productName, 'Tea');
        expect(intent.lines.single.unitPriceMmk, 2500);
        final receipt = await database.recordSale(
          operationId: intent.operationId,
          paymentMethod: 'kbzpay',
          walletCheckoutOperationId: intent.operationId,
          lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
        );
        expect(receipt.totalMmk, 2500);
        expect(receipt.lines.single.productName, 'Tea');
        expect(receipt.lines.single.unitPriceMmk, 2500);
        expect((await database.readActiveProducts()).single.onHand, 1);
      } finally {
        await database.close();
      }
    },
  );

  for (final myanmar in [false, true]) {
    testWidgets('Stock edits a product in ${myanmar ? 'MY' : 'EN'}', (
      tester,
    ) async {
      _usePhoneViewport(tester);
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        await database.addProduct(
          id: 'apple',
          name: 'Red apple',
          priceMmk: 2800,
          openingStock: 7,
          barcode: '111111',
        );
        await database.saveProductThumbnail(
          'apple',
          File('test/assets/grocery_photos/apple.png').readAsBytesSync(),
        );
        await tester.pumpWidget(
          MaterialApp(
            home: StockScreen(database: database, myanmar: myanmar),
          ),
        );
        await _settleStock(tester);
        expect(find.byKey(const ValueKey('stock-photo-apple')), findsOneWidget);
        expect(find.byKey(const ValueKey('stock-more-apple')), findsOneWidget);
        await tester.tap(find.byKey(const ValueKey('stock-more-apple')));
        await _settleStock(tester);
        await tester.tap(find.byKey(const ValueKey('stock-edit-apple')));
        await _settleStock(tester);
        expect(find.byKey(const ValueKey('stock-edit-name')), findsOneWidget);
        await tester.tap(find.text(myanmar ? 'မလုပ်တော့ပါ' : 'Cancel'));
        await _settleStock(tester);
        expect((await database.readActiveProducts()).single.priceMmk, 2800);
        await tester.tap(find.byKey(const ValueKey('stock-more-apple')));
        await _settleStock(tester);
        await tester.tap(find.byKey(const ValueKey('stock-edit-apple')));
        await _settleStock(tester);
        await tester.enterText(
          find.byKey(const ValueKey('stock-edit-name')),
          'Apple 1 pc',
        );
        await tester.enterText(
          find.byKey(const ValueKey('stock-edit-price')),
          myanmar ? '၃၂၀၀' : '3200',
        );
        await tester.enterText(
          find.byKey(const ValueKey('stock-edit-barcode')),
          '333333',
        );
        await tester.tap(find.byKey(const ValueKey('stock-edit-save')));
        await _settleStock(tester);
        final apple = (await database.readActiveProducts()).single;
        expect(apple.name, 'Apple 1 pc');
        expect(apple.priceMmk, 3200);
        expect(apple.barcode, '333333');
        expect(apple.onHand, 7);
        expect(tester.takeException(), isNull);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump(const Duration(milliseconds: 1));
        await database.close();
      }
    });
  }

  testWidgets('Stock refreshes a photo when returning from Sell', (
    tester,
  ) async {
    _usePhoneViewport(tester);
    final database = ShopDatabase(NativeDatabase.memory());
    final firstPhoto = base64Decode(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ'
      'AAAADUlEQVR4nGPQyNjxHwAETAJIB09U9wAAAABJRU5ErkJggg==',
    );
    final nextPhoto = File('test/assets/grocery_photos/apple.png')
        .readAsBytesSync();
    try {
      await database.addProduct(
        id: 'apple',
        name: 'Apple',
        priceMmk: 2800,
        openingStock: 7,
      );
      await database.saveProductThumbnail('apple', firstPhoto);
      Widget screen({required bool active}) => MaterialApp(
        home: StockScreen(database: database, myanmar: false, active: active),
      );
      await tester.pumpWidget(screen(active: true));
      await _settleStock(tester);
      Image photo() =>
          tester.widget<Image>(find.byKey(const ValueKey('stock-photo-apple')));
      expect((photo().image as MemoryImage).bytes, orderedEquals(firstPhoto));

      await tester.pumpWidget(screen(active: false));
      await database.saveProductThumbnail('apple', nextPhoto);
      await tester.pumpWidget(screen(active: true));
      await _settleStock(tester);
      expect((photo().image as MemoryImage).bytes, orderedEquals(nextPhoto));
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('Stock switches mounted catalogs with its database', (
    tester,
  ) async {
    _usePhoneViewport(tester);
    final first = ShopDatabase(NativeDatabase.memory());
    final second = ShopDatabase(NativeDatabase.memory());
    try {
      await first.addProduct(
        id: 'apple',
        name: 'Apple',
        priceMmk: 2800,
        openingStock: 7,
      );
      await second.addProduct(
        id: 'orange',
        name: 'Orange',
        priceMmk: 3200,
        openingStock: 4,
      );
      Widget screen(ShopDatabase database) =>
          MaterialApp(home: StockScreen(database: database, myanmar: false));
      await tester.pumpWidget(screen(first));
      await _settleStock(tester);
      expect(find.text('Apple'), findsOneWidget);
      await tester.pumpWidget(screen(second));
      await _settleStock(tester);
      expect(find.text('Orange'), findsOneWidget);
      expect(find.text('Apple'), findsNothing);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await first.close();
      await second.close();
    }
  });

  testWidgets('tablet Stock shows a photographed item and its price in MY', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(820, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final database = ShopDatabase(NativeDatabase.memory());
    try {
      await database.addProduct(
        id: 'apple',
        name: 'ပန်းသီး',
        priceMmk: 2800,
        openingStock: 7,
      );
      await database.saveProductThumbnail(
        'apple',
        File('test/assets/grocery_photos/apple.png').readAsBytesSync(),
      );
      await tester.pumpWidget(
        MaterialApp(home: StockScreen(database: database, myanmar: true)),
      );
      await _settleStock(tester);
      expect(find.byKey(const ValueKey('stock-photo-apple')), findsOneWidget);
      expect(find.textContaining('၂,၈၀၀'), findsWidgets);
      expect(find.byKey(const ValueKey('stock-more-apple')), findsOneWidget);
      expect(tester.takeException(), isNull);
    } finally {
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    }
  });

  testWidgets('phone stock action opens and cancels', (tester) async {
    final semantics = tester.ensureSemantics();
    tester.view.physicalSize = const Size(320, 800);
    tester.view.devicePixelRatio = 1;
    tester.platformDispatcher.textScaleFactorTestValue = 1.3;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    final database = ShopDatabase(NativeDatabase.memory());
    await database.addProduct(
      id: 'rice-phone',
      name: 'အလွန်ရှည်သော ကုန်ပစ္စည်းအမည် ဆန်အိတ်',
      sku: 'RICE-L',
      priceMmk: 12000,
      openingStock: 2,
    );
    await database.addProduct(
      id: 'rice-phone-small',
      name: 'အလွန်ရှည်သော ကုန်ပစ္စည်းအမည် ဆန်အိတ်',
      sku: 'RICE-S',
      priceMmk: 6000,
      openingStock: 4,
    );
    await database.saveProductThumbnail(
      'rice-phone',
      File('test/assets/grocery_photos/apple.png').readAsBytesSync(),
    );
    await tester.pumpWidget(
      ShopApp(
        testOnlyAllowMissingRuntimeScope: true,
        initialCounter: true,
        database: database,
        authClient: null,
        apiBaseUrl: 'https://app.supermega.dev',
        initialMyanmar: true,
      ),
    );
    await _settleStock(tester);
    await tester.tap(find.byTooltip('နောက်ထပ်'));
    await _settleStock(tester);
    await tester.tap(find.text('လက်ကျန်'));
    await _settleStock(tester);
    expect(find.byKey(const ValueKey('stock-more-rice-phone')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('stock-more-rice-phone')));
    await _settleStock(tester);
    expect(
      find.descendant(
        of: find.byKey(const ValueKey('stock-edit-rice-phone')),
        matching: find.text('ကုန်ပစ္စည်း ပြင်ရန်'),
      ),
      findsOneWidget,
    );
    await tester.tapAt(const Offset(4, 400));
    await _settleStock(tester);
    expect(find.byKey(const ValueKey('stock-row-rice-phone')), findsOneWidget);
    final firstRow = find.byKey(const ValueKey('stock-row-rice-phone'));
    final secondRow = find.byKey(const ValueKey('stock-row-rice-phone-small'));
    debugPrint(
      'Stock 320 MY x1.3: first=${tester.getTopLeft(firstRow)} '
      'size=${tester.getSize(firstRow)}, '
      'second=${tester.getTopLeft(secondRow)} '
      'size=${tester.getSize(secondRow)}',
    );
    final adjust = find.byKey(const ValueKey('stock-update-rice-phone'));
    expect(adjust, findsOneWidget);
    expect(
      find.descendant(of: adjust, matching: find.text('ပြင်ရန်')),
      findsOneWidget,
    );
    expect(
      find.descendant(
        of: adjust,
        matching: find.bySemanticsLabel('လက်ကျန်ပြင်ရန်'),
      ),
      findsOneWidget,
    );
    expect(tester.getSize(adjust).height, greaterThanOrEqualTo(48));
    expect(
      find.byKey(const ValueKey('stock-photo-rice-phone')),
      findsOneWidget,
    );
    expect(find.bySemanticsLabel(RegExp('၂.*RICE-L')), findsOneWidget);
    expect(find.bySemanticsLabel(RegExp('၄.*RICE-S')), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.tap(adjust);
    await _settleStock(tester);
    expect(find.text('လက်ခံရန်'), findsOneWidget);
    await tester.tap(find.text('မလုပ်တော့ပါ'));
    await _settleStock(tester);
    expect(
      (await database.readActiveProducts())
          .singleWhere((item) => item.id == 'rice-phone')
          .onHand,
      2,
    );
    expect(tester.takeException(), isNull);
    semantics.dispose();
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
          testOnlyAllowMissingRuntimeScope: true,
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
      expect(find.text('လက်ကျန်ပြင်ရန်'), findsNWidgets(2));
      expect(
        find.text('ကုန်ပစ္စည်းကုဒ် RICE-1 · ဘားကုဒ် 111111'),
        findsOneWidget,
      );
      expect(
        find.text('ကုန်ပစ္စည်းကုဒ် RICE-2 · ဘားကုဒ် 222222'),
        findsOneWidget,
      );

      await tester.tap(find.byKey(const ValueKey('stock-update-rice-large')));
      await tester.pumpAndSettle();
      expect(
        find.text('ကုန်ပစ္စည်းကုဒ် RICE-2 · ဘားကုဒ် 222222'),
        findsNWidgets(2),
      );
      expect(find.text('လက်ရှိ ၂ ခု လက်ကျန်'), findsOneWidget);
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
        testOnlyAllowMissingRuntimeScope: true,
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
    expect(find.text('English'), findsOneWidget);
    expect(find.text('မြန်မာ'), findsOneWidget);
    expect(find.text('Mobile money'), findsOneWidget);
    await tester.tap(find.text('မြန်မာ'));
    await tester.pumpAndSettle();
    expect(find.text('ဘာသာစကား'), findsOneWidget);
    await tester.ensureVisible(find.text('မိုဘိုင်းငွေပေးချေမှု'));
    await tester.tap(find.text('မိုဘိုင်းငွေပေးချေမှု'));
    await tester.pumpAndSettle();
    expect(find.text('KBZPay'), findsOneWidget);
    await database.close();
  });

  for (final (width, myanmar) in [
    (320.0, false),
    (390.0, false),
    (320.0, true),
    (390.0, true),
  ]) {
    testWidgets('settings stays readable and tappable at ${width.toInt()}px '
        '${myanmar ? 'MY' : 'EN'}', (tester) async {
      tester.view.physicalSize = Size(width, 800);
      tester.view.devicePixelRatio = 1;
      if (width == 320) {
        tester.platformDispatcher.textScaleFactorTestValue = 1.5;
      }
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      final database = ShopDatabase(NativeDatabase.memory());
      await tester.pumpWidget(
        ShopApp(
          testOnlyAllowMissingRuntimeScope: true,
          database: database,
          authClient: null,
          apiBaseUrl: 'https://example.invalid',
          initialMyanmar: myanmar,
          runtimeCapabilities: ShopRuntimeCapabilities.production,
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
      final titles = myanmar
          ? [
              'ပြေစာပရင်တာ',
              'မိုဘိုင်းငွေပေးချေမှု',
              'ငွေသားတာဝန်ချိန်',
              'အရန်ကူးဖိုင် ထုတ်ရန်',
            ]
          : [
              'Receipt printer',
              'Mobile money',
              'Cash shift',
              'Export backup file',
            ];
      for (final title in titles) {
        final tile = find.ancestor(
          of: find.text(title),
          matching: find.byType(ListTile),
        );
        expect(tile, findsOneWidget);
        final bounds = tester.getRect(tile);
        expect(bounds.height, greaterThanOrEqualTo(48));
        expect(bounds.left, greaterThanOrEqualTo(0));
        expect(bounds.right, lessThanOrEqualTo(width));
      }
      expect(
        tester.getSize(find.byType(SegmentedButton<bool>)).height,
        greaterThanOrEqualTo(48),
      );
      expect(
        find.text(
          myanmar
              ? 'ဤစက်တွင်သာ သိမ်းသည်။ အွန်လိုင်းအရန်ကူး မရှိပါ။'
              : 'On this device only. No online backup.',
        ),
        findsOneWidget,
      );
      expect(tester.takeException(), isNull);
      await database.close();
    });
  }

  testWidgets(
    'wallet setup shows saved status and opens one editor at a time',
    (tester) async {
      tester.view.physicalSize = const Size(800, 1200);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final database = ShopDatabase(NativeDatabase.memory());
      await database.saveWalletSetup(
        MerchantWalletSetup(
          provider: 'KBZPay',
          merchantPhone: '09123456789',
          officialQrPayload: _testStaticMmqr(),
          issuerConfirmed: true,
        ),
      );
      await tester.pumpWidget(
        MaterialApp(
          home: WalletSetupScreen(database: database, myanmar: false),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.text('Ready to show QR'), findsOneWidget);
      expect(find.text('No merchant QR saved'), findsOneWidget);
      expect(find.byType(TextField), findsNothing);
      expect(find.byType(QrImageView), findsNothing);
      expect(
        find.byWidgetPredicate(
          (widget) =>
              widget is Semantics &&
              widget.properties.label == 'KBZPay, Ready to show QR' &&
              widget.properties.button == true &&
              widget.properties.onTap != null,
        ),
        findsOneWidget,
      );

      await tester.tap(find.byKey(const ValueKey('wallet-provider-KBZPay')));
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('wallet-payload-KBZPay')),
        findsOneWidget,
      );
      expect(
        find.byKey(const ValueKey('wallet-payload-WavePay')),
        findsNothing,
      );
      expect(_merchantQrSemantics('KBZPay'), findsOneWidget);
      expect(find.textContaining('checksum'), findsNothing);
      final safetyDisclosure = find.text('Why check this QR?');
      await tester.ensureVisible(safetyDisclosure);
      await tester.pumpAndSettle();
      await tester.tap(safetyDisclosure);
      await tester.pumpAndSettle();
      expect(find.textContaining('checksum'), findsOneWidget);

      final waveRow = find.byKey(const ValueKey('wallet-provider-WavePay'));
      await tester.ensureVisible(waveRow);
      await tester.pumpAndSettle();
      await tester.tap(waveRow);
      await tester.pumpAndSettle();
      expect(find.byKey(const ValueKey('wallet-payload-KBZPay')), findsNothing);
      expect(
        find.byKey(const ValueKey('wallet-payload-WavePay')),
        findsOneWidget,
      );
      expect(find.byType(QrImageView), findsNothing);
      expect(_merchantQrSemantics('KBZPay'), findsNothing);
      await database.close();
    },
  );

  for (final (width, myanmar) in [
    (320.0, false),
    (320.0, true),
    (820.0, false),
    (820.0, true),
  ]) {
    testWidgets(
      'wallet setup fits ${width.toInt()}px ${myanmar ? 'my' : 'en'}',
      (tester) async {
        tester.view.physicalSize = Size(width, 800);
        tester.view.devicePixelRatio = 1;
        if (width == 320) {
          tester.platformDispatcher.textScaleFactorTestValue = 1.5;
        }
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        final database = ShopDatabase(NativeDatabase.memory());
        await tester.pumpWidget(
          MaterialApp(
            home: WalletSetupScreen(database: database, myanmar: myanmar),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.byType(TextField), findsNothing);

        await tester.tap(find.byKey(const ValueKey('wallet-provider-KBZPay')));
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.ensureVisible(
          find.byKey(const ValueKey('wallet-payload-KBZPay')),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await tester.ensureVisible(
          find.text(
            myanmar ? 'ငွေပေးချေမှုကို သိမ်းရန်' : 'Save payment setup',
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        await database.close();
      },
    );
  }

  testWidgets('editing a merchant QR clears its prior issuer confirmation', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(800, 1200);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
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

    expect(find.text('Ready to show QR'), findsOneWidget);
    expect(find.byType(QrImageView), findsNothing);
    await tester.tap(find.byKey(const ValueKey('wallet-provider-KBZPay')));
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
    expect(find.text('Unsaved changes'), findsOneWidget);
    final payloadConfirmation = tester.widget<CheckboxListTile>(
      find.byType(CheckboxListTile).first,
    );
    expect(payloadConfirmation.value, isFalse);
    final providerRow = find.byKey(const ValueKey('wallet-provider-KBZPay'));
    await tester.ensureVisible(providerRow);
    await tester.pumpAndSettle();
    await tester.tap(providerRow);
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('wallet-payload-KBZPay')), findsNothing);
    expect(find.text('Unsaved changes'), findsOneWidget);
    final storedBeforeSave = (await database.readWalletSetups()).single;
    expect(storedBeforeSave.officialQrPayload, _testStaticMmqr());
    expect(storedBeforeSave.issuerConfirmed, isTrue);
    await tester.tap(providerRow);
    await tester.pumpAndSettle();
    expect(
      tester
          .widget<TextField>(
            find.byKey(const ValueKey('wallet-payload-KBZPay')),
          )
          .controller!
          .text,
      revisedPayload,
    );
    expect(_merchantQrSemantics('KBZPay'), findsNothing);
    await tester.ensureVisible(find.text('Save payment setup'));
    await tester.tap(find.text('Save payment setup').first);
    await tester.pumpAndSettle();
    final saved = (await database.readWalletSetups()).single;
    expect(saved.officialQrPayload, revisedPayload);
    expect(saved.issuerConfirmed, isFalse);
    expect(find.text('Saved · confirm merchant QR'), findsOneWidget);

    await tester.ensureVisible(find.byType(CheckboxListTile).first);
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
    await tester.ensureVisible(find.text('Save payment setup'));
    await tester.tap(find.text('Save payment setup').first);
    await tester.pumpAndSettle();
    final savedAfterPhoneEdit = (await database.readWalletSetups()).single;
    expect(savedAfterPhoneEdit.merchantPhone, '09987654321');
    expect(savedAfterPhoneEdit.issuerConfirmed, isFalse);
    await database.close();
  });

  testWidgets('merchant QR is described in Burmese when Myanmar is selected', (
    tester,
  ) async {
    final database = ShopDatabase(NativeDatabase.memory());
    await database.saveWalletSetup(
      MerchantWalletSetup(
        provider: 'KBZPay',
        merchantPhone: '09123456789',
        officialQrPayload: _testStaticMmqr(),
        issuerConfirmed: true,
      ),
    );
    await tester.pumpWidget(
      MaterialApp(home: WalletSetupScreen(database: database, myanmar: true)),
    );
    await tester.pumpAndSettle();
    expect(find.textContaining('ဆိုင်ငွေလက်ခံ QR ထည့်ရန်'), findsOneWidget);
    expect(find.textContaining('payment QR'), findsNothing);
    expect(find.text('QR ပြသရန် အသင့်ဖြစ်ပြီ'), findsOneWidget);
    expect(find.byType(QrImageView), findsNothing);

    await tester.tap(find.byKey(const ValueKey('wallet-provider-KBZPay')));
    await tester.pumpAndSettle();
    expect(find.textContaining('ငွေကိုင်က အတည်ပြုရမည်'), findsOneWidget);
    expect(find.text('ဤ QR ကို ဘာကြောင့် စစ်ဆေးရသနည်း။'), findsOneWidget);
    await tester.ensureVisible(find.byType(QrImageView).first);
    await tester.pumpAndSettle();
    expect(
      find.byWidgetPredicate(
        (widget) =>
            widget is Semantics &&
            widget.properties.label == 'KBZPay ဆိုင်ငွေလက်ခံ QR' &&
            widget.properties.image == true,
      ),
      findsOneWidget,
    );
    expect(_merchantQrSemantics('KBZPay'), findsNothing);
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
          testOnlyAllowMissingRuntimeScope: true,
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
      final addToSaleRow = find.byKey(const ValueKey('shop-catalog-row:tea'));
      expect(
        find.byTooltip('Finish the pending payment first'),
        findsOneWidget,
      );
      expect(tester.widget<InkWell>(addToSaleRow).onTap, isNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pumpWidget(
        ShopApp(
          testOnlyAllowMissingRuntimeScope: true,
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

  testWidgets('restarted wallet review shows frozen items on phone and PC', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    for (final width in [320.0, 1200.0]) {
      for (final myanmar in [false, true]) {
        tester.view.physicalSize = Size(width, 800);
        final database = ShopDatabase(NativeDatabase.memory());
        try {
          await database.addProduct(
            id: 'tea',
            name: 'Tea before archive',
            priceMmk: 2500,
            openingStock: 3,
          );
          await database.createWalletCheckoutIntent(
            operationId: 'wallet-restart-$width-$myanmar',
            merchant: MerchantWalletSetup(
              provider: 'KBZPay',
              merchantPhone: '09123456789',
              officialQrPayload: _testStaticMmqr(),
              issuerConfirmed: true,
            ),
            lines: const [ShopSaleLineInput(productId: 'tea', quantity: 2)],
          );
          await database.customUpdate(
            'UPDATE shop_products SET archived = 1 WHERE id = ?',
            variables: [const Variable<String>('tea')],
            updates: {database.shopProducts},
          );
          await tester.pumpWidget(
            ShopApp(
              testOnlyAllowMissingRuntimeScope: true,
              initialCounter: true,
              database: database,
              authClient: null,
              apiBaseUrl: 'https://app.supermega.dev',
              initialMyanmar: myanmar,
            ),
          );
          await tester.pumpAndSettle();
          final savedLine = find.byKey(
            const ValueKey('shop-pending-wallet-line:tea'),
          );
          expect(savedLine, findsOneWidget);
          expect(
            find.descendant(
              of: savedLine,
              matching: find.text('Tea before archive'),
            ),
            findsOneWidget,
          );
          expect(
            find.descendant(
              of: savedLine,
              matching: find.text(shopMmk(5000, myanmar: myanmar)),
            ),
            findsOneWidget,
          );
          expect(await database.countSales(), 0);

          await tester.tap(
            find.text(shopCopy(myanmar, 'Resume payment', 'ပြန်စစ်ဆေးရန်')),
          );
          await tester.pumpAndSettle();
          final dialogLine = find.descendant(
            of: find.byType(AlertDialog),
            matching: savedLine,
          );
          expect(dialogLine, findsOneWidget);
          expect(
            find.descendant(
              of: dialogLine,
              matching: find.text('Tea before archive'),
            ),
            findsOneWidget,
          );
          final confirmation = tester.widget<FilledButton>(
            find.widgetWithText(
              FilledButton,
              shopCopy(
                myanmar,
                'Confirm received',
                'ငွေလက်ခံပြီးကြောင်း အတည်ပြုရန်',
              ),
            ),
          );
          expect(confirmation.onPressed, isNull);
          expect(await database.countSales(), 0);
          expect(await database.readPendingWalletCheckout(), isNotNull);
          expect(tester.takeException(), isNull);
        } finally {
          await tester.pumpWidget(const SizedBox.shrink());
          await tester.pump(const Duration(milliseconds: 1));
          await database.close();
        }
      }
    }
  });

  testWidgets('large pending basket keeps recovery actions reachable', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    for (final width in [320.0, 1200.0]) {
      tester.view.physicalSize = Size(width, 800);
      final count = width == 320 ? 100 : 10;
      final database = ShopDatabase(NativeDatabase.memory());
      try {
        final lines = <ShopSaleLineInput>[];
        for (var index = 0; index < count; index++) {
          final id = 'item-${index.toString().padLeft(3, '0')}';
          await database.addProduct(
            id: id,
            name: 'Product $index',
            priceMmk: 100,
            openingStock: 2,
          );
          lines.add(ShopSaleLineInput(productId: id, quantity: 1));
        }
        await database.createWalletCheckoutIntent(
          operationId: 'large-wallet-$count',
          merchant: MerchantWalletSetup(
            provider: 'KBZPay',
            merchantPhone: null,
            officialQrPayload: _testStaticMmqr(),
            issuerConfirmed: true,
          ),
          lines: lines,
        );
        await tester.pumpWidget(
          ShopApp(
            testOnlyAllowMissingRuntimeScope: true,
            initialCounter: true,
            database: database,
            authClient: null,
            apiBaseUrl: 'https://app.supermega.dev',
            initialMyanmar: false,
          ),
        );
        await tester.pumpAndSettle();
        expect(
          find.byKey(const ValueKey('shop-pending-wallet-line:item-000')),
          findsOneWidget,
        );
        expect(
          find.byKey(const ValueKey('shop-pending-wallet-line:item-002')),
          findsNothing,
        );
        expect(
          find.text('+${count - 2} more items in payment review'),
          findsOneWidget,
        );
        final resume = find.text('Resume payment');
        expect(resume, findsOneWidget);
        expect(tester.getRect(resume).bottom, lessThan(800));
        await tester.tap(resume);
        await tester.pumpAndSettle();
        final lastId = 'item-${(count - 1).toString().padLeft(3, '0')}';
        final lastLine = find.descendant(
          of: find.byType(AlertDialog),
          matching: find.byKey(ValueKey('shop-pending-wallet-line:$lastId')),
        );
        expect(lastLine, findsOneWidget);
        await tester.ensureVisible(lastLine);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(await database.countSales(), 0);
      } finally {
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump(const Duration(milliseconds: 1));
        await database.close();
      }
    }
  });

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
        testOnlyAllowMissingRuntimeScope: true,
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

  testWidgets(
    'failed verified wallet save stays pending without another charge',
    (tester) async {
      final database = ShopDatabase(NativeDatabase.memory());
      await database.addProduct(
        id: 'tea',
        name: 'Tea',
        priceMmk: 2500,
        openingStock: 1,
      );
      await database.createWalletCheckoutIntent(
        operationId: 'wallet-stock-recovery',
        merchant: MerchantWalletSetup(
          provider: 'KBZPay',
          merchantPhone: null,
          officialQrPayload: _testStaticMmqr(),
          issuerConfirmed: true,
        ),
        lines: const [ShopSaleLineInput(productId: 'tea', quantity: 1)],
      );
      // Corrupt the quantity outside the normal count path. That path guards
      // pending wallet stock, but restore or damaged data still needs a safe UI.
      await database.customUpdate(
        'UPDATE shop_products SET on_hand = 0 WHERE id = ?',
        variables: [const Variable<String>('tea')],
      );
      await tester.pumpWidget(
        ShopApp(
          testOnlyAllowMissingRuntimeScope: true,
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
      final verified = find.text('I verified this payment in the wallet app.');
      await tester.ensureVisible(verified);
      await tester.tap(verified);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirm received'));
      await tester.pumpAndSettle();

      expect(find.text('Check payment before retrying'), findsOneWidget);
      expect(
        find.textContaining('Do not ask the customer to pay again.'),
        findsOneWidget,
      );
      expect(await database.countSales(), 0);
      expect(await database.readPendingWalletCheckout(), isNotNull);
      await tester.tap(find.text('Keep pending'));
      await tester.pumpAndSettle();
      expect(await database.readPendingWalletCheckout(), isNotNull);
      await tester.pumpWidget(const SizedBox.shrink());
      await tester.pump(const Duration(milliseconds: 1));
      await database.close();
    },
  );

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

typedef _WidgetAuthorize = Future<ShopCorrectionAuthorizationResult> Function({
  required String authorizationRequestId,
  required String workspaceId,
  required String capability,
  required String commandDigest,
  required String requestFingerprint,
});

class _WidgetCorrectionAuthorizer implements ShopCorrectionAuthorizer {
  _WidgetCorrectionAuthorizer({
    required this.available,
    _WidgetAuthorize? authorize,
  }) : _authorizeHandler = authorize;

  final bool available;
  final _WidgetAuthorize? _authorizeHandler;
  int authorizeCalls = 0;
  String? lastWorkspaceId;
  String? lastRequiredActorId;

  @override
  Future<bool> canRequestAuthorization({
    required String workspaceId,
    required String requiredActorId,
    required String capability,
  }) async {
    lastWorkspaceId = workspaceId;
    lastRequiredActorId = requiredActorId;
    return available;
  }

  @override
  Future<ShopCorrectionAuthorizationResult> authorize({
    required String authorizationRequestId,
    required String workspaceId,
    required String capability,
    required String commandDigest,
    required String requestFingerprint,
  }) {
    authorizeCalls++;
    final handler = _authorizeHandler;
    if (handler == null) {
      throw StateError('Authorization was not expected in this test.');
    }
    return handler(
      authorizationRequestId: authorizationRequestId,
      workspaceId: workspaceId,
      capability: capability,
      commandDigest: commandDigest,
      requestFingerprint: requestFingerprint,
    );
  }
}

class _RecentSalesFixtureDatabase extends ShopDatabase {
  _RecentSalesFixtureDatabase(this.sales) : super(NativeDatabase.memory());

  final List<ShopSaleReceipt> sales;

  @override
  Future<List<ShopSaleReceipt>> readRecentSales({
    int limit = 30,
    int offset = 0,
    String query = '',
  }) async => sales.skip(offset).take(limit).toList(growable: false);
}

Future<ShopManagedWorkspaceBinding> _attachWidgetWorkspace(
  ShopDatabase database,
) => database.attachAuthenticatedManagedWorkspace(
  const ShopAuthenticatedWorkspaceSelection(
    workspaceId: 'workspace-widget-test',
    actorId: 'owner-widget-test',
  ),
);

Future<ShopCorrectionAuthorization> _widgetCorrectionAuthorization(
  String commandDigest, {
  required String capability,
  required String receiptId,
}) async {
  final now = DateTime.now().millisecondsSinceEpoch;
  final issuedAtMillis = now - 1000;
  final expiresAtMillis =
      issuedAtMillis + const Duration(minutes: 5).inMilliseconds;
  const workspaceId = 'workspace-widget-test';
  const actorId = 'owner-widget-test';
  const actorLabel = 'Widget test owner';
  const actorRole = 'owner';
  const source = 'managed_membership_receipt_v1';
  const finalizationRequestId = '44444444-4444-4444-8444-444444444444';
  final receiptDigest = shopCorrectionAuthorizationReceiptDigest(
    source: source,
    receiptId: receiptId,
    workspaceId: workspaceId,
    actorId: actorId,
    actorLabel: actorLabel,
    actorRole: actorRole,
    capability: capability,
    commandDigest: commandDigest,
    finalizationRequestId: finalizationRequestId,
    finalizedAtMillis: issuedAtMillis,
    issuedAtMillis: issuedAtMillis,
    expiresAtMillis: expiresAtMillis,
  );
  final keyPair = await Ed25519().newKeyPairFromSeed(
    List<int>.generate(32, (index) => index),
  );
  final signed = await Ed25519().sign(
    utf8.encode(
      shopCorrectionAuthorizationSignatureMessage(
        keyId: _widgetCorrectionKeyId,
        receiptDigest: receiptDigest,
      ),
    ),
    keyPair: keyPair,
  );
  return ShopCorrectionAuthorization(
    contract: shopCorrectionAuthorizationReceiptContract,
    receiptId: receiptId,
    receiptDigest: receiptDigest,
    workspaceId: workspaceId,
    actorId: actorId,
    actorLabel: actorLabel,
    actorRole: actorRole,
    capability: capability,
    source: source,
    commandDigest: commandDigest,
    finalizationRequestId: finalizationRequestId,
    finalizedAtMillis: issuedAtMillis,
    issuedAtMillis: issuedAtMillis,
    expiresAtMillis: expiresAtMillis,
    keyId: _widgetCorrectionKeyId,
    signature: base64Url.encode(signed.bytes).replaceAll('=', ''),
  );
}

String _widgetMemberToken(int seed) {
  final bytes = List<int>.generate(32, (index) => (seed + index) & 0xff);
  return 'SMC1.${base64Url.encode(bytes).replaceAll('=', '')}';
}

Future<void> _seedWidgetMember(
  ShopDatabase database, {
  required String memberId,
  required String displayCode,
  required String token,
}) async {
  final digest = await Sha256().hash(
    utf8.encode('supermega.shop.member-card.lookup.v1\u0000$token'),
  );
  final tokenDigest = digest.bytes
      .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
      .join();
  final storeRef = await database.readStoreRef();
  const now = 1_800_000_000_000;
  await database.customInsert(
    'INSERT INTO shop_members '
    '(id, store_ref, display_code, status, created_at_millis, updated_at_millis) '
    'VALUES (?, ?, ?, ?, ?, ?)',
    variables: [
      Variable<String>(memberId),
      Variable<String>(storeRef),
      Variable<String>(displayCode),
      const Variable<String>('active'),
      const Variable<int>(now),
      const Variable<int>(now),
    ],
  );
  await database.customInsert(
    'INSERT INTO shop_member_cards '
    '(token_digest, member_id, revision, state, issued_at_millis, retired_at_millis) '
    'VALUES (?, ?, 1, ?, ?, NULL)',
    variables: [
      Variable<String>(tokenDigest),
      Variable<String>(memberId),
      const Variable<String>('active'),
      const Variable<int>(now),
    ],
  );
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
