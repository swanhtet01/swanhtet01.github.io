import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
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
    required this.productNames,
    required this.updatedAtMillis,
  });

  final String operationId;
  final Map<String, int> quantities;
  final Map<String, int> unitPricesMmk;

  /// Names seen when this basket was last saved; old drafts without names
  /// require an explicit review before cash checkout.
  final Map<String, String?> productNames;
  final int updatedAtMillis;
}

/// A named, device-local basket set aside by the cashier. Holding a ticket
/// never reserves stock, creates an order, or records a payment.
class HeldSaleTicket {
  const HeldSaleTicket({
    required this.id,
    required this.name,
    required this.draft,
    required this.createdAtMillis,
  });

  final String id;
  final String name;
  final CounterSaleDraft draft;
  final int createdAtMillis;
}

class ShopSaleReceipt {
  const ShopSaleReceipt({
    required this.id,
    required this.operationId,
    required this.totalMmk,
    required this.createdAtMillis,
    required this.paymentMethod,
    this.lines = const [],
    this.reversal,
  });

  final String id;
  final String operationId;
  final int totalMmk;
  final int createdAtMillis;
  final String paymentMethod;
  final List<ShopSaleReceiptLine> lines;
  final ShopSaleReversal? reversal;
}

class ShopSaleReceiptLine {
  const ShopSaleReceiptLine({
    required this.productName,
    required this.unitPriceMmk,
    required this.quantity,
    required this.lineTotalMmk,
    this.id,
    this.productId,
  });

  final String productName;
  final int unitPriceMmk;
  final int quantity;
  final int lineTotalMmk;
  final String? id;
  final String? productId;
}

/// A server-verified, command-bound authorization receipt.
///
/// This value is evidence returned by an external membership/capability
/// verifier. Constructing one locally does not authorize an action; production
/// callers must keep reversal entry points unavailable until that verifier is
/// configured. The database persists only receipt metadata and a digest, never
/// a bearer token.
class ShopCorrectionAuthorization {
  const ShopCorrectionAuthorization({
    required this.receiptId,
    required this.receiptDigest,
    required this.workspaceId,
    required this.actorId,
    required this.actorLabel,
    required this.actorRole,
    required this.capability,
    required this.source,
    required this.commandDigest,
    required this.issuedAtMillis,
    required this.expiresAtMillis,
  });

  final String receiptId;
  final String receiptDigest;
  final String workspaceId;
  final String actorId;
  final String actorLabel;
  final String actorRole;
  final String capability;
  final String source;
  final String commandDigest;
  final int issuedAtMillis;
  final int expiresAtMillis;
}

class ShopFullSaleReversalCommand {
  const ShopFullSaleReversalCommand({
    required this.operationId,
    required this.saleId,
    required this.saleSnapshotDigest,
    required this.requestFingerprint,
    required this.commandDigest,
    required this.originalTotalMmk,
    required this.originalPaymentMethod,
    required this.restockItems,
    required this.reason,
    required this.cashReturnConfirmed,
    required this.expectedCashShiftId,
    required this.paymentResolution,
  });

  final String operationId;
  final String saleId;
  final String saleSnapshotDigest;
  final String requestFingerprint;
  final String commandDigest;
  final int originalTotalMmk;
  final String originalPaymentMethod;
  final bool restockItems;
  final String reason;
  final bool cashReturnConfirmed;
  final String? expectedCashShiftId;
  final String paymentResolution;
}

class ShopWalletReconciliationCommand {
  const ShopWalletReconciliationCommand({
    required this.operationId,
    required this.reversalId,
    required this.requestFingerprint,
    required this.commandDigest,
    required this.outcome,
    required this.evidenceReference,
  });

  final String operationId;
  final String reversalId;
  final String requestFingerprint;
  final String commandDigest;
  final String outcome;
  final String evidenceReference;
}

class ShopSaleReversalLine {
  const ShopSaleReversalLine({
    required this.saleLineId,
    required this.productId,
    required this.productName,
    required this.unitPriceMmk,
    required this.quantity,
    required this.lineTotalMmk,
    required this.restockQuantity,
  });

  final String saleLineId;
  final String productId;
  final String productName;
  final int unitPriceMmk;
  final int quantity;
  final int lineTotalMmk;
  final int restockQuantity;
}

class ShopSaleReversal {
  const ShopSaleReversal({
    required this.id,
    required this.operationId,
    required this.saleId,
    required this.originalTotalMmk,
    required this.originalPaymentMethod,
    required this.originalCreatedAtMillis,
    required this.restockItems,
    required this.reason,
    required this.paymentResolution,
    required this.cashDrawerDeltaMmk,
    required this.authorizedActorId,
    required this.authorizedActorLabel,
    required this.authorizationReceiptId,
    required this.createdAtMillis,
    required this.lines,
    this.shiftId,
    this.walletReconciliationOutcome,
    this.walletEvidenceReference,
    this.walletReconciledActorLabel,
    this.walletReconciledAtMillis,
  });

  final String id;
  final String operationId;
  final String saleId;
  final int originalTotalMmk;
  final String originalPaymentMethod;
  final int originalCreatedAtMillis;
  final bool restockItems;
  final String reason;
  final String paymentResolution;
  final int cashDrawerDeltaMmk;
  final String authorizedActorId;
  final String authorizedActorLabel;
  final String authorizationReceiptId;
  final int createdAtMillis;
  final String? shiftId;
  final String? walletReconciliationOutcome;
  final String? walletEvidenceReference;
  final String? walletReconciledActorLabel;
  final int? walletReconciledAtMillis;
  final List<ShopSaleReversalLine> lines;

  bool get walletReconciliationPending =>
      originalPaymentMethod != 'cash' && walletReconciliationOutcome == null;
}

class ShopSalesSummary {
  const ShopSalesSummary({
    required this.grossSaleCount,
    required this.grossSalesMmk,
    required this.reversalCount,
    required this.reversalMmk,
    required this.pendingWalletReversalCount,
    required this.pendingWalletReversalMmk,
  });

  final int grossSaleCount;
  final int grossSalesMmk;
  final int reversalCount;
  final int reversalMmk;
  final int pendingWalletReversalCount;
  final int pendingWalletReversalMmk;

  int get netSalesMmk => grossSalesMmk - reversalMmk;
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
    this.cashReversalCount,
    this.cashReversalTotalMmk,
    this.cashDrawerOutflowMmk,
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
  final int? cashReversalCount;
  final int? cashReversalTotalMmk;
  final int? cashDrawerOutflowMmk;
}

class ShopCashShiftReview {
  const ShopCashShiftReview({
    required this.shift,
    required this.cashSalesCount,
    required this.cashSalesTotalMmk,
    required this.walletSalesCount,
    required this.walletSalesTotalMmk,
    required this.expectedCashMmk,
    required this.cashReversalCount,
    required this.cashReversalTotalMmk,
    required this.cashDrawerOutflowMmk,
  });

  final ShopCashShift shift;
  final int cashSalesCount;
  final int cashSalesTotalMmk;
  final int walletSalesCount;
  final int walletSalesTotalMmk;
  final int expectedCashMmk;
  final int cashReversalCount;
  final int cashReversalTotalMmk;
  final int cashDrawerOutflowMmk;

