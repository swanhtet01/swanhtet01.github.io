import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:drift_flutter/drift_flutter.dart';

import 'shop_models.dart';

part 'shop_database.g.dart';

class MenuImportDrafts extends Table {
  TextColumn get id => text()();
  TextColumn get batchId => text()();
  TextColumn get category => text()();
  TextColumn get name => text()();
  TextColumn get description => text().withDefault(const Constant(''))();
  IntColumn get priceMmk => integer().nullable()();
  TextColumn get sku => text().nullable()();
  TextColumn get barcode => text().nullable()();
  IntColumn get openingStock => integer().nullable()();
  TextColumn get reviewState =>
      text().withDefault(const Constant('needs_review'))();
  IntColumn get createdAtMillis => integer()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class MerchantWalletProfiles extends Table {
  TextColumn get provider => text()();
  TextColumn get merchantPhone => text().nullable()();
  TextColumn get officialQrPayload => text().nullable()();
  BoolColumn get issuerConfirmed =>
      boolean().withDefault(const Constant(false))();
  IntColumn get updatedAtMillis => integer()();

  @override
  Set<Column<Object>> get primaryKey => {provider};
}

class ShopProducts extends Table {
  TextColumn get id => text()();
  TextColumn get name => text()();
  TextColumn get category => text().withDefault(const Constant(''))();
  TextColumn get description => text().withDefault(const Constant(''))();
  TextColumn get sku => text().nullable()();
  TextColumn get barcode => text().nullable()();
  IntColumn get priceMmk => integer()();
  IntColumn get onHand => integer()();
  // Five is the visible starting alert for new and migrated products. Null
  // means the merchant turned this product's low-stock alert off.
  IntColumn get reorderLevel =>
      integer().nullable().withDefault(const Constant(5))();
  IntColumn get updatedAtMillis => integer()();
  BoolColumn get archived => boolean().withDefault(const Constant(false))();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class ShopSales extends Table {
  TextColumn get id => text()();
  TextColumn get operationId => text().unique()();
  TextColumn get requestFingerprint => text()();
  IntColumn get totalMmk => integer()();
  TextColumn get paymentMethod => text().withDefault(const Constant('cash'))();
  IntColumn get createdAtMillis => integer()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class ShopSaleLines extends Table {
  TextColumn get id => text()();
  TextColumn get saleId => text().references(ShopSales, #id)();
  TextColumn get productId => text().references(ShopProducts, #id)();
  TextColumn get productName => text()();
  IntColumn get unitPriceMmk => integer()();
  IntColumn get quantity => integer()();
  IntColumn get lineTotalMmk => integer()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class ShopStockMovements extends Table {
  TextColumn get id => text()();
  TextColumn get saleId => text().nullable().references(ShopSales, #id)();
  TextColumn get productId => text().references(ShopProducts, #id)();
  IntColumn get quantityDelta => integer()();
  TextColumn get reason => text()();
  IntColumn get createdAtMillis => integer()();

  @override
  Set<Column<Object>> get primaryKey => {id};
}

class ShopSyncOutbox extends Table {
  TextColumn get operationId => text()();
  TextColumn get eventType => text()();
  TextColumn get payloadJson => text()();
  TextColumn get state => text().withDefault(const Constant('pending'))();
  IntColumn get createdAtMillis => integer()();

  @override
  Set<Column<Object>> get primaryKey => {operationId};
}

class ShopSaleLineInput {
  const ShopSaleLineInput({required this.productId, required this.quantity});

  final String productId;
  final int quantity;
}

/// A device-local counter basket. It is neither an order nor a stock hold.
class CounterSaleDraft {
  const CounterSaleDraft({
    required this.operationId,
    required this.quantities,
    required this.unitPricesMmk,
    required this.updatedAtMillis,
  });

  final String operationId;
  final Map<String, int> quantities;
  final Map<String, int> unitPricesMmk;
  final int updatedAtMillis;
}

class ShopSaleReceipt {
  const ShopSaleReceipt({
    required this.id,
    required this.operationId,
    required this.totalMmk,
    required this.createdAtMillis,
    required this.paymentMethod,
    this.lines = const [],
  });

  final String id;
  final String operationId;
  final int totalMmk;
  final int createdAtMillis;
  final String paymentMethod;
  final List<ShopSaleReceiptLine> lines;
}

class ShopSaleReceiptLine {
  const ShopSaleReceiptLine({
    required this.productName,
    required this.unitPriceMmk,
    required this.quantity,
    required this.lineTotalMmk,
  });

  final String productName;
  final int unitPriceMmk;
  final int quantity;
  final int lineTotalMmk;
}

class ShopCashShift {
  const ShopCashShift({
    required this.id,
    required this.operatorLabel,
    required this.openingFloatMmk,
    required this.openedAtMillis,
    required this.state,
    this.closedAtMillis,
    this.cashSalesCount,
    this.cashSalesTotalMmk,
    this.walletSalesCount,
    this.walletSalesTotalMmk,
    this.expectedCashMmk,
    this.countedCashMmk,
    this.differenceMmk,
  });

  final String id;
  final String operatorLabel;
  final int openingFloatMmk;
  final int openedAtMillis;
  final String state;
  final int? closedAtMillis;
  final int? cashSalesCount;
  final int? cashSalesTotalMmk;
  final int? walletSalesCount;
  final int? walletSalesTotalMmk;
  final int? expectedCashMmk;
  final int? countedCashMmk;
  final int? differenceMmk;
}

class ShopCashShiftReview {
  const ShopCashShiftReview({
    required this.shift,
    required this.cashSalesCount,
    required this.cashSalesTotalMmk,
    required this.walletSalesCount,
    required this.walletSalesTotalMmk,
    required this.expectedCashMmk,
  });

  final ShopCashShift shift;
  final int cashSalesCount;
  final int cashSalesTotalMmk;
  final int walletSalesCount;
  final int walletSalesTotalMmk;
  final int expectedCashMmk;

  int get saleCount => cashSalesCount + walletSalesCount;
}

class WalletCheckoutLineSnapshot {
  const WalletCheckoutLineSnapshot({
    required this.productId,
    required this.productName,
    required this.unitPriceMmk,
    required this.quantity,
    required this.lineTotalMmk,
  });

  final String productId;
  final String productName;
  final int unitPriceMmk;
  final int quantity;
  final int lineTotalMmk;

  Map<String, Object> toJson() => {
    'productId': productId,
    'productName': productName,
    'unitPriceMmk': unitPriceMmk,
    'quantity': quantity,
    'lineTotalMmk': lineTotalMmk,
  };

  factory WalletCheckoutLineSnapshot.fromJson(Map<String, dynamic> json) {
    final productId = json['productId'];
    final productName = json['productName'];
    final unitPriceMmk = json['unitPriceMmk'];
    final quantity = json['quantity'];
    final lineTotalMmk = json['lineTotalMmk'];
    if (productId is! String ||
        productId.isEmpty ||
        productName is! String ||
        productName.isEmpty ||
        unitPriceMmk is! int ||
        unitPriceMmk < 0 ||
        quantity is! int ||
        quantity < 1 ||
        lineTotalMmk is! int ||
        lineTotalMmk != unitPriceMmk * quantity) {
      throw const FormatException('Wallet checkout snapshot is invalid.');
    }
    return WalletCheckoutLineSnapshot(
      productId: productId,
      productName: productName,
      unitPriceMmk: unitPriceMmk,
      quantity: quantity,
      lineTotalMmk: lineTotalMmk,
    );
  }
}

class PendingWalletCheckout {
  const PendingWalletCheckout({
    required this.operationId,
    required this.paymentMethod,
    required this.requestFingerprint,
    required this.totalMmk,
    required this.merchantPhone,
    required this.merchantQrPayload,
    required this.lines,
    required this.state,
    required this.createdAtMillis,
  });

  final String operationId;
  final String paymentMethod;
  final String requestFingerprint;
  final int totalMmk;
  final String? merchantPhone;
  final String merchantQrPayload;
  final List<WalletCheckoutLineSnapshot> lines;
  final String state;
  final int createdAtMillis;
}

@DriftDatabase(
  tables: [
    MenuImportDrafts,
    MerchantWalletProfiles,
    ShopProducts,
    ShopSales,
    ShopSaleLines,
    ShopStockMovements,
    ShopSyncOutbox,
  ],
)
class ShopDatabase extends _$ShopDatabase {
  static const maxProductThumbnailBytes = 192 * 1024;
  static const maxProductThumbnailsTotalBytes = 32 * 1024 * 1024;

  /// Keep the first-launch restore target and Drift's opened database identical.
  static File privateDatabaseFile(Directory documents) =>
      File('${documents.path}${Platform.pathSeparator}supermega_shop.sqlite');

  factory ShopDatabase.inPrivateDocuments(Directory documents) => ShopDatabase(
    driftDatabase(
      name: 'supermega_shop',
      native: DriftNativeOptions(
        databasePath: () async => privateDatabaseFile(documents).path,
      ),
    ),
  );

  ShopDatabase([QueryExecutor? executor])
    : super(executor ?? driftDatabase(name: 'supermega_shop'));

  @override
  int get schemaVersion => 9;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (migrator) async {
      await migrator.createAll();
      await _createWalletCheckoutTable();
      await _createCashShiftTables();
      await _createProductImageTable();
      await _createCounterDraftTable();
    },
    onUpgrade: (migrator, from, to) async {
      if (from < 2) {
        await migrator.createTable(shopProducts);
        await migrator.createTable(shopSales);
        await migrator.createTable(shopSaleLines);
        await migrator.createTable(shopStockMovements);
        await migrator.createTable(shopSyncOutbox);
      }
      if (from < 3) {
        // A migration from v1 may have just created these tables using the
        // current TableInfo definitions. Add only fields absent from older
        // persisted schemas so that path does not attempt duplicate columns.
        await _ensureColumn(
          'shop_products',
          'category',
          "TEXT NOT NULL DEFAULT ''",
        );
        await _ensureColumn(
          'shop_products',
          'description',
          "TEXT NOT NULL DEFAULT ''",
        );
        await _ensureColumn('shop_products', 'sku', 'TEXT');
      }
      if (from < 4) {
        await _createWalletCheckoutTable(includeQrSnapshot: false);
      }
      if (from < 5) {
        await customStatement(
          "ALTER TABLE shop_wallet_checkout_intents ADD COLUMN merchant_phone TEXT NOT NULL DEFAULT ''",
        );
        await customStatement(
          "ALTER TABLE shop_wallet_checkout_intents ADD COLUMN merchant_qr_payload TEXT NOT NULL DEFAULT ''",
        );
      }
      if (from < 6) {
        await _createCashShiftTables();
      }
      if (from < 7) {
        await _createProductImageTable();
      }
      if (from < 8) {
        await _createCounterDraftTable();
      }
      if (from < 9) {
        await _ensureColumn(
          'shop_products',
          'reorder_level',
          'INTEGER DEFAULT 5 CHECK (reorder_level IS NULL OR '
              'reorder_level BETWEEN 0 AND 2000000000)',
        );
      }
    },
    beforeOpen: (_) => customStatement('PRAGMA foreign_keys = ON'),
  );

  Future<void> _createWalletCheckoutTable({bool includeQrSnapshot = true}) {
    final qrSnapshotColumns = includeQrSnapshot
        ? "merchant_phone TEXT NOT NULL DEFAULT '', merchant_qr_payload TEXT NOT NULL,"
        : '';
    return customStatement('''
    CREATE TABLE IF NOT EXISTS shop_wallet_checkout_intents (
      operation_id TEXT PRIMARY KEY NOT NULL,
      payment_method TEXT NOT NULL CHECK (payment_method IN ('kbzpay', 'wavepay')),
      request_fingerprint TEXT NOT NULL,
      total_mmk INTEGER NOT NULL CHECK (total_mmk >= 0),
      $qrSnapshotColumns
      basket_json TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'pending'
        CHECK (state IN ('pending', 'completed', 'cancelled')),
      created_at_millis INTEGER NOT NULL
    )
  ''');
  }

  Future<void> _createCashShiftTables() async {
    await customStatement('''
      CREATE TABLE IF NOT EXISTS shop_cash_shifts (
        id TEXT PRIMARY KEY NOT NULL,
        open_operation_id TEXT NOT NULL UNIQUE,
        operator_label TEXT NOT NULL CHECK (length(operator_label) BETWEEN 1 AND 80),
        opening_float_mmk INTEGER NOT NULL CHECK (opening_float_mmk >= 0),
        opened_at_millis INTEGER NOT NULL,
        state TEXT NOT NULL CHECK (state IN ('open', 'closed')),
        close_operation_id TEXT UNIQUE,
        closed_at_millis INTEGER,
        cash_sales_count INTEGER,
        cash_sales_total_mmk INTEGER,
        wallet_sales_count INTEGER,
        wallet_sales_total_mmk INTEGER,
        expected_cash_mmk INTEGER,
        counted_cash_mmk INTEGER,
        difference_mmk INTEGER,
        review_sale_count INTEGER,
        review_cash_total_mmk INTEGER
      )
    ''');
    await customStatement('''
      CREATE UNIQUE INDEX IF NOT EXISTS shop_cash_shifts_one_open
      ON shop_cash_shifts(state) WHERE state = 'open'
    ''');
    await customStatement('''
      CREATE TABLE IF NOT EXISTS shop_cash_shift_sales (
        sale_id TEXT PRIMARY KEY NOT NULL REFERENCES shop_sales(id),
        shift_id TEXT NOT NULL REFERENCES shop_cash_shifts(id)
      )
    ''');
    await customStatement('''
      CREATE INDEX IF NOT EXISTS shop_cash_shift_sales_shift_id
      ON shop_cash_shift_sales(shift_id)
    ''');
  }

  Future<void> _createProductImageTable() => customStatement('''
    CREATE TABLE IF NOT EXISTS shop_product_images (
      product_id TEXT PRIMARY KEY NOT NULL REFERENCES shop_products(id) ON DELETE CASCADE,
      image_png BLOB NOT NULL CHECK(length(image_png) BETWEEN 1 AND $maxProductThumbnailBytes),
      updated_at_millis INTEGER NOT NULL
    )
  ''');

  Future<void> _createCounterDraftTable() => customStatement('''
    CREATE TABLE IF NOT EXISTS shop_counter_drafts (
      slot INTEGER PRIMARY KEY NOT NULL CHECK (slot = 1),
      operation_id TEXT NOT NULL UNIQUE CHECK (length(operation_id) BETWEEN 1 AND 120),
      basket_json TEXT NOT NULL,
      updated_at_millis INTEGER NOT NULL
    )
  ''');

  /// Persist the next basket before showing it to the operator. No stock or
  /// outbox row changes until recordSale commits the actual sale.
  Future<void> saveCounterSaleDraft({
    required String operationId,
    required Map<String, int> quantities,
  }) async {
    final cleanOperationId = operationId.trim();
    if (cleanOperationId.isEmpty ||
        cleanOperationId.length > 120 ||
        quantities.isEmpty ||
        quantities.length > 100) {
      throw ArgumentError('A counter draft needs a bounded basket.');
    }
    final sorted = quantities.entries.toList()
      ..sort((a, b) => a.key.compareTo(b.key));
    if (sorted.any(
      (line) =>
          line.key.trim().isEmpty ||
          line.key.length > 100 ||
          line.value < 1 ||
          line.value > 1000,
    )) {
      throw ArgumentError('Counter draft item values are invalid.');
    }
    await transaction(() async {
      final completed =
          await (select(shopSales)
                ..where((sale) => sale.operationId.equals(cleanOperationId)))
              .getSingleOrNull();
      if (completed != null) {
        throw StateError('This counter sale was already completed.');
      }
      final pending = await customSelect(
        "SELECT operation_id FROM shop_wallet_checkout_intents WHERE state = 'pending' LIMIT 1",
      ).getSingleOrNull();
      if (pending != null) {
        throw StateError('Finish the pending wallet checkout first.');
      }
      final previous = await readCounterSaleDraft();
      final lines = <Map<String, Object>>[];
      for (final line in sorted) {
        final product =
            await (select(shopProducts)..where(
                  (row) => row.id.equals(line.key) & row.archived.equals(false),
                ))
                .getSingleOrNull();
        lines.add({
          'productId': line.key,
          'quantity': line.value,
          'unitPriceMmk':
              product?.priceMmk ??
              (previous?.operationId == cleanOperationId
                  ? previous?.unitPricesMmk[line.key]
                  : null) ??
              0,
        });
      }
      await customStatement(
        'INSERT INTO shop_counter_drafts '
        '(slot, operation_id, basket_json, updated_at_millis) '
        'VALUES (1, ?, ?, ?) ON CONFLICT(slot) DO UPDATE SET '
        'operation_id = excluded.operation_id, '
        'basket_json = excluded.basket_json, '
        'updated_at_millis = excluded.updated_at_millis',
        [
          cleanOperationId,
          jsonEncode(lines),
          DateTime.now().millisecondsSinceEpoch,
        ],
      );
    });
  }

  Future<CounterSaleDraft?> readCounterSaleDraft() async {
    final row = await customSelect(
      'SELECT operation_id, basket_json, updated_at_millis '
      'FROM shop_counter_drafts WHERE slot = 1',
    ).getSingleOrNull();
    if (row == null) return null;
    final operationId = row.read<String>('operation_id');
    final completed = await (select(
      shopSales,
    )..where((sale) => sale.operationId.equals(operationId))).getSingleOrNull();
    if (completed != null) {
      throw StateError('A completed sale still has a counter draft.');
    }
    final raw = jsonDecode(row.read<String>('basket_json'));
    if (raw is! List || raw.isEmpty || raw.length > 100) {
      throw const FormatException('Counter draft is invalid.');
    }
    final quantities = <String, int>{};
    final prices = <String, int>{};
    for (final value in raw) {
      if (value is! Map<String, dynamic>) {
        throw const FormatException('Counter draft is invalid.');
      }
      final id = value['productId'];
      final quantity = value['quantity'];
      final price = value['unitPriceMmk'];
      if (id is! String ||
          id.isEmpty ||
          id.length > 100 ||
          quantity is! int ||
          quantity < 1 ||
          quantity > 1000 ||
          price is! int ||
          price < 0 ||
          price > 2000000000 ||
          quantities.containsKey(id)) {
        throw const FormatException('Counter draft is invalid.');
      }
      quantities[id] = quantity;
      prices[id] = price;
    }
    return CounterSaleDraft(
      operationId: operationId,
      quantities: Map.unmodifiable(quantities),
      unitPricesMmk: Map.unmodifiable(prices),
      updatedAtMillis: row.read<int>('updated_at_millis'),
    );
  }

  Future<void> clearCounterSaleDraft(String operationId) async {
    await customStatement(
      'DELETE FROM shop_counter_drafts WHERE slot = 1 AND operation_id = ?',
      [operationId],
    );
  }

  /// Store only bounded, metadata-free PNG thumbnails beside the local catalog.
  /// They are included in encrypted SQLite snapshots but not in JSON sync events.
  Future<void> saveProductThumbnail(String productId, Uint8List png) async {
    if (productId.trim().isEmpty || !isValidProductThumbnail(png)) {
      throw ArgumentError('The product photo is not a bounded PNG thumbnail.');
    }
    await transaction(() async {
      final product = await customSelect(
        'SELECT id FROM shop_products WHERE id = ? AND archived = 0',
        variables: [Variable.withString(productId)],
      ).getSingleOrNull();
      if (product == null) throw StateError('The product no longer exists.');
      final otherBytes = await customSelect(
        'SELECT COALESCE(SUM(length(image_png)), 0) AS total_bytes '
        'FROM shop_product_images WHERE product_id != ?',
        variables: [Variable.withString(productId)],
      ).getSingle();
      if (otherBytes.read<int>('total_bytes') + png.length >
          maxProductThumbnailsTotalBytes) {
        throw StateError('The local product photo limit is full.');
      }
      await customStatement(
        'INSERT INTO shop_product_images (product_id, image_png, updated_at_millis) '
        'VALUES (?, ?, ?) ON CONFLICT(product_id) DO UPDATE SET '
        'image_png = excluded.image_png, updated_at_millis = excluded.updated_at_millis',
        [productId, png, DateTime.now().millisecondsSinceEpoch],
      );
    });
  }

  Future<Uint8List?> readProductThumbnail(String productId) async {
    final row = await customSelect(
      'SELECT image_png FROM shop_product_images WHERE product_id = ?',
      variables: [Variable.withString(productId)],
    ).getSingleOrNull();
    return row?.read<Uint8List>('image_png');
  }

  Future<bool> hasActiveProductThumbnails() async {
    final row = await customSelect(
      'SELECT 1 FROM shop_product_images AS image '
      'JOIN shop_products AS product ON product.id = image.product_id '
      'WHERE product.archived = 0 LIMIT 1',
    ).getSingleOrNull();
    return row != null;
  }

  Future<void> removeProductThumbnail(String productId) => customStatement(
    'DELETE FROM shop_product_images WHERE product_id = ?',
    [productId],
  );

  static bool isValidProductThumbnail(Uint8List bytes) {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (bytes.length < 45 || bytes.length > maxProductThumbnailBytes) {
      return false;
    }
    for (var index = 0; index < signature.length; index++) {
      if (bytes[index] != signature[index]) return false;
    }
    final data = ByteData.sublistView(bytes);
    var offset = 8;
    var seenImageData = false;
    while (offset + 12 <= bytes.length) {
      final chunkLength = data.getUint32(offset);
      if (chunkLength > bytes.length - offset - 12) return false;
      final typeStart = offset + 4;
      final chunkEnd = offset + 8 + chunkLength;
      var crc = 0xffffffff;
      for (var index = typeStart; index < chunkEnd; index++) {
        crc ^= bytes[index];
        for (var bit = 0; bit < 8; bit++) {
          crc = (crc >> 1) ^ ((crc & 1) == 1 ? 0xedb88320 : 0);
        }
      }
      if (((crc ^ 0xffffffff) & 0xffffffff) != data.getUint32(chunkEnd)) {
        return false;
      }
      final isHeader =
          bytes[typeStart] == 73 &&
          bytes[typeStart + 1] == 72 &&
          bytes[typeStart + 2] == 68 &&
          bytes[typeStart + 3] == 82;
      final isImageData =
          bytes[typeStart] == 73 &&
          bytes[typeStart + 1] == 68 &&
          bytes[typeStart + 2] == 65 &&
          bytes[typeStart + 3] == 84;
      final isEnd =
          bytes[typeStart] == 73 &&
          bytes[typeStart + 1] == 69 &&
          bytes[typeStart + 2] == 78 &&
          bytes[typeStart + 3] == 68;
      if (offset == 8) {
        if (!isHeader || chunkLength != 13) return false;
        final width = data.getUint32(offset + 8);
        final height = data.getUint32(offset + 12);
        if (width == 0 || height == 0 || width > 192 || height > 192) {
          return false;
        }
      } else if (isHeader) {
        return false;
      }
      if (isImageData) seenImageData = true;
      if (isEnd) {
        return chunkLength == 0 &&
            seenImageData &&
            chunkEnd + 4 == bytes.length;
      }
      offset = chunkEnd + 4;
    }
    return false;
  }

  Future<void> _ensureColumn(
    String table,
    String column,
    String declaration,
  ) async {
    final rows = await customSelect('PRAGMA table_info($table)').get();
    if (rows.any((row) => row.read<String>('name') == column)) return;
    await customStatement('ALTER TABLE $table ADD COLUMN $column $declaration');
  }

  /// Create and read back a consistent local SQLite snapshot. This plaintext
  /// file is an internal building block, not a user-shareable backup format.
  Future<void> exportVerifiedLocalSnapshot(File target) async {
    await target.parent.create(recursive: true);
    if (await target.exists()) {
      throw StateError('A snapshot already exists at this path.');
    }
    // Reserve the output exclusively. A concurrent creator must never have its
    // file removed by the cleanup path below.
    await target.create(exclusive: true);
    try {
      // SQLite includes all tables, including the raw wallet-intent table and
      // pending outbox events, in one consistent point-in-time snapshot.
      await customStatement('VACUUM INTO ?', [target.path]);
      final snapshot = ShopDatabase(NativeDatabase(target));
      try {
        final version = await snapshot
            .customSelect('PRAGMA user_version')
            .get();
        final integrity = await snapshot
            .customSelect('PRAGMA integrity_check')
            .get();
        final brokenReferences = await snapshot
            .customSelect('PRAGMA foreign_key_check')
            .get();
        if (version.single.read<int>('user_version') != schemaVersion ||
            integrity.length != 1 ||
            integrity.single.read<String>('integrity_check') != 'ok' ||
            brokenReferences.isNotEmpty) {
          throw StateError('The snapshot did not pass database checks.');
        }
      } finally {
        await snapshot.close();
      }
    } catch (_) {
      if (await target.exists()) await target.delete();
      rethrow;
    }
  }

  Future<void> addProduct({
    required String id,
    required String name,
    required int priceMmk,
    required int openingStock,
    String category = '',
    String description = '',
    String? sku,
    String? barcode,
  }) async {
    final cleanId = id.trim();
    final cleanName = name.trim();
    final cleanCategory = category.trim();
    final cleanDescription = description.trim();
    final cleanSku = _optionalText(sku);
    final cleanBarcode = _optionalText(barcode);
    if (cleanId.isEmpty ||
        cleanId.length > 100 ||
        cleanName.isEmpty ||
        cleanName.length > 160 ||
        cleanCategory.length > 80 ||
        cleanDescription.length > 800 ||
        priceMmk < 0 ||
        priceMmk > 2000000000 ||
        openingStock < 0 ||
        openingStock > 2000000000 ||
        (cleanBarcode != null && cleanBarcode.length > 64) ||
        (cleanSku != null && cleanSku.length > 80)) {
      throw ArgumentError('Product values are invalid.');
    }

    final now = DateTime.now().millisecondsSinceEpoch;
    final operationId = 'catalog.product.created:$cleanId';
    await transaction(() async {
      final existing = await (select(
        shopProducts,
      )..where((row) => row.id.equals(cleanId))).getSingleOrNull();
      if (existing != null) {
        final sameProduct =
            existing.name == cleanName &&
            existing.category == cleanCategory &&
            existing.description == cleanDescription &&
            existing.sku == cleanSku &&
            existing.barcode == cleanBarcode &&
            existing.priceMmk == priceMmk &&
            existing.onHand == openingStock;
        if (sameProduct) return;
        throw StateError('This product ID already belongs to another item.');
      }
      if (cleanBarcode != null) {
        final duplicateBarcode = await (select(
          shopProducts,
        )..where((row) => row.barcode.equals(cleanBarcode))).getSingleOrNull();
        if (duplicateBarcode != null) {
          throw StateError('That barcode is already assigned to a product.');
        }
      }
      if (cleanSku != null) {
        final duplicateSku = await (select(
          shopProducts,
        )..where((row) => row.sku.equals(cleanSku))).getSingleOrNull();
        if (duplicateSku != null) {
          throw StateError('That SKU is already assigned to a product.');
        }
      }

      await into(shopProducts).insert(
        ShopProductsCompanion.insert(
          id: cleanId,
          name: cleanName,
          category: Value(cleanCategory),
          description: Value(cleanDescription),
          sku: Value(cleanSku),
          barcode: Value(cleanBarcode),
          priceMmk: priceMmk,
          onHand: openingStock,
          updatedAtMillis: now,
        ),
      );
      await into(shopStockMovements).insert(
        ShopStockMovementsCompanion.insert(
          id: '$operationId:opening',
          productId: cleanId,
          quantityDelta: openingStock,
          reason: 'opening_stock',
          createdAtMillis: now,
        ),
      );
      await into(shopSyncOutbox).insert(
        ShopSyncOutboxCompanion.insert(
          operationId: operationId,
          eventType: 'catalog.product.created.v1',
          payloadJson: jsonEncode({
            'productId': cleanId,
            'name': cleanName,
            'category': cleanCategory,
            'description': cleanDescription,
            'sku': cleanSku,
            'barcode': cleanBarcode,
            'priceMmk': priceMmk,
            'openingStock': openingStock,
          }),
          createdAtMillis: now,
        ),
      );
    });
  }

  /// Apply a reviewed local stock receipt or physical count exactly once.
  /// The expected balance prevents a stale count from erasing a later sale.
  Future<int> changeStock({
    required String operationId,
    required String productId,
    required String kind,
    required int quantity,
    required int expectedOnHand,
  }) async {
    final cleanOperationId = operationId.trim();
    final cleanProductId = productId.trim();
    if (cleanOperationId.isEmpty ||
        cleanOperationId.length > 100 ||
        cleanProductId.isEmpty ||
        cleanProductId.length > 100 ||
        !const {'receive', 'count'}.contains(kind) ||
        quantity < (kind == 'receive' ? 1 : 0) ||
        quantity > 2000000000 ||
        expectedOnHand < 0 ||
        expectedOnHand > 2000000000) {
      throw ArgumentError('Stock change values are invalid.');
    }

    return transaction(() async {
      final prior =
          await (select(shopSyncOutbox)
                ..where((row) => row.operationId.equals(cleanOperationId)))
              .getSingleOrNull();
      if (prior != null) {
        if (prior.eventType != 'shop.stock_changed.v1') {
          throw StateError('This operation ID was already used.');
        }
        final payload = jsonDecode(prior.payloadJson);
        if (payload is! Map<String, dynamic> ||
            payload['productId'] != cleanProductId ||
            payload['kind'] != kind ||
            payload['quantity'] != quantity ||
            payload['expectedOnHand'] != expectedOnHand) {
          throw StateError('This stock change was already used differently.');
        }
        return payload['resultingOnHand'] as int;
      }

      final product = await (select(
        shopProducts,
      )..where((row) => row.id.equals(cleanProductId))).getSingleOrNull();
      if (product == null || product.archived) {
        throw StateError('This product is no longer available.');
      }
      if (product.onHand != expectedOnHand) {
        throw StateError(
          'Stock changed. Reopen this item and check the count.',
        );
      }
      final resultingOnHand = kind == 'receive'
          ? product.onHand + quantity
          : quantity;
      if (resultingOnHand > 2000000000) {
        throw StateError('Stock would exceed the supported quantity.');
      }
      if (kind == 'count') {
        final pendingRows = await customSelect(
          'SELECT operation_id, payment_method, request_fingerprint, total_mmk, '
          'merchant_phone, merchant_qr_payload, basket_json, state, created_at_millis '
          'FROM shop_wallet_checkout_intents '
          'WHERE state = ? LIMIT 2',
          variables: [const Variable<String>('pending')],
        ).get();
        if (pendingRows.length > 1) {
          throw StateError(
            'Resolve the pending wallet payments before counting stock.',
          );
        }
        final pendingWallet = pendingRows.isEmpty
            ? null
            : _walletCheckoutFromRow(pendingRows.single);
        if (pendingWallet != null) {
          final pendingQuantity = pendingWallet.lines
              .where((line) => line.productId == cleanProductId)
              .fold<int>(0, (total, line) => total + line.quantity);
          if (resultingOnHand < pendingQuantity) {
            throw StateError(
              'Finish or cancel the pending wallet payment before counting '
              'this item below its saved quantity.',
            );
          }
        }
      }
      final now = DateTime.now().millisecondsSinceEpoch;
      final changed =
          await (update(shopProducts)..where(
                (row) =>
                    row.id.equals(cleanProductId) &
                    row.onHand.equals(expectedOnHand) &
                    row.archived.equals(false),
              ))
              .write(
                ShopProductsCompanion(
                  onHand: Value(resultingOnHand),
                  updatedAtMillis: Value(now),
                ),
              );
      if (changed != 1) {
        throw StateError('Stock changed. Reopen this item and try again.');
      }
      final delta = resultingOnHand - product.onHand;
      await into(shopStockMovements).insert(
        ShopStockMovementsCompanion.insert(
          id: '$cleanOperationId:stock',
          productId: cleanProductId,
          quantityDelta: delta,
          reason: kind == 'receive' ? 'stock_received' : 'stock_counted',
          createdAtMillis: now,
        ),
      );
      await into(shopSyncOutbox).insert(
        ShopSyncOutboxCompanion.insert(
          operationId: cleanOperationId,
          eventType: 'shop.stock_changed.v1',
          payloadJson: jsonEncode({
            'productId': cleanProductId,
            'kind': kind,
            'quantity': quantity,
            'expectedOnHand': expectedOnHand,
            'resultingOnHand': resultingOnHand,
            'delta': delta,
            'createdAtMillis': now,
          }),
          createdAtMillis: now,
        ),
      );
      return resultingOnHand;
    });
  }

  Future<int> importReviewedMenuBatch({
    required String batchId,
    required List<MenuDraftInput> products,
  }) async {
    final cleanBatchId = batchId.trim();
    if (cleanBatchId.isEmpty ||
        cleanBatchId.length > 100 ||
        products.isEmpty ||
        products.length > 100) {
      throw ArgumentError('A reviewed menu batch must contain 1 to 100 items.');
    }
    final seenIds = <String>{};
    final seenSkus = <String>{};
    final seenBarcodes = <String>{};
    final cleanProducts = <Map<String, Object?>>[];
    for (final item in products) {
      final id = item.id.trim();
      final name = item.name.trim();
      final category = item.category.trim();
      final description = item.description.trim();
      final sku = _optionalText(item.sku);
      final barcode = _optionalText(item.barcode);
      final priceMmk = item.priceMmk;
      final openingStock = item.openingStock;
      if (item.batchId != cleanBatchId ||
          id.isEmpty ||
          id.length > 100 ||
          !seenIds.add(id) ||
          name.isEmpty ||
          name.length > 160 ||
          category.isEmpty ||
          category.length > 80 ||
          description.length > 800 ||
          priceMmk == null ||
          priceMmk < 0 ||
          priceMmk > 2000000000 ||
          openingStock == null ||
          openingStock < 0 ||
          openingStock > 2000000000 ||
          (sku != null && (sku.length > 80 || !seenSkus.add(sku))) ||
          (barcode != null &&
              (barcode.length > 64 || !seenBarcodes.add(barcode)))) {
        throw ArgumentError(
          'Every reviewed product needs a name, price and confirmed stock.',
        );
      }
      cleanProducts.add({
        'id': id,
        'name': name,
        'category': category,
        'description': description,
        'sku': sku,
        'barcode': barcode,
        'priceMmk': priceMmk,
        'openingStock': openingStock,
      });
    }
    cleanProducts.sort(
      (a, b) => (a['id']! as String).compareTo(b['id']! as String),
    );
    final operationId = 'catalog.menu_import.v1:$cleanBatchId';
    final payload = jsonEncode({
      'batchId': cleanBatchId,
      'products': cleanProducts,
    });
    final now = DateTime.now().millisecondsSinceEpoch;

    await transaction(() async {
      final prior = await (select(
        shopSyncOutbox,
      )..where((row) => row.operationId.equals(operationId))).getSingleOrNull();
      if (prior != null) {
        if (prior.eventType == 'catalog.menu_import.batch.v1' &&
            prior.payloadJson == payload) {
          return;
        }
        throw StateError('This menu-import batch ID was already used.');
      }

      final existing = await select(shopProducts).get();
      final existingIds = existing.map((row) => row.id).toSet();
      final existingSkus = existing
          .map((row) => row.sku)
          .whereType<String>()
          .toSet();
      final existingBarcodes = existing
          .map((row) => row.barcode)
          .whereType<String>()
          .toSet();
      for (final item in cleanProducts) {
        if (existingIds.contains(item['id'])) {
          throw StateError('A reviewed product already exists in the catalog.');
        }
        if (item['sku'] case final String sku when existingSkus.contains(sku)) {
          throw StateError('A reviewed SKU is already assigned to a product.');
        }
        if (item['barcode'] case final String barcode
            when existingBarcodes.contains(barcode)) {
          throw StateError(
            'A reviewed barcode is already assigned to a product.',
          );
        }
      }

      await batch((write) {
        write.insertAll(
          shopProducts,
          cleanProducts.map(
            (item) => ShopProductsCompanion.insert(
              id: item['id']! as String,
              name: item['name']! as String,
              category: Value(item['category']! as String),
              description: Value(item['description']! as String),
              sku: Value(item['sku'] as String?),
              barcode: Value(item['barcode'] as String?),
              priceMmk: item['priceMmk']! as int,
              onHand: item['openingStock']! as int,
              updatedAtMillis: now,
            ),
          ),
        );
        final openingMovements = cleanProducts
            .where((item) => (item['openingStock']! as int) > 0)
            .map(
              (item) => ShopStockMovementsCompanion.insert(
                id: '$operationId:${item['id']}:opening',
                productId: item['id']! as String,
                quantityDelta: item['openingStock']! as int,
                reason: 'menu_import_opening_stock',
                createdAtMillis: now,
              ),
            )
            .toList(growable: false);
        if (openingMovements.isNotEmpty) {
          write.insertAll(shopStockMovements, openingMovements);
        }
        write.insert(
          shopSyncOutbox,
          ShopSyncOutboxCompanion.insert(
            operationId: operationId,
            eventType: 'catalog.menu_import.batch.v1',
            payloadJson: payload,
            createdAtMillis: now,
          ),
        );
      });
    });
    return cleanProducts.length;
  }

  Stream<List<ShopProduct>> watchActiveProducts() {
    return (select(shopProducts)
          ..where((row) => row.archived.equals(false))
          ..orderBy([(row) => OrderingTerm.asc(row.name)]))
        .watch();
  }

  Future<PendingWalletCheckout?> readPendingWalletCheckout() async {
    final row = await customSelect(
      'SELECT operation_id, payment_method, request_fingerprint, total_mmk, '
      'merchant_phone, merchant_qr_payload, basket_json, state, created_at_millis '
      'FROM shop_wallet_checkout_intents '
      'WHERE state = ? ORDER BY created_at_millis LIMIT 1',
      variables: [const Variable<String>('pending')],
    ).getSingleOrNull();
    return row == null ? null : _walletCheckoutFromRow(row);
  }

  PendingWalletCheckout _walletCheckoutFromRow(QueryRow row) {
    final rawLines = jsonDecode(row.read<String>('basket_json'));
    if (rawLines is! List || rawLines.isEmpty || rawLines.length > 100) {
      throw const FormatException('Wallet checkout snapshot is invalid.');
    }
    final lines = rawLines
        .map((line) {
          if (line is! Map<String, dynamic>) {
            throw const FormatException('Wallet checkout snapshot is invalid.');
          }
          return WalletCheckoutLineSnapshot.fromJson(line);
        })
        .toList(growable: false);
    final savedTotalMmk = row.read<int>('total_mmk');
    final seenProductIds = <String>{};
    var calculatedTotalMmk = 0;
    for (final line in lines) {
      if (!seenProductIds.add(line.productId) ||
          calculatedTotalMmk > 200000000000000 - line.lineTotalMmk) {
        throw const FormatException('Wallet checkout snapshot is invalid.');
      }
      calculatedTotalMmk += line.lineTotalMmk;
    }
    if (calculatedTotalMmk != savedTotalMmk) {
      throw const FormatException('Wallet checkout snapshot is invalid.');
    }
    return PendingWalletCheckout(
      operationId: row.read<String>('operation_id'),
      paymentMethod: row.read<String>('payment_method'),
      requestFingerprint: row.read<String>('request_fingerprint'),
      totalMmk: savedTotalMmk,
      merchantPhone: row.read<String>('merchant_phone').isEmpty
          ? null
          : row.read<String>('merchant_phone'),
      merchantQrPayload: row.read<String>('merchant_qr_payload'),
      lines: List.unmodifiable(lines),
      state: row.read<String>('state'),
      createdAtMillis: row.read<int>('created_at_millis'),
    );
  }

  Future<PendingWalletCheckout> createWalletCheckoutIntent({
    required String operationId,
    required MerchantWalletSetup merchant,
    required List<ShopSaleLineInput> lines,
  }) async {
    final cleanOperationId = operationId.trim();
    final paymentMethod = merchant.provider == 'KBZPay' ? 'kbzpay' : 'wavepay';
    final merchantQrPayload = merchant.officialQrPayload?.trim();
    final merchantPhone = merchant.merchantPhone?.trim() ?? '';
    if (cleanOperationId.isEmpty ||
        cleanOperationId.length > 120 ||
        !const {'KBZPay', 'WavePay'}.contains(merchant.provider) ||
        !merchant.issuerConfirmed ||
        merchantQrPayload == null ||
        !isValidStaticMyanmarMmqr(merchantQrPayload) ||
        merchantPhone.length > 40 ||
        lines.isEmpty ||
        lines.length > 100) {
      throw ArgumentError('A wallet checkout must contain a valid basket.');
    }
    final quantities = <String, int>{};
    for (final line in lines) {
      final productId = line.productId.trim();
      if (productId.isEmpty ||
          line.quantity < 1 ||
          line.quantity > 1000 ||
          quantities.containsKey(productId)) {
        throw ArgumentError('Wallet checkout item values are invalid.');
      }
      quantities[productId] = line.quantity;
    }
    final canonicalLines = quantities.entries.toList()
      ..sort((a, b) => a.key.compareTo(b.key));
    final fingerprint = jsonEncode({
      'paymentMethod': paymentMethod,
      'lines': [
        for (final line in canonicalLines)
          {'productId': line.key, 'quantity': line.value},
      ],
    });

    return transaction(() async {
      final existingIntent = await customSelect(
        'SELECT operation_id, payment_method, request_fingerprint, total_mmk, '
        'merchant_phone, merchant_qr_payload, basket_json, state, created_at_millis '
        'FROM shop_wallet_checkout_intents '
        'WHERE operation_id = ?',
        variables: [Variable<String>(cleanOperationId)],
      ).getSingleOrNull();
      if (existingIntent != null) {
        final prior = _walletCheckoutFromRow(existingIntent);
        if (prior.state == 'pending' &&
            prior.paymentMethod == paymentMethod &&
            prior.requestFingerprint == fingerprint) {
          return prior;
        }
        throw StateError('This wallet checkout ID was already used.');
      }
      final openIntent = await customSelect(
        'SELECT operation_id FROM shop_wallet_checkout_intents WHERE state = ? LIMIT 1',
        variables: [const Variable<String>('pending')],
      ).getSingleOrNull();
      if (openIntent != null) {
        throw StateError(
          'Finish or cancel the open wallet checkout before starting another.',
        );
      }
      final priorSale =
          await (select(shopSales)
                ..where((sale) => sale.operationId.equals(cleanOperationId)))
              .getSingleOrNull();
      if (priorSale != null) {
        throw StateError('This sale ID was already completed.');
      }

      final snapshots = <WalletCheckoutLineSnapshot>[];
      var totalMmk = 0;
      for (final line in canonicalLines) {
        final product =
            await (select(shopProducts)..where(
                  (row) => row.id.equals(line.key) & row.archived.equals(false),
                ))
                .getSingleOrNull();
        if (product == null) {
          throw StateError('A selected product is no longer available.');
        }
        if (product.onHand < line.value) {
          throw StateError('Not enough stock for ${product.name}.');
        }
        final lineTotal = product.priceMmk * line.value;
        if (lineTotal > 2000000000000 ||
            totalMmk > 200000000000000 - lineTotal) {
          throw ArgumentError('Sale total exceeds the supported MMK limit.');
        }
        totalMmk += lineTotal;
        snapshots.add(
          WalletCheckoutLineSnapshot(
            productId: product.id,
            productName: product.name,
            unitPriceMmk: product.priceMmk,
            quantity: line.value,
            lineTotalMmk: lineTotal,
          ),
        );
      }
      final createdAt = DateTime.now().millisecondsSinceEpoch;
      final basketJson = jsonEncode(
        snapshots.map((line) => line.toJson()).toList(),
      );
      await customInsert(
        'INSERT INTO shop_wallet_checkout_intents '
        '(operation_id, payment_method, request_fingerprint, total_mmk, merchant_phone, '
        'merchant_qr_payload, basket_json, state, created_at_millis) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        variables: [
          Variable<String>(cleanOperationId),
          Variable<String>(paymentMethod),
          Variable<String>(fingerprint),
          Variable<int>(totalMmk),
          Variable<String>(merchantPhone),
          Variable<String>(merchantQrPayload),
          Variable<String>(basketJson),
          const Variable<String>('pending'),
          Variable<int>(createdAt),
        ],
      );
      await clearCounterSaleDraft(cleanOperationId);
      return PendingWalletCheckout(
        operationId: cleanOperationId,
        paymentMethod: paymentMethod,
        requestFingerprint: fingerprint,
        totalMmk: totalMmk,
        merchantPhone: merchantPhone.isEmpty ? null : merchantPhone,
        merchantQrPayload: merchantQrPayload,
        lines: List.unmodifiable(snapshots),
        state: 'pending',
        createdAtMillis: createdAt,
      );
    });
  }

  Future<bool> cancelWalletCheckoutIntent(
    String operationId, {
    String? resumeOperationId,
  }) async {
    if (resumeOperationId != null &&
        (resumeOperationId.trim().isEmpty ||
            resumeOperationId.length > 120 ||
            resumeOperationId == operationId)) {
      throw ArgumentError('A resumed basket needs a new operation ID.');
    }
    return transaction(() async {
      final row = await customSelect(
        'SELECT operation_id, payment_method, request_fingerprint, total_mmk, '
        'merchant_phone, merchant_qr_payload, basket_json, state, created_at_millis '
        'FROM shop_wallet_checkout_intents '
        "WHERE operation_id = ? AND state = 'pending'",
        variables: [Variable<String>(operationId)],
      ).getSingleOrNull();
      if (row == null) return false;
      final intent = _walletCheckoutFromRow(row);
      if (resumeOperationId != null) {
        final priorSale =
            await (select(shopSales)
                  ..where((sale) => sale.operationId.equals(resumeOperationId)))
                .getSingleOrNull();
        final otherDraft = await readCounterSaleDraft();
        if (priorSale != null || otherDraft != null) {
          throw StateError('A different sale already uses this draft slot.');
        }
      }
      final changed = await customUpdate(
        "UPDATE shop_wallet_checkout_intents SET state = 'cancelled' "
        "WHERE operation_id = ? AND state = 'pending'",
        variables: [Variable<String>(operationId)],
      );
      if (changed != 1) return false;
      if (resumeOperationId != null) {
        final draftLines = [
          for (final line in intent.lines)
            {
              'productId': line.productId,
              'quantity': line.quantity,
              'unitPriceMmk': line.unitPriceMmk,
            },
        ];
        await customStatement(
          'INSERT INTO shop_counter_drafts '
          '(slot, operation_id, basket_json, updated_at_millis) '
          'VALUES (1, ?, ?, ?) ON CONFLICT(slot) DO UPDATE SET '
          'operation_id = excluded.operation_id, '
          'basket_json = excluded.basket_json, '
          'updated_at_millis = excluded.updated_at_millis',
          [
            resumeOperationId,
            jsonEncode(draftLines),
            DateTime.now().millisecondsSinceEpoch,
          ],
        );
      }
      return true;
    });
  }

  Future<List<ShopProduct>> readActiveProducts() {
    return (select(shopProducts)
          ..where((row) => row.archived.equals(false))
          ..orderBy([(row) => OrderingTerm.asc(row.name)]))
        .get();
  }

  /// Change only this product's local alert setting. A stale settings dialog
  /// cannot overwrite a newer choice, and stock movements are unaffected.
  Future<void> setReorderLevel({
    required String productId,
    required int? expectedReorderLevel,
    required int? reorderLevel,
  }) async {
    final cleanProductId = productId.trim();
    if (cleanProductId.isEmpty ||
        cleanProductId.length > 100 ||
        (expectedReorderLevel != null &&
            (expectedReorderLevel < 0 || expectedReorderLevel > 2000000000)) ||
        (reorderLevel != null &&
            (reorderLevel < 0 || reorderLevel > 2000000000))) {
      throw ArgumentError('Low-stock alert values are invalid.');
    }

    await transaction(() async {
      final product = await (select(
        shopProducts,
      )..where((row) => row.id.equals(cleanProductId))).getSingleOrNull();
      if (product == null || product.archived) {
        throw StateError('This product is no longer available.');
      }
      if (product.reorderLevel != expectedReorderLevel) {
        throw StateError('Low-stock alert changed. Reopen this item.');
      }
      if (product.reorderLevel == reorderLevel) return;

      final changed =
          await (update(shopProducts)..where(
                (row) =>
                    row.id.equals(cleanProductId) &
                    row.archived.equals(false) &
                    (expectedReorderLevel == null
                        ? row.reorderLevel.isNull()
                        : row.reorderLevel.equals(expectedReorderLevel)),
              ))
              .write(
                ShopProductsCompanion(
                  reorderLevel: Value(reorderLevel),
                  updatedAtMillis: Value(DateTime.now().millisecondsSinceEpoch),
                ),
              );
      if (changed != 1) {
        throw StateError('Low-stock alert changed. Reopen this item.');
      }
    });
  }

  ShopCashShift _cashShiftFromRow(QueryRow row) => ShopCashShift(
    id: row.read<String>('id'),
    operatorLabel: row.read<String>('operator_label'),
    openingFloatMmk: row.read<int>('opening_float_mmk'),
    openedAtMillis: row.read<int>('opened_at_millis'),
    state: row.read<String>('state'),
    closedAtMillis: row.readNullable<int>('closed_at_millis'),
    cashSalesCount: row.readNullable<int>('cash_sales_count'),
    cashSalesTotalMmk: row.readNullable<int>('cash_sales_total_mmk'),
    walletSalesCount: row.readNullable<int>('wallet_sales_count'),
    walletSalesTotalMmk: row.readNullable<int>('wallet_sales_total_mmk'),
    expectedCashMmk: row.readNullable<int>('expected_cash_mmk'),
    countedCashMmk: row.readNullable<int>('counted_cash_mmk'),
    differenceMmk: row.readNullable<int>('difference_mmk'),
  );

  Future<ShopCashShift?> readOpenCashShift() async {
    final row = await customSelect(
      "SELECT * FROM shop_cash_shifts WHERE state = 'open' LIMIT 1",
    ).getSingleOrNull();
    return row == null ? null : _cashShiftFromRow(row);
  }

  Future<ShopCashShift?> readLatestCashShift() async {
    final row = await customSelect(
      'SELECT * FROM shop_cash_shifts '
      'ORDER BY opened_at_millis DESC, id DESC LIMIT 1',
    ).getSingleOrNull();
    return row == null ? null : _cashShiftFromRow(row);
  }

  Future<ShopCashShift> openCashShift({
    required String operationId,
    required String operatorLabel,
    required int openingFloatMmk,
  }) async {
    final cleanOperationId = operationId.trim();
    final cleanOperatorLabel = operatorLabel.trim();
    if (cleanOperationId.isEmpty ||
        cleanOperationId.length > 120 ||
        cleanOperatorLabel.isEmpty ||
        cleanOperatorLabel.length > 80 ||
        openingFloatMmk < 0 ||
        openingFloatMmk > 200000000000000) {
      throw ArgumentError('Cash shift details are invalid.');
    }
    return transaction(() async {
      final previous = await customSelect(
        'SELECT * FROM shop_cash_shifts WHERE open_operation_id = ?',
        variables: [Variable<String>(cleanOperationId)],
      ).getSingleOrNull();
      if (previous != null) {
        final priorShift = _cashShiftFromRow(previous);
        if (priorShift.operatorLabel != cleanOperatorLabel ||
            priorShift.openingFloatMmk != openingFloatMmk) {
          throw StateError('A shift operation ID was reused with new details.');
        }
        return priorShift;
      }
      if (await readOpenCashShift() != null) {
        throw StateError(
          'Close the current cash shift before starting another.',
        );
      }
      final pendingWallet = await customSelect(
        "SELECT operation_id FROM shop_wallet_checkout_intents WHERE state = 'pending' LIMIT 1",
      ).getSingleOrNull();
      if (pendingWallet != null) {
        throw StateError('Finish or cancel the pending wallet checkout first.');
      }
      final now = DateTime.now().millisecondsSinceEpoch;
      final shiftId = 'shift-$cleanOperationId';
      await customInsert(
        'INSERT INTO shop_cash_shifts '
        '(id, open_operation_id, operator_label, opening_float_mmk, '
        'opened_at_millis, state) VALUES (?, ?, ?, ?, ?, ?)',
        variables: [
          Variable<String>(shiftId),
          Variable<String>(cleanOperationId),
          Variable<String>(cleanOperatorLabel),
          Variable<int>(openingFloatMmk),
          Variable<int>(now),
          const Variable<String>('open'),
        ],
      );
      await into(shopSyncOutbox).insert(
        ShopSyncOutboxCompanion.insert(
          operationId: cleanOperationId,
          eventType: 'shop.cash_shift.opened.v1',
          payloadJson: jsonEncode({
            'shiftId': shiftId,
            'operatorLabel': cleanOperatorLabel,
            'openingFloatMmk': openingFloatMmk,
            'openedAtMillis': now,
          }),
          createdAtMillis: now,
        ),
      );
      return (await readOpenCashShift())!;
    });
  }

  Future<ShopCashShiftReview> readCashShiftReview(String shiftId) async {
    final row = await customSelect(
      'SELECT * FROM shop_cash_shifts WHERE id = ?',
      variables: [Variable<String>(shiftId)],
    ).getSingleOrNull();
    if (row == null) throw StateError('Cash shift was not found.');
    final shift = _cashShiftFromRow(row);
    if (shift.state != 'open') {
      throw StateError('This cash shift is already closed.');
    }
    final totals = await customSelect(
      '''
      SELECT
        COALESCE(SUM(CASE WHEN s.payment_method = 'cash' THEN 1 ELSE 0 END), 0) AS cash_count,
        COALESCE(SUM(CASE WHEN s.payment_method = 'cash' THEN s.total_mmk ELSE 0 END), 0) AS cash_total,
        COALESCE(SUM(CASE WHEN s.payment_method IN ('kbzpay', 'wavepay') THEN 1 ELSE 0 END), 0) AS wallet_count,
        COALESCE(SUM(CASE WHEN s.payment_method IN ('kbzpay', 'wavepay') THEN s.total_mmk ELSE 0 END), 0) AS wallet_total,
        COALESCE(SUM(CASE WHEN s.payment_method NOT IN ('cash', 'kbzpay', 'wavepay') THEN 1 ELSE 0 END), 0) AS unknown_count
      FROM shop_cash_shift_sales link
      JOIN shop_sales s ON s.id = link.sale_id
      WHERE link.shift_id = ?
    ''',
      variables: [Variable<String>(shiftId)],
    ).getSingle();
    if (totals.read<int>('unknown_count') != 0) {
      throw StateError('The shift contains an unsupported payment method.');
    }
    final cashTotal = totals.read<int>('cash_total');
    if (cashTotal > 200000000000000 - shift.openingFloatMmk) {
      throw StateError('Cash shift total exceeds the supported limit.');
    }
    return ShopCashShiftReview(
      shift: shift,
      cashSalesCount: totals.read<int>('cash_count'),
      cashSalesTotalMmk: cashTotal,
      walletSalesCount: totals.read<int>('wallet_count'),
      walletSalesTotalMmk: totals.read<int>('wallet_total'),
      expectedCashMmk: shift.openingFloatMmk + cashTotal,
    );
  }

  Future<ShopCashShift> closeCashShift({
    required String shiftId,
    required String operationId,
    required int seenSaleCount,
    required int seenCashTotalMmk,
    required int countedCashMmk,
  }) async {
    final cleanOperationId = operationId.trim();
    if (shiftId.trim().isEmpty ||
        cleanOperationId.isEmpty ||
        cleanOperationId.length > 120 ||
        seenSaleCount < 0 ||
        seenCashTotalMmk < 0 ||
        countedCashMmk < 0 ||
        countedCashMmk > 200000000000000) {
      throw ArgumentError('Cash shift close details are invalid.');
    }
    return transaction(() async {
      final previous = await customSelect(
        'SELECT * FROM shop_cash_shifts WHERE close_operation_id = ?',
        variables: [Variable<String>(cleanOperationId)],
      ).getSingleOrNull();
      if (previous != null) {
        final priorShift = _cashShiftFromRow(previous);
        if (priorShift.id != shiftId ||
            priorShift.countedCashMmk != countedCashMmk ||
            previous.readNullable<int>('review_sale_count') != seenSaleCount ||
            previous.readNullable<int>('review_cash_total_mmk') !=
                seenCashTotalMmk) {
          throw StateError('A shift operation ID was reused with new details.');
        }
        return priorShift;
      }
      final pendingWallet = await customSelect(
        "SELECT operation_id FROM shop_wallet_checkout_intents WHERE state = 'pending' LIMIT 1",
      ).getSingleOrNull();
      if (pendingWallet != null) {
        throw StateError('Finish or cancel the pending wallet checkout first.');
      }
      final review = await readCashShiftReview(shiftId);
      if (review.saleCount != seenSaleCount ||
          review.cashSalesTotalMmk != seenCashTotalMmk) {
        throw StateError('Sales changed. Review the cash shift again.');
      }
      final now = DateTime.now().millisecondsSinceEpoch;
      final difference = countedCashMmk - review.expectedCashMmk;
      final changed = await customUpdate(
        'UPDATE shop_cash_shifts SET state = ?, close_operation_id = ?, '
        'closed_at_millis = ?, cash_sales_count = ?, cash_sales_total_mmk = ?, '
        'wallet_sales_count = ?, wallet_sales_total_mmk = ?, '
        'expected_cash_mmk = ?, counted_cash_mmk = ?, difference_mmk = ?, '
        'review_sale_count = ?, review_cash_total_mmk = ? '
        "WHERE id = ? AND state = 'open'",
        variables: [
          const Variable<String>('closed'),
          Variable<String>(cleanOperationId),
          Variable<int>(now),
          Variable<int>(review.cashSalesCount),
          Variable<int>(review.cashSalesTotalMmk),
          Variable<int>(review.walletSalesCount),
          Variable<int>(review.walletSalesTotalMmk),
          Variable<int>(review.expectedCashMmk),
          Variable<int>(countedCashMmk),
          Variable<int>(difference),
          Variable<int>(seenSaleCount),
          Variable<int>(seenCashTotalMmk),
          Variable<String>(shiftId),
        ],
      );
      if (changed != 1) throw StateError('Cash shift changed. Review again.');
      await into(shopSyncOutbox).insert(
        ShopSyncOutboxCompanion.insert(
          operationId: cleanOperationId,
          eventType: 'shop.cash_shift.closed.v1',
          payloadJson: jsonEncode({
            'shiftId': shiftId,
            'cashSalesCount': review.cashSalesCount,
            'cashSalesTotalMmk': review.cashSalesTotalMmk,
            'walletSalesCount': review.walletSalesCount,
            'walletSalesTotalMmk': review.walletSalesTotalMmk,
            'expectedCashMmk': review.expectedCashMmk,
            'countedCashMmk': countedCashMmk,
            'differenceMmk': difference,
            'closedAtMillis': now,
          }),
          createdAtMillis: now,
        ),
      );
      final closed = await customSelect(
        'SELECT * FROM shop_cash_shifts WHERE id = ?',
        variables: [Variable<String>(shiftId)],
      ).getSingle();
      return _cashShiftFromRow(closed);
    });
  }

  Future<ShopSaleReceipt> recordCashSale({
    required String operationId,
    required List<ShopSaleLineInput> lines,
  }) =>
      recordSale(operationId: operationId, lines: lines, paymentMethod: 'cash');

  Future<ShopSaleReceipt> recordSale({
    required String operationId,
    required List<ShopSaleLineInput> lines,
    required String paymentMethod,
    String? walletCheckoutOperationId,
    int? expectedTotalMmk,
  }) async {
    final cleanOperationId = operationId.trim();
    final cleanWalletCheckoutId = walletCheckoutOperationId?.trim();
    const supportedPaymentMethods = {'cash', 'kbzpay', 'wavepay'};
    if (cleanOperationId.isEmpty ||
        cleanOperationId.length > 120 ||
        lines.isEmpty ||
        lines.length > 100 ||
        !supportedPaymentMethods.contains(paymentMethod) ||
        (expectedTotalMmk != null &&
            (expectedTotalMmk < 0 || paymentMethod != 'cash')) ||
        (paymentMethod == 'cash' && cleanWalletCheckoutId != null) ||
        (paymentMethod != 'cash' &&
            cleanWalletCheckoutId != cleanOperationId)) {
      throw ArgumentError('A sale must contain between 1 and 100 items.');
    }
    final productQuantities = <String, int>{};
    for (final line in lines) {
      final productId = line.productId.trim();
      if (productId.isEmpty ||
          line.quantity < 1 ||
          line.quantity > 1000 ||
          productQuantities.containsKey(productId)) {
        throw ArgumentError('Sale item values are invalid.');
      }
      productQuantities[productId] = line.quantity;
    }
    final canonicalLines = productQuantities.entries.toList()
      ..sort((a, b) => a.key.compareTo(b.key));
    final fingerprintLines = [
      for (final line in canonicalLines)
        {'productId': line.key, 'quantity': line.value},
    ];
    final fingerprint = paymentMethod == 'cash'
        ? jsonEncode(fingerprintLines)
        : jsonEncode({
            'paymentMethod': paymentMethod,
            'lines': fingerprintLines,
          });

    return transaction(() async {
      final priorSale =
          await (select(shopSales)
                ..where((sale) => sale.operationId.equals(cleanOperationId)))
              .getSingleOrNull();
      if (priorSale != null) {
        if (priorSale.requestFingerprint != fingerprint) {
          throw StateError(
            'A sale operation ID was reused with different items.',
          );
        }
        if (expectedTotalMmk != null &&
            priorSale.totalMmk != expectedTotalMmk) {
          throw StateError('Sale total changed. Review the amount again.');
        }
        final priorLines =
            await (select(shopSaleLines)
                  ..where((line) => line.saleId.equals(priorSale.id))
                  ..orderBy([(line) => OrderingTerm.asc(line.productName)]))
                .get();
        await clearCounterSaleDraft(cleanOperationId);
        return ShopSaleReceipt(
          id: priorSale.id,
          operationId: priorSale.operationId,
          totalMmk: priorSale.totalMmk,
          createdAtMillis: priorSale.createdAtMillis,
          paymentMethod: priorSale.paymentMethod,
          lines: [
            for (final line in priorLines)
              ShopSaleReceiptLine(
                productName: line.productName,
                unitPriceMmk: line.unitPriceMmk,
                quantity: line.quantity,
                lineTotalMmk: line.lineTotalMmk,
              ),
          ],
        );
      }

      // Read the persisted intent inside the same transaction as the stock
      // mutation. Startup UI recovery can still be loading or can fail, so a
      // null in-memory checkout must never make a second sale permissible.
      final openWalletIntents = await customSelect(
        'SELECT operation_id FROM shop_wallet_checkout_intents '
        'WHERE state = ? LIMIT 2',
        variables: [const Variable<String>('pending')],
      ).get();
      if (openWalletIntents.isNotEmpty &&
          (paymentMethod == 'cash' ||
              openWalletIntents.length != 1 ||
              openWalletIntents.single.read<String>('operation_id') !=
                  cleanWalletCheckoutId)) {
        throw StateError(
          'Finish or cancel the pending wallet payment before another sale.',
        );
      }

      Map<String, WalletCheckoutLineSnapshot>? walletSnapshots;
      int? walletIntentTotalMmk;
      if (paymentMethod != 'cash') {
        final intentRow = await customSelect(
          'SELECT operation_id, payment_method, request_fingerprint, total_mmk, '
          'merchant_phone, merchant_qr_payload, basket_json, state, created_at_millis '
          'FROM shop_wallet_checkout_intents '
          'WHERE operation_id = ? AND state = ?',
          variables: [
            Variable<String>(cleanWalletCheckoutId!),
            const Variable<String>('pending'),
          ],
        ).getSingleOrNull();
        if (intentRow == null) {
          throw StateError('The wallet checkout is no longer pending.');
        }
        final intent = _walletCheckoutFromRow(intentRow);
        if (intent.paymentMethod != paymentMethod ||
            intent.requestFingerprint != fingerprint) {
          throw StateError('The pending checkout does not match this sale.');
        }
        if (intent.lines.length != canonicalLines.length ||
            intent.lines.any(
              (line) => productQuantities[line.productId] != line.quantity,
            )) {
          throw StateError(
            'The pending checkout basket does not match this sale.',
          );
        }
        walletIntentTotalMmk = intent.totalMmk;
        walletSnapshots = {
          for (final line in intent.lines) line.productId: line,
        };
      }

      final products = <ShopProduct>[];
      var totalMmk = 0;
      for (final line in canonicalLines) {
        // A persisted wallet intent freezes a sale while awaiting payment.
        // Archiving its product later hides it from new sales, but must not
        // strand a verified payment. The saved intent and stock check remain
        // the authority for this completion path.
        final product =
            await (select(shopProducts)..where(
                  (row) => walletSnapshots == null
                      ? row.id.equals(line.key) & row.archived.equals(false)
                      : row.id.equals(line.key),
                ))
                .getSingleOrNull();
        if (product == null) {
          throw StateError('A selected product is no longer available.');
        }
        final snapshot = walletSnapshots?[line.key];
        if (walletSnapshots != null &&
            (snapshot == null || snapshot.quantity != line.value)) {
          throw StateError('The sale does not match the saved checkout.');
        }
        final unitPriceMmk = snapshot?.unitPriceMmk ?? product.priceMmk;
        final lineTotal = unitPriceMmk * line.value;
        if (lineTotal > 2000000000000 ||
            totalMmk > 200000000000000 - lineTotal) {
          throw ArgumentError('Sale total exceeds the supported MMK limit.');
        }
        totalMmk += lineTotal;
        products.add(product);
      }
      if (expectedTotalMmk != null && totalMmk != expectedTotalMmk) {
        throw StateError('Sale total changed. Review the amount again.');
      }
      if (walletIntentTotalMmk != null && totalMmk != walletIntentTotalMmk) {
        throw StateError('The saved wallet amount does not match this sale.');
      }

      final activeShift = await readOpenCashShift();
      if (activeShift != null && paymentMethod == 'cash') {
        final review = await readCashShiftReview(activeShift.id);
        if (totalMmk > 200000000000000 - review.expectedCashMmk) {
          throw StateError(
            'This cash shift reached its supported limit. Close the shift '
            'before recording another cash sale.',
          );
        }
      }
      final now = DateTime.now().millisecondsSinceEpoch;
      final saleId = cleanOperationId;
      await into(shopSales).insert(
        ShopSalesCompanion.insert(
          id: saleId,
          operationId: cleanOperationId,
          requestFingerprint: fingerprint,
          totalMmk: totalMmk,
          paymentMethod: Value(paymentMethod),
          createdAtMillis: now,
        ),
      );
      if (activeShift != null) {
        await customInsert(
          'INSERT INTO shop_cash_shift_sales (sale_id, shift_id) VALUES (?, ?)',
          variables: [
            Variable<String>(saleId),
            Variable<String>(activeShift.id),
          ],
        );
      }

      final eventLines = <Map<String, Object>>[];
      for (var index = 0; index < canonicalLines.length; index++) {
        final line = canonicalLines[index];
        final product = products[index];
        final snapshot = walletSnapshots?[line.key];
        final quantity = line.value;
        final productName = snapshot?.productName ?? product.name;
        final unitPriceMmk = snapshot?.unitPriceMmk ?? product.priceMmk;
        final lineTotal = unitPriceMmk * quantity;
        final changedRows = await customUpdate(
          'UPDATE shop_products '
          'SET on_hand = on_hand - ?, updated_at_millis = ? '
          'WHERE id = ? AND on_hand >= ? AND (archived = 0 OR ? = 1)',
          variables: [
            Variable<int>(quantity),
            Variable<int>(now),
            Variable<String>(product.id),
            Variable<int>(quantity),
            Variable<int>(walletSnapshots == null ? 0 : 1),
          ],
        );
        if (changedRows != 1) {
          throw StateError('Not enough stock for $productName.');
        }
        await into(shopSaleLines).insert(
          ShopSaleLinesCompanion.insert(
            id: '$saleId:${product.id}',
            saleId: saleId,
            productId: product.id,
            productName: productName,
            unitPriceMmk: unitPriceMmk,
            quantity: quantity,
            lineTotalMmk: lineTotal,
          ),
        );
        await into(shopStockMovements).insert(
          ShopStockMovementsCompanion.insert(
            id: '$saleId:${product.id}:sale',
            saleId: Value(saleId),
            productId: product.id,
            quantityDelta: -quantity,
            reason: '${paymentMethod}_sale',
            createdAtMillis: now,
          ),
        );
        eventLines.add({
          'productId': product.id,
          'productName': productName,
          'unitPriceMmk': unitPriceMmk,
          'quantity': quantity,
          'lineTotalMmk': lineTotal,
        });
      }

      await into(shopSyncOutbox).insert(
        ShopSyncOutboxCompanion.insert(
          operationId: cleanOperationId,
          eventType: paymentMethod == 'cash'
              ? 'shop.cash_sale.completed.v1'
              : 'shop.mobile_money_sale.completed.v1',
          payloadJson: jsonEncode({
            'saleId': saleId,
            'totalMmk': totalMmk,
            'paymentMethod': paymentMethod,
            'createdAtMillis': now,
            if (activeShift != null) 'shiftId': activeShift.id,
            'lines': eventLines,
          }),
          createdAtMillis: now,
        ),
      );
      if (paymentMethod != 'cash') {
        final changed = await customUpdate(
          'UPDATE shop_wallet_checkout_intents SET state = ? '
          'WHERE operation_id = ? AND state = ?',
          variables: [
            const Variable<String>('completed'),
            Variable<String>(cleanWalletCheckoutId!),
            const Variable<String>('pending'),
          ],
        );
        if (changed != 1) {
          throw StateError('The wallet checkout could not be finalized.');
        }
      }
      await clearCounterSaleDraft(cleanOperationId);
      return ShopSaleReceipt(
        id: saleId,
        operationId: cleanOperationId,
        totalMmk: totalMmk,
        createdAtMillis: now,
        paymentMethod: paymentMethod,
        lines: [
          for (final line in eventLines)
            ShopSaleReceiptLine(
              productName: line['productName']! as String,
              unitPriceMmk: line['unitPriceMmk']! as int,
              quantity: line['quantity']! as int,
              lineTotalMmk: line['lineTotalMmk']! as int,
            ),
        ],
      );
    });
  }

  /// A bounded page of device-local committed sales. Search uses saved item
  /// names, so later catalog edits cannot make an old receipt disappear.
  Future<List<ShopSaleReceipt>> readRecentSales({
    int limit = 30,
    int offset = 0,
    String query = '',
  }) async {
    if (limit < 1 || limit > 100) {
      throw ArgumentError.value(limit, 'limit', 'Use between 1 and 100 sales.');
    }
    if (offset < 0) {
      throw ArgumentError.value(offset, 'offset', 'Use a non-negative offset.');
    }
    final search = query.trim();
    late final List<ShopSale> sales;
    if (search.isEmpty) {
      sales =
          await (select(shopSales)
                ..orderBy([
                  (sale) => OrderingTerm.desc(sale.createdAtMillis),
                  (sale) => OrderingTerm.desc(sale.id),
                ])
                ..limit(limit, offset: offset))
              .get();
    } else {
      final matchingIds = await customSelect(
        'SELECT sale.id FROM shop_sales AS sale '
        'WHERE instr(lower(sale.id), lower(?)) > 0 '
        'OR EXISTS (SELECT 1 FROM shop_sale_lines AS line '
        'WHERE line.sale_id = sale.id '
        'AND instr(lower(line.product_name), lower(?)) > 0) '
        'ORDER BY sale.created_at_millis DESC, sale.id DESC '
        'LIMIT ? OFFSET ?',
        variables: [
          Variable.withString(search),
          Variable.withString(search),
          Variable.withInt(limit),
          Variable.withInt(offset),
        ],
        readsFrom: {shopSales, shopSaleLines},
      ).get();
      if (matchingIds.isEmpty) return const [];
      final ids = matchingIds.map((row) => row.read<String>('id')).toList();
      final rows = await (select(
        shopSales,
      )..where((sale) => sale.id.isIn(ids))).get();
      final byId = {for (final row in rows) row.id: row};
      sales = [for (final id in ids) byId[id]!];
    }
    if (sales.isEmpty) return const [];

    final saleIds = sales.map((sale) => sale.id).toList(growable: false);
    final savedLines =
        await (select(shopSaleLines)
              ..where((line) => line.saleId.isIn(saleIds))
              ..orderBy([(line) => OrderingTerm.asc(line.id)]))
            .get();
    final linesBySale = <String, List<ShopSaleReceiptLine>>{};
    for (final line in savedLines) {
      (linesBySale[line.saleId] ??= []).add(
        ShopSaleReceiptLine(
          productName: line.productName,
          unitPriceMmk: line.unitPriceMmk,
          quantity: line.quantity,
          lineTotalMmk: line.lineTotalMmk,
        ),
      );
    }
    return [
      for (final sale in sales)
        ShopSaleReceipt(
          id: sale.id,
          operationId: sale.operationId,
          totalMmk: sale.totalMmk,
          createdAtMillis: sale.createdAtMillis,
          paymentMethod: sale.paymentMethod,
          lines: linesBySale[sale.id] ?? const [],
        ),
    ];
  }

  Future<int> countSales() async {
    final count = countAll();
    final query = selectOnly(shopSales)..addColumns([count]);
    return await query.map((row) => row.read(count) ?? 0).getSingle();
  }

  Future<int> countStockMovements() async {
    final count = countAll();
    final query = selectOnly(shopStockMovements)..addColumns([count]);
    return await query.map((row) => row.read(count) ?? 0).getSingle();
  }

  Future<int> countOutboxOperations() async {
    final count = countAll();
    final query = selectOnly(shopSyncOutbox)..addColumns([count]);
    return await query.map((row) => row.read(count) ?? 0).getSingle();
  }

  Future<int> stageMenuCandidates({
    required String batchId,
    required List<MenuDraftInput> drafts,
  }) async {
    if (batchId.trim().isEmpty || drafts.isEmpty || drafts.length > 100) {
      throw ArgumentError('A menu batch must contain between 1 and 100 rows.');
    }
    final ids = <String>{};
    for (final draft in drafts) {
      if (draft.batchId != batchId ||
          draft.id.trim().isEmpty ||
          !ids.add(draft.id) ||
          draft.category.trim().isEmpty ||
          draft.name.trim().isEmpty ||
          draft.category.length > 80 ||
          draft.name.length > 160 ||
          draft.description.length > 800 ||
          (draft.priceMmk != null &&
              (draft.priceMmk! < 0 || draft.priceMmk! > 2000000000)) ||
          (draft.openingStock != null && draft.openingStock! < 0)) {
        throw ArgumentError('Menu draft values are invalid.');
      }
    }

    final createdAt = DateTime.now().millisecondsSinceEpoch;
    await transaction(() async {
      await batch((batch) {
        batch.insertAll(
          menuImportDrafts,
          drafts
              .map(
                (draft) => MenuImportDraftsCompanion.insert(
                  id: draft.id,
                  batchId: draft.batchId,
                  category: draft.category.trim(),
                  name: draft.name.trim(),
                  description: Value(draft.description.trim()),
                  priceMmk: Value(draft.priceMmk),
                  sku: Value(_optionalText(draft.sku)),
                  barcode: Value(_optionalText(draft.barcode)),
                  openingStock: Value(draft.openingStock),
                  createdAtMillis: createdAt,
                ),
              )
              .toList(growable: false),
        );
      });
    });
    return drafts.length;
  }

  Future<List<MenuImportDraft>> readMenuDrafts() {
    return (select(menuImportDrafts)..orderBy([
          (row) => OrderingTerm.desc(row.createdAtMillis),
          (row) => OrderingTerm.asc(row.name),
        ]))
        .get();
  }

  Future<int> countMenuDrafts() async {
    final count = countAll();
    final query = selectOnly(menuImportDrafts)..addColumns([count]);
    return await query.map((row) => row.read(count) ?? 0).getSingle();
  }

  Future<void> saveWalletSetup(MerchantWalletSetup setup) async {
    const providers = {'KBZPay', 'WavePay'};
    final phone = _optionalText(setup.merchantPhone);
    final payload = _optionalText(setup.officialQrPayload);
    if (!providers.contains(setup.provider) ||
        (phone != null && phone.length > 40) ||
        (payload != null && payload.length > 512) ||
        (setup.issuerConfirmed &&
            (payload == null || !isValidStaticMyanmarMmqr(payload)))) {
      throw ArgumentError('Wallet setup values are invalid.');
    }
    await into(merchantWalletProfiles).insertOnConflictUpdate(
      MerchantWalletProfilesCompanion.insert(
        provider: setup.provider,
        merchantPhone: Value(phone),
        officialQrPayload: Value(payload),
        issuerConfirmed: Value(setup.issuerConfirmed && payload != null),
        updatedAtMillis: DateTime.now().millisecondsSinceEpoch,
      ),
    );
  }

  Future<List<MerchantWalletProfile>> readWalletSetups() {
    return select(merchantWalletProfiles).get();
  }

  String? _optionalText(String? value) {
    final trimmed = value?.trim();
    return trimmed == null || trimmed.isEmpty ? null : trimmed;
  }
}
