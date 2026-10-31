import 'dart:convert';
import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/printer_services.dart';
import 'package:supermega_shop/shop_backup.dart';
import 'package:supermega_shop/shop_database.dart';

void main() {
  test(
    'core cash journey survives close, reopen, reprint, and encrypted restore',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'supermega-shop-core-acceptance-',
      );
      final sourceFile = File('${directory.path}/shop.sqlite');
      final archive = File('${directory.path}/shop.smbak');
      final restoredFile = File('${directory.path}/restored.sqlite');
      var database = ShopDatabase(NativeDatabase(sourceFile));

      try {
        await database.addProduct(
          id: 'acceptance-rice',
          name: 'Premium Rice',
          barcode: '0012345678905',
          priceMmk: 6750,
          openingStock: 5,
        );
        final shift = await database.openCashShift(
          operationId: 'acceptance-open-shift',
          operatorLabel: 'Internal QA',
          openingFloatMmk: 10000,
        );
        const lines = [
          ShopSaleLineInput(productId: 'acceptance-rice', quantity: 2),
        ];

        final receipt = await database.recordCashSale(
          operationId: 'acceptance-cash-sale',
          lines: lines,
          cashTenderedMmk: 20000,
        );
        expect(receipt.paymentMethod, 'cash');
        expect(receipt.totalMmk, 13500);
        expect(receipt.lines.single.productName, 'Premium Rice');
        expect(receipt.lines.single.quantity, 2);
        expect(receipt.cashTenderedMmk, 20000);
        expect(receipt.cashChangeMmk, 6500);

        final receiptText = shopReceiptTextLines(
          receipt,
          myanmar: false,
        ).join('\n');
        expect(receiptText, contains('Premium Rice x2'));
        expect(receiptText, contains('TOTAL: 13,500 MMK'));
        expect(receiptText, contains('Payment: Cash'));
        expect(receiptText, contains('Cash received: 20,000 MMK'));
        expect(receiptText, contains('Change: 6,500 MMK'));

        final countsAfterSale = (
          sales: await database.countSales(),
          stockMovements: await database.countStockMovements(),
          outbox: await database.countOutboxOperations(),
        );
        final retry = await database.recordCashSale(
          operationId: 'acceptance-cash-sale',
          lines: lines,
          cashTenderedMmk: 20000,
        );
        expect(retry.id, receipt.id);
        expect(await database.countSales(), countsAfterSale.sales);
        expect(
          await database.countStockMovements(),
          countsAfterSale.stockMovements,
        );
        expect(await database.countOutboxOperations(), countsAfterSale.outbox);
        await expectLater(
          database.recordCashSale(
            operationId: 'acceptance-cash-sale',
            lines: lines,
            cashTenderedMmk: 21000,
          ),
          throwsStateError,
        );

        final review = await database.readCashShiftReview(shift.id);
        expect(review.saleCount, 1);
        expect(review.cashSalesTotalMmk, 13500);
        expect(review.expectedCashMmk, 23500);
        final closed = await database.closeCashShift(
          shiftId: shift.id,
          operationId: 'acceptance-close-shift',
          seenSaleCount: review.saleCount,
          seenCashTotalMmk: review.cashSalesTotalMmk,
          countedCashMmk: 23500,
        );
        expect(closed.state, 'closed');
        expect(closed.differenceMmk, 0);

        final countsAfterClose = (
          sales: await database.countSales(),
          stockMovements: await database.countStockMovements(),
          outbox: await database.countOutboxOperations(),
        );
        await database.close();
        database = ShopDatabase(NativeDatabase(sourceFile));
        await database.verifyReadyForUse();

        final reopenedProduct = (await database.readActiveProducts()).single;
        final reopenedReceipt = (await database.readRecentSales()).single;
        final reopenedShift = await database.readLatestCashShift();
        expect(reopenedProduct.barcode, '0012345678905');
        expect(reopenedProduct.onHand, 3);
        expect(reopenedReceipt.id, receipt.id);
        expect(reopenedReceipt.operationId, 'acceptance-cash-sale');
        expect(reopenedReceipt.cashTenderedMmk, 20000);
        expect(reopenedReceipt.cashChangeMmk, 6500);
        expect(reopenedShift?.state, 'closed');
        expect(await database.countSales(), countsAfterClose.sales);
        expect(
          await database.countStockMovements(),
          countsAfterClose.stockMovements,
        );
        expect(await database.countOutboxOperations(), countsAfterClose.outbox);

        final reprintText = shopReceiptTextLines(
          reopenedReceipt,
          myanmar: false,
        ).join('\n');
        expect(reprintText, receiptText);
        expect(await database.countSales(), countsAfterClose.sales);
        expect(
          await database.countStockMovements(),
          countsAfterClose.stockMovements,
        );
        expect(await database.countOutboxOperations(), countsAfterClose.outbox);

        await ShopBackup.exportEncrypted(
          database: database,
          archive: archive,
          password: 'internal acceptance recovery password',
          scratchRoot: directory,
        );
        final archiveBytes = await archive.readAsBytes();
        expect(archiveBytes.sublist(0, 4), ascii.encode('SMBK'));
        expect(
          utf8.decode(archiveBytes, allowMalformed: true),
          isNot(contains('Premium Rice')),
        );
        await database.close();

        await ShopBackup.restoreIntoEmptyDatabase(
          archive: archive,
          target: restoredFile,
          password: 'internal acceptance recovery password',
        );
        ShopBackup.verifySnapshot(restoredFile);
        database = ShopDatabase(NativeDatabase(restoredFile));
        await database.verifyReadyForUse();

        final restoredProduct = (await database.readActiveProducts()).single;
        final restoredReceipt = (await database.readRecentSales()).single;
        final restoredShift = await database.readLatestCashShift();
        expect(restoredProduct.onHand, 3);
        expect(restoredReceipt.id, receipt.id);
        expect(restoredReceipt.lines.single.productName, 'Premium Rice');
        expect(restoredReceipt.cashTenderedMmk, 20000);
        expect(restoredReceipt.cashChangeMmk, 6500);
        expect(restoredShift?.state, 'closed');
        expect(await database.countSales(), countsAfterClose.sales);
        expect(
          await database.countStockMovements(),
          countsAfterClose.stockMovements,
        );
        expect(await database.countOutboxOperations(), countsAfterClose.outbox);

        final restoredCounts = (
          sales: await database.countSales(),
          stockMovements: await database.countStockMovements(),
          outbox: await database.countOutboxOperations(),
        );
        final restoredRetry = await database.recordCashSale(
          operationId: 'acceptance-cash-sale',
          lines: lines,
          cashTenderedMmk: 20000,
        );
        expect(restoredRetry.id, receipt.id);
        expect(await database.countSales(), restoredCounts.sales);
        expect(
          await database.countStockMovements(),
          restoredCounts.stockMovements,
        );
        expect(await database.countOutboxOperations(), restoredCounts.outbox);
        expect((await database.readActiveProducts()).single.onHand, 3);
      } finally {
        try {
          await database.close();
        } on Object {
          // The test deliberately closes and reopens the same handle.
        }
        await directory.delete(recursive: true);
      }
    },
  );
}
