import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_catalog_search.dart';
import 'package:supermega_shop/shop_database.dart';

void main() {
  test('catalog search preserves name, barcode and SKU behavior', () {
    final products = [
      _product('tea', 'Myanmar Milk Tea', barcode: '8850001234567'),
      _product('coffee', 'Iced Coffee', sku: 'DRINK-COFFEE'),
      _product('rice', 'Shwe Bo Rice'),
    ];
    final index = ShopCatalogSearchIndex();

    expect(index.search(products, '').map((item) => item.id), [
      'tea',
      'coffee',
      'rice',
    ]);
    expect(index.search(products, 'milk').single.id, 'tea');
    expect(index.search(products, '885000').single.id, 'tea');
    expect(index.search(products, 'drink-coffee').single.id, 'coffee');
    expect(index.search(products, 'missing'), isEmpty);
    expect(index.indexedProductCount, 3);
  });

  test('a new catalog snapshot replaces normalized search fields', () {
    final index = ShopCatalogSearchIndex();
    final first = [_product('tea', 'Milk Tea')];
    final updated = [_product('tea', 'Lemon Tea')];

    expect(index.search(first, 'milk').single.id, 'tea');
    expect(index.search(updated, 'milk'), isEmpty);
    expect(index.search(updated, 'lemon').single.id, 'tea');
  });

  test(
    'successive catalog snapshots replace rather than accumulate entries',
    () {
      final index = ShopCatalogSearchIndex();
      for (var revision = 0; revision < 100; revision += 1) {
        final products = List.generate(
          1000,
          (position) => _product(
            'revision-$revision-item-$position',
            'Catalog item $position revision $revision',
          ),
        );
        expect(
          index.search(products, 'item 999').single.id,
          endsWith('item-999'),
        );
        expect(index.indexedProductCount, 1000);
      }
    },
  );

  test('representative 1k and 10k searches retain exact results', () {
    final random = Random(8842);
    final index = ShopCatalogSearchIndex();
    for (final count in [1000, 10000]) {
      final products = List.generate(
        count,
        (position) => _product(
          'item-$position',
          position == count - 1
              ? 'Golden Myanmar Tea'
              : 'Catalog item ${random.nextInt(1000000)}',
          barcode: '${8800000000000 + position}',
          sku: 'SKU-${position.toString().padLeft(5, '0')}',
        ),
      );
      for (final query in ['golden', '8800000000999', 'sku-00042', 'absent']) {
        final expected = _legacySearch(
          products,
          query,
        ).map((item) => item.id).toList();
        final actual = index.search(products, query).map((item) => item.id);
        expect(actual, expected, reason: '$count products, query $query');
      }
    }
  });

  test('diagnostic compares repeated 10k-catalog typing on this host', () {
    final products = List.generate(
      10000,
      (position) => _product(
        'item-$position',
        position == 9999 ? 'Golden Myanmar Tea' : 'Catalog item $position',
        barcode: '${8800000000000 + position}',
        sku: 'SKU-${position.toString().padLeft(5, '0')}',
      ),
    );
    const queries = ['g', 'go', 'gol', 'gold', 'golde', 'golden'];
    final index = ShopCatalogSearchIndex();
    index.search(products, 'warmup').toList();

    final legacy = Stopwatch()..start();
    late List<String> legacyResult;
    for (var repeat = 0; repeat < 20; repeat++) {
      for (final query in queries) {
        legacyResult = _legacySearch(
          products,
          query,
        ).map((item) => item.id).toList();
      }
    }
    legacy.stop();

    final indexed = Stopwatch()..start();
    late List<String> indexedResult;
    for (var repeat = 0; repeat < 20; repeat++) {
      for (final query in queries) {
        indexedResult = index
            .search(products, query)
            .map((item) => item.id)
            .toList();
      }
    }
    indexed.stop();

    expect(indexedResult, legacyResult);
    // Diagnostic evidence only. Device performance still requires a named
    // installed target; elapsed time is deliberately not a pass threshold.
    // ignore: avoid_print
    print(
      'SHOP_CATALOG_SEARCH_10K '
      'legacy_us=${legacy.elapsedMicroseconds} '
      'indexed_us=${indexed.elapsedMicroseconds} '
      'queries=${queries.length * 20}',
    );
  });
}

Iterable<ShopProduct> _legacySearch(List<ShopProduct> products, String query) {
  final text = query.trim().toLowerCase();
  return products.where(
    (item) =>
        text.isEmpty ||
        item.name.toLowerCase().contains(text) ||
        (item.barcode?.toLowerCase().contains(text) ?? false) ||
        (item.sku?.toLowerCase().contains(text) ?? false),
  );
}

ShopProduct _product(String id, String name, {String? barcode, String? sku}) =>
    ShopProduct(
      id: id,
      name: name,
      category: '',
      description: '',
      sku: sku,
      barcode: barcode,
      priceMmk: 1000,
      onHand: 10,
      reorderLevel: null,
      updatedAtMillis: 0,
      archived: false,
    );
