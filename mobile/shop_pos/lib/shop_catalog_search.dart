import 'shop_database.dart';

/// Reuses normalized catalog fields while the active product snapshot is
/// unchanged. Drift emits a new immutable list when catalog data changes, so a
/// new snapshot rebuilds the index and a cashier's successive keystrokes do
/// not lowercase every product again.
class ShopCatalogSearchIndex {
  List<ShopProduct>? _source;
  List<_ShopCatalogSearchEntry> _entries = const [];

  int get indexedProductCount => _entries.length;

  Iterable<ShopProduct> search(List<ShopProduct> products, String query) sync* {
    final normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.isEmpty) {
      yield* products;
      return;
    }
    if (!identical(_source, products)) {
      _source = products;
      _entries = [
        for (final product in products)
          _ShopCatalogSearchEntry(
            product,
            product.name.toLowerCase(),
            product.barcode?.toLowerCase(),
            product.sku?.toLowerCase(),
          ),
      ];
    }
    for (final entry in _entries) {
      if (entry.name.contains(normalizedQuery) ||
          (entry.barcode?.contains(normalizedQuery) ?? false) ||
          (entry.sku?.contains(normalizedQuery) ?? false)) {
        yield entry.product;
      }
    }
  }
}

class _ShopCatalogSearchEntry {
  const _ShopCatalogSearchEntry(
    this.product,
    this.name,
    this.barcode,
    this.sku,
  );

  final ShopProduct product;
  final String name;
  final String? barcode;
  final String? sku;
}