  int get saleCount => cashSalesCount + walletSalesCount;
  int get activityCount => saleCount + cashReversalCount;
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

const shopSaleReversalsV11Sql = '''
  CREATE TABLE IF NOT EXISTS shop_sale_reversals (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 1 AND 120),
    operation_id TEXT NOT NULL UNIQUE CHECK (length(operation_id) BETWEEN 1 AND 120),
    request_fingerprint TEXT NOT NULL,
    sale_snapshot_digest TEXT NOT NULL CHECK (length(sale_snapshot_digest) = 64),
    sale_id TEXT NOT NULL UNIQUE REFERENCES shop_sales(id),
    original_total_mmk INTEGER NOT NULL CHECK (original_total_mmk BETWEEN 0 AND 200000000000000),
    original_payment_method TEXT NOT NULL CHECK (original_payment_method IN ('cash', 'kbzpay', 'wavepay')),
    original_created_at_millis INTEGER NOT NULL,
    original_line_count INTEGER NOT NULL CHECK (original_line_count BETWEEN 1 AND 100),
    restock_items INTEGER NOT NULL CHECK (restock_items IN (0, 1)),
    reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 240),
    payment_resolution TEXT NOT NULL CHECK (payment_resolution IN ('cash_returned_now', 'external_pending')),
    cash_drawer_delta_mmk INTEGER NOT NULL CHECK (cash_drawer_delta_mmk <= 0),
    shift_id TEXT REFERENCES shop_cash_shifts(id),
    authorization_receipt_id TEXT NOT NULL UNIQUE CHECK (length(authorization_receipt_id) BETWEEN 1 AND 160),
    authorization_receipt_digest TEXT NOT NULL CHECK (length(authorization_receipt_digest) = 64),
    authorization_command_digest TEXT NOT NULL CHECK (length(authorization_command_digest) = 64),
    authorization_workspace_id TEXT NOT NULL CHECK (length(authorization_workspace_id) BETWEEN 1 AND 128),
    authorized_actor_id TEXT NOT NULL CHECK (length(authorized_actor_id) BETWEEN 1 AND 128),
    authorized_actor_label TEXT NOT NULL CHECK (length(authorized_actor_label) BETWEEN 1 AND 120),
    authorized_actor_role TEXT NOT NULL CHECK (authorized_actor_role = 'owner'),
    authorization_capability TEXT NOT NULL CHECK (authorization_capability = 'shop.sale.reverse'),
    authorization_source TEXT NOT NULL CHECK (authorization_source = 'managed_membership_receipt_v1'),
    authorization_issued_at_millis INTEGER NOT NULL,
    authorization_verified_at_millis INTEGER NOT NULL,
    authorization_expires_at_millis INTEGER NOT NULL,
    created_at_millis INTEGER NOT NULL,
    CHECK ((original_payment_method = 'cash' AND payment_resolution = 'cash_returned_now' AND shift_id IS NOT NULL AND cash_drawer_delta_mmk = -original_total_mmk)
      OR (original_payment_method IN ('kbzpay', 'wavepay') AND payment_resolution = 'external_pending' AND shift_id IS NULL AND cash_drawer_delta_mmk = 0))
  )
''';

const shopSaleReversalLinesV11Sql = '''
  CREATE TABLE IF NOT EXISTS shop_sale_reversal_lines (
    id TEXT PRIMARY KEY NOT NULL,
    reversal_id TEXT NOT NULL REFERENCES shop_sale_reversals(id),
    sale_line_id TEXT NOT NULL REFERENCES shop_sale_lines(id),
    product_id TEXT NOT NULL REFERENCES shop_products(id),
    product_name TEXT NOT NULL,
    unit_price_mmk INTEGER NOT NULL CHECK (unit_price_mmk BETWEEN 0 AND 2000000000),
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 1000),
    line_total_mmk INTEGER NOT NULL CHECK (line_total_mmk = unit_price_mmk * quantity),
    restock_quantity INTEGER NOT NULL CHECK (restock_quantity IN (0, quantity)),
    stock_movement_id TEXT UNIQUE REFERENCES shop_stock_movements(id),
    UNIQUE(reversal_id, sale_line_id),
    CHECK ((restock_quantity = 0 AND stock_movement_id IS NULL)
      OR (restock_quantity = quantity AND stock_movement_id IS NOT NULL))
  )
''';

const shopWalletReversalReconciliationsV11Sql = '''
  CREATE TABLE IF NOT EXISTS shop_wallet_reversal_reconciliations (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 1 AND 120),
    operation_id TEXT NOT NULL UNIQUE CHECK (length(operation_id) BETWEEN 1 AND 120),
    request_fingerprint TEXT NOT NULL,
    reversal_id TEXT NOT NULL UNIQUE REFERENCES shop_sale_reversals(id),
    outcome TEXT NOT NULL CHECK (outcome IN ('money_returned', 'payment_not_received')),
    evidence_reference TEXT NOT NULL CHECK (length(evidence_reference) BETWEEN 1 AND 160),
    authorization_receipt_id TEXT NOT NULL UNIQUE CHECK (length(authorization_receipt_id) BETWEEN 1 AND 160),
    authorization_receipt_digest TEXT NOT NULL CHECK (length(authorization_receipt_digest) = 64),
    authorization_command_digest TEXT NOT NULL CHECK (length(authorization_command_digest) = 64),
    authorization_workspace_id TEXT NOT NULL CHECK (length(authorization_workspace_id) BETWEEN 1 AND 128),
    authorized_actor_id TEXT NOT NULL CHECK (length(authorized_actor_id) BETWEEN 1 AND 128),
    authorized_actor_label TEXT NOT NULL CHECK (length(authorized_actor_label) BETWEEN 1 AND 120),
    authorized_actor_role TEXT NOT NULL CHECK (authorized_actor_role = 'owner'),
    authorization_capability TEXT NOT NULL CHECK (authorization_capability = 'shop.sale.reconcile_wallet'),
    authorization_source TEXT NOT NULL CHECK (authorization_source = 'managed_membership_receipt_v1'),
    authorization_issued_at_millis INTEGER NOT NULL,
    authorization_verified_at_millis INTEGER NOT NULL,
    authorization_expires_at_millis INTEGER NOT NULL,
    created_at_millis INTEGER NOT NULL
  )
''';

String shopImmutableTriggerV11Sql({
  required String table,
  required String operation,
  required String message,
}) =>
    '''
  CREATE TRIGGER IF NOT EXISTS ${table}_no_$operation
  BEFORE ${operation.toUpperCase()} ON $table BEGIN
    SELECT RAISE(ABORT, '$message');
  END
''';

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
  int get schemaVersion => 11;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (migrator) async {
      await migrator.createAll();
      await _createWalletCheckoutTable();
      await _createCashShiftTables();
      await _createProductImageTable();
      await _createCounterDraftTable();
      await _createHeldSaleTable();
      await _createSaleReversalTables();
    },
    onUpgrade: (migrator, from, to) async {
      if (from < 11) {
        await _requireNoReservedV11Objects();
      }
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
      if (from < 10) {
        await _createHeldSaleTable();
      }
      if (from < 11) {
        await _ensureColumn(
          'shop_cash_shifts',
          'cash_reversal_count',
          'INTEGER',
        );
        await _ensureColumn(
          'shop_cash_shifts',
          'cash_reversal_total_mmk',
          'INTEGER',
        );
        await _ensureColumn(
          'shop_cash_shifts',
          'cash_drawer_outflow_mmk',
          'INTEGER',
        );
        await _ensureColumn(
          'shop_cash_shifts',
          'review_cash_reversal_count',
          'INTEGER',
        );
        await _ensureColumn(
          'shop_cash_shifts',
          'review_cash_drawer_outflow_mmk',
          'INTEGER',
        );
        await _createSaleReversalTables();
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
        review_cash_total_mmk INTEGER,
        cash_reversal_count INTEGER,
        cash_reversal_total_mmk INTEGER,
        cash_drawer_outflow_mmk INTEGER,
        review_cash_reversal_count INTEGER,
        review_cash_drawer_outflow_mmk INTEGER
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

  Future<void> _createHeldSaleTable() async {
    await customStatement('''
      CREATE TABLE IF NOT EXISTS shop_held_sales (
        id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 1 AND 120),
        name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
        operation_id TEXT NOT NULL UNIQUE CHECK (length(operation_id) BETWEEN 1 AND 120),
        basket_json TEXT NOT NULL,
        created_at_millis INTEGER NOT NULL,
        updated_at_millis INTEGER NOT NULL
      )
    ''');
    await customStatement('''
      CREATE INDEX IF NOT EXISTS shop_held_sales_updated
      ON shop_held_sales(updated_at_millis DESC)
    ''');
  }

  Future<void> _createSaleReversalTables() async {
    await customStatement(shopSaleReversalsV11Sql);
    await customStatement(shopSaleReversalLinesV11Sql);
    await customStatement(shopWalletReversalReconciliationsV11Sql);
    for (final table in const [
      'shop_sale_reversals',
      'shop_sale_reversal_lines',
      'shop_wallet_reversal_reconciliations',
    ]) {
      for (final operation in const ['update', 'delete']) {
        await customStatement(
          shopImmutableTriggerV11Sql(
            table: table,
            operation: operation,
            message: 'Shop reversal audit records are immutable',
          ),
        );
      }
    }
    for (final table in const [
      'shop_sales',
      'shop_sale_lines',
      'shop_stock_movements',
    ]) {
      for (final operation in const ['update', 'delete']) {
        await customStatement(
          shopImmutableTriggerV11Sql(
            table: table,
            operation: operation,
            message: table == 'shop_stock_movements'
                ? 'Completed Shop stock movements are immutable'
                : 'Completed Shop sales are immutable',
          ),
        );
      }
    }
  }

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
      final held = await customSelect(
        'SELECT 1 FROM shop_held_sales WHERE operation_id = ? LIMIT 1',
        variables: [Variable.withString(cleanOperationId)],
      ).getSingleOrNull();
      if (held != null) {
        throw StateError('This sale is held. Reopen it before editing.');
      }
      final previous = await readCounterSaleDraft();
      final lines = <Map<String, Object?>>[];
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
          'productName':
              product?.name ??
              (previous?.operationId == cleanOperationId
                  ? previous?.productNames[line.key]
                  : null),
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
    return _decodeCounterDraft(
      operationId: operationId,
      basketJson: row.read<String>('basket_json'),
      updatedAtMillis: row.read<int>('updated_at_millis'),
    );
  }

  CounterSaleDraft _decodeCounterDraft({
    required String operationId,
    required String basketJson,
    required int updatedAtMillis,
  }) {
    if (operationId.trim().isEmpty || operationId.length > 120) {
      throw const FormatException('Counter draft operation is invalid.');
    }
    final raw = jsonDecode(basketJson);
    if (raw is! List || raw.isEmpty || raw.length > 100) {
      throw const FormatException('Counter draft is invalid.');
    }
    final quantities = <String, int>{};
    final prices = <String, int>{};
    final names = <String, String?>{};
    for (final value in raw) {
      if (value is! Map<String, dynamic>) {
        throw const FormatException('Counter draft is invalid.');
      }
      final id = value['productId'];
      final quantity = value['quantity'];
      final price = value['unitPriceMmk'];
      final name = value['productName'];
      if (id is! String ||
          id.isEmpty ||
          id.length > 100 ||
          quantity is! int ||
          quantity < 1 ||
          quantity > 1000 ||
          price is! int ||
          price < 0 ||
          price > 2000000000 ||
          (name != null &&
              (name is! String || name.isEmpty || name.length > 160)) ||
          quantities.containsKey(id)) {
        throw const FormatException('Counter draft is invalid.');
      }
      quantities[id] = quantity;
      prices[id] = price;
      names[id] = name as String?;
    }
    return CounterSaleDraft(
      operationId: operationId,
      quantities: Map.unmodifiable(quantities),
      unitPricesMmk: Map.unmodifiable(prices),
      productNames: Map.unmodifiable(names),
      updatedAtMillis: updatedAtMillis,
    );
  }

  Future<List<HeldSaleTicket>> readHeldSaleTickets() async {
    final rows = await customSelect(
      'SELECT id, name, operation_id, basket_json, created_at_millis, '
      'updated_at_millis FROM shop_held_sales '
      'ORDER BY updated_at_millis DESC, id ASC',
    ).get();
    if (rows.length > 30) {
      throw StateError('The held-sale limit was exceeded.');
    }
    final tickets = <HeldSaleTicket>[];
    for (final row in rows) {
      final id = row.read<String>('id');
      final name = row.read<String>('name');
      final operationId = row.read<String>('operation_id');
      if (id.isEmpty ||
          id.length > 120 ||
          name.trim().isEmpty ||
          name.runes.length > 80) {
        throw const FormatException('Held sale is invalid.');
      }
      final completed =
          await (select(shopSales)
                ..where((sale) => sale.operationId.equals(operationId)))
              .getSingleOrNull();
      if (completed != null) {
        throw StateError('A completed sale still has a held ticket.');
      }
      final active = await customSelect(
        'SELECT 1 FROM shop_counter_drafts WHERE operation_id = ? LIMIT 1',
        variables: [Variable.withString(operationId)],
      ).getSingleOrNull();
      if (active != null) {
        throw StateError('A sale cannot be active and held at the same time.');
      }
      tickets.add(
        HeldSaleTicket(
          id: id,
          name: name,
          draft: _decodeCounterDraft(
            operationId: operationId,
            basketJson: row.read<String>('basket_json'),
            updatedAtMillis: row.read<int>('updated_at_millis'),
          ),
          createdAtMillis: row.read<int>('created_at_millis'),
        ),
      );
    }
    return List.unmodifiable(tickets);
  }

  /// Move the only active basket into a named ticket in one SQLite transaction.
  Future<void> holdCounterSaleDraft({
    required String id,
    required String name,
    required String operationId,
  }) async {
    final cleanId = id.trim();
    final cleanName = name.trim();
    if (cleanId.isEmpty ||
        cleanId.length > 120 ||
        cleanName.isEmpty ||
        cleanName.runes.length > 80 ||
        RegExp(r'[\x00-\x1f\x7f]').hasMatch(cleanName)) {
      throw ArgumentError('Give the held sale a short name.');
    }
    await transaction(() async {
      final pending = await customSelect(
        "SELECT 1 FROM shop_wallet_checkout_intents WHERE state = 'pending' LIMIT 1",
      ).getSingleOrNull();
      if (pending != null) {
        throw StateError('Finish the pending wallet checkout first.');
      }
      final draft = await readCounterSaleDraft();
      if (draft == null || draft.operationId != operationId) {
        throw StateError('The current sale changed. Review it before holding.');
      }
      final count = await customSelect(
        'SELECT COUNT(*) AS total FROM shop_held_sales',
      ).getSingle();
      if (count.read<int>('total') >= 30) {
        throw StateError(
          'Reopen or discard a held sale before adding another.',
        );
      }
      final now = DateTime.now().millisecondsSinceEpoch;
      await customStatement(
        'INSERT INTO shop_held_sales '
        '(id, name, operation_id, basket_json, created_at_millis, updated_at_millis) '
        'SELECT ?, ?, operation_id, basket_json, ?, ? '
        'FROM shop_counter_drafts WHERE slot = 1 AND operation_id = ?',
        [cleanId, cleanName, now, now, operationId],
      );
      await clearCounterSaleDraft(operationId);
    });
  }

  /// A held basket may reopen only into an empty counter. The same operation
  /// ID travels with it, preserving sale retry idempotency.
  Future<CounterSaleDraft> reopenHeldSaleTicket(String id) async =>
      transaction(() async {
        final current = await readCounterSaleDraft();
        if (current != null) {
          throw StateError(
            'Hold or clear the current sale before reopening another.',
          );
        }
        final pending = await customSelect(
          "SELECT 1 FROM shop_wallet_checkout_intents WHERE state = 'pending' LIMIT 1",
        ).getSingleOrNull();
        if (pending != null) {
          throw StateError('Finish the pending wallet checkout first.');
        }
        final rows = await readHeldSaleTickets();
        final matches = rows.where((ticket) => ticket.id == id).toList();
        if (matches.length != 1) throw StateError('Held sale is unavailable.');
        final ticket = matches.single;
        await customStatement(
          'INSERT INTO shop_counter_drafts '
          '(slot, operation_id, basket_json, updated_at_millis) '
          'SELECT 1, operation_id, basket_json, ? '
          'FROM shop_held_sales WHERE id = ?',
          [DateTime.now().millisecondsSinceEpoch, id],
        );
        await customStatement('DELETE FROM shop_held_sales WHERE id = ?', [id]);
        return ticket.draft;
      });

  Future<void> discardHeldSaleTicket(String id) async {
    await transaction(() async {
      final rows = await readHeldSaleTickets();
      if (!rows.any((ticket) => ticket.id == id)) {
        throw StateError('Held sale is unavailable.');
      }
      await customStatement('DELETE FROM shop_held_sales WHERE id = ?', [id]);
    });
  }

  Future<void> clearCounterSaleDraft(String operationId) async {
    await customStatement(
      'DELETE FROM shop_counter_drafts WHERE slot = 1 AND operation_id = ?',
      [operationId],
    );
  }

  Future<void> _rejectHeldSaleOperation(String operationId) async {
    final held = await customSelect(
      'SELECT 1 FROM shop_held_sales WHERE operation_id = ? LIMIT 1',
      variables: [Variable.withString(operationId)],
    ).getSingleOrNull();
    if (held != null) {
      throw StateError('Reopen the held sale before checkout.');
    }
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

  Future<void> _requireNoReservedV11Objects() async {
    const auditTables = {
      'shop_sale_reversals',
      'shop_sale_reversal_lines',
      'shop_wallet_reversal_reconciliations',
    };
    const protectedTables = {
      ...auditTables,
      'shop_sales',
      'shop_sale_lines',
      'shop_stock_movements',
    };
    final reservedNames = <String>{
      ...auditTables,
      for (final table in protectedTables) '${table}_no_update',
      for (final table in protectedTables) '${table}_no_delete',
    };
    final objects = await customSelect(
      "SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
    ).get();
    final hasReservedObject = objects.any(
      (row) => reservedNames.contains(row.read<String>('name').toLowerCase()),
    );
    final shiftColumns = await customSelect(
      'PRAGMA table_info(shop_cash_shifts)',
    ).get();
    const reservedShiftColumns = {
      'cash_reversal_count',
      'cash_reversal_total_mmk',
      'cash_drawer_outflow_mmk',
      'review_cash_reversal_count',
      'review_cash_drawer_outflow_mmk',
    };
    final hasReservedShiftColumn = shiftColumns.any(
      (row) =>
          reservedShiftColumns.contains(row.read<String>('name').toLowerCase()),
    );
    if (hasReservedObject || hasReservedShiftColumn) {
      throw StateError(
        'This legacy Shop database contains reserved future audit objects.',
      );
    }
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

  /// Change catalog details without changing stock or rewriting prior sales.
  /// The expected values keep a stale edit sheet from replacing a newer edit.
  Future<void> updateProductDetails({
    required String operationId,
    required String productId,
    required String expectedName,
    required int expectedPriceMmk,
    required String? expectedBarcode,
    required String name,
    required int priceMmk,
    required String? barcode,
  }) async {
    final cleanOperationId = operationId.trim();
    final cleanProductId = productId.trim();
    final cleanName = name.trim();
    final cleanBarcode = _optionalText(barcode);
    final oldBarcode = _optionalText(expectedBarcode);
    if (cleanOperationId.isEmpty ||
        cleanOperationId.length > 120 ||
        cleanProductId.isEmpty ||
        cleanProductId.length > 100 ||
        cleanName.isEmpty ||
        cleanName.length > 160 ||
        priceMmk < 0 ||
        priceMmk > 2000000000 ||
        (cleanBarcode != null && cleanBarcode.length > 64)) {
      throw ArgumentError('Product values are invalid.');
    }
    await transaction(() async {
      final product = await (select(
        shopProducts,
      )..where((row) => row.id.equals(cleanProductId))).getSingleOrNull();
      if (product == null || product.archived) {
        throw StateError('This product is no longer available.');
      }
      final previousEvent =
          await (select(shopSyncOutbox)
                ..where((row) => row.operationId.equals(cleanOperationId)))
              .getSingleOrNull();
      if (previousEvent != null) {
        final data = jsonDecode(previousEvent.payloadJson);
        if (previousEvent.eventType == 'catalog.product.updated.v1' &&
            data is Map<String, dynamic> &&
            data['productId'] == cleanProductId &&
            data['name'] == cleanName &&
            data['priceMmk'] == priceMmk &&
            data['barcode'] == cleanBarcode &&
            product.name == cleanName &&
            product.priceMmk == priceMmk &&
            product.barcode == cleanBarcode) {
          return;
        }
        throw StateError('This product edit was already used differently.');
      }
      if (product.name != expectedName ||
          product.priceMmk != expectedPriceMmk ||
          product.barcode != oldBarcode) {
        throw StateError('Product changed. Reopen this item.');
      }
      if (product.name == cleanName &&
          product.priceMmk == priceMmk &&
          product.barcode == cleanBarcode) {
        return;
      }
      if (cleanBarcode != null) {
        final matches = await (select(
          shopProducts,
        )..where((row) => row.barcode.equals(cleanBarcode))).get();
        if (matches.any((row) => row.id != cleanProductId)) {
          throw StateError('That barcode is already assigned to a product.');
        }
      }
      final now = DateTime.now().millisecondsSinceEpoch;
      final changed =
          await (update(shopProducts)..where(
                (row) =>
                    row.id.equals(cleanProductId) &
                    row.archived.equals(false) &
                    row.name.equals(expectedName) &
                    row.priceMmk.equals(expectedPriceMmk) &
                    (oldBarcode == null
                        ? row.barcode.isNull()
                        : row.barcode.equals(oldBarcode)),
              ))
              .write(
                ShopProductsCompanion(
                  name: Value(cleanName),
                  priceMmk: Value(priceMmk),
                  barcode: Value(cleanBarcode),
                  updatedAtMillis: Value(now),
                ),
              );
      if (changed != 1) {
        throw StateError('Product changed. Reopen this item.');
      }
      await into(shopSyncOutbox).insert(
        ShopSyncOutboxCompanion.insert(
          operationId: cleanOperationId,
          eventType: 'catalog.product.updated.v1',
          payloadJson: jsonEncode({
            'productId': cleanProductId,
            'name': cleanName,
            'priceMmk': priceMmk,
            'barcode': cleanBarcode,
            'previousName': product.name,
            'previousPriceMmk': product.priceMmk,
            'previousBarcode': product.barcode,
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
      await _rejectHeldSaleOperation(cleanOperationId);
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
    cashReversalCount: row.readNullable<int>('cash_reversal_count'),
    cashReversalTotalMmk: row.readNullable<int>('cash_reversal_total_mmk'),
    cashDrawerOutflowMmk: row.readNullable<int>('cash_drawer_outflow_mmk'),
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
    final salesTotals = await customSelect(
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
    if (salesTotals.read<int>('unknown_count') != 0) {
      throw StateError('The shift contains an unsupported payment method.');
    }
    final reversalTotals = await customSelect(
      '''
      SELECT
        COUNT(*) AS reversal_count,
        COALESCE(SUM(original_total_mmk), 0) AS reversal_total,
        COALESCE(SUM(-cash_drawer_delta_mmk), 0) AS drawer_outflow
      FROM shop_sale_reversals
      WHERE shift_id = ? AND original_payment_method = 'cash'
    ''',
      variables: [Variable<String>(shiftId)],
    ).getSingle();
    final cashTotal = salesTotals.read<int>('cash_total');
    final drawerOutflow = reversalTotals.read<int>('drawer_outflow');
    if (cashTotal > 200000000000000 - shift.openingFloatMmk) {
      throw StateError('Cash shift total exceeds the supported limit.');
    }
    final cashBeforeReturns = shift.openingFloatMmk + cashTotal;
    if (drawerOutflow > cashBeforeReturns) {
      throw StateError(
        'Cash returns exceed this shift\'s recorded drawer cash.',
      );
    }
    return ShopCashShiftReview(
      shift: shift,
      cashSalesCount: salesTotals.read<int>('cash_count'),
      cashSalesTotalMmk: cashTotal,
      walletSalesCount: salesTotals.read<int>('wallet_count'),
      walletSalesTotalMmk: salesTotals.read<int>('wallet_total'),
      cashReversalCount: reversalTotals.read<int>('reversal_count'),
      cashReversalTotalMmk: reversalTotals.read<int>('reversal_total'),
      cashDrawerOutflowMmk: drawerOutflow,
      expectedCashMmk: cashBeforeReturns - drawerOutflow,
    );
  }

  Future<ShopCashShift> closeCashShift({
    required String shiftId,
    required String operationId,
    required int seenSaleCount,
    required int seenCashTotalMmk,
    required int countedCashMmk,
    int seenCashReversalCount = 0,
    int seenCashDrawerOutflowMmk = 0,
  }) async {
    final cleanOperationId = operationId.trim();
    if (shiftId.trim().isEmpty ||
        cleanOperationId.isEmpty ||
        cleanOperationId.length > 120 ||
        seenSaleCount < 0 ||
        seenCashTotalMmk < 0 ||
        seenCashReversalCount < 0 ||
        seenCashDrawerOutflowMmk < 0 ||
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
                seenCashTotalMmk ||
            (previous.readNullable<int>('review_cash_reversal_count') ?? 0) !=
                seenCashReversalCount ||
            (previous.readNullable<int>('review_cash_drawer_outflow_mmk') ??
                    0) !=
                seenCashDrawerOutflowMmk) {
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
          review.cashSalesTotalMmk != seenCashTotalMmk ||
          review.cashReversalCount != seenCashReversalCount ||
          review.cashDrawerOutflowMmk != seenCashDrawerOutflowMmk) {
        throw StateError(
          'Shift activity changed. Review the cash shift again.',
        );
      }
      final now = DateTime.now().millisecondsSinceEpoch;
      final difference = countedCashMmk - review.expectedCashMmk;
      final changed = await customUpdate(
        'UPDATE shop_cash_shifts SET state = ?, close_operation_id = ?, '
        'closed_at_millis = ?, cash_sales_count = ?, cash_sales_total_mmk = ?, '
        'wallet_sales_count = ?, wallet_sales_total_mmk = ?, '
        'expected_cash_mmk = ?, counted_cash_mmk = ?, difference_mmk = ?, '
        'review_sale_count = ?, review_cash_total_mmk = ?, '
        'cash_reversal_count = ?, cash_reversal_total_mmk = ?, '
        'cash_drawer_outflow_mmk = ?, review_cash_reversal_count = ?, '
        'review_cash_drawer_outflow_mmk = ? '
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
          Variable<int>(review.cashReversalCount),
          Variable<int>(review.cashReversalTotalMmk),
          Variable<int>(review.cashDrawerOutflowMmk),
          Variable<int>(seenCashReversalCount),
          Variable<int>(seenCashDrawerOutflowMmk),
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
            'cashReversalCount': review.cashReversalCount,
            'cashReversalTotalMmk': review.cashReversalTotalMmk,
            'cashDrawerOutflowMmk': review.cashDrawerOutflowMmk,
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

  Future<String> _sha256Hex(String value) async {
    final digest = await Sha256().hash(utf8.encode(value));
    return digest.bytes
        .map((byte) => byte.toRadixString(16).padLeft(2, '0'))
        .join();
  }

  String _boundedCorrectionText(
    String value, {
    required String field,
    required int maximum,
  }) {
    final clean = value.trim();
    if (clean.isEmpty ||
        clean.runes.length > maximum ||
        RegExp(r'[\x00-\x1f\x7f]').hasMatch(clean)) {
      throw ArgumentError('$field is invalid.');
    }
    return clean;
  }

  Future<ShopFullSaleReversalCommand> previewFullSaleReversal({
    required String operationId,
    required String saleId,
    required bool restockItems,
    required String reason,
    required bool confirmCashReturned,
  }) async {
    final cleanOperationId = operationId.trim();
    final cleanSaleId = saleId.trim();
    final cleanReason = _boundedCorrectionText(
      reason,
      field: 'Correction reason',
      maximum: 240,
    );
    if (cleanOperationId.isEmpty ||
        cleanOperationId.length > 120 ||
        cleanSaleId.isEmpty ||
        cleanSaleId.length > 120) {
      throw ArgumentError('Correction identifiers are invalid.');
    }
    final sale = await (select(
      shopSales,
    )..where((row) => row.id.equals(cleanSaleId))).getSingleOrNull();
    if (sale == null) throw StateError('The original sale was not found.');
    if (!const {'cash', 'kbzpay', 'wavepay'}.contains(sale.paymentMethod)) {
      throw StateError('The original payment method is unsupported.');
    }
    final lines =
        await (select(shopSaleLines)
              ..where((row) => row.saleId.equals(cleanSaleId))
              ..orderBy([(row) => OrderingTerm.asc(row.id)]))
            .get();
    if (lines.isEmpty || lines.length > 100) {
      throw StateError('The original sale lines are incomplete.');
    }
    var calculatedTotal = 0;
    for (final line in lines) {
      if (line.quantity < 1 ||
          line.quantity > 1000 ||
          line.unitPriceMmk < 0 ||
          line.unitPriceMmk > 2000000000 ||
          line.lineTotalMmk != line.unitPriceMmk * line.quantity ||
          calculatedTotal > 200000000000000 - line.lineTotalMmk) {
        throw StateError('The original sale snapshot is invalid.');
      }
      calculatedTotal += line.lineTotalMmk;
    }
    if (calculatedTotal != sale.totalMmk) {
      throw StateError('The original sale total does not match its lines.');
    }
    final snapshot = jsonEncode({
      'saleId': sale.id,
      'totalMmk': sale.totalMmk,
      'paymentMethod': sale.paymentMethod,
      'createdAtMillis': sale.createdAtMillis,
      'lines': [
        for (final line in lines)
          {
            'id': line.id,
            'productId': line.productId,
            'productName': line.productName,
            'unitPriceMmk': line.unitPriceMmk,
            'quantity': line.quantity,
            'lineTotalMmk': line.lineTotalMmk,
          },
      ],
    });
    final snapshotDigest = await _sha256Hex(snapshot);
    final isCash = sale.paymentMethod == 'cash';
    if (isCash != confirmCashReturned) {
      throw ArgumentError(
        isCash
            ? 'Confirm that the full cash amount was returned.'
            : 'Wallet reversals require separate provider reconciliation.',
      );
    }
    final activeShift = isCash ? await readOpenCashShift() : null;
    if (isCash && activeShift == null) {
      throw StateError('Start a cash shift before returning cash.');
    }
    final paymentResolution = isCash ? 'cash_returned_now' : 'external_pending';
    final requestFingerprint = jsonEncode({
      'operationId': cleanOperationId,
      'saleId': sale.id,
      'saleSnapshotDigest': snapshotDigest,
      'restockItems': restockItems,
      'reason': cleanReason,
      'cashReturnConfirmed': confirmCashReturned,
      'expectedCashShiftId': activeShift?.id,
      'paymentResolution': paymentResolution,
    });
    return ShopFullSaleReversalCommand(
      operationId: cleanOperationId,
      saleId: sale.id,
      saleSnapshotDigest: snapshotDigest,
      requestFingerprint: requestFingerprint,
      commandDigest: await _sha256Hex(requestFingerprint),
      originalTotalMmk: sale.totalMmk,
      originalPaymentMethod: sale.paymentMethod,
      restockItems: restockItems,
      reason: cleanReason,
      cashReturnConfirmed: confirmCashReturned,
      expectedCashShiftId: activeShift?.id,
      paymentResolution: paymentResolution,
    );
  }

  void _validateCorrectionAuthorization({
    required ShopCorrectionAuthorization authorization,
    required String commandDigest,
    required String capability,
    required int now,
  }) {
    final hex = RegExp(r'^[0-9a-f]{64}$');
    if (authorization.receiptId.trim().isEmpty ||
        authorization.receiptId.length > 160 ||
        !hex.hasMatch(authorization.receiptDigest) ||
        authorization.workspaceId.trim().isEmpty ||
        authorization.workspaceId.length > 128 ||
        authorization.actorId.trim().isEmpty ||
        authorization.actorId.length > 128 ||
        authorization.actorLabel.trim().isEmpty ||
        authorization.actorLabel.runes.length > 120 ||
        authorization.actorRole != 'owner' ||
        authorization.capability != capability ||
        authorization.source != 'managed_membership_receipt_v1' ||
        authorization.commandDigest != commandDigest ||
        authorization.issuedAtMillis <= 0 ||
        authorization.expiresAtMillis <= authorization.issuedAtMillis ||
        authorization.expiresAtMillis - authorization.issuedAtMillis >
            const Duration(minutes: 10).inMilliseconds ||
        authorization.issuedAtMillis > now ||
        authorization.expiresAtMillis < now) {
      throw StateError('Correction authorization is missing or invalid.');
    }
  }

  bool _matchesRecordedCorrectionAuthorization(
    QueryRow row,
    ShopCorrectionAuthorization authorization,
  ) =>
      row.read<String>('authorization_receipt_id') == authorization.receiptId &&
      row.read<String>('authorization_receipt_digest') ==
          authorization.receiptDigest &&
      row.read<String>('authorization_workspace_id') ==
          authorization.workspaceId &&
      row.read<String>('authorized_actor_id') == authorization.actorId &&
      row.read<String>('authorized_actor_label') == authorization.actorLabel &&
      row.read<String>('authorized_actor_role') == authorization.actorRole &&
      row.read<String>('authorization_capability') ==
          authorization.capability &&
      row.read<String>('authorization_source') == authorization.source &&
      row.read<String>('authorization_command_digest') ==
          authorization.commandDigest &&
      row.read<int>('authorization_issued_at_millis') ==
          authorization.issuedAtMillis &&
      row.read<int>('authorization_expires_at_millis') ==
          authorization.expiresAtMillis;

  Future<void> _requireUnusedCorrectionReceipt(String receiptId) async {
    final usedForReversal = await customSelect(
      'SELECT 1 FROM shop_sale_reversals '
      'WHERE authorization_receipt_id = ? LIMIT 1',
      variables: [Variable<String>(receiptId)],
    ).getSingleOrNull();
    final usedForReconciliation = await customSelect(
      'SELECT 1 FROM shop_wallet_reversal_reconciliations '
      'WHERE authorization_receipt_id = ? LIMIT 1',
      variables: [Variable<String>(receiptId)],
    ).getSingleOrNull();
    if (usedForReversal != null || usedForReconciliation != null) {
      throw StateError(
        'This correction authorization receipt was already used.',
      );
    }
  }

  Future<ShopSaleReversal> _saleReversalFromRow(QueryRow row) async {
    final reversalId = row.read<String>('id');
    final lineRows = await customSelect(
      'SELECT * FROM shop_sale_reversal_lines '
      'WHERE reversal_id = ? ORDER BY sale_line_id',
      variables: [Variable<String>(reversalId)],
    ).get();
    final reconciliation = await customSelect(
      'SELECT * FROM shop_wallet_reversal_reconciliations '
      'WHERE reversal_id = ? LIMIT 1',
      variables: [Variable<String>(reversalId)],
    ).getSingleOrNull();
    return ShopSaleReversal(
      id: reversalId,
      operationId: row.read<String>('operation_id'),
      saleId: row.read<String>('sale_id'),
      originalTotalMmk: row.read<int>('original_total_mmk'),
      originalPaymentMethod: row.read<String>('original_payment_method'),
      originalCreatedAtMillis: row.read<int>('original_created_at_millis'),
      restockItems: row.read<int>('restock_items') == 1,
      reason: row.read<String>('reason'),
      paymentResolution: row.read<String>('payment_resolution'),
      cashDrawerDeltaMmk: row.read<int>('cash_drawer_delta_mmk'),
      shiftId: row.readNullable<String>('shift_id'),
      authorizedActorId: row.read<String>('authorized_actor_id'),
      authorizedActorLabel: row.read<String>('authorized_actor_label'),
      authorizationReceiptId: row.read<String>('authorization_receipt_id'),
      createdAtMillis: row.read<int>('created_at_millis'),
      walletReconciliationOutcome: reconciliation?.read<String>('outcome'),
      walletEvidenceReference: reconciliation?.read<String>(
        'evidence_reference',
      ),
      walletReconciledActorLabel: reconciliation?.read<String>(
        'authorized_actor_label',
      ),
      walletReconciledAtMillis: reconciliation?.read<int>('created_at_millis'),
      lines: [
        for (final line in lineRows)
          ShopSaleReversalLine(
            saleLineId: line.read<String>('sale_line_id'),
            productId: line.read<String>('product_id'),
            productName: line.read<String>('product_name'),
            unitPriceMmk: line.read<int>('unit_price_mmk'),
            quantity: line.read<int>('quantity'),
            lineTotalMmk: line.read<int>('line_total_mmk'),
            restockQuantity: line.read<int>('restock_quantity'),
          ),
      ],
    );
  }

  Future<ShopSaleReversal?> readSaleReversalForSale(String saleId) async {
    final cleanSaleId = saleId.trim();
    if (cleanSaleId.isEmpty) return null;
    final row = await customSelect(
      'SELECT * FROM shop_sale_reversals WHERE sale_id = ? LIMIT 1',
      variables: [Variable<String>(cleanSaleId)],
    ).getSingleOrNull();
    return row == null ? null : _saleReversalFromRow(row);
  }

  Future<ShopSaleReversal> recordAuthorizedFullSaleReversal({
    required ShopFullSaleReversalCommand command,
    required ShopCorrectionAuthorization authorization,
  }) {
    return transaction(() async {
      final prior = await customSelect(
        'SELECT * FROM shop_sale_reversals WHERE operation_id = ? LIMIT 1',
        variables: [Variable<String>(command.operationId)],
      ).getSingleOrNull();
      if (prior != null) {
        if (prior.read<String>('request_fingerprint') !=
                command.requestFingerprint ||
            prior.read<String>('sale_snapshot_digest') !=
                command.saleSnapshotDigest ||
            prior.read<String>('sale_id') != command.saleId ||
            prior.read<int>('original_total_mmk') != command.originalTotalMmk ||
            prior.read<String>('original_payment_method') !=
                command.originalPaymentMethod ||
            (prior.read<int>('restock_items') == 1) != command.restockItems ||
            prior.read<String>('reason') != command.reason ||
            (command.originalPaymentMethod == 'cash') !=
                command.cashReturnConfirmed ||
            prior.readNullable<String>('shift_id') !=
                command.expectedCashShiftId ||
            prior.read<String>('payment_resolution') !=
                command.paymentResolution ||
            await _sha256Hex(command.requestFingerprint) !=
                command.commandDigest ||
            !_matchesRecordedCorrectionAuthorization(prior, authorization)) {
          throw StateError(
            'A correction operation ID was reused with different details.',
          );
        }
        return _saleReversalFromRow(prior);
      }

      final verifiedCommand = await previewFullSaleReversal(
        operationId: command.operationId,
        saleId: command.saleId,
        restockItems: command.restockItems,
        reason: command.reason,
        confirmCashReturned: command.cashReturnConfirmed,
      );
      if (verifiedCommand.requestFingerprint != command.requestFingerprint ||
          verifiedCommand.commandDigest != command.commandDigest ||
          verifiedCommand.saleSnapshotDigest != command.saleSnapshotDigest ||
          verifiedCommand.originalTotalMmk != command.originalTotalMmk ||
          verifiedCommand.originalPaymentMethod !=
              command.originalPaymentMethod ||
          verifiedCommand.cashReturnConfirmed != command.cashReturnConfirmed ||
          verifiedCommand.expectedCashShiftId != command.expectedCashShiftId ||
          verifiedCommand.paymentResolution != command.paymentResolution) {
        throw StateError('The original sale changed. Review it again.');
      }
      final existing = await customSelect(
        'SELECT operation_id FROM shop_sale_reversals '
        'WHERE sale_id = ? LIMIT 1',
        variables: [Variable<String>(command.saleId)],
      ).getSingleOrNull();
      if (existing != null) {
        throw StateError('This sale was already reversed.');
      }
      final now = DateTime.now().millisecondsSinceEpoch;
      _validateCorrectionAuthorization(
        authorization: authorization,
        commandDigest: command.commandDigest,
        capability: 'shop.sale.reverse',
        now: now,
      );
      await _requireUnusedCorrectionReceipt(authorization.receiptId);

      ShopCashShift? activeShift;
      if (command.originalPaymentMethod == 'cash') {
        activeShift = await readOpenCashShift();
        if (activeShift == null ||
            activeShift.id != command.expectedCashShiftId) {
          throw StateError(
            'The cash shift changed. Review and authorize this return again.',
          );
        }
        final review = await readCashShiftReview(activeShift.id);
        if (review.expectedCashMmk < command.originalTotalMmk) {
          throw StateError(
            'The open shift does not contain enough recorded cash for this return.',
          );
        }
      }
      final originalLines =
          await (select(shopSaleLines)
                ..where((line) => line.saleId.equals(command.saleId))
                ..orderBy([(line) => OrderingTerm.asc(line.id)]))
              .get();
      final drawerDelta = command.originalPaymentMethod == 'cash'
          ? -command.originalTotalMmk
          : 0;
      await customInsert(
        'INSERT INTO shop_sale_reversals '
        '(id, operation_id, request_fingerprint, sale_snapshot_digest, sale_id, '
        'original_total_mmk, original_payment_method, original_created_at_millis, '
        'original_line_count, restock_items, reason, payment_resolution, '
        'cash_drawer_delta_mmk, shift_id, authorization_receipt_id, '
        'authorization_receipt_digest, authorization_command_digest, '
        'authorization_workspace_id, '
        'authorized_actor_id, authorized_actor_label, authorized_actor_role, '
        'authorization_capability, authorization_source, '
        'authorization_issued_at_millis, authorization_verified_at_millis, '
        'authorization_expires_at_millis, created_at_millis) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        variables: [
          Variable<String>(command.operationId),
          Variable<String>(command.operationId),
          Variable<String>(command.requestFingerprint),
          Variable<String>(command.saleSnapshotDigest),
          Variable<String>(command.saleId),
          Variable<int>(command.originalTotalMmk),
          Variable<String>(command.originalPaymentMethod),
          Variable<int>(
            (await (select(
                  shopSales,
                )..where((sale) => sale.id.equals(command.saleId))).getSingle())
                .createdAtMillis,
          ),
          Variable<int>(originalLines.length),
          Variable<int>(command.restockItems ? 1 : 0),
          Variable<String>(command.reason),
          Variable<String>(command.paymentResolution),
          Variable<int>(drawerDelta),
          Variable<String>(activeShift?.id),
          Variable<String>(authorization.receiptId),
          Variable<String>(authorization.receiptDigest),
          Variable<String>(authorization.commandDigest),
          Variable<String>(authorization.workspaceId),
          Variable<String>(authorization.actorId),
          Variable<String>(authorization.actorLabel),
          Variable<String>(authorization.actorRole),
          Variable<String>(authorization.capability),
          Variable<String>(authorization.source),
          Variable<int>(authorization.issuedAtMillis),
          Variable<int>(now),
          Variable<int>(authorization.expiresAtMillis),
          Variable<int>(now),
        ],
      );

      final eventLines = <Map<String, Object?>>[];
      for (var index = 0; index < originalLines.length; index++) {
        final line = originalLines[index];
        String? movementId;
        if (command.restockItems) {
          final changed = await customUpdate(
            'UPDATE shop_products SET on_hand = on_hand + ?, '
            'updated_at_millis = ? WHERE id = ? AND on_hand <= ?',
            variables: [
              Variable<int>(line.quantity),
              Variable<int>(now),
              Variable<String>(line.productId),
              Variable<int>(2000000000 - line.quantity),
            ],
          );
          if (changed != 1) {
            throw StateError(
              'Restoring stock would exceed the supported limit.',
            );
          }
          movementId = '${command.operationId}:reversal:$index';
          await into(shopStockMovements).insert(
            ShopStockMovementsCompanion.insert(
              id: movementId,
              saleId: Value(command.saleId),
              productId: line.productId,
              quantityDelta: line.quantity,
              reason: 'sale_reversal_restock',
              createdAtMillis: now,
            ),
          );
        }
        await customInsert(
          'INSERT INTO shop_sale_reversal_lines '
          '(id, reversal_id, sale_line_id, product_id, product_name, '
          'unit_price_mmk, quantity, line_total_mmk, restock_quantity, '
          'stock_movement_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          variables: [
            Variable<String>('${command.operationId}:$index'),
            Variable<String>(command.operationId),
            Variable<String>(line.id),
            Variable<String>(line.productId),
            Variable<String>(line.productName),
            Variable<int>(line.unitPriceMmk),
            Variable<int>(line.quantity),
            Variable<int>(line.lineTotalMmk),
            Variable<int>(command.restockItems ? line.quantity : 0),
            Variable<String>(movementId),
          ],
        );
        eventLines.add({
          'saleLineId': line.id,
          'productId': line.productId,
          'productName': line.productName,
          'unitPriceMmk': line.unitPriceMmk,
          'quantity': line.quantity,
          'lineTotalMmk': line.lineTotalMmk,
          'restockQuantity': command.restockItems ? line.quantity : 0,
        });
      }
      await into(shopSyncOutbox).insert(
        ShopSyncOutboxCompanion.insert(
          operationId: command.operationId,
          eventType: 'shop.sale.reversal_recorded.v1',
          payloadJson: jsonEncode({
            'reversalId': command.operationId,
            'saleId': command.saleId,
            'originalTotalMmk': command.originalTotalMmk,
            'originalPaymentMethod': command.originalPaymentMethod,
            'restockItems': command.restockItems,
            'reason': command.reason,
            'paymentResolution': command.paymentResolution,
            'cashReturnConfirmed': command.cashReturnConfirmed,
            'cashDrawerDeltaMmk': drawerDelta,
            if (activeShift != null) 'shiftId': activeShift.id,
            'externalReconciliationState':
                command.originalPaymentMethod == 'cash'
                ? 'not_applicable'
                : 'pending',
            'moneyReturned':
                command.originalPaymentMethod == 'cash' &&
                command.cashReturnConfirmed,
            'authorizationReceiptId': authorization.receiptId,
            'authorizedActorId': authorization.actorId,
            'createdAtMillis': now,
            'lines': eventLines,
          }),
          createdAtMillis: now,
        ),
      );
      final row = await customSelect(
        'SELECT * FROM shop_sale_reversals WHERE id = ?',
        variables: [Variable<String>(command.operationId)],
      ).getSingle();
      return _saleReversalFromRow(row);
    });
  }

  Future<ShopWalletReconciliationCommand> previewWalletReconciliation({
    required String operationId,
    required String reversalId,
    required String outcome,
    required String evidenceReference,
  }) async {
    final cleanOperationId = operationId.trim();
    final cleanReversalId = reversalId.trim();
    final cleanEvidence = _boundedCorrectionText(
      evidenceReference,
      field: 'Wallet evidence reference',
      maximum: 160,
    );
    if (cleanOperationId.isEmpty ||
        cleanOperationId.length > 120 ||
        cleanReversalId.isEmpty ||
        cleanReversalId.length > 120 ||
        !const {'money_returned', 'payment_not_received'}.contains(outcome)) {
      throw ArgumentError('Wallet reconciliation details are invalid.');
    }
    final reversal = await customSelect(
      'SELECT original_payment_method FROM shop_sale_reversals WHERE id = ?',
      variables: [Variable<String>(cleanReversalId)],
    ).getSingleOrNull();
    if (reversal == null) throw StateError('The sale reversal was not found.');
    if (reversal.read<String>('original_payment_method') == 'cash') {
      throw StateError('Cash returns do not have wallet reconciliation.');
    }
    final fingerprint = jsonEncode({
      'operationId': cleanOperationId,
      'reversalId': cleanReversalId,
      'outcome': outcome,
      'evidenceReference': cleanEvidence,
    });
    return ShopWalletReconciliationCommand(
      operationId: cleanOperationId,
      reversalId: cleanReversalId,
      requestFingerprint: fingerprint,
      commandDigest: await _sha256Hex(fingerprint),
      outcome: outcome,
      evidenceReference: cleanEvidence,
    );
  }

  Future<ShopSaleReversal> recordAuthorizedWalletReconciliation({
    required ShopWalletReconciliationCommand command,
    required ShopCorrectionAuthorization authorization,
  }) {
    return transaction(() async {
      final prior = await customSelect(
        'SELECT * FROM shop_wallet_reversal_reconciliations '
        'WHERE operation_id = ? LIMIT 1',
        variables: [Variable<String>(command.operationId)],
      ).getSingleOrNull();
      if (prior != null) {
        if (prior.read<String>('request_fingerprint') !=
                command.requestFingerprint ||
            prior.read<String>('reversal_id') != command.reversalId ||
            prior.read<String>('outcome') != command.outcome ||
            prior.read<String>('evidence_reference') !=
                command.evidenceReference ||
            await _sha256Hex(command.requestFingerprint) !=
                command.commandDigest ||
            !_matchesRecordedCorrectionAuthorization(prior, authorization)) {
          throw StateError(
            'A wallet reconciliation ID was reused with different details.',
          );
        }
        final reversal = await customSelect(
          'SELECT * FROM shop_sale_reversals WHERE id = ?',
          variables: [Variable<String>(prior.read<String>('reversal_id'))],
        ).getSingle();
        return _saleReversalFromRow(reversal);
      }
      final verifiedCommand = await previewWalletReconciliation(
        operationId: command.operationId,
        reversalId: command.reversalId,
        outcome: command.outcome,
        evidenceReference: command.evidenceReference,
      );
      if (verifiedCommand.requestFingerprint != command.requestFingerprint ||
          verifiedCommand.commandDigest != command.commandDigest) {
        throw StateError('Wallet reconciliation changed. Review it again.');
      }
      final existing = await customSelect(
        'SELECT operation_id FROM shop_wallet_reversal_reconciliations '
        'WHERE reversal_id = ? LIMIT 1',
        variables: [Variable<String>(command.reversalId)],
      ).getSingleOrNull();
      if (existing != null) {
        throw StateError('This wallet reversal was already reconciled.');
      }
      final now = DateTime.now().millisecondsSinceEpoch;
      _validateCorrectionAuthorization(
        authorization: authorization,
        commandDigest: command.commandDigest,
        capability: 'shop.sale.reconcile_wallet',
        now: now,
      );
      await _requireUnusedCorrectionReceipt(authorization.receiptId);
      await customInsert(
        'INSERT INTO shop_wallet_reversal_reconciliations '
        '(id, operation_id, request_fingerprint, reversal_id, outcome, '
        'evidence_reference, authorization_receipt_id, '
        'authorization_receipt_digest, authorization_command_digest, '
        'authorization_workspace_id, '
        'authorized_actor_id, authorized_actor_label, authorized_actor_role, '
        'authorization_capability, authorization_source, '
        'authorization_issued_at_millis, authorization_verified_at_millis, '
        'authorization_expires_at_millis, created_at_millis) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        variables: [
          Variable<String>(command.operationId),
          Variable<String>(command.operationId),
          Variable<String>(command.requestFingerprint),
          Variable<String>(command.reversalId),
          Variable<String>(command.outcome),
          Variable<String>(command.evidenceReference),
          Variable<String>(authorization.receiptId),
          Variable<String>(authorization.receiptDigest),
          Variable<String>(authorization.commandDigest),
          Variable<String>(authorization.workspaceId),
          Variable<String>(authorization.actorId),
          Variable<String>(authorization.actorLabel),
          Variable<String>(authorization.actorRole),
          Variable<String>(authorization.capability),
          Variable<String>(authorization.source),
          Variable<int>(authorization.issuedAtMillis),
          Variable<int>(now),
          Variable<int>(authorization.expiresAtMillis),
          Variable<int>(now),
        ],
      );
      await into(shopSyncOutbox).insert(
        ShopSyncOutboxCompanion.insert(
          operationId: command.operationId,
          eventType: 'shop.mobile_money.reversal_reconciled.v1',
          payloadJson: jsonEncode({
            'reversalId': command.reversalId,
            'outcome': command.outcome,
            'evidenceReference': command.evidenceReference,
            'externalReconciliationState': 'confirmed',
            'moneyReturned': command.outcome == 'money_returned',
            'authorizationReceiptId': authorization.receiptId,
            'authorizedActorId': authorization.actorId,
            'createdAtMillis': now,
          }),
          createdAtMillis: now,
        ),
      );
      final reversal = await customSelect(
        'SELECT * FROM shop_sale_reversals WHERE id = ?',
        variables: [Variable<String>(command.reversalId)],
      ).getSingle();
      return _saleReversalFromRow(reversal);
    });
  }

  Future<ShopSalesSummary> readSalesSummary({
    required int startAtMillis,
    required int endAtMillis,
  }) async {
    if (startAtMillis < 0 || endAtMillis <= startAtMillis) {
      throw ArgumentError('Sales summary range is invalid.');
    }
    final gross = await customSelect(
      'SELECT COUNT(*) AS sale_count, COALESCE(SUM(total_mmk), 0) AS total_mmk '
      'FROM shop_sales WHERE created_at_millis >= ? AND created_at_millis < ?',
      variables: [Variable<int>(startAtMillis), Variable<int>(endAtMillis)],
    ).getSingle();
    final reversed = await customSelect(
      'SELECT COUNT(*) AS reversal_count, '
      'COALESCE(SUM(original_total_mmk), 0) AS total_mmk '
      'FROM shop_sale_reversals '
      'WHERE created_at_millis >= ? AND created_at_millis < ?',
      variables: [Variable<int>(startAtMillis), Variable<int>(endAtMillis)],
    ).getSingle();
    final pendingWallet = await customSelect(
      'SELECT COUNT(*) AS reversal_count, '
      'COALESCE(SUM(r.original_total_mmk), 0) AS total_mmk '
      'FROM shop_sale_reversals r '
      'LEFT JOIN shop_wallet_reversal_reconciliations w '
      'ON w.reversal_id = r.id '
      "WHERE r.original_payment_method IN ('kbzpay', 'wavepay') "
      'AND w.id IS NULL',
    ).getSingle();
    return ShopSalesSummary(
      grossSaleCount: gross.read<int>('sale_count'),
      grossSalesMmk: gross.read<int>('total_mmk'),
      reversalCount: reversed.read<int>('reversal_count'),
      reversalMmk: reversed.read<int>('total_mmk'),
      pendingWalletReversalCount: pendingWallet.read<int>('reversal_count'),
      pendingWalletReversalMmk: pendingWallet.read<int>('total_mmk'),
    );
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
    Map<String, int>? expectedUnitPricesMmk,
    Map<String, String>? expectedProductNames,
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
        (expectedUnitPricesMmk != null && paymentMethod != 'cash') ||
        (expectedProductNames != null && paymentMethod != 'cash') ||
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
    if (expectedUnitPricesMmk != null &&
        (expectedUnitPricesMmk.length != productQuantities.length ||
            productQuantities.keys.any(
              (id) =>
                  expectedUnitPricesMmk[id] == null ||
                  expectedUnitPricesMmk[id]! < 0 ||
                  expectedUnitPricesMmk[id]! > 2000000000,
            ))) {
      throw ArgumentError('Reviewed sale prices are invalid.');
    }
    if (expectedProductNames != null &&
        (expectedProductNames.length != productQuantities.length ||
            productQuantities.keys.any(
              (id) =>
                  expectedProductNames[id] == null ||
                  expectedProductNames[id]!.isEmpty ||
                  expectedProductNames[id]!.length > 160,
            ))) {
      throw ArgumentError('Reviewed sale items are invalid.');
    }
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
      await _rejectHeldSaleOperation(cleanOperationId);
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
        if (expectedUnitPricesMmk != null &&
            priorLines.any(
              (line) =>
                  expectedUnitPricesMmk[line.productId] != line.unitPriceMmk,
            )) {
          throw StateError('Sale price changed. Review the amount again.');
        }
        if (expectedProductNames != null &&
            priorLines.any(
              (line) =>
                  expectedProductNames[line.productId] != line.productName,
            )) {
          throw StateError('Sale item changed. Review each line again.');
        }
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
                id: line.id,
                productId: line.productId,
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
        if (expectedUnitPricesMmk != null &&
            expectedUnitPricesMmk[line.key] != unitPriceMmk) {
          throw StateError('Sale price changed. Review the amount again.');
        }
        if (expectedProductNames != null &&
            expectedProductNames[line.key] != product.name) {
          throw StateError('Sale item changed. Review each line again.');
        }
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
        final grossCashBeforeSale =
            activeShift.openingFloatMmk + review.cashSalesTotalMmk;
        if (totalMmk > 200000000000000 - grossCashBeforeSale) {
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
              id: '$saleId:${line['productId']! as String}',
              productId: line['productId']! as String,
              productName: line['productName']! as String,
              unitPriceMmk: line['unitPriceMmk']! as int,
              quantity: line['quantity']! as int,
              lineTotalMmk: line['lineTotalMmk']! as int,
            ),
        ],
      );
    });
  }

  /// A bounded page of device-local committed sales, ordered by the latest
  /// sale or reversal activity. Search uses saved item names, so later catalog
  /// edits cannot make an old receipt disappear.
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
    final matchingIds = await customSelect(
      'SELECT sale.id FROM shop_sales AS sale '
      'LEFT JOIN shop_sale_reversals AS reversal '
      'ON reversal.sale_id = sale.id '
      '${search.isEmpty ? '' : 'WHERE instr(lower(sale.id), lower(?)) > 0 OR EXISTS (SELECT 1 FROM shop_sale_lines AS line WHERE line.sale_id = sale.id AND instr(lower(line.product_name), lower(?)) > 0) '} '
      'ORDER BY COALESCE(reversal.created_at_millis, sale.created_at_millis) DESC, '
      'sale.id DESC LIMIT ? OFFSET ?',
      variables: [
        if (search.isNotEmpty) ...[
          Variable.withString(search),
          Variable.withString(search),
        ],
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
    final sales = [for (final id in ids) byId[id]!];
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
          id: line.id,
          productId: line.productId,
          productName: line.productName,
          unitPriceMmk: line.unitPriceMmk,
          quantity: line.quantity,
          lineTotalMmk: line.lineTotalMmk,
        ),
      );
    }
    final reversalsBySale = <String, ShopSaleReversal>{};
    for (final saleId in saleIds) {
      final reversal = await readSaleReversalForSale(saleId);
      if (reversal != null) reversalsBySale[saleId] = reversal;
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
          reversal: reversalsBySale[sale.id],
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
