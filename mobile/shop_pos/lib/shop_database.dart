import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:drift_flutter/drift_flutter.dart';

import 'shop_models.dart';
import 'shop_correction_consumption.dart';
import 'shop_correction_receipt.dart';
import 'shop_operational_export.dart';

export 'shop_correction_consumption.dart';
export 'shop_correction_receipt.dart';

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
    this.member,
  });

  final String id;
  final String operationId;
  final int totalMmk;
  final int createdAtMillis;
  final String paymentMethod;
  final List<ShopSaleReceiptLine> lines;
  final ShopSaleReversal? reversal;
  final ShopSaleMember? member;
}

/// A PII-free Shop member identity associated with a completed sale.
///
/// The display code is for recognition only. It is never payment, redemption,
/// account, or management authority.
class ShopMember {
  const ShopMember({
    required this.id,
    required this.displayCode,
    required this.status,
    required this.createdAtMillis,
    required this.updatedAtMillis,
  });

  final String id;
  final String displayCode;
  final String status;
  final int createdAtMillis;
  final int updatedAtMillis;
}

class ShopMemberCardMatch {
  const ShopMemberCardMatch({required this.member, required this.cardRevision});

  final ShopMember member;
  final int cardRevision;
}

class ShopSaleMember {
  const ShopSaleMember({
    required this.memberId,
    required this.displayCode,
    required this.cardRevision,
    required this.associatedAtMillis,
  });

  final String memberId;
  final String displayCode;
  final int cardRevision;
  final int associatedAtMillis;
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

const shopManagedWorkspaceDirectoryContract =
    'supermega.managed_workspace_directory.v1';

/// A workspace chosen from a freshly authenticated managed-workspace listing.
///
/// This value is deliberately narrower than a raw workspace ID. A future
/// connected client must create it only after authenticated discovery; it is
/// not a correction authorization and must never be inferred from one.
class ShopAuthenticatedWorkspaceSelection {
  const ShopAuthenticatedWorkspaceSelection({
    required this.workspaceId,
    required this.actorId,
    this.directoryContract = shopManagedWorkspaceDirectoryContract,
  });

  final String workspaceId;
  final String actorId;
  final String directoryContract;
}

class ShopManagedWorkspaceBinding {
  const ShopManagedWorkspaceBinding({
    required this.workspaceId,
    required this.attachedActorId,
    required this.discoveryContract,
    required this.attachedAtMillis,
  });

  final String workspaceId;
  final String attachedActorId;
  final String discoveryContract;
  final int attachedAtMillis;
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

const _shopFullSaleCorrectionRecoveryContract =
    'supermega.shop.full-sale-correction-recovery.v1';

class _RecoveredFullSaleCorrection {
  const _RecoveredFullSaleCorrection(this.command, this.authorization);

  final ShopFullSaleReversalCommand command;
  final ShopCorrectionAuthorization authorization;
}

String _fullSaleCorrectionRecoveryEnvelope({
  required ShopFullSaleReversalCommand command,
  required ShopCorrectionAuthorization authorization,
}) => jsonEncode({
  'contract': _shopFullSaleCorrectionRecoveryContract,
  'command': {
    'operationId': command.operationId,
    'saleId': command.saleId,
    'saleSnapshotDigest': command.saleSnapshotDigest,
    'requestFingerprint': command.requestFingerprint,
    'commandDigest': command.commandDigest,
    'originalTotalMmk': command.originalTotalMmk,
    'originalPaymentMethod': command.originalPaymentMethod,
    'restockItems': command.restockItems,
    'reason': command.reason,
    'cashReturnConfirmed': command.cashReturnConfirmed,
    'expectedCashShiftId': command.expectedCashShiftId,
    'paymentResolution': command.paymentResolution,
  },
  'authorization': {
    'contract': authorization.contract,
    'receiptId': authorization.receiptId,
    'receiptDigest': authorization.receiptDigest,
    'workspaceId': authorization.workspaceId,
    'actorId': authorization.actorId,
    'actorLabel': authorization.actorLabel,
    'actorRole': authorization.actorRole,
    'capability': authorization.capability,
    'source': authorization.source,
    'commandDigest': authorization.commandDigest,
    'finalizationRequestId': authorization.finalizationRequestId,
    'finalizedAtMillis': authorization.finalizedAtMillis,
    'issuedAtMillis': authorization.issuedAtMillis,
    'expiresAtMillis': authorization.expiresAtMillis,
    'keyId': authorization.keyId,
    'signature': authorization.signature,
  },
});

_RecoveredFullSaleCorrection _decodeFullSaleCorrectionRecoveryEnvelope(
  String encoded,
) {
  try {
    final decoded = jsonDecode(encoded);
    if (decoded is! Map<String, dynamic> ||
        decoded['contract'] != _shopFullSaleCorrectionRecoveryContract ||
        decoded['command'] is! Map<String, dynamic> ||
        decoded['authorization'] is! Map<String, dynamic>) {
      throw const FormatException();
    }
    final command = decoded['command'] as Map<String, dynamic>;
    final authorization = decoded['authorization'] as Map<String, dynamic>;
    return _RecoveredFullSaleCorrection(
      ShopFullSaleReversalCommand(
        operationId: command['operationId'] as String,
        saleId: command['saleId'] as String,
        saleSnapshotDigest: command['saleSnapshotDigest'] as String,
        requestFingerprint: command['requestFingerprint'] as String,
        commandDigest: command['commandDigest'] as String,
        originalTotalMmk: command['originalTotalMmk'] as int,
        originalPaymentMethod: command['originalPaymentMethod'] as String,
        restockItems: command['restockItems'] as bool,
        reason: command['reason'] as String,
        cashReturnConfirmed: command['cashReturnConfirmed'] as bool,
        expectedCashShiftId: command['expectedCashShiftId'] as String?,
        paymentResolution: command['paymentResolution'] as String,
      ),
      ShopCorrectionAuthorization(
        contract: authorization['contract'] as String,
        receiptId: authorization['receiptId'] as String,
        receiptDigest: authorization['receiptDigest'] as String,
        workspaceId: authorization['workspaceId'] as String,
        actorId: authorization['actorId'] as String,
        actorLabel: authorization['actorLabel'] as String,
        actorRole: authorization['actorRole'] as String,
        capability: authorization['capability'] as String,
        source: authorization['source'] as String,
        commandDigest: authorization['commandDigest'] as String,
        finalizationRequestId:
            authorization['finalizationRequestId'] as String?,
        finalizedAtMillis: authorization['finalizedAtMillis'] as int?,
        issuedAtMillis: authorization['issuedAtMillis'] as int,
        expiresAtMillis: authorization['expiresAtMillis'] as int,
        keyId: authorization['keyId'] as String,
        signature: authorization['signature'] as String,
      ),
    );
  } on Object {
    throw StateError('The persisted correction recovery request is invalid.');
  }
}

class ShopWalletReconciliationCommand {
  const ShopWalletReconciliationCommand({
    required this.operationId,
    required this.reversalId,
    required this.originalPaymentMethod,
    required this.originalTotalMmk,
    required this.requestFingerprint,
    required this.commandDigest,
    required this.outcome,
    required this.evidenceReference,
  });

