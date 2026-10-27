import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_copy.dart';
import 'package:supermega_shop/shop_database.dart';

void main() {
  test('whole-MMK parser preserves zero and exact supported boundaries', () {
    expect(parseShopMmkInput('0'), 0);
    expect(parseShopMmkInput('၀'), 0);
    expect(parseShopMmkInput(' ၁၃၅၀၀ '), 13500);
    expect(parseShopMmkInput('$shopMaximumMmk'), shopMaximumMmk);
    expect(
      parseShopMmkInput(_myanmarDigits('$shopMaximumMmk')),
      shopMaximumMmk,
    );
    expect(parseShopMmkInput('${shopMaximumMmk + 1}'), isNull);
    expect(parseShopMmkInput('2000000000', maximum: 2000000000), 2000000000);
    expect(parseShopMmkInput('2000000001', maximum: 2000000000), isNull);
  });

  test('whole-MMK parser never strips pasted separators or signs', () {
    for (final value in <String>[
      '',
      '20,000',
      '20.000',
      '20,000.50',
      '၂၀,၀၀၀',
      '-1',
      '+1',
      '1 000',
      '1e3',
    ]) {
      expect(parseShopMmkInput(value), isNull, reason: value);
    }
  });

  test(
    'sale ledger accepts exact zero, per-line, and aggregate MMK bounds',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      addTearDown(database.close);

      await database.addProduct(
        id: 'zero-price',
        name: 'Free sample',
        priceMmk: 0,
        openingStock: 1,
      );
      final zero = await database.recordCashSale(
        operationId: 'zero-boundary-sale',
        lines: const [ShopSaleLineInput(productId: 'zero-price', quantity: 1)],
      );
      expect(zero.totalMmk, 0);

      await database.addProduct(
        id: 'line-maximum',
        name: 'Maximum line',
        priceMmk: 2000000000,
        openingStock: 1000,
      );
      final lineMaximum = await database.recordCashSale(
        operationId: 'line-maximum-sale',
        lines: const [
          ShopSaleLineInput(productId: 'line-maximum', quantity: 1000),
        ],
      );
      expect(lineMaximum.lines.single.lineTotalMmk, 2000000000000);

      final aggregateLines = <ShopSaleLineInput>[];
      for (var index = 0; index < 100; index++) {
        final id = 'aggregate-$index';
        await database.addProduct(
          id: id,
          name: 'Aggregate $index',
          priceMmk: 2000000000,
          openingStock: 1000,
        );
        aggregateLines.add(ShopSaleLineInput(productId: id, quantity: 1000));
      }
      final aggregateMaximum = await database.recordCashSale(
        operationId: 'aggregate-maximum-sale',
        lines: aggregateLines,
      );
      expect(aggregateMaximum.lines, hasLength(100));
      expect(aggregateMaximum.totalMmk, shopMaximumMmk);
    },
  );

  test(
    'sale ledger rejects inputs beyond structural MMK bounds atomically',
    () async {
      final database = ShopDatabase(NativeDatabase.memory());
      addTearDown(database.close);
      await database.addProduct(
        id: 'bounded-product',
        name: 'Bounded product',
        priceMmk: 2000000000,
        openingStock: 2000,
      );
      final stockBefore = (await database.readActiveProducts()).single.onHand;
      final movementsBefore = await database.countStockMovements();
      final outboxBefore = await database.countOutboxOperations();

      await expectLater(
        database.recordCashSale(
          operationId: 'line-over-maximum',
          lines: const [
            ShopSaleLineInput(productId: 'bounded-product', quantity: 1001),
          ],
        ),
        throwsArgumentError,
      );
      await expectLater(
        database.recordCashSale(
          operationId: 'item-count-over-maximum',
          lines: [
            for (var index = 0; index < 101; index++)
              ShopSaleLineInput(productId: 'product-$index', quantity: 1000),
          ],
        ),
        throwsArgumentError,
      );

      expect(await database.countSales(), 0);
      expect((await database.readActiveProducts()).single.onHand, stockBefore);
      expect(await database.countStockMovements(), movementsBefore);
      expect(await database.countOutboxOperations(), outboxBefore);
    },
  );
}

String _myanmarDigits(String ascii) {
  const digits = '၀၁၂၃၄၅၆၇၈၉';
  return String.fromCharCodes(
    ascii.runes.map((digit) => digits.runes.elementAt(digit - 0x30)),
  );
}
