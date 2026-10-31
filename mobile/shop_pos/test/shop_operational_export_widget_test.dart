import 'dart:async';

import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_cash_shift_screen.dart';
import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_operational_export_saver.dart';

void main() {
  test('a test callback cannot override a real runtime scope', () {
    expect(
      shopOperationalExportActionAvailable(
        hasRuntimeScope: true,
        hasTestAction: true,
        allowTestSeam: true,
      ),
      isFalse,
    );
    expect(
      shopOperationalExportActionAvailable(
        hasRuntimeScope: false,
        hasTestAction: true,
        allowTestSeam: true,
      ),
      isTrue,
    );
    expect(
      shopOperationalExportSaveAvailable(
        isSyntheticQa: true,
        hasTestAction: false,
      ),
      isFalse,
    );
    expect(
      shopOperationalExportSaveAvailable(
        isSyntheticQa: false,
        hasTestAction: false,
      ),
      isTrue,
    );
  });
  testWidgets(
    'English preview discloses readable unencrypted CSV and cancel is inert',
    (tester) async {
      final database = await _closedShiftDatabase();
      addTearDown(database.close);
      var calls = 0;
      await _pumpShift(
        tester,
        database: database,
        myanmar: false,
        exportAction: (_) async {
          calls += 1;
          return ShopOperationalExportSaveResult.saved;
        },
      );

      await _openPreview(tester, 'Export closed shift (CSV)');
      expect(find.text('Closed shift'), findsOneWidget);
      expect(find.text('Readable local file — not encrypted.'), findsOneWidget);
      expect(
        find.text('Use encrypted Backup & restore for recovery.'),
        findsOneWidget,
      );
      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(calls, 0);
    },
  );

  testWidgets('Burmese preview uses localized readable-not-encrypted warning', (
    tester,
  ) async {
    final database = await _closedShiftDatabase();
    addTearDown(database.close);
    await _pumpShift(
      tester,
      database: database,
      myanmar: true,
      exportAction: (_) async => ShopOperationalExportSaveResult.saved,
    );

    await _openPreview(tester, 'ပိတ်ပြီးတာဝန်ချိန် CSV ထုတ်မည်');
    expect(find.text('ပိတ်ပြီး ငွေစာရင်းချိန်'), findsOneWidget);
    expect(
      find.text('ဖတ်ရှုနိုင်သော စက်တွင်းဖိုင် — စာဝှက်မထားပါ။'),
      findsOneWidget,
    );
    expect(find.text('မလုပ်တော့ပါ'), findsOneWidget);
  });

  testWidgets(
    'injected export is single-call while busy and reports cancellation',
    (tester) async {
      final database = await _closedShiftDatabase();
      addTearDown(database.close);
      final pending = Completer<ShopOperationalExportSaveResult>();
      var calls = 0;
      await _pumpShift(
        tester,
        database: database,
        myanmar: false,
        exportAction: (_) {
          calls += 1;
          return pending.future;
        },
      );

      await _openPreview(tester, 'Export closed shift (CSV)');
      await tester.tap(find.text('Save CSV'));
      await tester.pump();
      expect(calls, 1);
      final exportFinder = find.widgetWithText(
        OutlinedButton,
        'Export closed shift (CSV)',
      );
      final exportButton = tester.widget<OutlinedButton>(exportFinder);
      expect(exportButton.onPressed, isNull);
      await tester.tap(exportFinder);
      await tester.pump();
      expect(calls, 1);

      pending.complete(ShopOperationalExportSaveResult.cancelled);
      await tester.pumpAndSettle();
      await tester.drag(find.byType(ListView), const Offset(0, 1000));
      await tester.pumpAndSettle();
      expect(
        find.text('Save cancelled. Shop records were not changed.'),
        findsOneWidget,
      );
    },
  );

  testWidgets('injected export failure is an announced ambiguous result', (
    tester,
  ) async {
    final database = await _closedShiftDatabase();
    addTearDown(database.close);
    await _pumpShift(
      tester,
      database: database,
      myanmar: false,
      exportAction: (_) async => throw StateError('synthetic write failure'),
    );

    await _openPreview(tester, 'Export closed shift (CSV)');
    await tester.tap(find.text('Save CSV'));
    await tester.pumpAndSettle();
    await tester.drag(find.byType(ListView), const Offset(0, 1000));
    await tester.pumpAndSettle();
    const message =
        'Could not confirm whether the CSV was saved. Check your files before retrying. Shop records were not changed.';
    final messageFinder = find.text(message);
    expect(messageFinder, findsOneWidget);
    final semantics = tester.getSemantics(messageFinder).getSemanticsData();
    expect(semantics.flagsCollection.isLiveRegion, isTrue);
    final focus = tester.widget<Focus>(
      find.ancestor(of: messageFinder, matching: find.byType(Focus)).first,
    );
    expect(focus.focusNode?.hasFocus, isTrue);
  });
}

Future<ShopDatabase> _closedShiftDatabase() async {
  final database = ShopDatabase(NativeDatabase.memory());
  await database.addProduct(
    id: 'tea',
    name: 'Tea',
    priceMmk: 2500,
    openingStock: 4,
  );
  final shift = await database.openCashShift(
    operationId: 'widget-open',
    operatorLabel: 'May',
    openingFloatMmk: 10000,
  );
  await database.recordCashSale(
    operationId: 'widget-sale',
    lines: const [ShopSaleLineInput(productId: 'tea', quantity: 2)],
  );
  final review = await database.readCashShiftReview(shift.id);
  await database.closeCashShift(
    shiftId: shift.id,
    operationId: 'widget-close',
    seenSaleCount: review.saleCount,
    seenCashTotalMmk: review.cashSalesTotalMmk,
    countedCashMmk: review.expectedCashMmk,
  );
  return database;
}

Future<void> _pumpShift(
  WidgetTester tester, {
  required ShopDatabase database,
  required bool myanmar,
  required Future<ShopOperationalExportSaveResult> Function(String shiftId)
  exportAction,
}) async {
  await tester.pumpWidget(
    MaterialApp(
      home: ShopCashShiftScreen(
        database: database,
        myanmar: myanmar,
        exportAction: exportAction,
        testOnlyAllowMissingRuntimeScope: true,
      ),
    ),
  );
  await tester.pumpAndSettle();
}

Future<void> _openPreview(WidgetTester tester, String label) async {
  await tester.scrollUntilVisible(
    find.text(label),
    300,
    scrollable: find.byType(Scrollable).first,
  );
  final button = find.widgetWithText(OutlinedButton, label);
  await tester.tap(button);
  await tester.pumpAndSettle();
}