  final String operationId;
  final String reversalId;
  final String originalPaymentMethod;
  final int originalTotalMmk;
  final String requestFingerprint;
  final String commandDigest;
  final String outcome;
  final String evidenceReference;
}

// Key order is part of the cross-runtime authorization command contract.
String _walletReconciliationRequestFingerprint({
  required String operationId,
  required String reversalId,
  required String originalPaymentMethod,
  required int originalTotalMmk,
  required String outcome,
  required String evidenceReference,
}) {
  return jsonEncode(<String, Object>{
    'operationId': operationId,
    'reversalId': reversalId,
    'originalPaymentMethod': originalPaymentMethod,
    'originalTotalMmk': originalTotalMmk,
    'outcome': outcome,
    'evidenceReference': evidenceReference,
  });
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
    required this.authorizationProofKind,
    required this.createdAtMillis,
    required this.lines,
    this.shiftId,
    this.walletReconciliationOutcome,
    this.walletEvidenceReference,
    this.walletReconciledActorLabel,
    this.walletReconciledAtMillis,
    this.walletReconciliationProofKind,
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
  final String authorizationProofKind;
  final int createdAtMillis;
  final String? shiftId;
  final String? walletReconciliationOutcome;
  final String? walletEvidenceReference;
  final String? walletReconciledActorLabel;
  final int? walletReconciledAtMillis;
  final String? walletReconciliationProofKind;
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
    this.member,
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
  final ShopSaleMember? member;
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

const shopManagedWorkspaceBindingV12Sql = '''
  CREATE TABLE IF NOT EXISTS shop_managed_workspace_binding (
    singleton INTEGER PRIMARY KEY NOT NULL CHECK (singleton = 1),
    workspace_id TEXT NOT NULL UNIQUE CHECK (
      typeof(workspace_id) = 'text'
      AND length(workspace_id) BETWEEN 1 AND 128
      AND workspace_id = trim(workspace_id)
      AND substr(workspace_id, 1, 1) GLOB '[A-Za-z0-9]'
      AND workspace_id NOT GLOB '*[^A-Za-z0-9._:-]*'
    ),
    discovery_contract TEXT NOT NULL CHECK (
      discovery_contract = 'supermega.managed_workspace_directory.v1'
    ),
    attached_actor_id TEXT NOT NULL CHECK (
      typeof(attached_actor_id) = 'text'
      AND length(attached_actor_id) BETWEEN 1 AND 128
      AND attached_actor_id = trim(attached_actor_id)
      AND substr(attached_actor_id, 1, 1) GLOB '[A-Za-z0-9]'
      AND attached_actor_id NOT GLOB '*[^A-Za-z0-9._:-]*'
    ),
    attached_at_millis INTEGER NOT NULL CHECK (
      typeof(attached_at_millis) = 'integer' AND attached_at_millis > 0
    )
  )
''';

const shopManagedWorkspaceBindingInsertGuardV12Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_managed_workspace_binding_insert_guard
  BEFORE INSERT ON shop_managed_workspace_binding
  WHEN EXISTS (SELECT 1 FROM shop_managed_workspace_binding)
    OR EXISTS (
      SELECT 1 FROM shop_sale_reversals
      WHERE authorization_workspace_id != NEW.workspace_id
    )
    OR EXISTS (
      SELECT 1 FROM shop_wallet_reversal_reconciliations
      WHERE authorization_workspace_id != NEW.workspace_id
    )
  BEGIN
    SELECT RAISE(
      ABORT,
      'Managed Shop workspace binding is immutable or conflicts with correction history'
    );
  END
''';

const shopSaleReversalsRequireWorkspaceBindingV12Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_sale_reversals_require_workspace_binding
  BEFORE INSERT ON shop_sale_reversals
  WHEN NOT EXISTS (
    SELECT 1 FROM shop_managed_workspace_binding
    WHERE singleton = 1
      AND workspace_id = NEW.authorization_workspace_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'Shop correction requires the bound workspace');
  END
''';

const shopWalletReversalReconciliationsRequireWorkspaceBindingV12Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_wallet_reversal_reconciliations_require_workspace_binding
  BEFORE INSERT ON shop_wallet_reversal_reconciliations
  WHEN NOT EXISTS (
    SELECT 1 FROM shop_managed_workspace_binding
    WHERE singleton = 1
      AND workspace_id = NEW.authorization_workspace_id
  )
    OR NOT EXISTS (
      SELECT 1 FROM shop_sale_reversals
      WHERE id = NEW.reversal_id
        AND authorization_workspace_id = NEW.authorization_workspace_id
    )
  BEGIN
    SELECT RAISE(ABORT, 'Shop reconciliation requires the bound workspace');
  END
''';

/// The exact singleton table shipped by PR #751 when that branch called
/// itself schema 11. The historical identifiers are data compatibility
/// values; later UI labels must not rewrite them during migration.
const shopBusinessProfileV11Sql = '''
  CREATE TABLE IF NOT EXISTS shop_business_profile (
    singleton_key INTEGER PRIMARY KEY NOT NULL CHECK (singleton_key = 1),
    schema_id TEXT NOT NULL
      CHECK (schema_id = 'supermega.shop.business_profile.v1'),
    template_id TEXT NOT NULL
      CHECK (template_id IN (
        'mini-mart', 'cafe-takeaway', 'fashion-accessories',
        'beauty-household', 'custom'
      )),
    template_version INTEGER NOT NULL CHECK (template_version = 1),
    updated_at_millis INTEGER NOT NULL CHECK (updated_at_millis >= 0)
  )
''';

/// Distinguishes a legitimate correction-v11/v12 migration that had audit
/// history before authenticated workspace attachment. It grants no identity,
/// role, capability, or workspace authority and is removed on real attach.
const shopMigrationProvenanceV13Sql = '''
  CREATE TABLE IF NOT EXISTS shop_v13_migration_provenance (
    singleton INTEGER PRIMARY KEY NOT NULL CHECK (singleton = 1),
    reason TEXT NOT NULL CHECK (
      reason = 'legacy_unbound_correction_history'
    )
  )
''';

const shopStoreIdentityV16Sql = '''
  CREATE TABLE IF NOT EXISTS shop_store_identity (
    singleton INTEGER PRIMARY KEY NOT NULL CHECK (singleton = 1),
    store_ref TEXT NOT NULL UNIQUE CHECK (
      typeof(store_ref) = 'text'
      AND length(store_ref) = 64
      AND store_ref NOT GLOB '*[^0-9a-f]*'
    ),
    created_at_millis INTEGER NOT NULL CHECK (
      typeof(created_at_millis) = 'integer' AND created_at_millis > 0
    )
  )
''';

const shopMembersV16Sql = '''
  CREATE TABLE IF NOT EXISTS shop_members (
    id TEXT PRIMARY KEY NOT NULL CHECK (
      typeof(id) = 'text'
      AND length(id) = 36
      AND substr(id, 1, 4) = 'mem_'
      AND substr(id, 5) NOT GLOB '*[^0-9a-f]*'
    ),
    store_ref TEXT NOT NULL REFERENCES shop_store_identity(store_ref),
    display_code TEXT NOT NULL UNIQUE CHECK (
      typeof(display_code) = 'text'
      AND length(display_code) BETWEEN 6 AND 20
      AND display_code NOT GLOB '*[^0-9]*'
    ),
    status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
    created_at_millis INTEGER NOT NULL CHECK (
      typeof(created_at_millis) = 'integer' AND created_at_millis > 0
    ),
    updated_at_millis INTEGER NOT NULL CHECK (
      typeof(updated_at_millis) = 'integer'
      AND updated_at_millis >= created_at_millis
    )
  )
''';

const shopMemberCardsV16Sql = '''
  CREATE TABLE IF NOT EXISTS shop_member_cards (
    token_digest TEXT PRIMARY KEY NOT NULL CHECK (
      typeof(token_digest) = 'text'
      AND length(token_digest) = 64
      AND token_digest NOT GLOB '*[^0-9a-f]*'
    ),
    member_id TEXT NOT NULL REFERENCES shop_members(id),
    revision INTEGER NOT NULL CHECK (
      typeof(revision) = 'integer' AND revision >= 1
    ),
    state TEXT NOT NULL CHECK (state IN ('active', 'retired', 'revoked')),
    issued_at_millis INTEGER NOT NULL CHECK (
      typeof(issued_at_millis) = 'integer' AND issued_at_millis > 0
    ),
    retired_at_millis INTEGER CHECK (
      retired_at_millis IS NULL OR (
        typeof(retired_at_millis) = 'integer'
        AND retired_at_millis >= issued_at_millis
      )
    ),
    UNIQUE(member_id, revision),
    CHECK (
      (state = 'active' AND retired_at_millis IS NULL)
      OR (state IN ('retired', 'revoked') AND retired_at_millis IS NOT NULL)
    )
  )
''';

const shopSaleMemberLinksV16Sql = '''
  CREATE TABLE IF NOT EXISTS shop_sale_member_links (
    sale_id TEXT PRIMARY KEY NOT NULL REFERENCES shop_sales(id),
    member_id TEXT NOT NULL REFERENCES shop_members(id),
    card_revision INTEGER NOT NULL CHECK (
      typeof(card_revision) = 'integer' AND card_revision >= 1
    ),
    display_code TEXT NOT NULL CHECK (
      typeof(display_code) = 'text'
      AND length(display_code) BETWEEN 6 AND 20
      AND display_code NOT GLOB '*[^0-9]*'
    ),
    associated_at_millis INTEGER NOT NULL CHECK (
      typeof(associated_at_millis) = 'integer' AND associated_at_millis > 0
    )
  )
''';

const shopWalletCheckoutMemberLinksV16Sql = '''
  CREATE TABLE IF NOT EXISTS shop_wallet_checkout_member_links (
    operation_id TEXT PRIMARY KEY NOT NULL
      REFERENCES shop_wallet_checkout_intents(operation_id),
    member_id TEXT NOT NULL REFERENCES shop_members(id),
    card_revision INTEGER NOT NULL CHECK (
      typeof(card_revision) = 'integer' AND card_revision >= 1
    ),
    display_code TEXT NOT NULL CHECK (
      typeof(display_code) = 'text'
      AND length(display_code) BETWEEN 6 AND 20
      AND display_code NOT GLOB '*[^0-9]*'
    ),
    associated_at_millis INTEGER NOT NULL CHECK (
      typeof(associated_at_millis) = 'integer' AND associated_at_millis > 0
    )
  )
''';

const shopStoreIdentitySingleRowV16Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_store_identity_single_row
  BEFORE INSERT ON shop_store_identity
  WHEN EXISTS (SELECT 1 FROM shop_store_identity)
  BEGIN
    SELECT RAISE(ABORT, 'Shop store identity is a singleton');
  END
''';

const shopSaleMemberLinksRequireActiveCardV16Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_sale_member_links_require_active_card
  BEFORE INSERT ON shop_sale_member_links
  WHEN NOT EXISTS (
    SELECT 1
    FROM shop_members AS member
    JOIN shop_member_cards AS card ON card.member_id = member.id
    WHERE member.id = NEW.member_id
      AND member.status = 'active'
      AND member.display_code = NEW.display_code
      AND card.revision = NEW.card_revision
      AND card.state = 'active'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM shop_wallet_checkout_member_links AS wallet_link
    WHERE wallet_link.operation_id = NEW.sale_id
      AND wallet_link.member_id = NEW.member_id
      AND wallet_link.card_revision = NEW.card_revision
      AND wallet_link.display_code = NEW.display_code
  )
  BEGIN
    SELECT RAISE(ABORT, 'Shop sale member card is not active');
  END
''';

const shopWalletMemberLinksRequireActiveCardV16Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_wallet_member_links_require_active_card
  BEFORE INSERT ON shop_wallet_checkout_member_links
  WHEN NOT EXISTS (
    SELECT 1
    FROM shop_members AS member
    JOIN shop_member_cards AS card ON card.member_id = member.id
    WHERE member.id = NEW.member_id
      AND member.status = 'active'
      AND member.display_code = NEW.display_code
      AND card.revision = NEW.card_revision
      AND card.state = 'active'
  )
  BEGIN
    SELECT RAISE(ABORT, 'Shop wallet member card is not active');
  END
''';

const shopCorrectionAuthorizationProofKindSignedV2 = 'signed_v2';
const shopCorrectionAuthorizationProofKindSignedV3 = 'signed_v3';
const shopCorrectionAuthorizationProofKindLegacyV1 = 'legacy_unverified_v1';

const shopCorrectionAuthorizationProofsV14Sql = '''
  CREATE TABLE IF NOT EXISTS shop_correction_authorization_proofs (
    receipt_id TEXT PRIMARY KEY NOT NULL CHECK (length(receipt_id) BETWEEN 1 AND 160),
    proof_kind TEXT NOT NULL CHECK (proof_kind IN ('signed_v2', 'legacy_unverified_v1')),
    local_operation_id TEXT NOT NULL CHECK (length(local_operation_id) BETWEEN 1 AND 120),
    receipt_digest TEXT NOT NULL CHECK (length(receipt_digest) = 64),
    key_id TEXT,
    signature TEXT,
    workspace_id TEXT NOT NULL CHECK (length(workspace_id) BETWEEN 1 AND 128),
    actor_id TEXT NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 128),
    actor_label TEXT NOT NULL CHECK (length(actor_label) BETWEEN 1 AND 120),
    actor_role TEXT NOT NULL CHECK (actor_role = 'owner'),
    capability TEXT NOT NULL CHECK (capability IN ('shop.sale.reverse', 'shop.sale.reconcile_wallet')),
    source TEXT NOT NULL CHECK (source = 'managed_membership_receipt_v1'),
    command_digest TEXT NOT NULL CHECK (length(command_digest) = 64),
    issued_at_millis INTEGER NOT NULL CHECK (issued_at_millis > 0),
    expires_at_millis INTEGER NOT NULL CHECK (expires_at_millis > issued_at_millis),
    verified_at_millis INTEGER NOT NULL CHECK (
      verified_at_millis >= issued_at_millis
      AND verified_at_millis <= expires_at_millis
    ),
    CHECK (
      (proof_kind = 'signed_v2'
        AND key_id IS NOT NULL
        AND length(key_id) BETWEEN 1 AND 32
        AND signature IS NOT NULL
        AND length(signature) = 86)
      OR
      (proof_kind = 'legacy_unverified_v1'
        AND key_id IS NULL
        AND signature IS NULL)
    )
  )
''';

const shopCorrectionAuthorizationProofsV15Sql = '''
  CREATE TABLE IF NOT EXISTS shop_correction_authorization_proofs (
    receipt_id TEXT PRIMARY KEY NOT NULL CHECK (length(receipt_id) BETWEEN 1 AND 160),
    proof_kind TEXT NOT NULL CHECK (proof_kind IN ('signed_v3', 'signed_v2', 'legacy_unverified_v1')),
    local_operation_id TEXT NOT NULL CHECK (length(local_operation_id) BETWEEN 1 AND 120),
    receipt_digest TEXT NOT NULL CHECK (length(receipt_digest) = 64),
    key_id TEXT,
    signature TEXT,
    finalization_request_id TEXT,
    finalized_at_millis INTEGER,
    workspace_id TEXT NOT NULL CHECK (length(workspace_id) BETWEEN 1 AND 128),
    actor_id TEXT NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 128),
    actor_label TEXT NOT NULL CHECK (length(actor_label) BETWEEN 1 AND 120),
    actor_role TEXT NOT NULL CHECK (actor_role = 'owner'),
    capability TEXT NOT NULL CHECK (capability IN ('shop.sale.reverse', 'shop.sale.reconcile_wallet')),
    source TEXT NOT NULL CHECK (source = 'managed_membership_receipt_v1'),
    command_digest TEXT NOT NULL CHECK (length(command_digest) = 64),
    issued_at_millis INTEGER NOT NULL CHECK (issued_at_millis > 0),
    expires_at_millis INTEGER NOT NULL CHECK (expires_at_millis > issued_at_millis),
    verified_at_millis INTEGER NOT NULL CHECK (
      verified_at_millis >= issued_at_millis
      AND verified_at_millis <= expires_at_millis
    ),
    CHECK (
      (proof_kind = 'signed_v3'
        AND key_id IS NOT NULL
        AND length(key_id) BETWEEN 1 AND 32
        AND signature IS NOT NULL
        AND length(signature) = 86
        AND finalization_request_id IS NOT NULL
        AND length(finalization_request_id) = 36
        AND finalized_at_millis IS NOT NULL
        AND finalized_at_millis = issued_at_millis
        AND finalized_at_millis <= expires_at_millis
        AND verified_at_millis = finalized_at_millis
        AND source = 'managed_membership_receipt_v1')
      OR
      (proof_kind = 'signed_v2'
        AND key_id IS NOT NULL
        AND length(key_id) BETWEEN 1 AND 32
        AND signature IS NOT NULL
        AND length(signature) = 86
        AND finalization_request_id IS NULL
        AND finalized_at_millis IS NULL
        AND source = 'managed_membership_receipt_v1')
      OR
      (proof_kind = 'legacy_unverified_v1'
        AND key_id IS NULL
        AND signature IS NULL
        AND finalization_request_id IS NULL
        AND finalized_at_millis IS NULL
        AND source = 'managed_membership_receipt_v1')
    )
  )
''';

const shopSaleReversalsRequireSignedProofV14Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_sale_reversals_require_signed_proof
  BEFORE INSERT ON shop_sale_reversals
  WHEN NOT EXISTS (
    SELECT 1 FROM shop_correction_authorization_proofs
    WHERE receipt_id = NEW.authorization_receipt_id
      AND proof_kind = 'signed_v2'
      AND local_operation_id = NEW.operation_id
      AND receipt_digest = NEW.authorization_receipt_digest
      AND workspace_id = NEW.authorization_workspace_id
      AND actor_id = NEW.authorized_actor_id
      AND actor_label = NEW.authorized_actor_label
      AND actor_role = NEW.authorized_actor_role
      AND capability = NEW.authorization_capability
      AND source = NEW.authorization_source
      AND command_digest = NEW.authorization_command_digest
      AND issued_at_millis = NEW.authorization_issued_at_millis
      AND expires_at_millis = NEW.authorization_expires_at_millis
      AND verified_at_millis = NEW.authorization_verified_at_millis
  )
  BEGIN
    SELECT RAISE(ABORT, 'Shop correction requires a signed authorization proof');
  END
''';

const shopWalletReconciliationsRequireSignedProofV14Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_wallet_reconciliations_require_signed_proof
  BEFORE INSERT ON shop_wallet_reversal_reconciliations
  WHEN NOT EXISTS (
    SELECT 1 FROM shop_correction_authorization_proofs
    WHERE receipt_id = NEW.authorization_receipt_id
      AND proof_kind = 'signed_v2'
      AND local_operation_id = NEW.operation_id
      AND receipt_digest = NEW.authorization_receipt_digest
      AND workspace_id = NEW.authorization_workspace_id
      AND actor_id = NEW.authorized_actor_id
      AND actor_label = NEW.authorized_actor_label
      AND actor_role = NEW.authorized_actor_role
      AND capability = NEW.authorization_capability
      AND source = NEW.authorization_source
      AND command_digest = NEW.authorization_command_digest
      AND issued_at_millis = NEW.authorization_issued_at_millis
      AND expires_at_millis = NEW.authorization_expires_at_millis
      AND verified_at_millis = NEW.authorization_verified_at_millis
  )
  BEGIN
    SELECT RAISE(ABORT, 'Shop reconciliation requires a signed authorization proof');
  END
''';

String shopCorrectionRequiresFinalizedProofV15Sql({
  required String trigger,
  required String table,
  required String message,
}) =>
    '''
  CREATE TRIGGER IF NOT EXISTS $trigger
  BEFORE INSERT ON $table
  WHEN NOT EXISTS (
    SELECT 1 FROM shop_correction_authorization_proofs
    WHERE receipt_id = NEW.authorization_receipt_id
      AND proof_kind = 'signed_v3'
      AND local_operation_id = NEW.operation_id
      AND receipt_digest = NEW.authorization_receipt_digest
      AND workspace_id = NEW.authorization_workspace_id
      AND actor_id = NEW.authorized_actor_id
      AND actor_label = NEW.authorized_actor_label
      AND actor_role = NEW.authorized_actor_role
      AND capability = NEW.authorization_capability
      AND source = NEW.authorization_source
      AND command_digest = NEW.authorization_command_digest
      AND issued_at_millis = NEW.authorization_issued_at_millis
      AND expires_at_millis = NEW.authorization_expires_at_millis
      AND finalized_at_millis = NEW.authorization_verified_at_millis
      AND verified_at_millis = NEW.authorization_verified_at_millis
  )
  BEGIN
    SELECT RAISE(ABORT, '$message');
  END
''';

const shopCashShiftsOneOpenV6Sql = '''
  CREATE UNIQUE INDEX IF NOT EXISTS shop_cash_shifts_one_open
  ON shop_cash_shifts(state) WHERE state = 'open'
''';

const shopCashShiftSalesShiftIdV6Sql = '''
  CREATE INDEX IF NOT EXISTS shop_cash_shift_sales_shift_id
  ON shop_cash_shift_sales(shift_id)
''';

const shopHeldSalesUpdatedV10Sql = '''
  CREATE INDEX IF NOT EXISTS shop_held_sales_updated
  ON shop_held_sales(updated_at_millis DESC)
''';

const shopKnownBaseObjectNames = <String>{
  'menu_import_drafts',
  'merchant_wallet_profiles',
  'shop_products',
  'shop_sales',
  'shop_sale_lines',
  'shop_stock_movements',
  'shop_sync_outbox',
  'shop_wallet_checkout_intents',
  'shop_cash_shifts',
  'shop_cash_shifts_one_open',
  'shop_cash_shift_sales',
  'shop_cash_shift_sales_shift_id',
  'shop_product_images',
  'shop_counter_drafts',
  'shop_held_sales',
  'shop_held_sales_updated',
};

const shopBaseTableColumnsV6 = <String, Set<String>>{
  'menu_import_drafts': {
    'id',
    'batch_id',
    'category',
    'name',
    'description',
    'price_mmk',
    'sku',
    'barcode',
    'opening_stock',
    'review_state',
    'created_at_millis',
  },
  'merchant_wallet_profiles': {
    'provider',
    'merchant_phone',
    'official_qr_payload',
    'issuer_confirmed',
    'updated_at_millis',
  },
  'shop_products': {
    'id',
    'name',
    'category',
    'description',
    'sku',
    'barcode',
    'price_mmk',
    'on_hand',
    'updated_at_millis',
    'archived',
  },
  'shop_sales': {
    'id',
    'operation_id',
    'request_fingerprint',
    'total_mmk',
    'payment_method',
    'created_at_millis',
  },
  'shop_sale_lines': {
    'id',
    'sale_id',
    'product_id',
    'product_name',
    'unit_price_mmk',
    'quantity',
    'line_total_mmk',
  },
  'shop_stock_movements': {
    'id',
    'sale_id',
    'product_id',
    'quantity_delta',
    'reason',
    'created_at_millis',
  },
  'shop_sync_outbox': {
    'operation_id',
    'event_type',
    'payload_json',
    'state',
    'created_at_millis',
  },
  'shop_wallet_checkout_intents': {
    'operation_id',
    'payment_method',
    'request_fingerprint',
    'total_mmk',
    'merchant_phone',
    'merchant_qr_payload',
    'basket_json',
    'state',
    'created_at_millis',
  },
  'shop_cash_shifts': {
    'id',
    'open_operation_id',
    'operator_label',
    'opening_float_mmk',
    'opened_at_millis',
    'state',
    'close_operation_id',
    'closed_at_millis',
    'cash_sales_count',
    'cash_sales_total_mmk',
    'wallet_sales_count',
    'wallet_sales_total_mmk',
    'expected_cash_mmk',
    'counted_cash_mmk',
    'difference_mmk',
    'review_sale_count',
    'review_cash_total_mmk',
  },
  'shop_cash_shift_sales': {'sale_id', 'shift_id'},
};

const shopProductImageColumnsV7 = {
  'product_id',
  'image_png',
  'updated_at_millis',
};

const shopCounterDraftColumnsV8 = {
  'slot',
  'operation_id',
  'basket_json',
  'updated_at_millis',
};

const shopHeldSaleColumnsV10 = {
  'id',
  'name',
  'operation_id',
  'basket_json',
  'created_at_millis',
  'updated_at_millis',
};

Map<String, Set<String>> shopBaseTableColumnsForVersion(int schemaVersion) {
  if (schemaVersion < 6 || schemaVersion > 17) return const {};
  return <String, Set<String>>{
    for (final entry in shopBaseTableColumnsV6.entries)
      entry.key: <String>{
        ...entry.value,
        if (entry.key == 'shop_products' && schemaVersion >= 9) 'reorder_level',
      },
    if (schemaVersion >= 7) 'shop_product_images': shopProductImageColumnsV7,
    if (schemaVersion >= 8) 'shop_counter_drafts': shopCounterDraftColumnsV8,
    if (schemaVersion >= 10) 'shop_held_sales': shopHeldSaleColumnsV10,
  };
}

Map<String, String> shopCriticalIndexDefinitions(int schemaVersion) => {
  if (schemaVersion >= 6)
    'shop_cash_shifts_one_open': shopCashShiftsOneOpenV6Sql,
  if (schemaVersion >= 6)
    'shop_cash_shift_sales_shift_id': shopCashShiftSalesShiftIdV6Sql,
  if (schemaVersion >= 10)
    'shop_held_sales_updated': shopHeldSalesUpdatedV10Sql,
};

String shopSchemaObjectTypeForDefinition(String definition) {
  final sql = canonicalShopSchemaSql(definition);
  if (sql.startsWith('create table')) return 'table';
  if (sql.startsWith('create index') || sql.startsWith('create unique index')) {
    return 'index';
  }
  if (sql.startsWith('create trigger')) return 'trigger';
  throw ArgumentError.value(definition, 'definition', 'Unknown schema object');
}

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

Map<String, String> shopReversalSchemaDefinitionsV11() {
  final definitions = <String, String>{
    'shop_sale_reversals': shopSaleReversalsV11Sql,
    'shop_sale_reversal_lines': shopSaleReversalLinesV11Sql,
    'shop_wallet_reversal_reconciliations':
        shopWalletReversalReconciliationsV11Sql,
  };
  for (final table in const [
    'shop_sale_reversals',
    'shop_sale_reversal_lines',
    'shop_wallet_reversal_reconciliations',
    'shop_sales',
    'shop_sale_lines',
    'shop_stock_movements',
  ]) {
    final message = table == 'shop_stock_movements'
        ? 'Completed Shop stock movements are immutable'
        : table == 'shop_sales' || table == 'shop_sale_lines'
        ? 'Completed Shop sales are immutable'
        : 'Shop reversal audit records are immutable';
    for (final operation in const ['update', 'delete']) {
      definitions['${table}_no_$operation'] = shopImmutableTriggerV11Sql(
        table: table,
        operation: operation,
        message: message,
      );
    }
  }
  return definitions;
}

Map<String, String> shopWorkspaceSchemaDefinitionsV12() => <String, String>{
  'shop_managed_workspace_binding': shopManagedWorkspaceBindingV12Sql,
  'shop_managed_workspace_binding_no_update': shopImmutableTriggerV11Sql(
    table: 'shop_managed_workspace_binding',
    operation: 'update',
    message: 'Managed Shop workspace binding is immutable',
  ),
  'shop_managed_workspace_binding_no_delete': shopImmutableTriggerV11Sql(
    table: 'shop_managed_workspace_binding',
    operation: 'delete',
    message: 'Managed Shop workspace binding is immutable',
  ),
  'shop_managed_workspace_binding_insert_guard':
      shopManagedWorkspaceBindingInsertGuardV12Sql,
  'shop_sale_reversals_require_workspace_binding':
      shopSaleReversalsRequireWorkspaceBindingV12Sql,
  'shop_wallet_reversal_reconciliations_require_workspace_binding':
      shopWalletReversalReconciliationsRequireWorkspaceBindingV12Sql,
};

Map<String, String> shopWorkspaceCollisionPrefixDefinitionsV12() {
  final definitions = shopWorkspaceSchemaDefinitionsV12();
  definitions.remove('shop_sale_reversals_require_workspace_binding');
  definitions.remove(
    'shop_wallet_reversal_reconciliations_require_workspace_binding',
  );
  return definitions;
}

Map<String, String>
shopAuthorizationProofSchemaDefinitionsV14() => <String, String>{
  'shop_correction_authorization_proofs':
      shopCorrectionAuthorizationProofsV14Sql,
  'shop_correction_authorization_proofs_no_update': shopImmutableTriggerV11Sql(
    table: 'shop_correction_authorization_proofs',
    operation: 'update',
    message: 'Shop correction authorization proofs are immutable',
  ),
  'shop_correction_authorization_proofs_no_delete': shopImmutableTriggerV11Sql(
    table: 'shop_correction_authorization_proofs',
    operation: 'delete',
    message: 'Shop correction authorization proofs are immutable',
  ),
  'shop_sale_reversals_require_signed_proof':
      shopSaleReversalsRequireSignedProofV14Sql,
  'shop_wallet_reconciliations_require_signed_proof':
      shopWalletReconciliationsRequireSignedProofV14Sql,
};

Map<String, String>
shopAuthorizationProofSchemaDefinitionsV15() => <String, String>{
  'shop_correction_authorization_proofs':
      shopCorrectionAuthorizationProofsV15Sql,
  'shop_correction_authorization_proofs_no_update': shopImmutableTriggerV11Sql(
    table: 'shop_correction_authorization_proofs',
    operation: 'update',
    message: 'Shop correction authorization proofs are immutable',
  ),
  'shop_correction_authorization_proofs_no_delete': shopImmutableTriggerV11Sql(
    table: 'shop_correction_authorization_proofs',
    operation: 'delete',
    message: 'Shop correction authorization proofs are immutable',
  ),
  'shop_sale_reversals_require_signed_proof':
      shopCorrectionRequiresFinalizedProofV15Sql(
        trigger: 'shop_sale_reversals_require_signed_proof',
        table: 'shop_sale_reversals',
        message: 'Shop correction requires a finalized authorization proof',
      ),
  'shop_wallet_reconciliations_require_signed_proof':
      shopCorrectionRequiresFinalizedProofV15Sql(
        trigger: 'shop_wallet_reconciliations_require_signed_proof',
        table: 'shop_wallet_reversal_reconciliations',
        message: 'Shop reconciliation requires a finalized authorization proof',
      ),
};

Map<String, String> shopMemberSchemaDefinitionsV16() => <String, String>{
  'shop_store_identity': shopStoreIdentityV16Sql,
  'shop_members': shopMembersV16Sql,
  'shop_member_cards': shopMemberCardsV16Sql,
  'shop_sale_member_links': shopSaleMemberLinksV16Sql,
  'shop_wallet_checkout_member_links': shopWalletCheckoutMemberLinksV16Sql,
  'shop_store_identity_single_row': shopStoreIdentitySingleRowV16Sql,
  'shop_store_identity_no_update': shopImmutableTriggerV11Sql(
    table: 'shop_store_identity',
    operation: 'update',
    message: 'Shop store identity is immutable',
  ),
  'shop_store_identity_no_delete': shopImmutableTriggerV11Sql(
    table: 'shop_store_identity',
    operation: 'delete',
    message: 'Shop store identity is immutable',
  ),
  'shop_members_no_update': shopImmutableTriggerV11Sql(
    table: 'shop_members',
    operation: 'update',
    message: 'Shop member identities are immutable in schema v16',
  ),
  'shop_members_no_delete': shopImmutableTriggerV11Sql(
    table: 'shop_members',
    operation: 'delete',
    message: 'Shop member identities are immutable',
  ),
  'shop_member_cards_no_update': shopImmutableTriggerV11Sql(
    table: 'shop_member_cards',
    operation: 'update',
    message: 'Shop member card history is immutable',
  ),
  'shop_member_cards_no_delete': shopImmutableTriggerV11Sql(
    table: 'shop_member_cards',
    operation: 'delete',
    message: 'Shop member card history is immutable',
  ),
  'shop_sale_member_links_require_active_card':
      shopSaleMemberLinksRequireActiveCardV16Sql,
  'shop_sale_member_links_no_update': shopImmutableTriggerV11Sql(
    table: 'shop_sale_member_links',
    operation: 'update',
    message: 'Completed Shop sale member links are immutable',
  ),
  'shop_sale_member_links_no_delete': shopImmutableTriggerV11Sql(
    table: 'shop_sale_member_links',
    operation: 'delete',
    message: 'Completed Shop sale member links are immutable',
  ),
  'shop_wallet_member_links_require_active_card':
      shopWalletMemberLinksRequireActiveCardV16Sql,
  'shop_wallet_checkout_member_links_no_update': shopImmutableTriggerV11Sql(
    table: 'shop_wallet_checkout_member_links',
    operation: 'update',
    message: 'Shop wallet member links are immutable',
  ),
  'shop_wallet_checkout_member_links_no_delete': shopImmutableTriggerV11Sql(
    table: 'shop_wallet_checkout_member_links',
    operation: 'delete',
    message: 'Shop wallet member links are immutable',
  ),
};

const shopCorrectionLineageStateV17Sql = '''
  CREATE TABLE IF NOT EXISTS shop_correction_lineage_state (
    singleton INTEGER PRIMARY KEY NOT NULL CHECK (singleton = 1),
    activation_request_id TEXT NOT NULL UNIQUE CHECK (length(activation_request_id) = 36),
    workspace_id TEXT NOT NULL CHECK (length(workspace_id) BETWEEN 1 AND 128),
    actor_id TEXT NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 128),
    lineage_id TEXT NOT NULL UNIQUE CHECK (length(lineage_id) = 36),
    lineage_epoch INTEGER NOT NULL CHECK (lineage_epoch >= 1),
    previous_lineage_id TEXT CHECK (previous_lineage_id IS NULL OR length(previous_lineage_id) = 36),
    previous_lineage_epoch INTEGER,
    consumption_ordinal INTEGER NOT NULL CHECK (consumption_ordinal >= 0),
    consumption_digest TEXT CHECK (consumption_digest IS NULL OR length(consumption_digest) = 64),
    lifecycle_state TEXT NOT NULL CHECK (lifecycle_state IN ('active', 'restore_pending', 'reconciliation_required')),
    activated_at_millis INTEGER NOT NULL CHECK (activated_at_millis > 0),
    CHECK ((lineage_epoch = 1 AND previous_lineage_id IS NULL AND previous_lineage_epoch IS NULL)
      OR (lineage_epoch > 1 AND previous_lineage_id IS NOT NULL AND previous_lineage_epoch = lineage_epoch - 1)),
    CHECK ((consumption_ordinal = 0 AND consumption_digest IS NULL)
      OR (consumption_ordinal > 0 AND consumption_digest IS NOT NULL))
  )
''';

const shopCorrectionLineageStateGuardUpdateV17Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_correction_lineage_state_guard_update
  BEFORE UPDATE ON shop_correction_lineage_state
  WHEN NOT (
    (
      OLD.lifecycle_state = 'active'
      AND NEW.lifecycle_state = 'restore_pending'
      AND NEW.singleton IS OLD.singleton
      AND NEW.activation_request_id IS OLD.activation_request_id
      AND NEW.workspace_id IS OLD.workspace_id
      AND NEW.actor_id IS OLD.actor_id
      AND NEW.lineage_id IS OLD.lineage_id
      AND NEW.lineage_epoch IS OLD.lineage_epoch
      AND NEW.previous_lineage_id IS OLD.previous_lineage_id
      AND NEW.previous_lineage_epoch IS OLD.previous_lineage_epoch
      AND NEW.consumption_ordinal IS OLD.consumption_ordinal
      AND NEW.consumption_digest IS OLD.consumption_digest
      AND NEW.activated_at_millis IS OLD.activated_at_millis
    )
    OR (
      OLD.lifecycle_state IN ('active', 'restore_pending')
      AND NEW.lifecycle_state = 'reconciliation_required'
      AND NEW.singleton IS OLD.singleton
      AND NEW.activation_request_id IS OLD.activation_request_id
      AND NEW.workspace_id IS OLD.workspace_id
      AND NEW.actor_id IS OLD.actor_id
      AND NEW.lineage_id IS OLD.lineage_id
      AND NEW.lineage_epoch IS OLD.lineage_epoch
      AND NEW.previous_lineage_id IS OLD.previous_lineage_id
      AND NEW.previous_lineage_epoch IS OLD.previous_lineage_epoch
      AND NEW.consumption_ordinal IS OLD.consumption_ordinal
      AND NEW.consumption_digest IS OLD.consumption_digest
      AND NEW.activated_at_millis IS OLD.activated_at_millis
    )
    OR (
      OLD.lifecycle_state = 'reconciliation_required'
      AND NEW.lifecycle_state = 'reconciliation_required'
      AND NEW.singleton IS OLD.singleton
      AND NEW.activation_request_id IS OLD.activation_request_id
      AND NEW.workspace_id IS OLD.workspace_id
      AND NEW.actor_id IS OLD.actor_id
      AND NEW.lineage_id IS OLD.lineage_id
      AND NEW.lineage_epoch IS OLD.lineage_epoch
      AND NEW.previous_lineage_id IS OLD.previous_lineage_id
      AND NEW.previous_lineage_epoch IS OLD.previous_lineage_epoch
      AND NEW.consumption_ordinal IS OLD.consumption_ordinal
      AND NEW.consumption_digest IS OLD.consumption_digest
      AND NEW.activated_at_millis IS OLD.activated_at_millis
    )
    OR (
      OLD.lifecycle_state = 'restore_pending'
      AND NEW.lifecycle_state = 'active'
      AND NEW.singleton IS OLD.singleton
      AND NEW.activation_request_id IS NOT OLD.activation_request_id
      AND NEW.workspace_id IS OLD.workspace_id
      AND NEW.actor_id IS OLD.actor_id
      AND NEW.lineage_id IS NOT OLD.lineage_id
      AND NEW.lineage_epoch = OLD.lineage_epoch + 1
      AND NEW.previous_lineage_id IS OLD.lineage_id
      AND NEW.previous_lineage_epoch IS OLD.lineage_epoch
      AND NEW.consumption_ordinal IS OLD.consumption_ordinal
      AND NEW.consumption_digest IS OLD.consumption_digest
      AND NEW.activated_at_millis >= OLD.activated_at_millis
    )
    OR (
      OLD.lifecycle_state = 'active'
      AND NEW.lifecycle_state = 'active'
      AND NEW.singleton IS OLD.singleton
      AND NEW.activation_request_id IS OLD.activation_request_id
      AND NEW.workspace_id IS OLD.workspace_id
      AND NEW.actor_id IS OLD.actor_id
      AND NEW.lineage_id IS OLD.lineage_id
      AND NEW.lineage_epoch IS OLD.lineage_epoch
      AND NEW.previous_lineage_id IS OLD.previous_lineage_id
      AND NEW.previous_lineage_epoch IS OLD.previous_lineage_epoch
      AND NEW.consumption_ordinal = OLD.consumption_ordinal + 1
      AND NEW.consumption_digest IS NOT NULL
      AND NEW.activated_at_millis IS OLD.activated_at_millis
      AND EXISTS (
        SELECT 1 FROM shop_correction_consumptions
        WHERE lineage_id = OLD.lineage_id
          AND lineage_epoch = OLD.lineage_epoch
          AND consumption_ordinal = NEW.consumption_ordinal
          AND history_digest = NEW.consumption_digest
          AND previous_consumption_digest IS OLD.consumption_digest
      )
    )
  )
  BEGIN
    SELECT RAISE(ABORT, 'Shop correction lineage transition is invalid');
  END
''';

const shopCorrectionConsumptionIntentsV17Sql = '''
  CREATE TABLE IF NOT EXISTS shop_correction_consumption_intents (
    consumption_request_id TEXT PRIMARY KEY NOT NULL CHECK (length(consumption_request_id) = 36),
    local_operation_id TEXT NOT NULL UNIQUE CHECK (length(local_operation_id) BETWEEN 1 AND 120),
    authorization_receipt_id TEXT NOT NULL UNIQUE CHECK (length(authorization_receipt_id) = 36),
    authorization_receipt_digest TEXT NOT NULL CHECK (length(authorization_receipt_digest) = 64),
    workspace_id TEXT NOT NULL CHECK (length(workspace_id) BETWEEN 1 AND 128),
    actor_id TEXT NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 128),
    capability TEXT NOT NULL CHECK (capability IN ('shop.sale.reverse', 'shop.sale.reconcile_wallet')),
    semantic_target_id TEXT NOT NULL CHECK (length(semantic_target_id) BETWEEN 1 AND 120),
    command_digest TEXT NOT NULL CHECK (length(command_digest) = 64),
    lineage_id TEXT NOT NULL CHECK (length(lineage_id) = 36),
    lineage_epoch INTEGER NOT NULL CHECK (lineage_epoch >= 1),
    recovery_envelope_json TEXT CHECK (recovery_envelope_json IS NULL OR length(recovery_envelope_json) BETWEEN 2 AND 8192),
    created_at_millis INTEGER NOT NULL CHECK (created_at_millis > 0)
  )
''';

const shopCorrectionConsumptionsV17Sql = '''
  CREATE TABLE IF NOT EXISTS shop_correction_consumptions (
    consumption_id TEXT PRIMARY KEY NOT NULL CHECK (length(consumption_id) = 36),
    consumption_request_id TEXT NOT NULL UNIQUE REFERENCES shop_correction_consumption_intents(consumption_request_id),
    local_operation_id TEXT NOT NULL UNIQUE REFERENCES shop_correction_consumption_intents(local_operation_id),
    authorization_receipt_id TEXT NOT NULL UNIQUE CHECK (length(authorization_receipt_id) = 36),
    authorization_receipt_digest TEXT NOT NULL CHECK (length(authorization_receipt_digest) = 64),
    workspace_id TEXT NOT NULL CHECK (length(workspace_id) BETWEEN 1 AND 128),
    actor_id TEXT NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 128),
    capability TEXT NOT NULL CHECK (capability IN ('shop.sale.reverse', 'shop.sale.reconcile_wallet')),
    semantic_target_id TEXT NOT NULL CHECK (length(semantic_target_id) BETWEEN 1 AND 120),
    command_digest TEXT NOT NULL CHECK (length(command_digest) = 64),
    lineage_id TEXT NOT NULL CHECK (length(lineage_id) = 36),
    lineage_epoch INTEGER NOT NULL CHECK (lineage_epoch >= 1),
    consumption_ordinal INTEGER NOT NULL UNIQUE CHECK (consumption_ordinal >= 1),
    previous_consumption_digest TEXT CHECK (previous_consumption_digest IS NULL OR length(previous_consumption_digest) = 64),
    history_digest TEXT NOT NULL UNIQUE CHECK (length(history_digest) = 64),
    consumed_at_millis INTEGER NOT NULL CHECK (consumed_at_millis > 0),
    key_id TEXT NOT NULL CHECK (length(key_id) BETWEEN 1 AND 32),
    signature TEXT NOT NULL CHECK (length(signature) = 86),
    CHECK ((consumption_ordinal = 1 AND previous_consumption_digest IS NULL)
      OR (consumption_ordinal > 1 AND previous_consumption_digest IS NOT NULL))
  )
''';

const shopSaleReversalsRequireConsumptionV17Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_sale_reversals_require_consumption
  BEFORE INSERT ON shop_sale_reversals
  WHEN EXISTS (SELECT 1 FROM shop_correction_lineage_state)
  AND NOT EXISTS (
    SELECT 1 FROM shop_correction_consumptions
    WHERE local_operation_id = NEW.operation_id
      AND authorization_receipt_id = NEW.authorization_receipt_id
      AND authorization_receipt_digest = NEW.authorization_receipt_digest
      AND workspace_id = NEW.authorization_workspace_id
      AND actor_id = NEW.authorized_actor_id
      AND capability = 'shop.sale.reverse'
      AND semantic_target_id = NEW.sale_id
      AND command_digest = NEW.authorization_command_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'Shop reversal requires global consumption proof');
  END
''';

const shopWalletReconciliationsRequireConsumptionV17Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_wallet_reconciliations_require_consumption
  BEFORE INSERT ON shop_wallet_reversal_reconciliations
  WHEN EXISTS (SELECT 1 FROM shop_correction_lineage_state)
  AND NOT EXISTS (
    SELECT 1 FROM shop_correction_consumptions
    WHERE local_operation_id = NEW.operation_id
      AND authorization_receipt_id = NEW.authorization_receipt_id
      AND authorization_receipt_digest = NEW.authorization_receipt_digest
      AND workspace_id = NEW.authorization_workspace_id
      AND actor_id = NEW.authorized_actor_id
      AND capability = 'shop.sale.reconcile_wallet'
      AND semantic_target_id = NEW.reversal_id
      AND command_digest = NEW.authorization_command_digest
  )
  BEGIN
    SELECT RAISE(ABORT, 'Shop reconciliation requires global consumption proof');
  END
''';

Map<String, String>
shopCorrectionConsumptionSchemaDefinitionsV17() => <String, String>{
  'shop_correction_lineage_state': shopCorrectionLineageStateV17Sql,
  'shop_correction_lineage_state_guard_update':
      shopCorrectionLineageStateGuardUpdateV17Sql,
  'shop_correction_lineage_state_no_delete': shopImmutableTriggerV11Sql(
    table: 'shop_correction_lineage_state',
    operation: 'delete',
    message: 'Shop correction lineage history cannot be deleted',
  ),
  'shop_correction_consumption_intents': shopCorrectionConsumptionIntentsV17Sql,
  'shop_correction_consumptions': shopCorrectionConsumptionsV17Sql,
  'shop_correction_consumption_intents_no_update': shopImmutableTriggerV11Sql(
    table: 'shop_correction_consumption_intents',
    operation: 'update',
    message: 'Shop correction consumption intents are immutable',
  ),
  'shop_correction_consumption_intents_no_delete': shopImmutableTriggerV11Sql(
    table: 'shop_correction_consumption_intents',
    operation: 'delete',
    message: 'Shop correction consumption intents are immutable',
  ),
  'shop_correction_consumptions_no_update': shopImmutableTriggerV11Sql(
    table: 'shop_correction_consumptions',
    operation: 'update',
    message: 'Shop correction consumption proofs are immutable',
  ),
  'shop_correction_consumptions_no_delete': shopImmutableTriggerV11Sql(
    table: 'shop_correction_consumptions',
    operation: 'delete',
    message: 'Shop correction consumption proofs are immutable',
  ),
  'shop_sale_reversals_require_consumption':
      shopSaleReversalsRequireConsumptionV17Sql,
  'shop_wallet_reconciliations_require_consumption':
      shopWalletReconciliationsRequireConsumptionV17Sql,
};

String canonicalShopSchemaSql(String value) {
  final output = StringBuffer();
  final ifNotExists = RegExp(r'if\s+not\s+exists\b', caseSensitive: false);
  var index = 0;
  var pendingSpace = false;
  while (index < value.length) {
    final character = value[index];
    if (character == "'" ||
        character == '"' ||
        character == '`' ||
        character == '[') {
      if (pendingSpace && output.length > 0) output.write(' ');
      pendingSpace = false;
      final closing = character == '[' ? ']' : character;
      output.write(character);
      index++;
      while (index < value.length) {
        final quoted = value[index];
        output.write(quoted);
        index++;
        if (quoted != closing) continue;
        if (closing != ']' && index < value.length && value[index] == closing) {
          output.write(value[index]);
          index++;
          continue;
        }
        break;
      }
      continue;
    }

    final optionalClause = ifNotExists.matchAsPrefix(value, index);
    final hasWordBefore =
        index > 0 && RegExp(r'[A-Za-z0-9_]').hasMatch(value[index - 1]);
    if (!hasWordBefore && optionalClause != null) {
      index = optionalClause.end;
      pendingSpace = true;
      continue;
    }
    if (RegExp(r'\s').hasMatch(character)) {
      pendingSpace = true;
      index++;
      continue;
    }
    if (pendingSpace && output.length > 0) output.write(' ');
    pendingSpace = false;
    output.write(character.toLowerCase());
    index++;
  }
  return output.toString().trim();
}

enum _ShopUpgradeOrigin {
  legacy,
  correctionV11,
  profileV11,
  correctionWorkspaceV12,
  profileWorkspaceCollisionV12,
  unifiedV13,
  unifiedV14,
  unifiedV15,
  unifiedV16,
}

class _ShopCorrectionReconciliationRequired implements Exception {
  const _ShopCorrectionReconciliationRequired(this.message);

  final String message;
}

enum _ColumnGroupState { none, partial, exact }

class _ShopSchemaObject {
  const _ShopSchemaObject({
    required this.type,
    required this.table,
    required this.sql,
  });

  final String type;
  final String table;
  final String sql;
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
  static const _testMutationBypassAvailable = !bool.fromEnvironment(
    'dart.vm.product',
  );

  static const maxProductThumbnailBytes = 192 * 1024;
  static const maxProductThumbnailsTotalBytes = 32 * 1024 * 1024;

  /// Keep the first-launch restore target and Drift's opened database identical.
  static File privateDatabaseFile(Directory documents) =>
      File('${documents.path}${Platform.pathSeparator}supermega_shop.sqlite');

  /// Migrates and fully opens a restore candidate before it is published.
  ///
  /// DELETE journaling keeps all transient state beside the staged file and
  /// guarantees that closing the database leaves one self-contained SQLite
  /// file for the restore layer to verify and hard-link without replacement.
  static Future<void> migrateAndVerifyRestoreFile(
    File file, {
    ShopCorrectionReceiptVerifier? correctionReceiptVerifier,
  }) async {
    final database = ShopDatabase.withCorrectionReceiptVerifier(
      executor: NativeDatabase(
        file,
        setup: (raw) => raw.execute('PRAGMA journal_mode = DELETE'),
      ),
      correctionReceiptVerifier:
          correctionReceiptVerifier ??
          ShopCorrectionReceiptVerifier.production(),
    );
    try {
      await database.verifyReadyForUse();
      await database.markCorrectionRestorePending();
      await database.verifyReadyForUse();
      final row = await database
          .customSelect('PRAGMA user_version')
          .getSingle();
      if (row.read<int>('user_version') != database.schemaVersion) {
        throw StateError('The staged Shop restore did not reach schema v17.');
      }
    } finally {
      await database.close();
    }
  }

  factory ShopDatabase.inPrivateDocuments(
    Directory documents, {
    ShopCorrectionReceiptVerifier? correctionReceiptVerifier,
  }) => ShopDatabase.withCorrectionReceiptVerifier(
    executor: driftDatabase(
      name: 'supermega_shop',
      native: DriftNativeOptions(
        databasePath: () async => privateDatabaseFile(documents).path,
      ),
    ),
    correctionReceiptVerifier:
        correctionReceiptVerifier ?? ShopCorrectionReceiptVerifier.production(),
  );

  ShopDatabase([QueryExecutor? executor])
    : this.withCorrectionReceiptVerifier(
        executor: executor,
        correctionReceiptVerifier: ShopCorrectionReceiptVerifier.production(),
      );

  ShopDatabase.withCorrectionReceiptVerifier({
    QueryExecutor? executor,
    required this.correctionReceiptVerifier,
    bool testOnlyAllowUnconsumedAuthorization = false,
  }) : assert(
         !testOnlyAllowUnconsumedAuthorization || _testMutationBypassAvailable,
         'Unconsumed correction authorization is unavailable in product builds.',
       ),
       testOnlyAllowUnconsumedAuthorization =
           testOnlyAllowUnconsumedAuthorization && _testMutationBypassAvailable,
       super(executor ?? driftDatabase(name: 'supermega_shop'));

  final ShopCorrectionReceiptVerifier correctionReceiptVerifier;
  final bool testOnlyAllowUnconsumedAuthorization;

  @override
  int get schemaVersion => 17;

  @override
  MigrationStrategy get migration => MigrationStrategy(
    onCreate: (migrator) => transaction(() async {
      await _requireEmptyCreateOrigin();
      await migrator.createAll();
      await _createWalletCheckoutTable();
      await _createCashShiftTables();
      await _createProductImageTable();
      await _createCounterDraftTable();
      await _createHeldSaleTable();
      await _createSaleReversalTables();
      await _createManagedWorkspaceBinding();
      await _createBusinessProfileTable();
      await _createMigrationProvenanceTable();
      await _createCorrectionAuthorizationProofLedgerV15();
      await _createMemberSchemaV16();
      await _createCorrectionConsumptionSchemaV17();
      await _requireUnifiedV17Schema();
    }),
    onUpgrade: (migrator, from, to) => transaction(() async {
      // Version 11 has two historical meanings. Classify the complete reserved
      // schema before the first DDL statement so a branch-hop database cannot
      // be silently relabelled or partially repaired.
      final origin = await _classifyUpgradeOrigin(from);
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
      final needsCorrectionSchema =
          from < 11 ||
          origin == _ShopUpgradeOrigin.profileV11 ||
          origin == _ShopUpgradeOrigin.profileWorkspaceCollisionV12;
      if (needsCorrectionSchema) {
        // The historical profile/workspace collision can retain a binding
        // guard that references the correction tables it never received.
        // Remove it before DDL reparses every trigger; the workspace repair
        // below recreates the exact guard after the correction tables exist.
        if (origin == _ShopUpgradeOrigin.profileWorkspaceCollisionV12) {
          await customStatement(
            'DROP TRIGGER shop_managed_workspace_binding_insert_guard',
          );
        }
        await _createSaleReversalTables();
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
      }
      final needsWorkspaceSchema =
          from < 12 ||
          origin == _ShopUpgradeOrigin.profileWorkspaceCollisionV12;
      if (needsWorkspaceSchema) {
        // A legacy correction receipt is audit evidence, not workspace attach
        // authority. Leave the migrated database unbound until an explicit
        // authenticated selection is attached.
        await _createManagedWorkspaceBinding();
      }
      final profileAlreadyPresent =
          origin == _ShopUpgradeOrigin.profileV11 ||
          origin == _ShopUpgradeOrigin.profileWorkspaceCollisionV12;
      if (!profileAlreadyPresent) {
        await _createBusinessProfileTable();
      }
      await _createMigrationProvenanceTable();
      await _recordLegacyUnboundCorrectionHistory();
      await _createCorrectionAuthorizationProofLedger();
      if (from < 14) {
        await _recordLegacyCorrectionAuthorizationProofs();
      }
      if (from < 16) {
        await _migrateCorrectionAuthorizationProofLedgerV15();
        await _requireUnifiedV15Schema();
        await _createMemberSchemaV16();
      }
      await _requireUnifiedV16Schema();
      if (from < 17) {
        await _createCorrectionConsumptionSchemaV17();
      }
      await _requireUnifiedV17Schema();
    }),
    beforeOpen: (_) async {
      await customStatement('PRAGMA foreign_keys = ON');
      await _requireUnifiedV17Schema();
    },
  );

  Future<void> verifyReadyForUse() => _requireUnifiedV17Schema();

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
    await customStatement(shopCashShiftsOneOpenV6Sql);
    await customStatement('''
      CREATE TABLE IF NOT EXISTS shop_cash_shift_sales (
        sale_id TEXT PRIMARY KEY NOT NULL REFERENCES shop_sales(id),
        shift_id TEXT NOT NULL REFERENCES shop_cash_shifts(id)
      )
    ''');
    await customStatement(shopCashShiftSalesShiftIdV6Sql);
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
    await customStatement(shopHeldSalesUpdatedV10Sql);
  }

  Future<void> _createBusinessProfileTable() =>
      customStatement(shopBusinessProfileV11Sql);

  static String _newStoreRef() {
    final random = Random.secure();
    return List<int>.generate(
      32,
      (_) => random.nextInt(256),
    ).map((value) => value.toRadixString(16).padLeft(2, '0')).join();
  }

  Future<void> _createMemberSchemaV16() async {
    await customStatement(shopStoreIdentityV16Sql);
    await customStatement(shopMembersV16Sql);
    await customStatement(shopMemberCardsV16Sql);
    await customStatement(shopSaleMemberLinksV16Sql);
    await customStatement(shopWalletCheckoutMemberLinksV16Sql);
    final rows = await customSelect('SELECT singleton FROM shop_store_identity')
        .get();
    if (rows.isEmpty) {
      await customInsert(
        'INSERT INTO shop_store_identity '
        '(singleton, store_ref, created_at_millis) VALUES (1, ?, ?)',
        variables: [
          Variable<String>(_newStoreRef()),
          Variable<int>(DateTime.now().millisecondsSinceEpoch),
        ],
      );
    }
    final definitions = shopMemberSchemaDefinitionsV16();
    for (final entry in definitions.entries) {
      if (entry.key == 'shop_store_identity' ||
          entry.key == 'shop_members' ||
          entry.key == 'shop_member_cards' ||
          entry.key == 'shop_sale_member_links' ||
          entry.key == 'shop_wallet_checkout_member_links') {
        continue;
      }
      await customStatement(entry.value);
    }
  }

  Future<void> _createCorrectionConsumptionSchemaV17() async {
    for (final definition
        in shopCorrectionConsumptionSchemaDefinitionsV17().values) {
      await customStatement(definition);
    }
  }

  Future<void> _createMigrationProvenanceTable() =>
      customStatement(shopMigrationProvenanceV13Sql);

  Future<void> _createCorrectionAuthorizationProofLedger() async {
    for (final definition
        in shopAuthorizationProofSchemaDefinitionsV14().values) {
      await customStatement(definition);
    }
  }

  Future<void> _createCorrectionAuthorizationProofLedgerV15() async {
    for (final definition
        in shopAuthorizationProofSchemaDefinitionsV15().values) {
      await customStatement(definition);
    }
  }

  Future<void> _migrateCorrectionAuthorizationProofLedgerV15() async {
    final columns = await customSelect(
      'PRAGMA table_info(shop_correction_authorization_proofs)',
    ).get();
    if (columns.any(
      (row) => row.read<String>('name') == 'finalization_request_id',
    )) {
      return;
    }
    for (final trigger in const [
      'shop_correction_authorization_proofs_no_update',
      'shop_correction_authorization_proofs_no_delete',
      'shop_sale_reversals_require_signed_proof',
      'shop_wallet_reconciliations_require_signed_proof',
    ]) {
      await customStatement('DROP TRIGGER IF EXISTS $trigger');
    }
    await customStatement(
      'ALTER TABLE shop_correction_authorization_proofs '
      'RENAME TO shop_correction_authorization_proofs_v14',
    );
    await customStatement(shopCorrectionAuthorizationProofsV15Sql);
    await customStatement(
      'INSERT INTO shop_correction_authorization_proofs '
      '(receipt_id, proof_kind, local_operation_id, receipt_digest, key_id, '
      'signature, finalization_request_id, finalized_at_millis, workspace_id, '
      'actor_id, actor_label, actor_role, capability, source, command_digest, '
      'issued_at_millis, expires_at_millis, verified_at_millis) '
      'SELECT receipt_id, proof_kind, local_operation_id, receipt_digest, '
      'key_id, signature, NULL, NULL, workspace_id, actor_id, actor_label, '
      'actor_role, capability, source, command_digest, issued_at_millis, '
      'expires_at_millis, verified_at_millis '
      'FROM shop_correction_authorization_proofs_v14',
    );
    await customStatement(
      'DROP TABLE shop_correction_authorization_proofs_v14',
    );
    await _createCorrectionAuthorizationProofLedgerV15();
  }

  Future<void> _recordLegacyCorrectionAuthorizationProofs() async {
    for (final source in const [
      (table: 'shop_sale_reversals', capability: 'shop.sale.reverse'),
      (
        table: 'shop_wallet_reversal_reconciliations',
        capability: 'shop.sale.reconcile_wallet',
      ),
    ]) {
      final rows = await customSelect('SELECT * FROM ${source.table}').get();
      for (final row in rows) {
        final receiptId = row.read<String>('authorization_receipt_id');
        final receiptDigest = row.read<String>('authorization_receipt_digest');
        final workspaceId = row.read<String>('authorization_workspace_id');
        final actorId = row.read<String>('authorized_actor_id');
        final actorLabel = row.read<String>('authorized_actor_label');
        final actorRole = row.read<String>('authorized_actor_role');
        final capability = row.read<String>('authorization_capability');
        final receiptSource = row.read<String>('authorization_source');
        final commandDigest = row.read<String>('authorization_command_digest');
        final issuedAtMillis = row.read<int>('authorization_issued_at_millis');
        final verifiedAtMillis = row.read<int>(
          'authorization_verified_at_millis',
        );
        final expiresAtMillis = row.read<int>(
          'authorization_expires_at_millis',
        );
        if (capability != source.capability ||
            actorRole != 'owner' ||
            receiptSource != 'managed_membership_receipt_v1' ||
            issuedAtMillis <= 0 ||
            expiresAtMillis - issuedAtMillis !=
                const Duration(minutes: 5).inMilliseconds ||
            verifiedAtMillis < issuedAtMillis ||
            verifiedAtMillis > expiresAtMillis ||
            !shopLegacyCorrectionAuthorizationReceiptDigestMatchesV1(
              receiptDigest: receiptDigest,
              source: receiptSource,
              receiptId: receiptId,
              workspaceId: workspaceId,
              actorId: actorId,
              actorLabel: actorLabel,
              actorRole: actorRole,
              capability: capability,
              commandDigest: commandDigest,
              issuedAtMillis: issuedAtMillis,
              expiresAtMillis: expiresAtMillis,
            )) {
          throw StateError(
            'Legacy correction authorization evidence is invalid.',
          );
        }
        await customInsert(
          'INSERT INTO shop_correction_authorization_proofs '
          '(receipt_id, proof_kind, local_operation_id, receipt_digest, '
          'key_id, signature, workspace_id, actor_id, actor_label, actor_role, '
          'capability, source, command_digest, issued_at_millis, '
          'expires_at_millis, verified_at_millis) '
          'VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          variables: [
            Variable<String>(receiptId),
            Variable<String>(shopCorrectionAuthorizationProofKindLegacyV1),
            Variable<String>(row.read<String>('operation_id')),
            Variable<String>(receiptDigest),
            Variable<String>(workspaceId),
            Variable<String>(actorId),
            Variable<String>(actorLabel),
            Variable<String>(actorRole),
            Variable<String>(capability),
            Variable<String>(receiptSource),
            Variable<String>(commandDigest),
            Variable<int>(issuedAtMillis),
            Variable<int>(expiresAtMillis),
            Variable<int>(verifiedAtMillis),
          ],
        );
      }
    }
  }

  Future<void> _recordLegacyUnboundCorrectionHistory() async {
    final hasBinding = await customSelect(
      'SELECT 1 FROM shop_managed_workspace_binding LIMIT 1',
    ).getSingleOrNull();
    final hasCorrectionHistory = await customSelect(
      'SELECT 1 FROM shop_sale_reversals LIMIT 1',
    ).getSingleOrNull();
    final existing = await customSelect(
      'SELECT reason FROM shop_v13_migration_provenance WHERE singleton = 1',
    ).getSingleOrNull();
    if (hasBinding == null && hasCorrectionHistory != null) {
      if (existing != null &&
          existing.read<String>('reason') ==
              'legacy_unbound_correction_history') {
        return;
      }
      await customStatement(
        'INSERT INTO shop_v13_migration_provenance (singleton, reason) '
        "VALUES (1, 'legacy_unbound_correction_history')",
      );
    } else if (existing != null) {
      throw StateError('Shop migration provenance is inconsistent.');
    }
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

  Future<void> _createManagedWorkspaceBinding() async {
    await customStatement(shopManagedWorkspaceBindingV12Sql);
    for (final operation in const ['update', 'delete']) {
      await customStatement(
        shopImmutableTriggerV11Sql(
          table: 'shop_managed_workspace_binding',
          operation: operation,
          message: 'Managed Shop workspace binding is immutable',
        ),
      );
    }
    await customStatement(shopManagedWorkspaceBindingInsertGuardV12Sql);
    await customStatement(shopSaleReversalsRequireWorkspaceBindingV12Sql);
    await customStatement(
      shopWalletReversalReconciliationsRequireWorkspaceBindingV12Sql,
    );
  }

  ShopManagedWorkspaceBinding _managedWorkspaceBindingFromRow(QueryRow row) =>
      ShopManagedWorkspaceBinding(
        workspaceId: row.read<String>('workspace_id'),
        attachedActorId: row.read<String>('attached_actor_id'),
        discoveryContract: row.read<String>('discovery_contract'),
        attachedAtMillis: row.read<int>('attached_at_millis'),
      );

  Future<ShopManagedWorkspaceBinding?> readManagedWorkspaceBinding() async {
    final row = await customSelect(
      'SELECT workspace_id, attached_actor_id, discovery_contract, '
      'attached_at_millis FROM shop_managed_workspace_binding '
      'WHERE singleton = 1',
    ).getSingleOrNull();
    return row == null ? null : _managedWorkspaceBindingFromRow(row);
  }

  /// Irreversibly attaches this database to an authenticated discovery choice.
  ///
  /// Correction receipts are intentionally not accepted here. The caller must
  /// supply a workspace selection produced by authenticated workspace
  /// discovery. Reattaching the same workspace is idempotent; switching a
  /// database to another workspace is never allowed.
  Future<ShopManagedWorkspaceBinding> attachAuthenticatedManagedWorkspace(
    ShopAuthenticatedWorkspaceSelection authenticatedSelection,
  ) {
    return transaction(() async {
      final id = RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$');
      if (!id.hasMatch(authenticatedSelection.workspaceId) ||
          !id.hasMatch(authenticatedSelection.actorId) ||
          authenticatedSelection.directoryContract !=
              shopManagedWorkspaceDirectoryContract) {
        throw ArgumentError(
          'The authenticated managed-workspace selection is invalid.',
        );
      }

      final existing = await readManagedWorkspaceBinding();
      if (existing != null) {
        if (existing.workspaceId != authenticatedSelection.workspaceId) {
          throw StateError(
            'This Shop database is already attached to another workspace.',
          );
        }
        if (existing.attachedActorId != authenticatedSelection.actorId) {
          throw StateError(
            'This Shop database is attached to another authenticated actor.',
          );
        }
        return existing;
      }

      final conflictingHistory = await customSelect(
        'SELECT 1 FROM ('
        'SELECT authorization_workspace_id AS workspace_id, '
        'authorized_actor_id AS actor_id '
        'FROM shop_sale_reversals UNION ALL '
        'SELECT authorization_workspace_id AS workspace_id, '
        'authorized_actor_id AS actor_id '
        'FROM shop_wallet_reversal_reconciliations'
        ') WHERE workspace_id != ? OR actor_id != ? LIMIT 1',
        variables: [
          Variable<String>(authenticatedSelection.workspaceId),
          Variable<String>(authenticatedSelection.actorId),
        ],
      ).getSingleOrNull();
      if (conflictingHistory != null) {
        throw StateError(
          'Existing correction history belongs to another workspace.',
        );
      }

      final now = DateTime.now().millisecondsSinceEpoch;
      await customInsert(
        'INSERT INTO shop_managed_workspace_binding '
        '(singleton, workspace_id, discovery_contract, attached_actor_id, '
        'attached_at_millis) VALUES (1, ?, ?, ?, ?)',
        variables: [
          Variable<String>(authenticatedSelection.workspaceId),
          Variable<String>(authenticatedSelection.directoryContract),
          Variable<String>(authenticatedSelection.actorId),
          Variable<int>(now),
        ],
      );
      await customStatement(
        'DELETE FROM shop_v13_migration_provenance '
        "WHERE singleton = 1 AND reason = 'legacy_unbound_correction_history'",
      );
      return (await readManagedWorkspaceBinding())!;
    });
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

  Future<void> _requireEmptyCreateOrigin() async {
    final objects = await customSelect(
      "SELECT 1 FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' LIMIT 1",
    ).get();
    if (objects.isNotEmpty) {
      throw StateError(
        'A schema-zero Shop database must be empty before creation.',
      );
    }
  }

  Future<_ShopUpgradeOrigin> _classifyUpgradeOrigin(int from) async {
    if (from < 1 || from > 16) {
      throw StateError('This Shop database version cannot migrate to v17.');
    }
    if (from == 16) {
      await _requireUnifiedV16Schema();
      return _ShopUpgradeOrigin.unifiedV16;
    }
    if (from == 15) {
      await _requireUnifiedV15Schema();
      return _ShopUpgradeOrigin.unifiedV15;
    }
    if (from == 14) {
      await _requireUnifiedV14Schema();
      return _ShopUpgradeOrigin.unifiedV14;
    }
    if (from == 13) {
      await _requireUnifiedV13Schema();
      return _ShopUpgradeOrigin.unifiedV13;
    }
    await _requireDatabaseIntegrity();
    final objects = await _readSchemaObjects();
    if (objects.values.any((object) => object.type == 'view')) {
      throw StateError('This Shop database contains an unknown schema view.');
    }

    final auditDefinitions = shopReversalSchemaDefinitionsV11();
    final workspaceDefinitions = shopWorkspaceSchemaDefinitionsV12();
    final collisionDefinitions = shopWorkspaceCollisionPrefixDefinitionsV12();
    final auditNames = auditDefinitions.keys.toSet();
    final workspaceNames = workspaceDefinitions.keys.toSet();
    const profileNames = {'shop_business_profile'};
    final presentNames = objects.keys.toSet();
    final cashState = await _reversalCashColumnState();
    if (from >= 6 && !await _baseSchemaExact(from, objects)) {
      throw StateError('This Shop database has an unknown base schema.');
    }
    final hasAnyAuditObject = presentNames.intersection(auditNames).isNotEmpty;
    final hasAnyWorkspaceObject = presentNames
        .intersection(workspaceNames)
        .isNotEmpty;
    final hasProfileObject = presentNames.intersection(profileNames).isNotEmpty;
    final hasAnyAudit =
        hasAnyAuditObject || cashState != _ColumnGroupState.none;
    final auditExact =
        cashState == _ColumnGroupState.exact &&
        _definitionGroupExact(objects, auditDefinitions, auditNames);
    final workspaceExact = _definitionGroupExact(
      objects,
      workspaceDefinitions,
      workspaceNames,
    );
    final collisionWorkspaceExact = _definitionGroupExact(
      objects,
      collisionDefinitions,
      workspaceNames,
    );
    final profileExact =
        _definitionGroupExact(objects, const {
          'shop_business_profile': shopBusinessProfileV11Sql,
        }, profileNames) &&
        await _businessProfileRowsValid();

    bool triggersMatch(Iterable<Map<String, String>> groups) {
      final expected = <String>{
        for (final group in groups)
          for (final entry in group.entries)
            if (!canonicalShopSchemaSql(entry.value).startsWith('create table'))
              entry.key,
      };
      final actual = objects.entries
          .where((entry) => entry.value.type == 'trigger')
          .map((entry) => entry.key)
          .toSet();
      return actual.length == expected.length && actual.containsAll(expected);
    }

    _ShopUpgradeOrigin? origin;
    Set<String>? expectedNames;
    if (from < 11) {
      if (!hasAnyAudit &&
          !hasAnyWorkspaceObject &&
          !hasProfileObject &&
          triggersMatch(const [])) {
        origin = _ShopUpgradeOrigin.legacy;
        expectedNames = _expectedSchemaObjectNames(from);
      }
    } else if (from == 11) {
      if (auditExact &&
          !hasProfileObject &&
          !hasAnyWorkspaceObject &&
          triggersMatch([auditDefinitions])) {
        origin = _ShopUpgradeOrigin.correctionV11;
        expectedNames = {
          ..._expectedSchemaObjectNames(from),
          ...auditDefinitions.keys,
        };
      }
      if (profileExact &&
          !hasAnyAudit &&
          !hasAnyWorkspaceObject &&
          triggersMatch(const [])) {
        origin = _ShopUpgradeOrigin.profileV11;
        expectedNames = {
          ..._expectedSchemaObjectNames(from),
          'shop_business_profile',
        };
      }
    } else if (from == 12) {
      if (auditExact &&
          workspaceExact &&
          !hasProfileObject &&
          await _workspaceBindingRowsValid(allowUnboundHistory: true) &&
          triggersMatch([auditDefinitions, workspaceDefinitions])) {
        origin = _ShopUpgradeOrigin.correctionWorkspaceV12;
        expectedNames = {
          ..._expectedSchemaObjectNames(from),
          ...auditDefinitions.keys,
          ...workspaceDefinitions.keys,
        };
      }
      if (profileExact &&
          !hasAnyAudit &&
          collisionWorkspaceExact &&
          await _workspaceBindingIsEmpty() &&
          triggersMatch([collisionDefinitions])) {
        origin = _ShopUpgradeOrigin.profileWorkspaceCollisionV12;
        expectedNames = {
          ..._expectedSchemaObjectNames(from),
          ...collisionDefinitions.keys,
          'shop_business_profile',
        };
      }
    }

    if (origin != null &&
        (from < 6 || _sameSchemaObjectNames(objects, expectedNames!))) {
      return origin;
    }

    throw StateError(
      'This Shop database has an unknown or partial v11/v12 schema.',
    );
  }

  Future<void> _requireUnifiedV13Schema() async {
    await _requireDatabaseIntegrity();
    final objects = await _readSchemaObjects();
    final auditDefinitions = shopReversalSchemaDefinitionsV11();
    final workspaceDefinitions = shopWorkspaceSchemaDefinitionsV12();
    final expectedTriggers = <String>{
      for (final definitions in [auditDefinitions, workspaceDefinitions])
        for (final entry in definitions.entries)
          if (!canonicalShopSchemaSql(entry.value).startsWith('create table'))
            entry.key,
    };
    final actualTriggers = objects.entries
        .where((entry) => entry.value.type == 'trigger')
        .map((entry) => entry.key)
        .toSet();
    final expectedNames = {
      ..._expectedSchemaObjectNames(13),
      ...auditDefinitions.keys,
      ...workspaceDefinitions.keys,
      'shop_business_profile',
      'shop_v13_migration_provenance',
    };
    final valid =
        objects.values.every((object) => object.type != 'view') &&
        await _baseSchemaExact(13, objects) &&
        _sameSchemaObjectNames(objects, expectedNames) &&
        await _reversalCashColumnState() == _ColumnGroupState.exact &&
        _definitionGroupExact(
          objects,
          auditDefinitions,
          auditDefinitions.keys.toSet(),
        ) &&
        _definitionGroupExact(
          objects,
          workspaceDefinitions,
          workspaceDefinitions.keys.toSet(),
        ) &&
        _definitionGroupExact(
          objects,
          const {'shop_business_profile': shopBusinessProfileV11Sql},
          const {'shop_business_profile'},
        ) &&
        _definitionGroupExact(
          objects,
          const {
            'shop_v13_migration_provenance': shopMigrationProvenanceV13Sql,
          },
          const {'shop_v13_migration_provenance'},
        ) &&
        await _businessProfileRowsValid() &&
        await _v13WorkspaceBindingRowsValid() &&
        actualTriggers.length == expectedTriggers.length &&
        actualTriggers.containsAll(expectedTriggers);
    if (!valid) {
      throw StateError('The unified Shop v13 schema failed verification.');
    }
  }

  Future<void> _requireUnifiedV14Schema() async {
    await _requireDatabaseIntegrity();
    final objects = await _readSchemaObjects();
    final auditDefinitions = shopReversalSchemaDefinitionsV11();
    final workspaceDefinitions = shopWorkspaceSchemaDefinitionsV12();
    final proofDefinitions = shopAuthorizationProofSchemaDefinitionsV14();
    final expectedTriggers = <String>{
      for (final definitions in [
        auditDefinitions,
        workspaceDefinitions,
        proofDefinitions,
      ])
        for (final entry in definitions.entries)
          if (!canonicalShopSchemaSql(entry.value).startsWith('create table'))
            entry.key,
    };
    final actualTriggers = objects.entries
        .where((entry) => entry.value.type == 'trigger')
        .map((entry) => entry.key)
        .toSet();
    final expectedNames = {
      ..._expectedSchemaObjectNames(14),
      ...auditDefinitions.keys,
      ...workspaceDefinitions.keys,
      ...proofDefinitions.keys,
      'shop_business_profile',
      'shop_v13_migration_provenance',
    };
    final valid =
        objects.values.every((object) => object.type != 'view') &&
        await _baseSchemaExact(14, objects) &&
        _sameSchemaObjectNames(objects, expectedNames) &&
        await _reversalCashColumnState() == _ColumnGroupState.exact &&
        _definitionGroupExact(
          objects,
          auditDefinitions,
          auditDefinitions.keys.toSet(),
        ) &&
        _definitionGroupExact(
          objects,
          workspaceDefinitions,
          workspaceDefinitions.keys.toSet(),
        ) &&
        _definitionGroupExact(
          objects,
          proofDefinitions,
          proofDefinitions.keys.toSet(),
        ) &&
        _definitionGroupExact(
          objects,
          const {'shop_business_profile': shopBusinessProfileV11Sql},
          const {'shop_business_profile'},
        ) &&
        _definitionGroupExact(
          objects,
          const {
            'shop_v13_migration_provenance': shopMigrationProvenanceV13Sql,
          },
          const {'shop_v13_migration_provenance'},
        ) &&
        await _businessProfileRowsValid() &&
        await _v14WorkspaceBindingRowsValid() &&
        await _v15CorrectionAuthorizationProofsValid(v15: false) &&
        actualTriggers.length == expectedTriggers.length &&
        actualTriggers.containsAll(expectedTriggers);
    if (!valid) {
      throw StateError('The unified Shop v14 schema failed verification.');
    }
  }

  Future<void> _requireUnifiedV15Schema() async {
    await _requireDatabaseIntegrity();
    final objects = await _readSchemaObjects();
    final auditDefinitions = shopReversalSchemaDefinitionsV11();
    final workspaceDefinitions = shopWorkspaceSchemaDefinitionsV12();
    final proofDefinitions = shopAuthorizationProofSchemaDefinitionsV15();
    final expectedTriggers = <String>{
      for (final definitions in [
        auditDefinitions,
        workspaceDefinitions,
        proofDefinitions,
      ])
        for (final entry in definitions.entries)
          if (!canonicalShopSchemaSql(entry.value).startsWith('create table'))
            entry.key,
    };
    final actualTriggers = objects.entries
        .where((entry) => entry.value.type == 'trigger')
        .map((entry) => entry.key)
        .toSet();
    final expectedNames = {
      ..._expectedSchemaObjectNames(15),
      ...auditDefinitions.keys,
      ...workspaceDefinitions.keys,
      ...proofDefinitions.keys,
      'shop_business_profile',
      'shop_v13_migration_provenance',
    };
    final valid =
        objects.values.every((object) => object.type != 'view') &&
        await _baseSchemaExact(15, objects) &&
        _sameSchemaObjectNames(objects, expectedNames) &&
        await _reversalCashColumnState() == _ColumnGroupState.exact &&
        _definitionGroupExact(
          objects,
          auditDefinitions,
          auditDefinitions.keys.toSet(),
        ) &&
        _definitionGroupExact(
          objects,
          workspaceDefinitions,
          workspaceDefinitions.keys.toSet(),
        ) &&
        _definitionGroupExact(
          objects,
          proofDefinitions,
          proofDefinitions.keys.toSet(),
        ) &&
        _definitionGroupExact(
          objects,
          const {'shop_business_profile': shopBusinessProfileV11Sql},
          const {'shop_business_profile'},
        ) &&
        _definitionGroupExact(
          objects,
          const {
            'shop_v13_migration_provenance': shopMigrationProvenanceV13Sql,
          },
          const {'shop_v13_migration_provenance'},
        ) &&
        await _businessProfileRowsValid() &&
        await _v14WorkspaceBindingRowsValid() &&
        await _v15CorrectionAuthorizationProofsValid() &&
        actualTriggers.length == expectedTriggers.length &&
        actualTriggers.containsAll(expectedTriggers);
    if (!valid) {
      throw StateError('The unified Shop v15 schema failed verification.');
    }
  }

  Future<void> _requireUnifiedV16Schema() async {
    await _requireDatabaseIntegrity();
    final objects = await _readSchemaObjects();
    final auditDefinitions = shopReversalSchemaDefinitionsV11();
    final workspaceDefinitions = shopWorkspaceSchemaDefinitionsV12();
    final proofDefinitions = shopAuthorizationProofSchemaDefinitionsV15();
    final memberDefinitions = shopMemberSchemaDefinitionsV16();
    final expectedTriggers = <String>{
      for (final definitions in [
        auditDefinitions,
        workspaceDefinitions,
        proofDefinitions,
        memberDefinitions,
      ])
        for (final entry in definitions.entries)
          if (canonicalShopSchemaSql(entry.value).startsWith('create trigger'))
            entry.key,
    };
    final actualTriggers = objects.entries
        .where((entry) => entry.value.type == 'trigger')
        .map((entry) => entry.key)
        .toSet();
    final expectedNames = {
      ..._expectedSchemaObjectNames(16),
      ...auditDefinitions.keys,
      ...workspaceDefinitions.keys,
      ...proofDefinitions.keys,
      ...memberDefinitions.keys,
      'shop_business_profile',
      'shop_v13_migration_provenance',
    };
    final valid =
        objects.values.every((object) => object.type != 'view') &&
        await _baseSchemaExact(16, objects) &&
        _sameSchemaObjectNames(objects, expectedNames) &&
        await _reversalCashColumnState() == _ColumnGroupState.exact &&
        _definitionGroupExact(
          objects,
          auditDefinitions,
          auditDefinitions.keys.toSet(),
        ) &&
        _definitionGroupExact(
          objects,
          workspaceDefinitions,
          workspaceDefinitions.keys.toSet(),
        ) &&
        _definitionGroupExact(
          objects,
          proofDefinitions,
          proofDefinitions.keys.toSet(),
        ) &&
        _definitionGroupExact(
          objects,
          memberDefinitions,
          memberDefinitions.keys.toSet(),
        ) &&
        _definitionGroupExact(
          objects,
          const {'shop_business_profile': shopBusinessProfileV11Sql},
          const {'shop_business_profile'},
        ) &&
        _definitionGroupExact(
          objects,
          const {
            'shop_v13_migration_provenance': shopMigrationProvenanceV13Sql,
          },
          const {'shop_v13_migration_provenance'},
        ) &&
        await _businessProfileRowsValid() &&
        await _v14WorkspaceBindingRowsValid() &&
        await _v15CorrectionAuthorizationProofsValid() &&
        await _v16MemberRowsValid() &&
        actualTriggers.length == expectedTriggers.length &&
        actualTriggers.containsAll(expectedTriggers);
    if (!valid) {
      throw StateError('The unified Shop v16 schema failed verification.');
    }
  }

  Future<void> _requireUnifiedV17Schema() async {
    await _requireDatabaseIntegrity();
    final objects = await _readSchemaObjects();
    final auditDefinitions = shopReversalSchemaDefinitionsV11();
    final workspaceDefinitions = shopWorkspaceSchemaDefinitionsV12();
    final proofDefinitions = shopAuthorizationProofSchemaDefinitionsV15();
    final memberDefinitions = shopMemberSchemaDefinitionsV16();
    final consumptionDefinitions =
        shopCorrectionConsumptionSchemaDefinitionsV17();
    final definitionGroups = [
      auditDefinitions,
      workspaceDefinitions,
      proofDefinitions,
      memberDefinitions,
      consumptionDefinitions,
    ];
    final expectedTriggers = <String>{
      for (final definitions in definitionGroups)
        for (final entry in definitions.entries)
          if (canonicalShopSchemaSql(entry.value).startsWith('create trigger'))
            entry.key,
    };
    final actualTriggers = objects.entries
        .where((entry) => entry.value.type == 'trigger')
        .map((entry) => entry.key)
        .toSet();
    final expectedNames = {
      ..._expectedSchemaObjectNames(17),
      for (final definitions in definitionGroups) ...definitions.keys,
      'shop_business_profile',
      'shop_v13_migration_provenance',
    };
    final valid =
        objects.values.every((object) => object.type != 'view') &&
        await _baseSchemaExact(17, objects) &&
        _sameSchemaObjectNames(objects, expectedNames) &&
        await _reversalCashColumnState() == _ColumnGroupState.exact &&
        definitionGroups.every(
          (definitions) => _definitionGroupExact(
            objects,
            definitions,
            definitions.keys.toSet(),
          ),
        ) &&
        _definitionGroupExact(
          objects,
          const {'shop_business_profile': shopBusinessProfileV11Sql},
          const {'shop_business_profile'},
        ) &&
        _definitionGroupExact(
          objects,
          const {
            'shop_v13_migration_provenance': shopMigrationProvenanceV13Sql,
          },
          const {'shop_v13_migration_provenance'},
        ) &&
        await _businessProfileRowsValid() &&
        await _v14WorkspaceBindingRowsValid() &&
        await _v15CorrectionAuthorizationProofsValid() &&
        await _v16MemberRowsValid() &&
        await _v17CorrectionConsumptionRowsValid() &&
        actualTriggers.length == expectedTriggers.length &&
        actualTriggers.containsAll(expectedTriggers);
    if (!valid) {
      throw StateError('The unified Shop v17 schema failed verification.');
    }
  }

  Future<bool> _v16MemberRowsValid() async {
    final stores = await customSelect(
      'SELECT singleton, store_ref, created_at_millis FROM shop_store_identity',
    ).get();
    if (stores.length != 1) return false;
    final storeRef = stores.single.read<String>('store_ref');
    final hex = RegExp(r'^[0-9a-f]{64}$');
    if (stores.single.read<int>('singleton') != 1 ||
        !hex.hasMatch(storeRef) ||
        stores.single.read<int>('created_at_millis') <= 0) {
      return false;
    }
    final badMember = await customSelect(
      'SELECT 1 FROM shop_members WHERE store_ref != ? '
      "OR id NOT GLOB 'mem_[0-9a-f]*' OR length(id) != 36 "
      "OR display_code GLOB '*[^0-9]*' "
      'OR length(display_code) < 6 OR length(display_code) > 20 '
      "OR status NOT IN ('active', 'revoked') "
      'OR created_at_millis <= 0 OR updated_at_millis < created_at_millis '
      'LIMIT 1',
      variables: [Variable<String>(storeRef)],
    ).getSingleOrNull();
    if (badMember != null) return false;
    final badCard = await customSelect(
      'SELECT 1 FROM shop_member_cards AS card '
      'LEFT JOIN shop_members AS member ON member.id = card.member_id '
      'WHERE member.id IS NULL OR length(card.token_digest) != 64 '
      "OR card.token_digest GLOB '*[^0-9a-f]*' "
      'OR card.revision < 1 OR card.issued_at_millis <= 0 '
      "OR card.state NOT IN ('active', 'retired', 'revoked') "
      "OR (card.state = 'active' AND card.retired_at_millis IS NOT NULL) "
      "OR (card.state != 'active' AND card.retired_at_millis IS NULL) "
      "OR (card.state = 'active' AND member.status != 'active') "
      "OR (card.state = 'active' AND card.revision != (SELECT MAX(latest.revision) "
      'FROM shop_member_cards AS latest WHERE latest.member_id = card.member_id) '
      ') '
      'LIMIT 1',
    ).getSingleOrNull();
    if (badCard != null) return false;
    final duplicateActive = await customSelect(
      "SELECT 1 FROM shop_member_cards WHERE state = 'active' "
      'GROUP BY member_id HAVING COUNT(*) > 1 LIMIT 1',
    ).getSingleOrNull();
    if (duplicateActive != null) return false;
    final badRevisionHistory = await customSelect(
      'SELECT 1 FROM shop_member_cards AS card '
      'WHERE card.revision != (SELECT COUNT(*) FROM shop_member_cards AS prior '
      'WHERE prior.member_id = card.member_id '
      'AND prior.revision <= card.revision) '
      'OR EXISTS (SELECT 1 FROM shop_member_cards AS earlier '
      'WHERE earlier.member_id = card.member_id '
      'AND earlier.revision < card.revision '
      'AND earlier.issued_at_millis >= card.issued_at_millis) '
      'LIMIT 1',
    ).getSingleOrNull();
    if (badRevisionHistory != null) return false;
    final reservedCatalogCode = await customSelect(
      "SELECT 1 FROM shop_products WHERE upper(COALESCE(barcode, '')) LIKE 'SMC1.%' "
      "OR upper(COALESCE(sku, '')) LIKE 'SMC1.%' LIMIT 1",
    ).getSingleOrNull();
    if (reservedCatalogCode != null) return false;
    final badLink = await customSelect(
      'SELECT 1 FROM shop_sale_member_links AS link '
      'LEFT JOIN shop_sales AS sale ON sale.id = link.sale_id '
      'LEFT JOIN shop_sync_outbox AS event '
      'ON event.operation_id = sale.operation_id '
      'LEFT JOIN shop_members AS member ON member.id = link.member_id '
      'LEFT JOIN shop_member_cards AS card '
      'ON card.member_id = link.member_id '
      'AND card.revision = link.card_revision '
      'WHERE sale.id IS NULL OR member.id IS NULL OR card.member_id IS NULL '
      'OR member.display_code != link.display_code '
      'OR link.associated_at_millis != sale.created_at_millis '
      "OR json_extract(sale.request_fingerprint, '\$.memberId') IS NOT link.member_id "
      "OR json_extract(sale.request_fingerprint, '\$.memberCardRevision') IS NOT link.card_revision "
      'OR event.operation_id IS NULL '
      "OR json_extract(event.payload_json, '\$.memberId') IS NOT link.member_id "
      "OR json_extract(event.payload_json, '\$.memberCardRevision') IS NOT link.card_revision "
      "OR (sale.payment_method != 'cash' AND NOT EXISTS ("
      'SELECT 1 FROM shop_wallet_checkout_member_links AS wallet_link '
      'WHERE wallet_link.operation_id = sale.operation_id '
      'AND wallet_link.member_id = link.member_id '
      'AND wallet_link.card_revision = link.card_revision '
      'AND wallet_link.display_code = link.display_code)) '
      'LIMIT 1',
    ).getSingleOrNull();
    if (badLink != null) return false;
    final missingSaleLink = await customSelect(
      'SELECT 1 FROM shop_sales AS sale '
      'LEFT JOIN shop_sync_outbox AS event '
      'ON event.operation_id = sale.operation_id '
      'LEFT JOIN shop_sale_member_links AS link ON link.sale_id = sale.id '
      'WHERE link.sale_id IS NULL AND ('
      "(json_valid(sale.request_fingerprint) AND ("
      "json_type(sale.request_fingerprint, '\$.memberId') IS NOT NULL "
      "OR json_type(sale.request_fingerprint, '\$.memberCardRevision') IS NOT NULL)) "
      "OR (json_valid(event.payload_json) AND ("
      "json_type(event.payload_json, '\$.memberId') IS NOT NULL "
      "OR json_type(event.payload_json, '\$.memberCardRevision') IS NOT NULL))) "
      'LIMIT 1',
    ).getSingleOrNull();
    if (missingSaleLink != null) return false;
    final badWalletLink = await customSelect(
      'SELECT 1 FROM shop_wallet_checkout_member_links AS link '
      'LEFT JOIN shop_wallet_checkout_intents AS intent '
      'ON intent.operation_id = link.operation_id '
      'LEFT JOIN shop_members AS member ON member.id = link.member_id '
      'LEFT JOIN shop_member_cards AS card '
      'ON card.member_id = link.member_id '
      'AND card.revision = link.card_revision '
      'WHERE intent.operation_id IS NULL OR member.id IS NULL '
      'OR card.member_id IS NULL '
      'OR member.display_code != link.display_code '
      'OR link.associated_at_millis != intent.created_at_millis '
      "OR json_extract(intent.request_fingerprint, '\$.memberId') IS NOT link.member_id "
      "OR json_extract(intent.request_fingerprint, '\$.memberCardRevision') IS NOT link.card_revision "
      'LIMIT 1',
    ).getSingleOrNull();
    if (badWalletLink != null) return false;
    final missingWalletLink = await customSelect(
      'SELECT 1 FROM shop_wallet_checkout_intents AS intent '
      'LEFT JOIN shop_wallet_checkout_member_links AS link '
      'ON link.operation_id = intent.operation_id '
      'WHERE link.operation_id IS NULL '
      'AND json_valid(intent.request_fingerprint) AND ('
      "json_type(intent.request_fingerprint, '\$.memberId') IS NOT NULL "
      "OR json_type(intent.request_fingerprint, '\$.memberCardRevision') IS NOT NULL) "
      'LIMIT 1',
    ).getSingleOrNull();
    return missingWalletLink == null;
  }

  Future<bool> _v17CorrectionConsumptionRowsValid() async {
    final lineageRows = await customSelect(
      'SELECT * FROM shop_correction_lineage_state',
    ).get();
    if (lineageRows.length > 1) return false;
    final intents = await customSelect(
      'SELECT * FROM shop_correction_consumption_intents '
      'ORDER BY created_at_millis, consumption_request_id',
    ).get();
    final proofs = await customSelect(
      'SELECT * FROM shop_correction_consumptions ORDER BY consumption_ordinal',
    ).get();
    if (lineageRows.isEmpty) return intents.isEmpty && proofs.isEmpty;
    final lineage = lineageRows.single;
    final uuid = RegExp(
      r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    );
    final digest = RegExp(r'^[0-9a-f]{64}$');
    final identifier = RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$');
    final lifecycle = lineage.read<String>('lifecycle_state');
    final lineageId = lineage.read<String>('lineage_id');
    final lineageEpoch = lineage.read<int>('lineage_epoch');
    final ordinal = lineage.read<int>('consumption_ordinal');
    final watermark = lineage.readNullable<String>('consumption_digest');
    if (lineage.read<int>('singleton') != 1 ||
        !uuid.hasMatch(lineage.read<String>('activation_request_id')) ||
        !identifier.hasMatch(lineage.read<String>('workspace_id')) ||
        !identifier.hasMatch(lineage.read<String>('actor_id')) ||
        !uuid.hasMatch(lineageId) ||
        lineageEpoch < 1 ||
        !const {
          'active',
          'restore_pending',
          'reconciliation_required',
        }.contains(lifecycle) ||
        ordinal < 0 ||
        (ordinal == 0
            ? watermark != null
            : !digest.hasMatch(watermark ?? ''))) {
      return false;
    }
    if (proofs.length != ordinal) return false;
    for (final intent in intents) {
      final capability = intent.read<String>('capability');
      if (capability == 'shop.sale.reverse') {
        final authorization = shopFullSaleRecoveryAuthorization(
          intent.readNullable<String>('recovery_envelope_json'),
          localOperationId: intent.read<String>('local_operation_id'),
          authorizationReceiptId: intent.read<String>(
            'authorization_receipt_id',
          ),
          authorizationReceiptDigest: intent.read<String>(
            'authorization_receipt_digest',
          ),
          workspaceId: intent.read<String>('workspace_id'),
          actorId: intent.read<String>('actor_id'),
          capability: capability,
          semanticTargetId: intent.read<String>('semantic_target_id'),
          commandDigest: intent.read<String>('command_digest'),
        );
        if (authorization == null ||
            !await correctionReceiptVerifier.verify(authorization)) {
          return false;
        }
      }
    }
    String? previous;
    for (var index = 0; index < proofs.length; index++) {
      final row = proofs[index];
      final proof = ShopCorrectionConsumptionProof(
        consumptionId: row.read<String>('consumption_id'),
        consumptionRequestId: row.read<String>('consumption_request_id'),
        authorizationReceiptId: row.read<String>('authorization_receipt_id'),
        authorizationReceiptDigest: row.read<String>(
          'authorization_receipt_digest',
        ),
        workspaceId: row.read<String>('workspace_id'),
        actorId: row.read<String>('actor_id'),
        capability: row.read<String>('capability'),
        semanticTargetId: row.read<String>('semantic_target_id'),
        commandDigest: row.read<String>('command_digest'),
        lineageId: row.read<String>('lineage_id'),
        lineageEpoch: row.read<int>('lineage_epoch'),
        consumptionOrdinal: row.read<int>('consumption_ordinal'),
        previousConsumptionDigest: row.readNullable<String>(
          'previous_consumption_digest',
        ),
        historyDigest: row.read<String>('history_digest'),
        consumedAtMillis: row.read<int>('consumed_at_millis'),
        keyId: row.read<String>('key_id'),
        signature: row.read<String>('signature'),
      );
      if (proof.workspaceId != lineage.read<String>('workspace_id') ||
          proof.actorId != lineage.read<String>('actor_id') ||
          proof.lineageEpoch > lineageEpoch ||
          proof.consumptionOrdinal != index + 1 ||
          proof.previousConsumptionDigest != previous ||
          !await proof.verify(correctionReceiptVerifier)) {
        return false;
      }
      final intent = intents
          .where(
            (candidate) =>
                candidate.read<String>('consumption_request_id') ==
                proof.consumptionRequestId,
          )
          .toList(growable: false);
      if (intent.length != 1 ||
          intent.single.read<String>('local_operation_id') !=
              row.read<String>('local_operation_id') ||
          intent.single.read<String>('authorization_receipt_id') !=
              proof.authorizationReceiptId ||
          intent.single.read<String>('authorization_receipt_digest') !=
              proof.authorizationReceiptDigest ||
          intent.single.read<String>('workspace_id') != proof.workspaceId ||
          intent.single.read<String>('actor_id') != proof.actorId ||
          intent.single.read<String>('capability') != proof.capability ||
          intent.single.read<String>('semantic_target_id') !=
              proof.semanticTargetId ||
          intent.single.read<String>('command_digest') != proof.commandDigest ||
          intent.single.read<String>('lineage_id') != proof.lineageId ||
          intent.single.read<int>('lineage_epoch') != proof.lineageEpoch) {
        return false;
      }
      final effectTable = proof.capability == 'shop.sale.reverse'
          ? 'shop_sale_reversals'
          : 'shop_wallet_reversal_reconciliations';
      final effectTargetColumn = proof.capability == 'shop.sale.reverse'
          ? 'sale_id'
          : 'reversal_id';
      final effect = await customSelect(
        'SELECT authorization_receipt_digest, '
        'authorization_workspace_id, authorized_actor_id, '
        'authorization_capability, $effectTargetColumn AS semantic_target_id, '
        'authorization_command_digest FROM $effectTable WHERE operation_id = ? '
        'AND authorization_receipt_id = ? LIMIT 1',
        variables: [
          Variable<String>(intent.single.read<String>('local_operation_id')),
          Variable<String>(proof.authorizationReceiptId),
        ],
      ).getSingleOrNull();
      if (effect == null ||
          effect.read<String>('authorization_receipt_digest') !=
              proof.authorizationReceiptDigest ||
          effect.read<String>('authorization_workspace_id') !=
              proof.workspaceId ||
          effect.read<String>('authorized_actor_id') != proof.actorId ||
          effect.read<String>('authorization_capability') != proof.capability ||
          effect.read<String>('semantic_target_id') != proof.semanticTargetId ||
          effect.read<String>('authorization_command_digest') !=
              proof.commandDigest) {
        return false;
      }
      previous = proof.historyDigest;
    }
    return previous == watermark;
  }

  bool _proofMatchesCorrectionRow(QueryRow proof, QueryRow correction) =>
      proof.read<String>('receipt_id') ==
          correction.read<String>('authorization_receipt_id') &&
      proof.read<String>('local_operation_id') ==
          correction.read<String>('operation_id') &&
      proof.read<String>('receipt_digest') ==
          correction.read<String>('authorization_receipt_digest') &&
      proof.read<String>('workspace_id') ==
          correction.read<String>('authorization_workspace_id') &&
      proof.read<String>('actor_id') ==
          correction.read<String>('authorized_actor_id') &&
      proof.read<String>('actor_label') ==
          correction.read<String>('authorized_actor_label') &&
      proof.read<String>('actor_role') ==
          correction.read<String>('authorized_actor_role') &&
      proof.read<String>('capability') ==
          correction.read<String>('authorization_capability') &&
      proof.read<String>('source') ==
          correction.read<String>('authorization_source') &&
      proof.read<String>('command_digest') ==
          correction.read<String>('authorization_command_digest') &&
      proof.read<int>('issued_at_millis') ==
          correction.read<int>('authorization_issued_at_millis') &&
      proof.read<int>('expires_at_millis') ==
          correction.read<int>('authorization_expires_at_millis') &&
      proof.read<int>('verified_at_millis') ==
          correction.read<int>('authorization_verified_at_millis');

  Future<bool> _v15CorrectionAuthorizationProofsValid({bool v15 = true}) async {
    final proofs = await customSelect(
      'SELECT * FROM shop_correction_authorization_proofs '
      'ORDER BY receipt_id',
    ).get();
    final reversalCount = (await customSelect(
      'SELECT COUNT(*) AS total FROM shop_sale_reversals',
    ).getSingle()).read<int>('total');
    final reconciliationCount = (await customSelect(
      'SELECT COUNT(*) AS total FROM shop_wallet_reversal_reconciliations',
    ).getSingle()).read<int>('total');
    if (proofs.length != reversalCount + reconciliationCount) return false;
    final id = RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$');
    final digest = RegExp(r'^[0-9a-f]{64}$');
    final boundedText = RegExp(r'^[^\x00-\x1f\x7f]{1,160}$');
    final keyIdPattern = RegExp(r'^[a-z0-9][a-z0-9._-]{0,31}$');
    final signaturePattern = RegExp(r'^[A-Za-z0-9_-]{86}$');
    final uuid = RegExp(
      r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    );

    for (final proof in proofs) {
      final proofKind = proof.read<String>('proof_kind');
      final capability = proof.read<String>('capability');
      final table = switch (capability) {
        'shop.sale.reverse' => 'shop_sale_reversals',
        'shop.sale.reconcile_wallet' => 'shop_wallet_reversal_reconciliations',
        _ => null,
      };
      if (table == null) return false;
      final correction = await customSelect(
        'SELECT * FROM $table WHERE authorization_receipt_id = ? '
        'AND operation_id = ? LIMIT 1',
        variables: [
          Variable<String>(proof.read<String>('receipt_id')),
          Variable<String>(proof.read<String>('local_operation_id')),
        ],
      ).getSingleOrNull();
      if (correction == null ||
          !_proofMatchesCorrectionRow(proof, correction)) {
        return false;
      }

      final receiptDigest = proof.read<String>('receipt_digest');
      final source = proof.read<String>('source');
      final receiptId = proof.read<String>('receipt_id');
      final localOperationId = proof.read<String>('local_operation_id');
      final workspaceId = proof.read<String>('workspace_id');
      final actorId = proof.read<String>('actor_id');
      final actorLabel = proof.read<String>('actor_label');
      final actorRole = proof.read<String>('actor_role');
      final commandDigest = proof.read<String>('command_digest');
      final issuedAtMillis = proof.read<int>('issued_at_millis');
      final expiresAtMillis = proof.read<int>('expires_at_millis');
      final verifiedAtMillis = proof.read<int>('verified_at_millis');
      final keyId = proof.readNullable<String>('key_id');
      final signature = proof.readNullable<String>('signature');
      final finalizationRequestId = v15
          ? proof.readNullable<String>('finalization_request_id')
          : null;
      final finalizedAtMillis = v15
          ? proof.readNullable<int>('finalized_at_millis')
          : null;
      if (!boundedText.hasMatch(receiptId) ||
          receiptId != receiptId.trim() ||
          !boundedText.hasMatch(localOperationId) ||
          localOperationId != localOperationId.trim() ||
          !digest.hasMatch(receiptDigest) ||
          !id.hasMatch(workspaceId) ||
          !id.hasMatch(actorId) ||
          !boundedText.hasMatch(actorLabel) ||
          actorLabel != actorLabel.trim() ||
          actorRole != 'owner' ||
          !digest.hasMatch(commandDigest) ||
          issuedAtMillis <= 0 ||
          expiresAtMillis - issuedAtMillis !=
              const Duration(minutes: 5).inMilliseconds ||
          verifiedAtMillis < issuedAtMillis ||
          verifiedAtMillis > expiresAtMillis) {
        return false;
      }
      if (proofKind == shopCorrectionAuthorizationProofKindLegacyV1) {
        if (keyId != null ||
            signature != null ||
            finalizationRequestId != null ||
            finalizedAtMillis != null ||
            source != 'managed_membership_receipt_v1' ||
            !shopLegacyCorrectionAuthorizationReceiptDigestMatchesV1(
              receiptDigest: receiptDigest,
              source: source,
              receiptId: receiptId,
              workspaceId: workspaceId,
              actorId: actorId,
              actorLabel: actorLabel,
              actorRole: actorRole,
              capability: capability,
              commandDigest: commandDigest,
              issuedAtMillis: issuedAtMillis,
              expiresAtMillis: expiresAtMillis,
            )) {
          return false;
        }
        continue;
      }
      if (proofKind != shopCorrectionAuthorizationProofKindSignedV2 &&
          (!v15 || proofKind != shopCorrectionAuthorizationProofKindSignedV3)) {
        return false;
      }
      final isV3 = proofKind == shopCorrectionAuthorizationProofKindSignedV3;
      if (isV3
          ? (source != 'managed_membership_receipt_v1' ||
                finalizationRequestId == null ||
                !uuid.hasMatch(finalizationRequestId) ||
                finalizedAtMillis == null ||
                finalizedAtMillis != verifiedAtMillis)
          : (source != 'managed_membership_receipt_v1' ||
                finalizationRequestId != null ||
                finalizedAtMillis != null)) {
        return false;
      }
      if (keyId == null ||
          signature == null ||
          !keyIdPattern.hasMatch(keyId) ||
          !signaturePattern.hasMatch(signature) ||
          !await correctionReceiptVerifier.verify(
            ShopCorrectionAuthorization(
              contract: isV3
                  ? shopCorrectionAuthorizationReceiptContract
                  : shopHistoricalCorrectionAuthorizationReceiptContractV2,
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
              finalizedAtMillis: finalizedAtMillis,
              issuedAtMillis: issuedAtMillis,
              expiresAtMillis: expiresAtMillis,
              keyId: keyId,
              signature: signature,
            ),
          )) {
        return false;
      }
    }
    return true;
  }

  Future<void> _requireDatabaseIntegrity() async {
    final integrity = await customSelect('PRAGMA integrity_check').get();
    final brokenReferences = await customSelect('PRAGMA foreign_key_check')
        .get();
    if (integrity.length != 1 ||
        integrity.single.read<String>('integrity_check') != 'ok' ||
        brokenReferences.isNotEmpty) {
      throw StateError('The Shop database failed integrity checks.');
    }
  }

  Future<Map<String, _ShopSchemaObject>> _readSchemaObjects() async {
    final rows = await customSelect(
      "SELECT type, name, tbl_name, sql FROM sqlite_master "
      "WHERE name NOT LIKE 'sqlite_%' "
      "AND type IN ('table', 'trigger', 'view', 'index')",
    ).get();
    final objects = <String, _ShopSchemaObject>{};
    for (final row in rows) {
      final name = row.read<String>('name').toLowerCase();
      if (objects.containsKey(name)) {
        throw StateError('The Shop database has duplicate schema names.');
      }
      objects[name] = _ShopSchemaObject(
        type: row.read<String>('type').toLowerCase(),
        table: row.read<String>('tbl_name').toLowerCase(),
        sql: row.read<String>('sql'),
      );
    }
    return objects;
  }

  Set<String> _expectedSchemaObjectNames(int version) => {
    ...shopBaseTableColumnsForVersion(version).keys,
    ...shopCriticalIndexDefinitions(version).keys,
  };

  bool _sameSchemaObjectNames(
    Map<String, _ShopSchemaObject> objects,
    Set<String> expected,
  ) =>
      objects.length == expected.length &&
      objects.keys.toSet().containsAll(expected);

  Future<bool> _baseSchemaExact(
    int version,
    Map<String, _ShopSchemaObject> objects,
  ) async {
    final columns = shopBaseTableColumnsForVersion(version);
    if (columns.isEmpty) return false;
    for (final entry in columns.entries) {
      if (objects[entry.key]?.type != 'table' ||
          !await _tableColumnsExact(entry.key, entry.value)) {
        return false;
      }
    }
    final indexes = shopCriticalIndexDefinitions(version);
    return _definitionGroupExact(objects, indexes, indexes.keys.toSet());
  }

  Future<bool> _tableColumnsExact(String table, Set<String> expected) async {
    final rows = await customSelect('PRAGMA table_info($table)').get();
    final actual = rows
        .map((row) => row.read<String>('name').toLowerCase())
        .toSet();
    if (table == 'shop_cash_shifts') {
      actual.removeAll(const {
        'cash_reversal_count',
        'cash_reversal_total_mmk',
        'cash_drawer_outflow_mmk',
        'review_cash_reversal_count',
        'review_cash_drawer_outflow_mmk',
      });
    }
    return actual.length == expected.length && actual.containsAll(expected);
  }

  bool _definitionGroupExact(
    Map<String, _ShopSchemaObject> objects,
    Map<String, String> expected,
    Set<String> reservedNames,
  ) {
    final present = objects.keys.toSet().intersection(reservedNames);
    if (present.length != expected.length ||
        !present.containsAll(expected.keys)) {
      return false;
    }
    for (final entry in expected.entries) {
      final object = objects[entry.key];
      final expectedType = shopSchemaObjectTypeForDefinition(entry.value);
      if (object == null ||
          object.type != expectedType ||
          canonicalShopSchemaSql(object.sql) !=
              canonicalShopSchemaSql(entry.value)) {
        return false;
      }
      if (expectedType == 'trigger' || expectedType == 'index') {
        final target = RegExp(r'\bon\s+([a-z0-9_]+)')
            .firstMatch(canonicalShopSchemaSql(entry.value));
        if (target == null || object.table != target.group(1)) return false;
      }
    }
    return true;
  }

  Future<_ColumnGroupState> _reversalCashColumnState() async {
    const names = [
      'cash_reversal_count',
      'cash_reversal_total_mmk',
      'cash_drawer_outflow_mmk',
      'review_cash_reversal_count',
      'review_cash_drawer_outflow_mmk',
    ];
    final rows = await customSelect('PRAGMA table_info(shop_cash_shifts)')
        .get();
    final byName = <String, QueryRow>{
      for (final row in rows) row.read<String>('name').toLowerCase(): row,
    };
    final present = names.where(byName.containsKey).toList(growable: false);
    if (present.isEmpty) return _ColumnGroupState.none;
    if (present.length != names.length) return _ColumnGroupState.partial;
    final orderedNames = rows
        .map((row) => row.read<String>('name').toLowerCase())
        .toList(growable: false);
    if (orderedNames.length < names.length ||
        !_sameStrings(
          orderedNames.sublist(orderedNames.length - names.length),
          names,
        )) {
      return _ColumnGroupState.partial;
    }
    for (final name in names) {
      final row = byName[name]!;
      if (row.read<String>('type').toUpperCase() != 'INTEGER' ||
          row.read<int>('notnull') != 0 ||
          row.data['dflt_value'] != null ||
          row.read<int>('pk') != 0) {
        return _ColumnGroupState.partial;
      }
    }
    return _ColumnGroupState.exact;
  }

  bool _sameStrings(List<String> actual, List<String> expected) {
    if (actual.length != expected.length) return false;
    for (var index = 0; index < actual.length; index++) {
      if (actual[index] != expected[index]) return false;
    }
    return true;
  }

  Future<bool> _businessProfileRowsValid() async {
    try {
      final rows = await customSelect(
        'SELECT singleton_key, schema_id, template_id, template_version, '
        'updated_at_millis FROM shop_business_profile',
      ).get();
      if (rows.length > 1) return false;
      if (rows.isEmpty) return true;
      const templates = {
        'mini-mart',
        'cafe-takeaway',
        'fashion-accessories',
        'beauty-household',
        'custom',
      };
      final row = rows.single;
      final updatedAt = row.data['updated_at_millis'];
      return row.data['singleton_key'] == 1 &&
          row.data['schema_id'] == 'supermega.shop.business_profile.v1' &&
          templates.contains(row.data['template_id']) &&
          row.data['template_version'] == 1 &&
          updatedAt is int &&
          updatedAt >= 0;
    } on Object {
      return false;
    }
  }

  Future<bool> _workspaceBindingIsEmpty() async {
    try {
      final rows = await customSelect(
        'SELECT 1 FROM shop_managed_workspace_binding LIMIT 1',
      ).get();
      return rows.isEmpty;
    } on Object {
      return false;
    }
  }

  Future<bool> _workspaceBindingRowsValid({
    required bool allowUnboundHistory,
  }) async {
    try {
      final bindings = await customSelect(
        'SELECT singleton, workspace_id, discovery_contract, '
        'attached_actor_id, attached_at_millis '
        'FROM shop_managed_workspace_binding',
      ).get();
      if (bindings.length > 1) return false;
      final correctionRows = await customSelect(
        'SELECT authorization_workspace_id AS workspace_id, '
        'authorized_actor_id AS actor_id '
        'FROM shop_sale_reversals UNION ALL '
        'SELECT authorization_workspace_id AS workspace_id, '
        'authorized_actor_id AS actor_id '
        'FROM shop_wallet_reversal_reconciliations',
      ).get();
      final workspaces = correctionRows
          .map((row) => row.data['workspace_id'])
          .toList(growable: false);
      final actors = correctionRows
          .map((row) => row.data['actor_id'])
          .toList(growable: false);
      final id = RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$');
      if (workspaces.any((value) => value is! String || !id.hasMatch(value)) ||
          actors.any((value) => value is! String || !id.hasMatch(value))) {
        return false;
      }
      if (bindings.isEmpty) return allowUnboundHistory || workspaces.isEmpty;
      final binding = bindings.single;
      final workspaceId = binding.data['workspace_id'];
      final actorId = binding.data['attached_actor_id'];
      final attachedAt = binding.data['attached_at_millis'];
      return binding.data['singleton'] == 1 &&
          workspaceId is String &&
          id.hasMatch(workspaceId) &&
          binding.data['discovery_contract'] ==
              shopManagedWorkspaceDirectoryContract &&
          actorId is String &&
          id.hasMatch(actorId) &&
          attachedAt is int &&
          attachedAt > 0 &&
          workspaces.every((value) => value == workspaceId) &&
          actors.every((value) => value == actorId);
    } on Object {
      return false;
    }
  }

  Future<bool> _v13WorkspaceBindingRowsValid() async {
    try {
      final provenance = await customSelect(
        'SELECT singleton, reason FROM shop_v13_migration_provenance',
      ).get();
      if (provenance.length > 1 ||
          provenance.any(
            (row) =>
                row.data['singleton'] != 1 ||
                row.data['reason'] != 'legacy_unbound_correction_history',
          )) {
        return false;
      }
      final bindings = await customSelect(
        'SELECT singleton, workspace_id, discovery_contract, '
        'attached_actor_id, attached_at_millis '
        'FROM shop_managed_workspace_binding',
      ).get();
      if (bindings.length > 1) return false;
      final correctionRows = await customSelect(
        'SELECT authorization_workspace_id AS workspace_id, '
        'authorized_actor_id AS actor_id '
        'FROM shop_sale_reversals UNION ALL '
        'SELECT authorization_workspace_id AS workspace_id, '
        'authorized_actor_id AS actor_id '
        'FROM shop_wallet_reversal_reconciliations',
      ).get();
      final workspaces = correctionRows
          .map((row) => row.data['workspace_id'])
          .toList(growable: false);
      final actors = correctionRows
          .map((row) => row.data['actor_id'])
          .toList(growable: false);
      final id = RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$');
      if (workspaces.any((value) => value is! String || !id.hasMatch(value)) ||
          actors.any((value) => value is! String || !id.hasMatch(value))) {
        return false;
      }
      if (bindings.isEmpty) {
        return workspaces.isEmpty ? provenance.isEmpty : provenance.length == 1;
      }
      if (provenance.isNotEmpty) return false;
      final binding = bindings.single;
      final workspaceId = binding.data['workspace_id'];
      final actorId = binding.data['attached_actor_id'];
      final attachedAt = binding.data['attached_at_millis'];
      return binding.data['singleton'] == 1 &&
          workspaceId is String &&
          id.hasMatch(workspaceId) &&
          binding.data['discovery_contract'] ==
              shopManagedWorkspaceDirectoryContract &&
          actorId is String &&
          id.hasMatch(actorId) &&
          attachedAt is int &&
          attachedAt > 0 &&
          workspaces.every((value) => value == workspaceId) &&
          actors.every((value) => value == actorId);
    } on Object {
      return false;
    }
  }

  Future<bool> _v14WorkspaceBindingRowsValid() async {
    if (!await _v13WorkspaceBindingRowsValid()) return false;
    try {
      final binding = await customSelect(
        'SELECT 1 FROM shop_managed_workspace_binding LIMIT 1',
      ).getSingleOrNull();
      if (binding != null) return true;
      final signedProof = await customSelect(
        'SELECT 1 FROM shop_correction_authorization_proofs '
        'WHERE proof_kind != ? LIMIT 1',
        variables: [
          Variable<String>(shopCorrectionAuthorizationProofKindLegacyV1),
        ],
      ).getSingleOrNull();
      return signedProof == null;
    } on Object {
      return false;
    }
  }

  /// Create and read back a consistent local SQLite snapshot. This plaintext
  /// file is an internal building block, not a user-shareable backup format.
  Future<void> exportVerifiedLocalSnapshot(File target) async {
    final lineage = await readCorrectionLineageState();
    if (lineage != null && !lineage.canConsume) {
      throw StateError(
        'Resolve the pending Shop correction before creating a backup.',
      );
    }
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
      final snapshot = ShopDatabase.withCorrectionReceiptVerifier(
        executor: NativeDatabase(target),
        correctionReceiptVerifier: correctionReceiptVerifier,
      );
      try {
        await snapshot.verifyReadyForUse();
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
        (cleanSku != null && cleanSku.length > 80) ||
        _usesReservedMemberCardNamespace(cleanBarcode) ||
        _usesReservedMemberCardNamespace(cleanSku)) {
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
        (cleanBarcode != null && cleanBarcode.length > 64) ||
        _usesReservedMemberCardNamespace(cleanBarcode)) {
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
            : await _walletCheckoutFromRow(pendingRows.single);
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
          _usesReservedMemberCardNamespace(sku) ||
          (barcode != null &&
              (barcode.length > 64 || !seenBarcodes.add(barcode))) ||
          _usesReservedMemberCardNamespace(barcode)) {
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

  static final RegExp _memberCardTokenPattern = RegExp(
    r'^SMC1\.[A-Za-z0-9_-]{43}$',
  );

  static bool _usesReservedMemberCardNamespace(String? value) =>
      value != null && value.toUpperCase().startsWith('SMC1.');

  Future<String> _memberCardDigest(String token) =>
      _sha256Hex('supermega.shop.member-card.lookup.v1\u0000$token');

  bool _memberCardTokenIsCanonical(String token) {
    if (!_memberCardTokenPattern.hasMatch(token)) return false;
    try {
      final encoded = token.substring(5);
      final bytes = base64Url.decode('$encoded=');
      return bytes.length == 32 &&
          base64Url.encode(bytes).replaceAll('=', '') == encoded;
    } on FormatException {
      return false;
    }
  }

  Future<ShopMemberCardMatch?> _lookupKnownMemberCard(String token) async {
    final clean = token.trim();
    if (!_memberCardTokenIsCanonical(clean)) return null;
    final digest = await _memberCardDigest(clean);
    final row = await customSelect(
      'SELECT member.id, member.display_code, member.status, '
      'member.created_at_millis, member.updated_at_millis, card.revision '
      'FROM shop_member_cards AS card '
      'JOIN shop_members AS member ON member.id = card.member_id '
      'JOIN shop_store_identity AS store '
      'ON store.store_ref = member.store_ref AND store.singleton = 1 '
      'WHERE card.token_digest = ? LIMIT 1',
      variables: [Variable<String>(digest)],
    ).getSingleOrNull();
    return row == null
        ? null
        : ShopMemberCardMatch(
            member: _memberFromRow(row),
            cardRevision: row.read<int>('revision'),
          );
  }

  Future<String> readStoreRef() async {
    final row = await customSelect(
      'SELECT store_ref FROM shop_store_identity WHERE singleton = 1',
    ).getSingle();
    return row.read<String>('store_ref');
  }

  ShopMember _memberFromRow(QueryRow row) => ShopMember(
    id: row.read<String>('id'),
    displayCode: row.read<String>('display_code'),
    status: row.read<String>('status'),
    createdAtMillis: row.read<int>('created_at_millis'),
    updatedAtMillis: row.read<int>('updated_at_millis'),
  );

  /// Looks up an identification-only card. The raw token is never persisted.
  ///
  /// Invalid, unknown, stale, retired, revoked, and foreign-store cards all
  /// return null so this boundary does not enumerate member state.
  Future<ShopMemberCardMatch?> lookupActiveMemberCard(String token) async {
    final clean = token.trim();
    if (!_memberCardTokenIsCanonical(clean)) return null;
    final digest = await _memberCardDigest(clean);
    final row = await customSelect(
      'SELECT member.id, member.display_code, member.status, '
      'member.created_at_millis, member.updated_at_millis, card.revision '
      'FROM shop_member_cards AS card '
      'JOIN shop_members AS member ON member.id = card.member_id '
      'JOIN shop_store_identity AS store '
      'ON store.store_ref = member.store_ref AND store.singleton = 1 '
      'WHERE card.token_digest = ? AND card.state = ? '
      'AND member.status = ? '
      'AND card.revision = (SELECT MAX(latest.revision) '
      'FROM shop_member_cards AS latest WHERE latest.member_id = member.id) '
      'LIMIT 1',
      variables: [
        Variable<String>(digest),
        const Variable<String>('active'),
        const Variable<String>('active'),
      ],
    ).getSingleOrNull();
    return row == null
        ? null
        : ShopMemberCardMatch(
            member: _memberFromRow(row),
            cardRevision: row.read<int>('revision'),
          );
  }

  /// Presentation-only lookup used inside the dedicated member selector.
  Future<ShopMemberCardMatch?> lookupActiveMemberDisplayCode(
    String displayCode,
  ) async {
    final clean = displayCode.trim();
    if (!RegExp(r'^\d{6,20}$').hasMatch(clean)) return null;
    final rows = await customSelect(
      'SELECT member.id, member.display_code, member.status, '
      'member.created_at_millis, member.updated_at_millis, card.revision '
      'FROM shop_members AS member '
      'JOIN shop_store_identity AS store '
      'ON store.store_ref = member.store_ref AND store.singleton = 1 '
      'JOIN shop_member_cards AS card ON card.member_id = member.id '
      'WHERE member.display_code = ? AND member.status = ? '
      'AND card.state = ? ORDER BY card.revision DESC LIMIT 2',
      variables: [
        Variable<String>(clean),
        const Variable<String>('active'),
        const Variable<String>('active'),
      ],
    ).get();
    if (rows.length != 1) return null;
    return ShopMemberCardMatch(
      member: _memberFromRow(rows.single),
      cardRevision: rows.single.read<int>('revision'),
    );
  }

  Future<ShopSaleMember?> readSaleMember(String saleId) async {
    final row = await customSelect(
      'SELECT member_id, display_code, card_revision, associated_at_millis '
      'FROM shop_sale_member_links WHERE sale_id = ?',
      variables: [Variable<String>(saleId)],
    ).getSingleOrNull();
    return row == null
        ? null
        : ShopSaleMember(
            memberId: row.read<String>('member_id'),
            displayCode: row.read<String>('display_code'),
            cardRevision: row.read<int>('card_revision'),
            associatedAtMillis: row.read<int>('associated_at_millis'),
          );
  }

  Future<ShopSaleMember?> _readWalletCheckoutMember(String operationId) async {
    final row = await customSelect(
      'SELECT member_id, display_code, card_revision, associated_at_millis '
      'FROM shop_wallet_checkout_member_links WHERE operation_id = ?',
      variables: [Variable<String>(operationId)],
    ).getSingleOrNull();
    return row == null
        ? null
        : ShopSaleMember(
            memberId: row.read<String>('member_id'),
            displayCode: row.read<String>('display_code'),
            cardRevision: row.read<int>('card_revision'),
            associatedAtMillis: row.read<int>('associated_at_millis'),
          );
  }

  Future<PendingWalletCheckout?> readPendingWalletCheckout() async {
    final row = await customSelect(
      'SELECT operation_id, payment_method, request_fingerprint, total_mmk, '
      'merchant_phone, merchant_qr_payload, basket_json, state, created_at_millis '
      'FROM shop_wallet_checkout_intents '
      'WHERE state = ? ORDER BY created_at_millis LIMIT 1',
      variables: [const Variable<String>('pending')],
    ).getSingleOrNull();
    return row == null ? null : await _walletCheckoutFromRow(row);
  }

  Future<PendingWalletCheckout> _walletCheckoutFromRow(QueryRow row) async {
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
    final memberRow = await customSelect(
      'SELECT member_id, display_code, card_revision, associated_at_millis '
      'FROM shop_wallet_checkout_member_links WHERE operation_id = ?',
      variables: [Variable<String>(row.read<String>('operation_id'))],
    ).getSingleOrNull();
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
      member: memberRow == null
          ? null
          : ShopSaleMember(
              memberId: memberRow.read<String>('member_id'),
              displayCode: memberRow.read<String>('display_code'),
              cardRevision: memberRow.read<int>('card_revision'),
              associatedAtMillis: memberRow.read<int>('associated_at_millis'),
            ),
    );
  }

  Future<PendingWalletCheckout> createWalletCheckoutIntent({
    required String operationId,
    required MerchantWalletSetup merchant,
    required List<ShopSaleLineInput> lines,
    String? memberCardToken,
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
        final prior = await _walletCheckoutFromRow(existingIntent);
        ShopMemberCardMatch? retryMember;
        if (memberCardToken != null) {
          retryMember = await _lookupKnownMemberCard(memberCardToken);
          if (retryMember == null ||
              prior.member?.memberId != retryMember.member.id ||
              prior.member?.cardRevision != retryMember.cardRevision) {
            throw StateError('This wallet checkout ID was already used.');
          }
        } else if (prior.member != null) {
          throw StateError('This wallet checkout ID was already used.');
        }
        final retryFingerprint = jsonEncode({
          'paymentMethod': paymentMethod,
          if (retryMember != null) ...{
            'memberId': retryMember.member.id,
            'memberCardRevision': retryMember.cardRevision,
          },
          'lines': [
            for (final line in canonicalLines)
              {'productId': line.key, 'quantity': line.value},
          ],
        });
        if (prior.state == 'pending' &&
            prior.paymentMethod == paymentMethod &&
            prior.requestFingerprint == retryFingerprint) {
          return prior;
        }
        throw StateError('This wallet checkout ID was already used.');
      }
      final member = memberCardToken == null
          ? null
          : await lookupActiveMemberCard(memberCardToken);
      if (memberCardToken != null && member == null) {
        throw StateError('The member card is unavailable.');
      }
      final fingerprint = jsonEncode({
        'paymentMethod': paymentMethod,
        if (member != null) ...{
          'memberId': member.member.id,
          'memberCardRevision': member.cardRevision,
        },
        'lines': [
          for (final line in canonicalLines)
            {'productId': line.key, 'quantity': line.value},
        ],
      });
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
      final saleMember = member == null
          ? null
          : ShopSaleMember(
              memberId: member.member.id,
              displayCode: member.member.displayCode,
              cardRevision: member.cardRevision,
              associatedAtMillis: createdAt,
            );
      if (saleMember != null) {
        await customInsert(
          'INSERT INTO shop_wallet_checkout_member_links '
          '(operation_id, member_id, card_revision, display_code, '
          'associated_at_millis) VALUES (?, ?, ?, ?, ?)',
          variables: [
            Variable<String>(cleanOperationId),
            Variable<String>(saleMember.memberId),
            Variable<int>(saleMember.cardRevision),
            Variable<String>(saleMember.displayCode),
            Variable<int>(saleMember.associatedAtMillis),
          ],
        );
      }
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
        member: saleMember,
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
      final intent = await _walletCheckoutFromRow(row);
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

  /// Reads one immutable, closed-shift operational snapshot for the
  /// merchant-readable CSV. This transaction never writes and intentionally
  /// excludes authorization proofs, request fingerprints, workspace IDs,
  /// outbox payloads, wallet profile details, and session/key material.
  Future<ShopOperationalSnapshot> readClosedCashShiftOperationalExport(
    String shiftId,
  ) {
    final cleanShiftId = shiftId.trim();
    if (cleanShiftId.isEmpty || cleanShiftId.length > 120) {
      throw ArgumentError.value(shiftId, 'shiftId', 'Invalid shift ID.');
    }
    return transaction(() async {
      final shiftRow = await customSelect(
        'SELECT * FROM shop_cash_shifts WHERE id = ? LIMIT 1',
        variables: [Variable<String>(cleanShiftId)],
      ).getSingleOrNull();
      if (shiftRow == null) throw StateError('shop_closed_shift_not_found');
      final shift = _cashShiftFromRow(shiftRow);
      final closedAt = shift.closedAtMillis;
      if (shift.state != 'closed' ||
          closedAt == null ||
          shift.cashSalesCount == null ||
          shift.cashSalesTotalMmk == null ||
          shift.walletSalesCount == null ||
          shift.walletSalesTotalMmk == null ||
          shift.expectedCashMmk == null ||
          shift.countedCashMmk == null ||
          shift.differenceMmk == null ||
          shift.cashReversalCount == null ||
          shift.cashReversalTotalMmk == null ||
          shift.cashDrawerOutflowMmk == null) {
        throw StateError('shop_closed_shift_snapshot_incomplete');
      }

      ShopOperationalPaymentMethod paymentMethod(String value) =>
          switch (value) {
            'cash' => ShopOperationalPaymentMethod.cash,
            'kbzpay' => ShopOperationalPaymentMethod.kbzpay,
            'wavepay' => ShopOperationalPaymentMethod.wavepay,
            _ => throw StateError('shop_operational_payment_method_invalid'),
          };

      final saleRows = await customSelect(
        '''
        SELECT s.id, s.total_mmk, s.payment_method, s.created_at_millis
        FROM shop_cash_shift_sales link
        JOIN shop_sales s ON s.id = link.sale_id
        WHERE link.shift_id = ?
        ORDER BY s.created_at_millis, s.id
        ''',
        variables: [Variable<String>(cleanShiftId)],
      ).get();
      final sales = <ShopOperationalSale>[];
      for (final saleRow in saleRows) {
        final saleId = saleRow.read<String>('id');
        final lineRows = await customSelect(
          'SELECT id, product_id, product_name, quantity, unit_price_mmk, '
          'line_total_mmk FROM shop_sale_lines WHERE sale_id = ? '
          'ORDER BY id',
          variables: [Variable<String>(saleId)],
        ).get();
        sales.add(
          ShopOperationalSale(
            id: saleId,
            paymentMethod: paymentMethod(
              saleRow.read<String>('payment_method'),
            ),
            totalMmk: saleRow.read<int>('total_mmk'),
            createdAtMillis: saleRow.read<int>('created_at_millis'),
            lines: [
              for (final line in lineRows)
                ShopOperationalSaleLine(
                  id: line.read<String>('id'),
                  productId: line.read<String>('product_id'),
                  productName: line.read<String>('product_name'),
                  quantity: line.read<int>('quantity'),
                  unitPriceMmk: line.read<int>('unit_price_mmk'),
                  lineTotalMmk: line.read<int>('line_total_mmk'),
                ),
            ],
          ),
        );
      }

      final reversalRows = await customSelect(
        '''
        SELECT r.id, r.sale_id, r.original_payment_method,
          r.original_total_mmk, r.cash_drawer_delta_mmk, r.reason,
          r.authorized_actor_label, r.created_at_millis
        FROM shop_sale_reversals r
        WHERE (r.created_at_millis BETWEEN ? AND ?)
          OR EXISTS (
            SELECT 1 FROM shop_wallet_reversal_reconciliations w
            WHERE w.reversal_id = r.id
              AND w.created_at_millis BETWEEN ? AND ?
          )
        ORDER BY r.created_at_millis, r.id
        ''',
        variables: [
          Variable<int>(shift.openedAtMillis),
          Variable<int>(closedAt),
          Variable<int>(shift.openedAtMillis),
          Variable<int>(closedAt),
        ],
      ).get();
      final reversals = <ShopOperationalReversal>[];
      for (final reversalRow in reversalRows) {
        final reversalId = reversalRow.read<String>('id');
        final lineRows = await customSelect(
          'SELECT id, product_id, product_name, quantity, unit_price_mmk, '
          'line_total_mmk, restock_quantity '
          'FROM shop_sale_reversal_lines WHERE reversal_id = ? ORDER BY id',
          variables: [Variable<String>(reversalId)],
        ).get();
        reversals.add(
          ShopOperationalReversal(
            id: reversalId,
            saleId: reversalRow.read<String>('sale_id'),
            originalPaymentMethod: paymentMethod(
              reversalRow.read<String>('original_payment_method'),
            ),
            originalTotalMmk: reversalRow.read<int>('original_total_mmk'),
            cashDrawerDeltaMmk: reversalRow.read<int>('cash_drawer_delta_mmk'),
            reason: reversalRow.read<String>('reason'),
            authorizedActorLabel: reversalRow.read<String>(
              'authorized_actor_label',
            ),
            createdAtMillis: reversalRow.read<int>('created_at_millis'),
            lines: [
              for (final line in lineRows)
                ShopOperationalReversalLine(
                  id: line.read<String>('id'),
                  productId: line.read<String>('product_id'),
                  productName: line.read<String>('product_name'),
                  quantity: line.read<int>('quantity'),
                  unitPriceMmk: line.read<int>('unit_price_mmk'),
                  lineTotalMmk: line.read<int>('line_total_mmk'),
                  restockQuantity: line.read<int>('restock_quantity'),
                ),
            ],
          ),
        );
      }

      final walletRows = await customSelect(
        '''
        SELECT w.id, w.reversal_id, w.outcome, w.evidence_reference,
          w.authorized_actor_label, w.created_at_millis
        FROM shop_wallet_reversal_reconciliations w
        JOIN shop_sale_reversals r ON r.id = w.reversal_id
        WHERE w.created_at_millis <= ?
          AND ((r.created_at_millis BETWEEN ? AND ?)
            OR (w.created_at_millis BETWEEN ? AND ?))
        ORDER BY w.created_at_millis, w.id
        ''',
        variables: [
          Variable<int>(closedAt),
          Variable<int>(shift.openedAtMillis),
          Variable<int>(closedAt),
          Variable<int>(shift.openedAtMillis),
          Variable<int>(closedAt),
        ],
      ).get();
      final walletReconciliations = [
        for (final wallet in walletRows)
          ShopOperationalWalletReconciliation(
            id: wallet.read<String>('id'),
            reversalId: wallet.read<String>('reversal_id'),
            outcome: switch (wallet.read<String>('outcome')) {
              'money_returned' => ShopOperationalWalletOutcome.moneyReturned,
              'payment_not_received' =>
                ShopOperationalWalletOutcome.paymentNotReceived,
              _ => throw StateError('shop_operational_wallet_outcome_invalid'),
            },
            evidenceReference: wallet.read<String>('evidence_reference'),
            actorLabel: wallet.read<String>('authorized_actor_label'),
            createdAtMillis: wallet.read<int>('created_at_millis'),
          ),
      ];

      final movementRows = await customSelect(
        'SELECT id, sale_id, product_id, quantity_delta, reason, '
        'created_at_millis FROM shop_stock_movements '
        'WHERE created_at_millis BETWEEN ? AND ? '
        'ORDER BY created_at_millis, id',
        variables: [
          Variable<int>(shift.openedAtMillis),
          Variable<int>(closedAt),
        ],
      ).get();
      return ShopOperationalSnapshot(
        shift: ShopOperationalShift(
          id: shift.id,
          operatorLabel: shift.operatorLabel,
          openingFloatMmk: shift.openingFloatMmk,
          openedAtMillis: shift.openedAtMillis,
          closedAtMillis: closedAt,
          cashSalesCount: shift.cashSalesCount!,
          cashSalesTotalMmk: shift.cashSalesTotalMmk!,
          walletSalesCount: shift.walletSalesCount!,
          walletSalesTotalMmk: shift.walletSalesTotalMmk!,
          cashReversalCount: shift.cashReversalCount!,
          cashReversalTotalMmk: shift.cashReversalTotalMmk!,
          expectedCashMmk: shift.expectedCashMmk!,
          countedCashMmk: shift.countedCashMmk!,
          differenceMmk: shift.differenceMmk!,
          cashDrawerOutflowMmk: shift.cashDrawerOutflowMmk!,
        ),
        sales: sales,
        reversals: reversals,
        walletReconciliations: walletReconciliations,
        stockMovements: [
          for (final movement in movementRows)
            ShopOperationalStockMovement(
              id: movement.read<String>('id'),
              saleId: movement.readNullable<String>('sale_id'),
              productId: movement.read<String>('product_id'),
              quantityDelta: movement.read<int>('quantity_delta'),
              reason: movement.read<String>('reason'),
              createdAtMillis: movement.read<int>('created_at_millis'),
            ),
        ],
      );
    });
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

  Future<ShopLocalCorrectionLineageState?> readCorrectionLineageState() async {
    final row = await customSelect(
      'SELECT * FROM shop_correction_lineage_state WHERE singleton = 1',
    ).getSingleOrNull();
    if (row == null) return null;
    return ShopLocalCorrectionLineageState(
      lineage: ShopCorrectionLineage(
        activationRequestId: row.read<String>('activation_request_id'),
        workspaceId: row.read<String>('workspace_id'),
        actorId: row.read<String>('actor_id'),
        lineageId: row.read<String>('lineage_id'),
        lineageEpoch: row.read<int>('lineage_epoch'),
        previousLineageId: row.readNullable<String>('previous_lineage_id'),
        previousLineageEpoch: row.readNullable<int>('previous_lineage_epoch'),
        consumptionOrdinal: row.read<int>('consumption_ordinal'),
        consumptionDigest: row.readNullable<String>('consumption_digest'),
        activatedAtMillis: row.read<int>('activated_at_millis'),
      ),
      lifecycleState: row.read<String>('lifecycle_state'),
    );
  }

  /// Persists an authenticated server lineage response.
  ///
  /// A restore must rotate from its exact old watermark. A server response
  /// cannot silently skip an unknown correction or reactivate a stale clone.
  Future<void> acceptCorrectionLineage(ShopCorrectionLineage lineage) async {
    if (!lineage.isStructurallyValid) {
      throw StateError('Shop correction lineage evidence is invalid.');
    }
    await _withCorrectionQuarantine(
      () => transaction(() async {
        final binding = await readManagedWorkspaceBinding();
        if (binding == null ||
            binding.workspaceId != lineage.workspaceId ||
            binding.attachedActorId != lineage.actorId) {
          throw StateError(
            'Shop correction lineage does not match this store.',
          );
        }
        final current = await readCorrectionLineageState();
        if (current == null) {
          if (lineage.lineageEpoch != 1 ||
              lineage.previousLineageId != null ||
              lineage.previousLineageEpoch != null ||
              lineage.consumptionOrdinal != 0 ||
              lineage.consumptionDigest != null) {
            throw StateError('Initial Shop correction lineage is not empty.');
          }
          await customInsert(
            'INSERT INTO shop_correction_lineage_state '
            '(singleton, activation_request_id, workspace_id, actor_id, '
            'lineage_id, lineage_epoch, previous_lineage_id, '
            'previous_lineage_epoch, consumption_ordinal, consumption_digest, '
            'lifecycle_state, activated_at_millis) '
            "VALUES (1, ?, ?, ?, ?, ?, NULL, NULL, 0, NULL, 'active', ?)",
            variables: [
              Variable<String>(lineage.activationRequestId),
              Variable<String>(lineage.workspaceId),
              Variable<String>(lineage.actorId),
              Variable<String>(lineage.lineageId),
              Variable<int>(lineage.lineageEpoch),
              Variable<int>(lineage.activatedAtMillis),
            ],
          );
          return;
        }
        final previous = current.lineage;
        if (current.lifecycleState != 'restore_pending' ||
            lineage.previousLineageId != previous.lineageId ||
            lineage.previousLineageEpoch != previous.lineageEpoch ||
            lineage.lineageEpoch != previous.lineageEpoch + 1 ||
            lineage.consumptionOrdinal != previous.consumptionOrdinal ||
            lineage.consumptionDigest != previous.consumptionDigest) {
          throw const _ShopCorrectionReconciliationRequired(
            'Shop correction restore requires reconciliation.',
          );
        }
        await customUpdate(
          'UPDATE shop_correction_lineage_state SET activation_request_id = ?, '
          'lineage_id = ?, lineage_epoch = ?, previous_lineage_id = ?, '
          'previous_lineage_epoch = ?, lifecycle_state = ?, '
          'activated_at_millis = ? WHERE singleton = 1',
          variables: [
            Variable<String>(lineage.activationRequestId),
            Variable<String>(lineage.lineageId),
            Variable<int>(lineage.lineageEpoch),
            Variable<String>(lineage.previousLineageId!),
            Variable<int>(lineage.previousLineageEpoch!),
            const Variable<String>('active'),
            Variable<int>(lineage.activatedAtMillis),
          ],
        );
      }),
    );
  }

  Future<T> _withCorrectionQuarantine<T>(Future<T> Function() action) async {
    try {
      return await action();
    } on _ShopCorrectionReconciliationRequired catch (error) {
      await customUpdate(
        "UPDATE shop_correction_lineage_state SET lifecycle_state = 'reconciliation_required' WHERE singleton = 1",
      );
      throw StateError(error.message);
    }
  }

  /// Called only on the staged database during encrypted restore.
  Future<void> markCorrectionRestorePending() => customUpdate(
    "UPDATE shop_correction_lineage_state SET lifecycle_state = 'restore_pending' "
    "WHERE singleton = 1 AND lifecycle_state = 'active'",
  );

  Future<bool> applyCorrectionReconciliationStatus(
    ShopCorrectionReconciliationStatus status,
  ) async {
    final current = await readCorrectionLineageState();
    if (current == null) return false;
    final local = current.lineage;
    final exact =
        status.workspaceId == local.workspaceId &&
        status.requestedLineageId == local.lineageId &&
        status.requestedLineageEpoch == local.lineageEpoch &&
        status.localConsumptionOrdinal == local.consumptionOrdinal &&
        status.localConsumptionDigest == local.consumptionDigest &&
        status.activeLineageId == local.lineageId &&
        status.activeLineageEpoch == local.lineageEpoch &&
        status.serverConsumptionOrdinal == local.consumptionOrdinal &&
        status.serverConsumptionDigest == local.consumptionDigest &&
        status.state == 'current';
    if (exact) return true;
    await customUpdate(
      "UPDATE shop_correction_lineage_state SET lifecycle_state = 'reconciliation_required' WHERE singleton = 1",
    );
    return false;
  }

  Future<ShopCorrectionConsumptionIntent> prepareFullSaleCorrectionConsumption({
    required String consumptionRequestId,
    required ShopFullSaleReversalCommand command,
    required ShopCorrectionAuthorization authorization,
  }) async {
    await _validateCorrectionAuthorization(
      authorization: authorization,
      commandDigest: command.commandDigest,
      capability: 'shop.sale.reverse',
    );
    return _prepareCorrectionConsumption(
      consumptionRequestId: consumptionRequestId,
      localOperationId: command.operationId,
      semanticTargetId: command.saleId,
      authorization: authorization,
      recoveryEnvelopeJson: _fullSaleCorrectionRecoveryEnvelope(
        command: command,
        authorization: authorization,
      ),
    );
  }

  Future<ShopCorrectionConsumptionIntent> _prepareCorrectionConsumption({
    required String consumptionRequestId,
    required String localOperationId,
    required String semanticTargetId,
    required ShopCorrectionAuthorization authorization,
    String? recoveryEnvelopeJson,
  }) async {
    final uuid = RegExp(
      r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    );
    if (!uuid.hasMatch(consumptionRequestId) ||
        localOperationId.trim().isEmpty ||
        localOperationId.length > 120 ||
        semanticTargetId.trim().isEmpty ||
        semanticTargetId.length > 120) {
      throw ArgumentError('Shop correction consumption request is invalid.');
    }
    await _validateCorrectionAuthorization(
      authorization: authorization,
      commandDigest: authorization.commandDigest,
      capability: authorization.capability,
    );
    return transaction(() async {
      final lineageState = await readCorrectionLineageState();
      if (lineageState == null || !lineageState.canConsume) {
        throw StateError('Shop correction consumption is unavailable.');
      }
      final lineage = lineageState.lineage;
      if (lineage.workspaceId != authorization.workspaceId ||
          lineage.actorId != authorization.actorId) {
        throw StateError('Shop correction authority changed.');
      }
      final existing = await customSelect(
        'SELECT * FROM shop_correction_consumption_intents '
        'WHERE local_operation_id = ? OR consumption_request_id = ?',
        variables: [
          Variable<String>(localOperationId),
          Variable<String>(consumptionRequestId),
        ],
      ).get();
      if (existing.isNotEmpty) {
        if (existing.length != 1) {
          throw StateError('Shop correction consumption intent conflicts.');
        }
        final intent = _correctionIntentFromRow(existing.single);
        if (intent.consumptionRequestId != consumptionRequestId ||
            intent.localOperationId != localOperationId ||
            intent.authorizationReceiptId != authorization.receiptId ||
            intent.authorizationReceiptDigest != authorization.receiptDigest ||
            intent.workspaceId != authorization.workspaceId ||
            intent.actorId != authorization.actorId ||
            intent.capability != authorization.capability ||
            intent.semanticTargetId != semanticTargetId ||
            intent.commandDigest != authorization.commandDigest ||
            intent.lineageId != lineage.lineageId ||
            intent.lineageEpoch != lineage.lineageEpoch ||
            intent.recoveryEnvelopeJson != recoveryEnvelopeJson) {
          throw StateError('Shop correction consumption intent was reused.');
        }
        return intent;
      }
      final now = DateTime.now().millisecondsSinceEpoch;
      await customInsert(
        'INSERT INTO shop_correction_consumption_intents '
        '(consumption_request_id, local_operation_id, '
        'authorization_receipt_id, authorization_receipt_digest, '
        'workspace_id, actor_id, capability, semantic_target_id, '
        'command_digest, lineage_id, lineage_epoch, recovery_envelope_json, '
        'created_at_millis) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        variables: [
          Variable<String>(consumptionRequestId),
          Variable<String>(localOperationId),
          Variable<String>(authorization.receiptId),
          Variable<String>(authorization.receiptDigest),
          Variable<String>(authorization.workspaceId),
          Variable<String>(authorization.actorId),
          Variable<String>(authorization.capability),
          Variable<String>(semanticTargetId),
          Variable<String>(authorization.commandDigest),
          Variable<String>(lineage.lineageId),
          Variable<int>(lineage.lineageEpoch),
          Variable<String>(recoveryEnvelopeJson),
          Variable<int>(now),
        ],
      );
      return ShopCorrectionConsumptionIntent(
        consumptionRequestId: consumptionRequestId,
        localOperationId: localOperationId,
        authorizationReceiptId: authorization.receiptId,
        authorizationReceiptDigest: authorization.receiptDigest,
        workspaceId: authorization.workspaceId,
        actorId: authorization.actorId,
        capability: authorization.capability,
        semanticTargetId: semanticTargetId,
        commandDigest: authorization.commandDigest,
        lineageId: lineage.lineageId,
        lineageEpoch: lineage.lineageEpoch,
        createdAtMillis: now,
        recoveryEnvelopeJson: recoveryEnvelopeJson,
      );
    });
  }

  ShopCorrectionConsumptionIntent _correctionIntentFromRow(QueryRow row) =>
      ShopCorrectionConsumptionIntent(
        consumptionRequestId: row.read<String>('consumption_request_id'),
        localOperationId: row.read<String>('local_operation_id'),
        authorizationReceiptId: row.read<String>('authorization_receipt_id'),
        authorizationReceiptDigest: row.read<String>(
          'authorization_receipt_digest',
        ),
        workspaceId: row.read<String>('workspace_id'),
        actorId: row.read<String>('actor_id'),
        capability: row.read<String>('capability'),
        semanticTargetId: row.read<String>('semantic_target_id'),
        commandDigest: row.read<String>('command_digest'),
        lineageId: row.read<String>('lineage_id'),
        lineageEpoch: row.read<int>('lineage_epoch'),
        createdAtMillis: row.read<int>('created_at_millis'),
        recoveryEnvelopeJson: row.readNullable<String>(
          'recovery_envelope_json',
        ),
      );

  Future<void> _preflightCorrectionConsumptionProof({
    required ShopCorrectionConsumptionProof proof,
    required String localOperationId,
    required ShopCorrectionAuthorization authorization,
    required String semanticTargetId,
  }) async {
    if (!await proof.verify(correctionReceiptVerifier)) {
      throw StateError('Shop correction consumption proof is invalid.');
    }
    final existing = await customSelect(
      'SELECT * FROM shop_correction_consumptions '
      'WHERE consumption_request_id = ? OR local_operation_id = ?',
      variables: [
        Variable<String>(proof.consumptionRequestId),
        Variable<String>(localOperationId),
      ],
    ).get();
    if (existing.isNotEmpty) {
      if (existing.length != 1 ||
          existing.single.read<String>('consumption_id') !=
              proof.consumptionId ||
          existing.single.read<String>('history_digest') !=
              proof.historyDigest ||
          existing.single.read<String>('local_operation_id') !=
              localOperationId) {
        throw StateError('Shop correction consumption proof conflicts.');
      }
      return;
    }
    final intent = await customSelect(
      'SELECT * FROM shop_correction_consumption_intents '
      'WHERE consumption_request_id = ? AND local_operation_id = ?',
      variables: [
        Variable<String>(proof.consumptionRequestId),
        Variable<String>(localOperationId),
      ],
    ).getSingleOrNull();
    final lineageState = await readCorrectionLineageState();
    if (intent == null || lineageState == null || !lineageState.canConsume) {
      throw StateError('Shop correction consumption intent is unavailable.');
    }
    final lineage = lineageState.lineage;
    if (proof.authorizationReceiptId != authorization.receiptId ||
        proof.authorizationReceiptDigest != authorization.receiptDigest ||
        proof.workspaceId != authorization.workspaceId ||
        proof.actorId != authorization.actorId ||
        proof.capability != authorization.capability ||
        proof.semanticTargetId != semanticTargetId ||
        proof.commandDigest != authorization.commandDigest ||
        proof.lineageId != lineage.lineageId ||
        proof.lineageEpoch != lineage.lineageEpoch ||
        proof.consumptionOrdinal != lineage.consumptionOrdinal + 1 ||
        proof.previousConsumptionDigest != lineage.consumptionDigest ||
        intent.read<String>('authorization_receipt_id') !=
            proof.authorizationReceiptId ||
        intent.read<String>('authorization_receipt_digest') !=
            proof.authorizationReceiptDigest ||
        intent.read<String>('workspace_id') != proof.workspaceId ||
        intent.read<String>('actor_id') != proof.actorId ||
        intent.read<String>('capability') != proof.capability ||
        intent.read<String>('semantic_target_id') != proof.semanticTargetId ||
        intent.read<String>('command_digest') != proof.commandDigest ||
        intent.read<String>('lineage_id') != proof.lineageId ||
        intent.read<int>('lineage_epoch') != proof.lineageEpoch) {
      await customUpdate(
        "UPDATE shop_correction_lineage_state SET lifecycle_state = 'reconciliation_required' WHERE singleton = 1",
      );
      throw StateError('Shop correction consumption requires reconciliation.');
    }
  }

  Future<void> _recordCorrectionConsumptionProof({
    required ShopCorrectionConsumptionProof proof,
    required String localOperationId,
    required ShopCorrectionAuthorization authorization,
    required String semanticTargetId,
  }) async {
    if (!await proof.verify(correctionReceiptVerifier)) {
      throw StateError('Shop correction consumption proof is invalid.');
    }
    final existing = await customSelect(
      'SELECT * FROM shop_correction_consumptions '
      'WHERE consumption_request_id = ? OR local_operation_id = ?',
      variables: [
        Variable<String>(proof.consumptionRequestId),
        Variable<String>(localOperationId),
      ],
    ).get();
    if (existing.isNotEmpty) {
      if (existing.length != 1 ||
          existing.single.read<String>('consumption_id') !=
              proof.consumptionId ||
          existing.single.read<String>('history_digest') !=
              proof.historyDigest ||
          existing.single.read<String>('local_operation_id') !=
              localOperationId) {
        throw StateError('Shop correction consumption proof conflicts.');
      }
      return;
    }
    final intent = await customSelect(
      'SELECT * FROM shop_correction_consumption_intents '
      'WHERE consumption_request_id = ? AND local_operation_id = ?',
      variables: [
        Variable<String>(proof.consumptionRequestId),
        Variable<String>(localOperationId),
      ],
    ).getSingleOrNull();
    final lineageState = await readCorrectionLineageState();
    if (intent == null || lineageState == null || !lineageState.canConsume) {
      throw StateError('Shop correction consumption intent is unavailable.');
    }
    final lineage = lineageState.lineage;
    if (proof.authorizationReceiptId != authorization.receiptId ||
        proof.authorizationReceiptDigest != authorization.receiptDigest ||
        proof.workspaceId != authorization.workspaceId ||
        proof.actorId != authorization.actorId ||
        proof.capability != authorization.capability ||
        proof.semanticTargetId != semanticTargetId ||
        proof.commandDigest != authorization.commandDigest ||
        proof.lineageId != lineage.lineageId ||
        proof.lineageEpoch != lineage.lineageEpoch ||
        proof.consumptionOrdinal != lineage.consumptionOrdinal + 1 ||
        proof.previousConsumptionDigest != lineage.consumptionDigest ||
        intent.read<String>('authorization_receipt_id') !=
            proof.authorizationReceiptId ||
        intent.read<String>('authorization_receipt_digest') !=
            proof.authorizationReceiptDigest ||
        intent.read<String>('workspace_id') != proof.workspaceId ||
        intent.read<String>('actor_id') != proof.actorId ||
        intent.read<String>('capability') != proof.capability ||
        intent.read<String>('semantic_target_id') != proof.semanticTargetId ||
        intent.read<String>('command_digest') != proof.commandDigest ||
        intent.read<String>('lineage_id') != proof.lineageId ||
        intent.read<int>('lineage_epoch') != proof.lineageEpoch) {
      throw StateError('Shop correction consumption requires reconciliation.');
    }
    await customInsert(
      'INSERT INTO shop_correction_consumptions '
      '(consumption_id, consumption_request_id, local_operation_id, '
      'authorization_receipt_id, authorization_receipt_digest, workspace_id, '
      'actor_id, capability, semantic_target_id, command_digest, lineage_id, '
      'lineage_epoch, consumption_ordinal, previous_consumption_digest, '
      'history_digest, consumed_at_millis, key_id, signature) '
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      variables: [
        Variable<String>(proof.consumptionId),
        Variable<String>(proof.consumptionRequestId),
        Variable<String>(localOperationId),
        Variable<String>(proof.authorizationReceiptId),
        Variable<String>(proof.authorizationReceiptDigest),
        Variable<String>(proof.workspaceId),
        Variable<String>(proof.actorId),
        Variable<String>(proof.capability),
        Variable<String>(proof.semanticTargetId),
        Variable<String>(proof.commandDigest),
        Variable<String>(proof.lineageId),
        Variable<int>(proof.lineageEpoch),
        Variable<int>(proof.consumptionOrdinal),
        Variable<String>(proof.previousConsumptionDigest),
        Variable<String>(proof.historyDigest),
        Variable<int>(proof.consumedAtMillis),
        Variable<String>(proof.keyId),
        Variable<String>(proof.signature),
      ],
    );
    final previousDigest = proof.previousConsumptionDigest;
    final changed = await customUpdate(
      'UPDATE shop_correction_lineage_state SET consumption_ordinal = ?, '
      'consumption_digest = ? WHERE singleton = 1 AND lineage_id = ? '
      'AND lineage_epoch = ? AND consumption_ordinal = ? AND '
      '${previousDigest == null ? 'consumption_digest IS NULL' : 'consumption_digest = ?'}',
      variables: [
        Variable<int>(proof.consumptionOrdinal),
        Variable<String>(proof.historyDigest),
        Variable<String>(proof.lineageId),
        Variable<int>(proof.lineageEpoch),
        Variable<int>(proof.consumptionOrdinal - 1),
        if (previousDigest != null) Variable<String>(previousDigest),
      ],
    );
    if (changed != 1) {
      throw StateError('Shop correction consumption watermark changed.');
    }
  }

  Future<void> _requireRecordedCorrectionConsumption({
    required String localOperationId,
    required ShopCorrectionConsumptionProof proof,
  }) async {
    final row = await customSelect(
      'SELECT consumption_id, history_digest FROM '
      'shop_correction_consumptions WHERE local_operation_id = ?',
      variables: [Variable<String>(localOperationId)],
    ).getSingleOrNull();
    if (row == null ||
        row.read<String>('consumption_id') != proof.consumptionId ||
        row.read<String>('history_digest') != proof.historyDigest) {
      throw StateError('Recorded Shop correction consumption is missing.');
    }
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

  Future<void> _validateCorrectionAuthorization({
    required ShopCorrectionAuthorization authorization,
    required String commandDigest,
    required String capability,
  }) async {
    final hex = RegExp(r'^[0-9a-f]{64}$');
    final uuid = RegExp(
      r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
    );
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
        authorization.contract != shopCorrectionAuthorizationReceiptContract ||
        authorization.capability != capability ||
        authorization.source != 'managed_membership_receipt_v1' ||
        authorization.commandDigest != commandDigest ||
        authorization.finalizationRequestId == null ||
        !uuid.hasMatch(authorization.finalizationRequestId!) ||
        authorization.finalizedAtMillis == null ||
        !shopCorrectionAuthorizationReceiptDigestMatches(
          receiptDigest: authorization.receiptDigest,
          source: authorization.source,
          receiptId: authorization.receiptId,
          workspaceId: authorization.workspaceId,
          actorId: authorization.actorId,
          actorLabel: authorization.actorLabel,
          actorRole: authorization.actorRole,
          capability: authorization.capability,
          commandDigest: authorization.commandDigest,
          finalizationRequestId: authorization.finalizationRequestId!,
          finalizedAtMillis: authorization.finalizedAtMillis!,
          issuedAtMillis: authorization.issuedAtMillis,
          expiresAtMillis: authorization.expiresAtMillis,
        ) ||
        authorization.issuedAtMillis <= 0 ||
        authorization.issuedAtMillis != authorization.finalizedAtMillis! ||
        authorization.finalizedAtMillis! > authorization.expiresAtMillis ||
        authorization.expiresAtMillis <= authorization.issuedAtMillis ||
        authorization.expiresAtMillis - authorization.issuedAtMillis !=
            const Duration(minutes: 5).inMilliseconds ||
        !await correctionReceiptVerifier.verify(authorization)) {
      throw StateError('Correction authorization is missing or invalid.');
    }
  }

  void _requireFreshCorrectionAuthorization(
    ShopCorrectionAuthorization authorization,
    int now,
  ) {
    if (authorization.finalizedAtMillis == null ||
        authorization.issuedAtMillis != authorization.finalizedAtMillis! ||
        authorization.finalizedAtMillis! > authorization.expiresAtMillis ||
        authorization.issuedAtMillis > now ||
        authorization.expiresAtMillis < now) {
      throw StateError('Correction authorization finalization is invalid.');
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
    final used = await customSelect(
      'SELECT 1 FROM shop_correction_authorization_proofs '
      'WHERE receipt_id = ? LIMIT 1',
      variables: [Variable<String>(receiptId)],
    ).getSingleOrNull();
    if (used != null) {
      throw StateError(
        'This correction authorization receipt was already used.',
      );
    }
  }

  Future<void> _insertSignedCorrectionAuthorizationProof({
    required ShopCorrectionAuthorization authorization,
    required String operationId,
    required int verifiedAtMillis,
  }) async {
    await customInsert(
      'INSERT INTO shop_correction_authorization_proofs '
      '(receipt_id, proof_kind, local_operation_id, receipt_digest, key_id, '
      'signature, workspace_id, actor_id, actor_label, actor_role, capability, '
      'finalization_request_id, finalized_at_millis, source, command_digest, '
      'issued_at_millis, expires_at_millis, verified_at_millis) '
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      variables: [
        Variable<String>(authorization.receiptId),
        Variable<String>(shopCorrectionAuthorizationProofKindSignedV3),
        Variable<String>(operationId),
        Variable<String>(authorization.receiptDigest),
        Variable<String>(authorization.keyId),
        Variable<String>(authorization.signature),
        Variable<String>(authorization.workspaceId),
        Variable<String>(authorization.actorId),
        Variable<String>(authorization.actorLabel),
        Variable<String>(authorization.actorRole),
        Variable<String>(authorization.capability),
        Variable<String>(authorization.finalizationRequestId!),
        Variable<int>(authorization.finalizedAtMillis!),
        Variable<String>(authorization.source),
        Variable<String>(authorization.commandDigest),
        Variable<int>(authorization.issuedAtMillis),
        Variable<int>(authorization.expiresAtMillis),
        Variable<int>(verifiedAtMillis),
      ],
    );
  }

  Future<void> _requireRecordedSignedCorrectionProof(
    QueryRow correction,
    ShopCorrectionAuthorization authorization,
  ) async {
    final proof = await customSelect(
      'SELECT * FROM shop_correction_authorization_proofs '
      'WHERE receipt_id = ? LIMIT 1',
      variables: [Variable<String>(authorization.receiptId)],
    ).getSingleOrNull();
    if (proof == null ||
        proof.read<String>('proof_kind') !=
            shopCorrectionAuthorizationProofKindSignedV3 ||
        proof.readNullable<String>('finalization_request_id') !=
            authorization.finalizationRequestId ||
        proof.readNullable<int>('finalized_at_millis') !=
            authorization.finalizedAtMillis ||
        proof.readNullable<String>('key_id') != authorization.keyId ||
        proof.readNullable<String>('signature') != authorization.signature ||
        !_proofMatchesCorrectionRow(proof, correction) ||
        !_matchesRecordedCorrectionAuthorization(correction, authorization)) {
      throw StateError(
        'The recorded correction authorization proof does not match.',
      );
    }
  }

  Future<void> _requireBoundCorrectionWorkspace(
    String authorizationWorkspaceId,
    String authorizationActorId, {
    String? reversalId,
  }) async {
    final binding = await readManagedWorkspaceBinding();
    if (binding == null ||
        binding.workspaceId != authorizationWorkspaceId ||
        binding.attachedActorId != authorizationActorId) {
      throw StateError(
        'Correction authorization does not match this Shop workspace and actor.',
      );
    }
    if (reversalId == null) return;
    final reversal = await customSelect(
      'SELECT authorization_workspace_id FROM shop_sale_reversals '
      'WHERE id = ? LIMIT 1',
      variables: [Variable<String>(reversalId)],
    ).getSingleOrNull();
    if (reversal == null ||
        reversal.read<String>('authorization_workspace_id') !=
            binding.workspaceId) {
      throw StateError(
        'Wallet reconciliation does not match this Shop workspace.',
      );
    }
  }

  Future<ShopSaleReversal> _saleReversalFromRow(QueryRow row) async {
    final reversalId = row.read<String>('id');
    final authorizationProof = await customSelect(
      'SELECT proof_kind FROM shop_correction_authorization_proofs '
      'WHERE receipt_id = ? LIMIT 1',
      variables: [
        Variable<String>(row.read<String>('authorization_receipt_id')),
      ],
    ).getSingle();
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
    final reconciliationProof = reconciliation == null
        ? null
        : await customSelect(
            'SELECT proof_kind FROM shop_correction_authorization_proofs '
            'WHERE receipt_id = ? LIMIT 1',
            variables: [
              Variable<String>(
                reconciliation.read<String>('authorization_receipt_id'),
              ),
            ],
          ).getSingle();
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
      authorizationProofKind: authorizationProof.read<String>('proof_kind'),
      createdAtMillis: row.read<int>('created_at_millis'),
      walletReconciliationOutcome: reconciliation?.read<String>('outcome'),
      walletEvidenceReference: reconciliation?.read<String>(
        'evidence_reference',
      ),
      walletReconciledActorLabel: reconciliation?.read<String>(
        'authorized_actor_label',
      ),
      walletReconciledAtMillis: reconciliation?.read<int>('created_at_millis'),
      walletReconciliationProofKind: reconciliationProof?.read<String>(
        'proof_kind',
      ),
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

  /// Persists the stable local intent before asking the server to consume the
  /// authorization. A caller can repeat this method with the same request and
  /// operation IDs after an ambiguous transport failure: the server contract
  /// returns the original signed proof and the local commit remains
  /// idempotent. This method is not wired to a production transport while the
  /// global consumption gate and production verification keys remain closed.
  Future<ShopSaleReversal> consumeAndRecordAuthorizedFullSaleReversal({
    required ShopFullSaleReversalCommand command,
    required ShopCorrectionAuthorization authorization,
    required String consumptionRequestId,
    required ShopCorrectionConsumptionGateway gateway,
  }) async {
    final intent = await prepareFullSaleCorrectionConsumption(
      consumptionRequestId: consumptionRequestId,
      command: command,
      authorization: authorization,
    );
    final proof = await gateway.consume(
      consumptionRequestId: intent.consumptionRequestId,
      authorization: authorization,
      lineageId: intent.lineageId,
      lineageEpoch: intent.lineageEpoch,
      semanticTargetId: intent.semanticTargetId,
    );
    return recordAuthorizedFullSaleReversal(
      command: command,
      authorization: authorization,
      consumptionProof: proof,
    );
  }

  /// Resumes a persisted consume request after process loss. The immutable
  /// envelope is revalidated by the same preview, receipt, gateway-proof and
  /// atomic-recording boundaries used by the initial attempt.
  Future<ShopSaleReversal> resumePendingFullSaleReversal({
    required String consumptionRequestId,
    required ShopCorrectionConsumptionGateway gateway,
  }) async {
    final row = await customSelect(
      'SELECT recovery_envelope_json FROM shop_correction_consumption_intents '
      'WHERE consumption_request_id = ?',
      variables: [Variable<String>(consumptionRequestId)],
    ).getSingleOrNull();
    final encoded = row?.readNullable<String>('recovery_envelope_json');
    if (encoded == null) {
      throw StateError('No resumable Shop correction request was found.');
    }
    final recovered = _decodeFullSaleCorrectionRecoveryEnvelope(encoded);
    final command = await previewFullSaleReversal(
      operationId: recovered.command.operationId,
      saleId: recovered.command.saleId,
      restockItems: recovered.command.restockItems,
      reason: recovered.command.reason,
      confirmCashReturned: recovered.command.cashReturnConfirmed,
    );
    if (command.requestFingerprint != recovered.command.requestFingerprint ||
        command.commandDigest != recovered.command.commandDigest ||
        command.saleSnapshotDigest != recovered.command.saleSnapshotDigest ||
        command.originalTotalMmk != recovered.command.originalTotalMmk ||
        command.originalPaymentMethod !=
            recovered.command.originalPaymentMethod ||
        command.expectedCashShiftId != recovered.command.expectedCashShiftId ||
        command.paymentResolution != recovered.command.paymentResolution) {
      throw StateError('The pending correction no longer matches the sale.');
    }
    return consumeAndRecordAuthorizedFullSaleReversal(
      command: command,
      authorization: recovered.authorization,
      consumptionRequestId: consumptionRequestId,
      gateway: gateway,
    );
  }

  Future<ShopSaleReversal> recordAuthorizedFullSaleReversal({
    required ShopFullSaleReversalCommand command,
    required ShopCorrectionAuthorization authorization,
    ShopCorrectionConsumptionProof? consumptionProof,
  }) async {
    if (consumptionProof != null) {
      await _preflightCorrectionConsumptionProof(
        proof: consumptionProof,
        localOperationId: command.operationId,
        authorization: authorization,
        semanticTargetId: command.saleId,
      );
    }
    return transaction(() async {
      await _validateCorrectionAuthorization(
        authorization: authorization,
        commandDigest: command.commandDigest,
        capability: 'shop.sale.reverse',
      );
      await _requireBoundCorrectionWorkspace(
        authorization.workspaceId,
        authorization.actorId,
      );
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
        await _requireRecordedSignedCorrectionProof(prior, authorization);
        if (consumptionProof != null) {
          await _requireRecordedCorrectionConsumption(
            localOperationId: command.operationId,
            proof: consumptionProof,
          );
        } else if (!testOnlyAllowUnconsumedAuthorization ||
            await readCorrectionLineageState() != null) {
          throw StateError('Global correction consumption proof is required.');
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
      final now = DateTime.now().millisecondsSinceEpoch;
      _requireFreshCorrectionAuthorization(
        authorization,
        consumptionProof?.consumedAtMillis ?? now,
      );
      if (consumptionProof != null) {
        await _recordCorrectionConsumptionProof(
          proof: consumptionProof,
          localOperationId: command.operationId,
          authorization: authorization,
          semanticTargetId: command.saleId,
        );
      } else if (!testOnlyAllowUnconsumedAuthorization ||
          await readCorrectionLineageState() != null) {
        throw StateError('Global correction consumption proof is required.');
      }
      await _insertSignedCorrectionAuthorizationProof(
        authorization: authorization,
        operationId: command.operationId,
        verifiedAtMillis: authorization.finalizedAtMillis!,
      );
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
          Variable<int>(authorization.finalizedAtMillis!),
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
      'SELECT original_payment_method, original_total_mmk '
      'FROM shop_sale_reversals WHERE id = ?',
      variables: [Variable<String>(cleanReversalId)],
    ).getSingleOrNull();
    if (reversal == null) throw StateError('The sale reversal was not found.');
    final originalPaymentMethod = reversal.read<String>(
      'original_payment_method',
    );
    final originalTotalMmk = reversal.read<int>('original_total_mmk');
    if (originalPaymentMethod == 'cash') {
      throw StateError('Cash returns do not have wallet reconciliation.');
    }
    final fingerprint = _walletReconciliationRequestFingerprint(
      operationId: cleanOperationId,
      reversalId: cleanReversalId,
      originalPaymentMethod: originalPaymentMethod,
      originalTotalMmk: originalTotalMmk,
      outcome: outcome,
      evidenceReference: cleanEvidence,
    );
    return ShopWalletReconciliationCommand(
      operationId: cleanOperationId,
      reversalId: cleanReversalId,
      originalPaymentMethod: originalPaymentMethod,
      originalTotalMmk: originalTotalMmk,
      requestFingerprint: fingerprint,
      commandDigest: await _sha256Hex(fingerprint),
      outcome: outcome,
      evidenceReference: cleanEvidence,
    );
  }

  Future<ShopSaleReversal> recordAuthorizedWalletReconciliation({
    required ShopWalletReconciliationCommand command,
    required ShopCorrectionAuthorization authorization,
    ShopCorrectionConsumptionProof? consumptionProof,
  }) async {
    if (consumptionProof != null) {
      await _preflightCorrectionConsumptionProof(
        proof: consumptionProof,
        localOperationId: command.operationId,
        authorization: authorization,
        semanticTargetId: command.reversalId,
      );
    }
    return transaction(() async {
      await _validateCorrectionAuthorization(
        authorization: authorization,
        commandDigest: command.commandDigest,
        capability: 'shop.sale.reconcile_wallet',
      );
      await _requireBoundCorrectionWorkspace(
        authorization.workspaceId,
        authorization.actorId,
        reversalId: command.reversalId,
      );
      final prior = await customSelect(
        'SELECT * FROM shop_wallet_reversal_reconciliations '
        'WHERE operation_id = ? LIMIT 1',
        variables: [Variable<String>(command.operationId)],
      ).getSingleOrNull();
      if (prior != null) {
        final recordedReversalId = prior.read<String>('reversal_id');
        final recordedOutcome = prior.read<String>('outcome');
        final recordedEvidence = prior.read<String>('evidence_reference');
        final reversal = await customSelect(
          'SELECT * FROM shop_sale_reversals WHERE id = ?',
          variables: [Variable<String>(recordedReversalId)],
        ).getSingle();
        final originalPaymentMethod = reversal.read<String>(
          'original_payment_method',
        );
        final originalTotalMmk = reversal.read<int>('original_total_mmk');
        final expectedFingerprint = _walletReconciliationRequestFingerprint(
          operationId: prior.read<String>('operation_id'),
          reversalId: recordedReversalId,
          originalPaymentMethod: originalPaymentMethod,
          originalTotalMmk: originalTotalMmk,
          outcome: recordedOutcome,
          evidenceReference: recordedEvidence,
        );
        if (prior.read<String>('request_fingerprint') != expectedFingerprint ||
            command.requestFingerprint != expectedFingerprint ||
            command.reversalId != recordedReversalId ||
            command.originalPaymentMethod != originalPaymentMethod ||
            command.originalTotalMmk != originalTotalMmk ||
            command.outcome != recordedOutcome ||
            command.evidenceReference != recordedEvidence ||
            await _sha256Hex(expectedFingerprint) != command.commandDigest ||
            authorization.commandDigest != command.commandDigest ||
            !_matchesRecordedCorrectionAuthorization(prior, authorization)) {
          throw StateError(
            'A wallet reconciliation ID was reused with different details.',
          );
        }
        await _requireRecordedSignedCorrectionProof(prior, authorization);
        if (consumptionProof != null) {
          await _requireRecordedCorrectionConsumption(
            localOperationId: command.operationId,
            proof: consumptionProof,
          );
        } else if (!testOnlyAllowUnconsumedAuthorization ||
            await readCorrectionLineageState() != null) {
          throw StateError('Global correction consumption proof is required.');
        }
        return _saleReversalFromRow(reversal);
      }
      final verifiedCommand = await previewWalletReconciliation(
        operationId: command.operationId,
        reversalId: command.reversalId,
        outcome: command.outcome,
        evidenceReference: command.evidenceReference,
      );
      if (verifiedCommand.requestFingerprint != command.requestFingerprint ||
          verifiedCommand.commandDigest != command.commandDigest ||
          verifiedCommand.originalPaymentMethod !=
              command.originalPaymentMethod ||
          verifiedCommand.originalTotalMmk != command.originalTotalMmk) {
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
      await _requireUnusedCorrectionReceipt(authorization.receiptId);
      final now = DateTime.now().millisecondsSinceEpoch;
      _requireFreshCorrectionAuthorization(
        authorization,
        consumptionProof?.consumedAtMillis ?? now,
      );
      if (consumptionProof != null) {
        await _recordCorrectionConsumptionProof(
          proof: consumptionProof,
          localOperationId: command.operationId,
          authorization: authorization,
          semanticTargetId: command.reversalId,
        );
      } else if (!testOnlyAllowUnconsumedAuthorization ||
          await readCorrectionLineageState() != null) {
        throw StateError('Global correction consumption proof is required.');
      }
      await _insertSignedCorrectionAuthorizationProof(
        authorization: authorization,
        operationId: command.operationId,
        verifiedAtMillis: authorization.finalizedAtMillis!,
      );
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
          Variable<int>(authorization.finalizedAtMillis!),
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
    String? memberCardToken,
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
        (paymentMethod != 'cash' && memberCardToken != null) ||
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
    ShopSaleMember? selectedMember;
    if (paymentMethod == 'cash' && memberCardToken != null) {
      var match = await lookupActiveMemberCard(memberCardToken);
      if (match == null) {
        final priorSale =
            await (select(shopSales)
                  ..where((sale) => sale.operationId.equals(cleanOperationId)))
                .getSingleOrNull();
        final priorMember = priorSale == null
            ? null
            : await readSaleMember(priorSale.id);
        final known = await _lookupKnownMemberCard(memberCardToken);
        if (priorMember == null ||
            known == null ||
            priorMember.memberId != known.member.id ||
            priorMember.cardRevision != known.cardRevision) {
          throw StateError('The member card is unavailable.');
        }
        match = known;
      }
      selectedMember = ShopSaleMember(
        memberId: match.member.id,
        displayCode: match.member.displayCode,
        cardRevision: match.cardRevision,
        associatedAtMillis: 0,
      );
    } else if (cleanWalletCheckoutId != null) {
      selectedMember = await _readWalletCheckoutMember(cleanWalletCheckoutId);
    }
    final fingerprint = paymentMethod == 'cash'
        ? selectedMember == null
              ? jsonEncode(fingerprintLines)
              : jsonEncode({
                  'memberId': selectedMember.memberId,
                  'memberCardRevision': selectedMember.cardRevision,
                  'lines': fingerprintLines,
                })
        : jsonEncode({
            'paymentMethod': paymentMethod,
            if (selectedMember != null) ...{
              'memberId': selectedMember.memberId,
              'memberCardRevision': selectedMember.cardRevision,
            },
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
        final priorMember = await readSaleMember(priorSale.id);
        if (priorMember?.memberId != selectedMember?.memberId ||
            priorMember?.cardRevision != selectedMember?.cardRevision) {
          throw StateError(
            'A sale operation ID was reused with a different member.',
          );
        }
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
          member: priorMember,
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
        final intent = await _walletCheckoutFromRow(intentRow);
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
      final reviewedMember = selectedMember;
      if (reviewedMember != null) {
        selectedMember = ShopSaleMember(
          memberId: reviewedMember.memberId,
          displayCode: reviewedMember.displayCode,
          cardRevision: reviewedMember.cardRevision,
          associatedAtMillis: now,
        );
        final committedMember = selectedMember!;
        await customInsert(
          'INSERT INTO shop_sale_member_links '
          '(sale_id, member_id, card_revision, display_code, '
          'associated_at_millis) VALUES (?, ?, ?, ?, ?)',
          variables: [
            Variable<String>(saleId),
            Variable<String>(committedMember.memberId),
            Variable<int>(committedMember.cardRevision),
            Variable<String>(committedMember.displayCode),
            Variable<int>(now),
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
            if (selectedMember != null) ...{
              'memberId': selectedMember!.memberId,
              'memberCardRevision': selectedMember!.cardRevision,
            },
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
        member: selectedMember,
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
    final membersBySale = <String, ShopSaleMember>{};
    for (final saleId in saleIds) {
      final reversal = await readSaleReversalForSale(saleId);
      if (reversal != null) reversalsBySale[saleId] = reversal;
      final member = await readSaleMember(saleId);
      if (member != null) membersBySale[saleId] = member;
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
          member: membersBySale[sale.id],
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
      final sku = _optionalText(draft.sku);
      final barcode = _optionalText(draft.barcode);
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
          (draft.openingStock != null && draft.openingStock! < 0) ||
          _usesReservedMemberCardNamespace(sku) ||
          _usesReservedMemberCardNamespace(barcode)) {
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
