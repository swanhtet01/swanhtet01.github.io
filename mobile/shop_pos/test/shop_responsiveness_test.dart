import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_database.dart';

void main() {
  test(
    'diagnostic times durable basket writes and verifies restart state',
    () async {
      final directory = await Directory.systemTemp.createTemp(
        'supermega-shop-responsiveness-',
      );
      final file = File('${directory.path}/shop.sqlite');
      var database = ShopDatabase(NativeDatabase(file));
      const productCount = 20;
      const writeCount = 60;
      try {
        for (var position = 0; position < productCount; position += 1) {
          await database.addProduct(
            id: 'item-$position',
            name: 'Catalog item $position',
            priceMmk: 1000 + position,
            openingStock: 100,
          );
        }
        final elapsedMicros = <int>[];
        Map<String, int> expected = const {};
        for (var write = 0; write < writeCount; write += 1) {
          final lineCount = 1 + write % productCount;
          expected = {
            for (var position = 0; position < lineCount; position += 1)
              'item-$position': 1 + (write + position) % 3,
          };
          final stopwatch = Stopwatch()..start();
          await database.saveCounterSaleDraft(
            operationId: 'responsiveness-checkout-1',
            quantities: expected,
          );
          stopwatch.stop();
          elapsedMicros.add(stopwatch.elapsedMicroseconds);
        }
        elapsedMicros.sort();
        final median = elapsedMicros[elapsedMicros.length ~/ 2];
        final p95 =
            elapsedMicros[(elapsedMicros.length * 95 ~/ 100).clamp(
              0,
              elapsedMicros.length - 1,
            )];
        final maximum = elapsedMicros.last;

        await database.close();
        database = ShopDatabase(NativeDatabase(file));
        final recovered = await database.readCounterSaleDraft();
        expect(recovered?.operationId, 'responsiveness-checkout-1');
        expect(recovered?.quantities, expected);

        // Diagnostic evidence only. Installed-device latency needs a named
        // target; elapsed time is deliberately not a pass threshold.
        // ignore: avoid_print
        print(
          'SHOP_DRAFT_DURABILITY writes=$writeCount lines_max=$productCount '
          'median_us=$median p95_us=$p95 max_us=$maximum',
        );
      } finally {
        await database.close();
        await directory.delete(recursive: true);
      }
    },
  );
}
