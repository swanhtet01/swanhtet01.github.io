import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:crypto/crypto.dart' as crypto;
import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:drift_flutter/drift_flutter.dart';

import 'shop_models.dart';
import 'shop_cafe_order_contract.dart';
import 'shop_connected_site_contracts.dart';
import 'shop_connected_site_reconciliation.dart';
import 'shop_connected_stock_reservation.dart';
import 'shop_correction_consumption.dart';
import 'shop_correction_receipt.dart';
import 'shop_operational_export.dart';
import 'shop_staff_authorization.dart';

export 'shop_correction_consumption.dart';
export 'shop_correction_receipt.dart';

part 'shop_database.g.dart';

final RegExp _canonicalShopMemberCardTokenPattern = RegExp(
  r'^SMC1\.[A-Za-z0-9_-]{43}$',
);

/// True only for the complete 32-byte member-card token contract.
///
/// Older merchants could legitimately use product codes beginning `SMC1.`
/// before member cards existed. Those codes are not member cards unless the
/// entire value is a canonical token.
bool isCanonicalShopMemberCardToken(String value) {
  if (!_canonicalShopMemberCardTokenPattern.hasMatch(value)) return false;
  try {
    final encoded = value.substring(5);
    final bytes = base64Url.decode('$encoded=');
    return bytes.length == 32 &&
        base64Url.encode(bytes).replaceAll('=', '') == encoded;
  } on FormatException {
    return false;
  }
}

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
  IntColumn get cashTenderedMmk => integer().nullable().customConstraint(
    "NULL CHECK (cash_tendered_mmk IS NULL OR "
    "(payment_method = 'cash' AND cash_tendered_mmk >= total_mmk "
    'AND cash_tendered_mmk <= 200000000000000))',
  )();
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

class ShopCashShiftChangedException implements Exception {
  const ShopCashShiftChangedException();
}

class ShopPendingCashCheckout {
  const ShopPendingCashCheckout({
    required this.operationId,
    required this.checkoutKind,
    required this.subjectId,
    required this.capturedShiftId,
    required this.memberId,
    required this.memberCardRevision,
    required this.requestFingerprint,
    required this.createdAtMillis,
  });

  final String operationId;
  final String checkoutKind;
  final String subjectId;
  final String? capturedShiftId;
  final String? memberId;
  final int? memberCardRevision;
  final String requestFingerprint;
  final int createdAtMillis;
}

/// A recoverable stock conflict that leaves every sale effect unchanged.
///
/// Pending cash creation and final sale commits use this shared shape so
/// counter and cafe screens can report the exact item and usable quantity.
class ShopStockUnavailableException implements Exception {
  const ShopStockUnavailableException({
    required this.productName,
    required this.available,
    required this.requiredQuantity,
  });

  final String productName;
  final int available;
  final int requiredQuantity;
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

enum ShopSaleHistoryFilter { all, cash, kbzpay, wavepay, reversed }

class ShopSaleReceipt {
  const ShopSaleReceipt({
    required this.id,
    required this.operationId,
    required this.totalMmk,
    required this.createdAtMillis,
    required this.paymentMethod,
    this.cashTenderedMmk,
    this.lines = const [],
    this.reversal,
    this.member,
  });

  final String id;
  final String operationId;
  final int totalMmk;
  final int createdAtMillis;
  final String paymentMethod;
  final int? cashTenderedMmk;
  int? get cashChangeMmk =>
      cashTenderedMmk == null ? null : cashTenderedMmk! - totalMmk;
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
    required this.grossCashSalesMmk,
    required this.grossKbzpaySalesMmk,
    required this.grossWavepaySalesMmk,
    required this.reversalCount,
    required this.reversalMmk,
    required this.cashReversalMmk,
    required this.kbzpayReversalMmk,
    required this.wavepayReversalMmk,
    required this.pendingWalletReversalCount,
    required this.pendingWalletReversalMmk,
  });

  final int grossSaleCount;
  final int grossSalesMmk;
  final int grossCashSalesMmk;
  final int grossKbzpaySalesMmk;
  final int grossWavepaySalesMmk;
  final int reversalCount;
  final int reversalMmk;
  final int cashReversalMmk;
  final int kbzpayReversalMmk;
  final int wavepayReversalMmk;
  final int pendingWalletReversalCount;
  final int pendingWalletReversalMmk;

  int get netSalesMmk => grossSalesMmk - reversalMmk;
  int get netCashSalesMmk => grossCashSalesMmk - cashReversalMmk;
  int get netKbzpaySalesMmk => grossKbzpaySalesMmk - kbzpayReversalMmk;
  int get netWavepaySalesMmk => grossWavepaySalesMmk - wavepayReversalMmk;
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
    this.cashMovementCount,
    this.cashInTotalMmk,
    this.cashOutTotalMmk,
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
  final int? cashMovementCount;
  final int? cashInTotalMmk;
  final int? cashOutTotalMmk;
}

class ShopCashMovementCommand {
  const ShopCashMovementCommand({
    required this.operationId,
    required this.storeRef,
    required this.shiftId,
    required this.kind,
    required this.amountMmk,
    required this.reason,
    required this.requestFingerprint,
    required this.commandDigest,
  });

  final String operationId;
  final String storeRef;
  final String shiftId;
  final String kind;
  final int amountMmk;
  final String reason;
  final String requestFingerprint;
  final String commandDigest;
}

class ShopCashMovement {
  const ShopCashMovement({
    required this.id,
    required this.operationId,
    required this.storeRef,
    required this.shiftId,
    required this.kind,
    required this.amountMmk,
    required this.reason,
    required this.workspaceId,
    required this.actorId,
    required this.actorLabel,
    required this.createdAtMillis,
  });

  final String id;
  final String operationId;
  final String storeRef;
  final String shiftId;
  final String kind;
  final int amountMmk;
  final String reason;
  final String workspaceId;
  final String actorId;
  final String actorLabel;
  final int createdAtMillis;
}

class ShopCashShiftReview {
  const ShopCashShiftReview({
    required this.shift,
    required this.cashSalesCount,
    required this.cashSalesTotalMmk,
    required this.walletSalesCount,
    required this.walletSalesTotalMmk,
    required this.kbzpaySalesCount,
    required this.kbzpaySalesTotalMmk,
    required this.wavepaySalesCount,
    required this.wavepaySalesTotalMmk,
    required this.expectedCashMmk,
    required this.cashReversalCount,
    required this.cashReversalTotalMmk,
    required this.cashDrawerOutflowMmk,
    required this.cashMovementCount,
    required this.cashInTotalMmk,
    required this.cashOutTotalMmk,
  });

  final ShopCashShift shift;
  final int cashSalesCount;
  final int cashSalesTotalMmk;
  final int walletSalesCount;
  final int walletSalesTotalMmk;
  final int kbzpaySalesCount;
  final int kbzpaySalesTotalMmk;
  final int wavepaySalesCount;
  final int wavepaySalesTotalMmk;
  final int expectedCashMmk;
  final int cashReversalCount;
  final int cashReversalTotalMmk;
  final int cashDrawerOutflowMmk;
  final int cashMovementCount;
  final int cashInTotalMmk;
  final int cashOutTotalMmk;

  int get saleCount => cashSalesCount + walletSalesCount;
  int get activityCount => saleCount + cashReversalCount + cashMovementCount;
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

const shopPendingCashCheckoutsV21Sql = '''
  CREATE TABLE IF NOT EXISTS shop_pending_cash_checkouts (
    operation_id TEXT PRIMARY KEY NOT NULL
      CHECK (length(operation_id) BETWEEN 1 AND 120),
    checkout_kind TEXT NOT NULL CHECK (checkout_kind IN ('counter', 'cafe')),
    subject_id TEXT NOT NULL CHECK (length(subject_id) BETWEEN 1 AND 120),
    captured_shift_id TEXT REFERENCES shop_cash_shifts(id),
    member_id TEXT REFERENCES shop_members(id),
    member_card_revision INTEGER,
    request_fingerprint TEXT NOT NULL CHECK (length(request_fingerprint) = 64),
    created_at_millis INTEGER NOT NULL CHECK (created_at_millis > 0),
    UNIQUE(checkout_kind, subject_id),
    CHECK (
      (member_id IS NULL AND member_card_revision IS NULL)
      OR (member_id IS NOT NULL AND member_card_revision >= 1)
    )
  )
''';

const shopPendingCashCheckoutInsertGuardV21Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_pending_cash_checkouts_insert_guard
  BEFORE INSERT ON shop_pending_cash_checkouts
  WHEN (NEW.captured_shift_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM shop_cash_shifts
    WHERE id = NEW.captured_shift_id AND state = 'open'
  )) OR (NEW.checkout_kind = 'counter' AND (
      NEW.subject_id != NEW.operation_id OR NOT EXISTS (
        SELECT 1 FROM shop_counter_drafts
        WHERE operation_id = NEW.subject_id
      )
    ))
    OR (NEW.checkout_kind = 'cafe' AND NOT EXISTS (
      SELECT 1 FROM shop_cafe_orders
      WHERE id = NEW.subject_id AND state = 'open'
    ))
  BEGIN
    SELECT RAISE(ABORT, 'cash_checkout_binding_invalid');
  END
''';

const shopPendingCashCheckoutCounterFreezeV21Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_pending_cash_checkouts_counter_freeze
  BEFORE UPDATE ON shop_counter_drafts
  WHEN EXISTS (
    SELECT 1 FROM shop_pending_cash_checkouts
    WHERE checkout_kind = 'counter' AND subject_id = OLD.operation_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'cash_checkout_counter_frozen');
  END
''';

const shopPendingCashCheckoutCounterDeleteFreezeV21Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_pending_cash_checkouts_counter_delete_freeze
  BEFORE DELETE ON shop_counter_drafts
  WHEN EXISTS (
    SELECT 1 FROM shop_pending_cash_checkouts
    WHERE checkout_kind = 'counter' AND subject_id = OLD.operation_id
  )
  BEGIN
    SELECT RAISE(ABORT, 'cash_checkout_counter_frozen');
  END
''';

const shopPendingCashCheckoutCafeFreezeV21Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_pending_cash_checkouts_cafe_freeze
  BEFORE UPDATE ON shop_cafe_orders
  WHEN EXISTS (
    SELECT 1 FROM shop_pending_cash_checkouts
    WHERE checkout_kind = 'cafe' AND subject_id = OLD.id
  )
  BEGIN
    SELECT RAISE(ABORT, 'cash_checkout_cafe_frozen');
  END
''';

const shopPendingCashCheckoutShiftFreezeV21Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_pending_cash_checkouts_shift_freeze
  BEFORE UPDATE OF state ON shop_cash_shifts
  WHEN NEW.state = 'closed' AND EXISTS (
    SELECT 1 FROM shop_pending_cash_checkouts
    WHERE captured_shift_id = OLD.id
  )
  BEGIN
    SELECT RAISE(ABORT, 'cash_checkout_shift_frozen');
  END
''';

const shopPendingCashCheckoutNoUpdateV21Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_pending_cash_checkouts_no_update
  BEFORE UPDATE ON shop_pending_cash_checkouts
  BEGIN
    SELECT RAISE(ABORT, 'cash_checkout_binding_immutable');
  END
''';

Map<String, String> shopPendingCashCheckoutSchemaDefinitionsV21() =>
    const <String, String>{
      'shop_pending_cash_checkouts': shopPendingCashCheckoutsV21Sql,
      'shop_pending_cash_checkouts_insert_guard':
          shopPendingCashCheckoutInsertGuardV21Sql,
      'shop_pending_cash_checkouts_no_update':
          shopPendingCashCheckoutNoUpdateV21Sql,
      'shop_pending_cash_checkouts_counter_freeze':
          shopPendingCashCheckoutCounterFreezeV21Sql,
      'shop_pending_cash_checkouts_counter_delete_freeze':
          shopPendingCashCheckoutCounterDeleteFreezeV21Sql,
      'shop_pending_cash_checkouts_cafe_freeze':
          shopPendingCashCheckoutCafeFreezeV21Sql,
      'shop_pending_cash_checkouts_shift_freeze':
          shopPendingCashCheckoutShiftFreezeV21Sql,
    };

const shopSiteDevicesV23Sql = '''
  CREATE TABLE IF NOT EXISTS shop_site_devices (
    device_id TEXT PRIMARY KEY NOT NULL CHECK (length(device_id) BETWEEN 1 AND 128),
    tenant_id TEXT NOT NULL CHECK (length(tenant_id) BETWEEN 1 AND 128),
    site_id TEXT NOT NULL CHECK (length(site_id) BETWEEN 1 AND 128),
    public_key_fingerprint TEXT NOT NULL CHECK (length(public_key_fingerprint) = 64),
    session_generation INTEGER NOT NULL CHECK (session_generation >= 0),
    state TEXT NOT NULL CHECK (state IN ('active', 'revoked')),
    enrolled_at_millis INTEGER NOT NULL CHECK (enrolled_at_millis > 0),
    revoked_at_millis INTEGER,
    CHECK ((state = 'active' AND revoked_at_millis IS NULL) OR
      (state = 'revoked' AND revoked_at_millis IS NOT NULL AND
       revoked_at_millis >= enrolled_at_millis))
  )
''';

const shopSiteDevicesUpdateGuardV23Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_site_devices_update_guard
  BEFORE UPDATE ON shop_site_devices
  WHEN NEW.device_id != OLD.device_id
    OR NEW.tenant_id != OLD.tenant_id
    OR NEW.site_id != OLD.site_id
    OR NEW.public_key_fingerprint != OLD.public_key_fingerprint
    OR NEW.enrolled_at_millis != OLD.enrolled_at_millis
    OR NEW.session_generation < OLD.session_generation
    OR (OLD.state = 'revoked' AND NEW.state != 'revoked')
  BEGIN
    SELECT RAISE(ABORT, 'connected_site_device_identity_immutable');
  END
''';

const shopSiteOfflineLeasesV23Sql = '''
  CREATE TABLE IF NOT EXISTS shop_site_offline_leases (
    lease_id TEXT PRIMARY KEY NOT NULL CHECK (length(lease_id) BETWEEN 1 AND 128),
    tenant_id TEXT NOT NULL CHECK (length(tenant_id) BETWEEN 1 AND 128),
    site_id TEXT NOT NULL CHECK (length(site_id) BETWEEN 1 AND 128),
    actor_id TEXT NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 128),
    actor_role TEXT NOT NULL CHECK (actor_role IN
      ('owner', 'manager', 'cashierCounter', 'stockStaff',
       'cafeWaiter', 'cafeKitchenBar')),
    capabilities_json TEXT NOT NULL CHECK (json_valid(capabilities_json)),
    device_id TEXT NOT NULL REFERENCES shop_site_devices(device_id),
    session_generation INTEGER NOT NULL CHECK (session_generation >= 0),
    revocation_generation INTEGER NOT NULL CHECK (revocation_generation >= 0),
    issued_at_millis INTEGER NOT NULL CHECK (issued_at_millis > 0),
    expires_at_millis INTEGER NOT NULL CHECK (
      expires_at_millis > issued_at_millis AND
      expires_at_millis - issued_at_millis <= 604800000),
    key_id TEXT NOT NULL CHECK (length(key_id) BETWEEN 1 AND 128),
    payload_digest TEXT NOT NULL UNIQUE CHECK (length(payload_digest) = 64),
    signature TEXT NOT NULL CHECK (length(signature) BETWEEN 32 AND 4096)
  )
''';

const shopSiteOfflineLeaseInsertGuardV23Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_site_offline_leases_insert_guard
  BEFORE INSERT ON shop_site_offline_leases
  WHEN NOT EXISTS (
    SELECT 1 FROM shop_site_devices device
    JOIN shop_site_revocation_observations observation
      ON observation.tenant_id = device.tenant_id
      AND observation.site_id = device.site_id
    WHERE device.device_id = NEW.device_id
      AND device.tenant_id = NEW.tenant_id
      AND device.site_id = NEW.site_id
      AND device.state = 'active'
      AND device.session_generation = NEW.session_generation
      AND observation.generation = NEW.revocation_generation
  ) BEGIN
    SELECT RAISE(ABORT, 'connected_site_lease_authority_mismatch');
  END
''';

const shopSiteRevocationObservationsV23Sql = '''
  CREATE TABLE IF NOT EXISTS shop_site_revocation_observations (
    tenant_id TEXT NOT NULL CHECK (length(tenant_id) BETWEEN 1 AND 128),
    site_id TEXT NOT NULL CHECK (length(site_id) BETWEEN 1 AND 128),
    generation INTEGER NOT NULL CHECK (generation >= 0),
    observed_at_millis INTEGER NOT NULL CHECK (observed_at_millis > 0),
    source_digest TEXT NOT NULL CHECK (length(source_digest) = 64),
    PRIMARY KEY (tenant_id, site_id)
  )
''';

const shopSiteRevocationObservationUpdateGuardV23Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_site_revocation_observations_update_guard
  BEFORE UPDATE ON shop_site_revocation_observations
  WHEN NEW.tenant_id != OLD.tenant_id
    OR NEW.site_id != OLD.site_id
    OR NEW.generation < OLD.generation
    OR NEW.observed_at_millis < OLD.observed_at_millis
  BEGIN
    SELECT RAISE(ABORT, 'connected_site_revocation_observation_regressed');
  END
''';

const shopSiteCommandsV23Sql = '''
  CREATE TABLE IF NOT EXISTS shop_site_commands (
    command_id TEXT PRIMARY KEY NOT NULL CHECK (length(command_id) BETWEEN 1 AND 128),
    tenant_id TEXT NOT NULL CHECK (length(tenant_id) BETWEEN 1 AND 128),
    site_id TEXT NOT NULL CHECK (length(site_id) BETWEEN 1 AND 128),
    actor_id TEXT NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 128),
    device_id TEXT NOT NULL REFERENCES shop_site_devices(device_id)
      CHECK (length(device_id) BETWEEN 1 AND 128),
    aggregate_type TEXT NOT NULL CHECK (length(aggregate_type) BETWEEN 1 AND 80),
    aggregate_id TEXT NOT NULL CHECK (length(aggregate_id) BETWEEN 1 AND 160),
    capability TEXT NOT NULL CHECK (length(capability) BETWEEN 1 AND 160),
    expected_version INTEGER NOT NULL CHECK (expected_version >= 0),
    payload_digest TEXT NOT NULL CHECK (length(payload_digest) = 64),
    lease_digest TEXT NOT NULL REFERENCES shop_site_offline_leases(payload_digest)
      CHECK (length(lease_digest) = 64),
    command_digest TEXT NOT NULL CHECK (length(command_digest) = 64),
    state TEXT NOT NULL CHECK (state IN ('accepted', 'conflict')),
    received_at_millis INTEGER NOT NULL CHECK (received_at_millis > 0)
  )
''';

const shopSiteCommandsInsertGuardV23Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_site_commands_insert_guard
  BEFORE INSERT ON shop_site_commands
  WHEN NOT EXISTS (
    SELECT 1 FROM shop_site_devices device
    JOIN shop_site_offline_leases lease
      ON lease.device_id = device.device_id
    JOIN shop_site_revocation_observations observation
      ON observation.tenant_id = lease.tenant_id
      AND observation.site_id = lease.site_id
    WHERE device.device_id = NEW.device_id
      AND device.tenant_id = NEW.tenant_id
      AND device.site_id = NEW.site_id
      AND device.state = 'active'
      AND lease.payload_digest = NEW.lease_digest
      AND lease.tenant_id = NEW.tenant_id
      AND lease.site_id = NEW.site_id
      AND lease.actor_id = NEW.actor_id
      AND lease.device_id = NEW.device_id
      AND lease.session_generation = device.session_generation
      AND lease.revocation_generation = observation.generation
      AND NEW.received_at_millis >= lease.issued_at_millis
      AND NEW.received_at_millis < lease.expires_at_millis
      AND EXISTS (
        SELECT 1 FROM json_each(lease.capabilities_json)
        WHERE json_each.value = NEW.capability
      )
  ) BEGIN
    SELECT RAISE(ABORT, 'connected_site_command_authority_mismatch');
  END
''';

const shopSiteEventsV23Sql = '''
  CREATE TABLE IF NOT EXISTS shop_site_events (
    event_row_id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_sequence INTEGER NOT NULL CHECK (site_sequence > 0),
    event_id TEXT NOT NULL UNIQUE CHECK (length(event_id) BETWEEN 1 AND 128),
    command_id TEXT NOT NULL UNIQUE REFERENCES shop_site_commands(command_id),
    tenant_id TEXT NOT NULL CHECK (length(tenant_id) BETWEEN 1 AND 128),
    site_id TEXT NOT NULL CHECK (length(site_id) BETWEEN 1 AND 128),
    aggregate_type TEXT NOT NULL CHECK (length(aggregate_type) BETWEEN 1 AND 80),
    aggregate_id TEXT NOT NULL CHECK (length(aggregate_id) BETWEEN 1 AND 160),
    aggregate_version INTEGER NOT NULL CHECK (aggregate_version > 0),
    event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 1 AND 160),
    payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
    event_digest TEXT NOT NULL CHECK (length(event_digest) = 64),
    created_at_millis INTEGER NOT NULL CHECK (created_at_millis > 0),
    UNIQUE (tenant_id, site_id, site_sequence),
    UNIQUE (tenant_id, site_id, aggregate_type, aggregate_id, aggregate_version)
  )
''';

const shopSiteAggregateVersionsV23Sql = '''
  CREATE TABLE IF NOT EXISTS shop_site_aggregate_versions (
    tenant_id TEXT NOT NULL CHECK (length(tenant_id) BETWEEN 1 AND 128),
    site_id TEXT NOT NULL CHECK (length(site_id) BETWEEN 1 AND 128),
    aggregate_type TEXT NOT NULL CHECK (length(aggregate_type) BETWEEN 1 AND 80),
    aggregate_id TEXT NOT NULL CHECK (length(aggregate_id) BETWEEN 1 AND 160),
    version INTEGER NOT NULL CHECK (version > 0),
    last_event_row_id INTEGER NOT NULL REFERENCES shop_site_events(event_row_id),
    last_site_sequence INTEGER NOT NULL CHECK (last_site_sequence > 0),
    updated_at_millis INTEGER NOT NULL CHECK (updated_at_millis > 0),
    PRIMARY KEY (tenant_id, site_id, aggregate_type, aggregate_id)
  )
''';

const shopSiteCommandAcksV23Sql = '''
  CREATE TABLE IF NOT EXISTS shop_site_command_acks (
    command_id TEXT PRIMARY KEY NOT NULL REFERENCES shop_site_commands(command_id),
    status TEXT NOT NULL CHECK (status IN ('accepted', 'conflict')),
    event_row_id INTEGER REFERENCES shop_site_events(event_row_id),
    site_sequence INTEGER,
    canonical_version INTEGER NOT NULL CHECK (canonical_version >= 0),
    ack_digest TEXT NOT NULL CHECK (length(ack_digest) = 64),
    created_at_millis INTEGER NOT NULL CHECK (created_at_millis > 0),
    CHECK ((status = 'accepted' AND event_row_id IS NOT NULL AND
      site_sequence IS NOT NULL AND canonical_version > 0) OR
      (status = 'conflict' AND event_row_id IS NULL AND site_sequence IS NULL))
  )
''';

const shopSiteClientCursorsV23Sql = '''
  CREATE TABLE IF NOT EXISTS shop_site_client_cursors (
    tenant_id TEXT NOT NULL CHECK (length(tenant_id) BETWEEN 1 AND 128),
    site_id TEXT NOT NULL CHECK (length(site_id) BETWEEN 1 AND 128),
    device_id TEXT NOT NULL REFERENCES shop_site_devices(device_id),
    acknowledged_sequence INTEGER NOT NULL CHECK (acknowledged_sequence >= 0),
    delivered_sequence INTEGER NOT NULL CHECK (delivered_sequence >= acknowledged_sequence),
    updated_at_millis INTEGER NOT NULL CHECK (updated_at_millis > 0),
    PRIMARY KEY (tenant_id, site_id, device_id)
  )
''';

const shopSiteCloudAcksV23Sql = '''
  CREATE TABLE IF NOT EXISTS shop_site_cloud_acks (
    event_row_id INTEGER PRIMARY KEY NOT NULL REFERENCES shop_site_events(event_row_id),
    cloud_event_id TEXT NOT NULL UNIQUE CHECK (length(cloud_event_id) BETWEEN 1 AND 160),
    acknowledgement_digest TEXT NOT NULL CHECK (length(acknowledgement_digest) = 64),
    acknowledged_at_millis INTEGER NOT NULL CHECK (acknowledged_at_millis > 0)
  )
''';

const shopSiteConflictsV23Sql = '''
  CREATE TABLE IF NOT EXISTS shop_site_conflicts (
    conflict_id TEXT PRIMARY KEY NOT NULL CHECK (length(conflict_id) BETWEEN 1 AND 160),
    command_id TEXT NOT NULL UNIQUE REFERENCES shop_site_commands(command_id),
    reason_code TEXT NOT NULL CHECK (length(reason_code) BETWEEN 1 AND 80),
    detail_digest TEXT NOT NULL CHECK (length(detail_digest) = 64),
    state TEXT NOT NULL CHECK (state IN ('pending', 'resolved', 'quarantined')),
    created_at_millis INTEGER NOT NULL CHECK (created_at_millis > 0),
    resolved_at_millis INTEGER,
    CHECK ((state = 'pending' AND resolved_at_millis IS NULL) OR
      (state != 'pending' AND resolved_at_millis IS NOT NULL AND
       resolved_at_millis >= created_at_millis))
  )
''';

const shopSiteRecoveryCheckpointsV23Sql = '''
  CREATE TABLE IF NOT EXISTS shop_site_recovery_checkpoints (
    tenant_id TEXT NOT NULL CHECK (length(tenant_id) BETWEEN 1 AND 128),
    site_id TEXT NOT NULL CHECK (length(site_id) BETWEEN 1 AND 128),
    coordinator_id TEXT NOT NULL CHECK (length(coordinator_id) BETWEEN 1 AND 128),
    event_sequence INTEGER NOT NULL CHECK (event_sequence >= 0),
    snapshot_digest TEXT NOT NULL CHECK (length(snapshot_digest) = 64),
    created_at_millis INTEGER NOT NULL CHECK (created_at_millis > 0),
    PRIMARY KEY (tenant_id, site_id)
  )
''';

const shopSiteStockReservationsV23Sql = '''
  CREATE TABLE IF NOT EXISTS shop_site_stock_reservations (
    reservation_id TEXT PRIMARY KEY NOT NULL CHECK (length(reservation_id) BETWEEN 1 AND 160),
    command_id TEXT NOT NULL UNIQUE REFERENCES shop_site_commands(command_id),
    product_id TEXT NOT NULL REFERENCES shop_products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 2000000000),
    state TEXT NOT NULL CHECK (state IN ('held', 'released', 'committed')),
    expires_at_millis INTEGER NOT NULL CHECK (expires_at_millis > 0),
    created_at_millis INTEGER NOT NULL CHECK (created_at_millis > 0),
    resolved_at_millis INTEGER,
    CHECK ((state = 'held' AND resolved_at_millis IS NULL AND
      expires_at_millis > created_at_millis) OR
      (state != 'held' AND resolved_at_millis IS NOT NULL AND
       resolved_at_millis >= created_at_millis))
  )
''';

const shopSiteAuditV23Sql = '''
  CREATE TABLE IF NOT EXISTS shop_site_audit (
    audit_id TEXT PRIMARY KEY NOT NULL CHECK (length(audit_id) BETWEEN 1 AND 160),
    command_id TEXT NOT NULL UNIQUE REFERENCES shop_site_commands(command_id),
    actor_id TEXT NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 128),
    action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 160),
    metadata_digest TEXT NOT NULL CHECK (length(metadata_digest) = 64),
    created_at_millis INTEGER NOT NULL CHECK (created_at_millis > 0)
  )
''';

const shopConnectedStockReservationHeadersV24Sql = '''
  CREATE TABLE IF NOT EXISTS shop_connected_stock_reservation_headers (
    reservation_id TEXT PRIMARY KEY NOT NULL CHECK (length(reservation_id) BETWEEN 1 AND 128),
    command_id TEXT NOT NULL UNIQUE REFERENCES shop_site_commands(command_id),
    tenant_id TEXT NOT NULL CHECK (length(tenant_id) BETWEEN 1 AND 128),
    site_id TEXT NOT NULL CHECK (length(site_id) BETWEEN 1 AND 128),
    actor_id TEXT NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 128),
    device_id TEXT NOT NULL CHECK (length(device_id) BETWEEN 1 AND 128),
    capability TEXT NOT NULL CHECK (length(capability) BETWEEN 1 AND 80),
    workflow_type TEXT CHECK (workflow_type IS NULL OR workflow_type IN ('retailCart', 'cafeOrder')),
    subject_id TEXT CHECK (subject_id IS NULL OR length(subject_id) BETWEEN 1 AND 128),
    basket_digest TEXT NOT NULL CHECK (length(basket_digest) = 64),
    initial_reservation_digest TEXT NOT NULL CHECK (length(initial_reservation_digest) = 64),
    reservation_json TEXT CHECK (reservation_json IS NULL OR json_valid(reservation_json)),
    issued_at_millis INTEGER NOT NULL CHECK (issued_at_millis > 0),
    expires_at_millis INTEGER NOT NULL CHECK (expires_at_millis > issued_at_millis),
    legacy_source INTEGER NOT NULL DEFAULT 0 CHECK (legacy_source IN (0, 1)),
    CHECK ((legacy_source = 0 AND reservation_json IS NOT NULL AND
      workflow_type IS NOT NULL AND subject_id IS NOT NULL) OR
      (legacy_source = 1 AND reservation_json IS NULL AND
       workflow_type IS NULL AND subject_id IS NULL))
  )
''';

const shopConnectedStockReservationLinesV24Sql = '''
  CREATE TABLE IF NOT EXISTS shop_connected_stock_reservation_lines (
    reservation_id TEXT NOT NULL REFERENCES shop_connected_stock_reservation_headers(reservation_id),
    product_id TEXT NOT NULL REFERENCES shop_products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0 AND quantity <= 1000),
    PRIMARY KEY (reservation_id, product_id)
  )
''';

const shopConnectedStockReservationTransitionsV24Sql = '''
  CREATE TABLE IF NOT EXISTS shop_connected_stock_reservation_transitions (
    transition_id TEXT PRIMARY KEY NOT NULL CHECK (length(transition_id) BETWEEN 1 AND 160),
    operation_id TEXT NOT NULL UNIQUE CHECK (length(operation_id) BETWEEN 1 AND 160),
    reservation_id TEXT NOT NULL REFERENCES shop_connected_stock_reservation_headers(reservation_id),
    from_state TEXT NOT NULL CHECK (from_state = 'held'),
    to_state TEXT NOT NULL CHECK (to_state IN ('released', 'expired', 'committed')),
    before_digest TEXT NOT NULL CHECK (length(before_digest) = 64),
    after_digest TEXT NOT NULL CHECK (length(after_digest) = 64),
    transition_digest TEXT NOT NULL CHECK (length(transition_digest) = 64),
    transition_json TEXT CHECK (transition_json IS NULL OR json_valid(transition_json)),
    sale_id TEXT,
    occurred_at_millis INTEGER NOT NULL CHECK (occurred_at_millis > 0),
    legacy_source INTEGER NOT NULL DEFAULT 0 CHECK (legacy_source IN (0, 1)),
    CHECK ((to_state = 'committed' AND
      ((legacy_source = 0 AND sale_id IS NOT NULL) OR legacy_source = 1)) OR
      (to_state != 'committed' AND sale_id IS NULL)),
    CHECK ((legacy_source = 0 AND transition_json IS NOT NULL) OR
      (legacy_source = 1 AND transition_json IS NULL))
  )
''';

const shopConnectedStockReservationTransitionInsertGuardV24Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_connected_stock_reservation_transition_insert_guard
  BEFORE INSERT ON shop_connected_stock_reservation_transitions
  WHEN EXISTS (
    SELECT 1 FROM shop_connected_stock_reservation_transitions prior
    WHERE prior.reservation_id = NEW.reservation_id
  ) OR NOT EXISTS (
    SELECT 1 FROM shop_connected_stock_reservation_headers header
    WHERE header.reservation_id = NEW.reservation_id
      AND NEW.occurred_at_millis >= header.issued_at_millis
      AND (NEW.to_state != 'committed' OR header.legacy_source = 1 OR
        NEW.occurred_at_millis < header.expires_at_millis)
      AND (NEW.to_state != 'expired' OR NEW.occurred_at_millis >= header.expires_at_millis)
  ) BEGIN
    SELECT RAISE(ABORT, 'connected_stock_reservation_transition_invalid');
  END
''';

const shopConnectedTrustedTimeV24Sql = '''
  CREATE TABLE IF NOT EXISTS shop_connected_trusted_time (
    tenant_id TEXT NOT NULL CHECK (length(tenant_id) BETWEEN 1 AND 128),
    site_id TEXT NOT NULL CHECK (length(site_id) BETWEEN 1 AND 128),
    observed_at_millis INTEGER NOT NULL CHECK (observed_at_millis > 0),
    PRIMARY KEY (tenant_id, site_id)
  )
''';

const shopConnectedScopeBindingV24Sql = '''
  CREATE TABLE IF NOT EXISTS shop_connected_scope_binding (
    singleton INTEGER PRIMARY KEY NOT NULL CHECK (singleton = 1),
    tenant_id TEXT NOT NULL CHECK (length(tenant_id) BETWEEN 1 AND 128),
    site_id TEXT NOT NULL CHECK (length(site_id) BETWEEN 1 AND 128),
    enrollment_evidence_digest TEXT NOT NULL CHECK (length(enrollment_evidence_digest) = 64),
    bound_at_millis INTEGER NOT NULL CHECK (bound_at_millis > 0)
  )
''';

const shopConnectedTenderReservationBindingsV24Sql = '''
  CREATE TABLE IF NOT EXISTS shop_connected_tender_reservation_bindings (
    operation_id TEXT NOT NULL CHECK (length(operation_id) BETWEEN 1 AND 120),
    tender_kind TEXT NOT NULL CHECK (tender_kind IN ('cash', 'wallet')),
    reservation_id TEXT NOT NULL REFERENCES shop_connected_stock_reservation_headers(reservation_id),
    reservation_digest TEXT NOT NULL CHECK (length(reservation_digest) = 64),
    tenant_id TEXT NOT NULL CHECK (length(tenant_id) BETWEEN 1 AND 128),
    site_id TEXT NOT NULL CHECK (length(site_id) BETWEEN 1 AND 128),
    workflow_type TEXT NOT NULL CHECK (workflow_type IN ('retailCart', 'cafeOrder')),
    subject_id TEXT NOT NULL CHECK (length(subject_id) BETWEEN 1 AND 128),
    basket_digest TEXT NOT NULL CHECK (length(basket_digest) = 64),
    binding_digest TEXT NOT NULL CHECK (length(binding_digest) = 64),
    created_at_millis INTEGER NOT NULL CHECK (created_at_millis > 0),
    PRIMARY KEY (operation_id, tender_kind)
  )
''';

const shopConnectedTrustedTimeUpdateGuardV24Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_connected_trusted_time_update_guard
  BEFORE UPDATE ON shop_connected_trusted_time
  WHEN NEW.tenant_id != OLD.tenant_id OR NEW.site_id != OLD.site_id OR
    NEW.observed_at_millis < OLD.observed_at_millis
  BEGIN
    SELECT RAISE(ABORT, 'connected_trusted_time_regressed');
  END
''';

Map<String, String> shopConnectedStockReservationSchemaDefinitionsV24() => {
  'shop_connected_stock_reservation_headers':
      shopConnectedStockReservationHeadersV24Sql,
  'shop_connected_stock_reservation_lines':
      shopConnectedStockReservationLinesV24Sql,
  'shop_connected_stock_reservation_transitions':
      shopConnectedStockReservationTransitionsV24Sql,
  'shop_connected_stock_reservation_transition_insert_guard':
      shopConnectedStockReservationTransitionInsertGuardV24Sql,
  'shop_connected_trusted_time': shopConnectedTrustedTimeV24Sql,
  'shop_connected_scope_binding': shopConnectedScopeBindingV24Sql,
  'shop_connected_tender_reservation_bindings':
      shopConnectedTenderReservationBindingsV24Sql,
  'shop_connected_trusted_time_update_guard':
      shopConnectedTrustedTimeUpdateGuardV24Sql,
  'shop_connected_trusted_time_no_delete': shopImmutableTriggerV11Sql(
    table: 'shop_connected_trusted_time',
    operation: 'delete',
    message: 'Connected trusted time cannot be removed',
  ),
  'shop_connected_scope_binding_no_update': shopImmutableTriggerV11Sql(
    table: 'shop_connected_scope_binding',
    operation: 'update',
    message: 'Connected stock scope binding is immutable',
  ),
  'shop_connected_scope_binding_no_delete': shopImmutableTriggerV11Sql(
    table: 'shop_connected_scope_binding',
    operation: 'delete',
    message: 'Connected stock scope binding is immutable',
  ),
  'shop_connected_tender_reservation_bindings_no_update':
      shopImmutableTriggerV11Sql(
        table: 'shop_connected_tender_reservation_bindings',
        operation: 'update',
        message: 'Connected tender reservation binding is immutable',
      ),
  'shop_connected_tender_reservation_bindings_no_delete':
      shopImmutableTriggerV11Sql(
        table: 'shop_connected_tender_reservation_bindings',
        operation: 'delete',
        message: 'Connected tender reservation binding is immutable',
      ),
  for (final table in const [
    'shop_connected_stock_reservation_headers',
    'shop_connected_stock_reservation_lines',
    'shop_connected_stock_reservation_transitions',
  ]) ...{
    '${table}_no_update': shopImmutableTriggerV11Sql(
      table: table,
      operation: 'update',
      message: 'Connected stock reservation evidence is immutable',
    ),
    '${table}_no_delete': shopImmutableTriggerV11Sql(
      table: table,
      operation: 'delete',
      message: 'Connected stock reservation evidence is immutable',
    ),
  },
};

Map<String, String> shopConnectedSiteSchemaDefinitionsV23() {
  final definitions = <String, String>{
    'shop_site_devices': shopSiteDevicesV23Sql,
    'shop_site_devices_update_guard': shopSiteDevicesUpdateGuardV23Sql,
    'shop_site_devices_no_delete': shopImmutableTriggerV11Sql(
      table: 'shop_site_devices',
      operation: 'delete',
      message: 'Connected site device history is immutable',
    ),
    'shop_site_revocation_observations': shopSiteRevocationObservationsV23Sql,
    'shop_site_revocation_observations_update_guard':
        shopSiteRevocationObservationUpdateGuardV23Sql,
    'shop_site_revocation_observations_no_delete': shopImmutableTriggerV11Sql(
      table: 'shop_site_revocation_observations',
      operation: 'delete',
      message: 'Connected site revocation history is immutable',
    ),
    'shop_site_offline_leases': shopSiteOfflineLeasesV23Sql,
    'shop_site_offline_leases_insert_guard':
        shopSiteOfflineLeaseInsertGuardV23Sql,
    'shop_site_commands': shopSiteCommandsV23Sql,
    'shop_site_commands_insert_guard': shopSiteCommandsInsertGuardV23Sql,
    'shop_site_events': shopSiteEventsV23Sql,
    'shop_site_aggregate_versions': shopSiteAggregateVersionsV23Sql,
    'shop_site_command_acks': shopSiteCommandAcksV23Sql,
    'shop_site_client_cursors': shopSiteClientCursorsV23Sql,
    'shop_site_cloud_acks': shopSiteCloudAcksV23Sql,
    'shop_site_conflicts': shopSiteConflictsV23Sql,
    'shop_site_recovery_checkpoints': shopSiteRecoveryCheckpointsV23Sql,
    'shop_site_stock_reservations': shopSiteStockReservationsV23Sql,
    'shop_site_audit': shopSiteAuditV23Sql,
  };
  for (final table in const [
    'shop_site_offline_leases',
    'shop_site_commands',
    'shop_site_events',
    'shop_site_command_acks',
    'shop_site_cloud_acks',
    'shop_site_audit',
  ]) {
    definitions['${table}_no_update'] = shopImmutableTriggerV11Sql(
      table: table,
      operation: 'update',
      message: 'Connected site history is immutable',
    );
    definitions['${table}_no_delete'] = shopImmutableTriggerV11Sql(
      table: table,
      operation: 'delete',
      message: 'Connected site history is immutable',
    );
  }
  return definitions;
}

Map<String, String> shopConnectedSiteSchemaDefinitionsV24() => {
  ...shopConnectedSiteSchemaDefinitionsV23(),
  ...shopConnectedStockReservationSchemaDefinitionsV24(),
};

const shopSitePairingNoncesV25Sql = '''
  CREATE TABLE IF NOT EXISTS shop_site_pairing_nonces (
    nonce TEXT PRIMARY KEY NOT NULL CHECK (length(nonce) BETWEEN 22 AND 128),
    tenant_id TEXT NOT NULL CHECK (length(tenant_id) BETWEEN 1 AND 128),
    site_id TEXT NOT NULL CHECK (length(site_id) BETWEEN 1 AND 128),
    coordinator_device_id TEXT NOT NULL CHECK (length(coordinator_device_id) BETWEEN 1 AND 128),
    issued_at_millis INTEGER NOT NULL CHECK (issued_at_millis > 0),
    expires_at_millis INTEGER NOT NULL CHECK (expires_at_millis > issued_at_millis),
    consumed_at_millis INTEGER,
    CHECK (consumed_at_millis IS NULL OR
      (consumed_at_millis >= issued_at_millis AND consumed_at_millis < expires_at_millis))
  )
''';

const shopSitePairingNoncesUpdateGuardV25Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_site_pairing_nonces_update_guard
  BEFORE UPDATE ON shop_site_pairing_nonces
  WHEN NEW.nonce != OLD.nonce OR NEW.tenant_id != OLD.tenant_id OR
    NEW.site_id != OLD.site_id OR
    NEW.coordinator_device_id != OLD.coordinator_device_id OR
    NEW.issued_at_millis != OLD.issued_at_millis OR
    NEW.expires_at_millis != OLD.expires_at_millis OR
    OLD.consumed_at_millis IS NOT NULL OR NEW.consumed_at_millis IS NULL
  BEGIN
    SELECT RAISE(ABORT, 'connected_pairing_nonce_immutable');
  END
''';

const shopSitePendingEnrollmentsV25Sql = '''
  CREATE TABLE IF NOT EXISTS shop_site_pending_enrollments (
    client_fingerprint TEXT PRIMARY KEY NOT NULL CHECK (length(client_fingerprint) = 64),
    nonce TEXT NOT NULL UNIQUE REFERENCES shop_site_pairing_nonces(nonce),
    tenant_id TEXT NOT NULL CHECK (length(tenant_id) BETWEEN 1 AND 128),
    site_id TEXT NOT NULL CHECK (length(site_id) BETWEEN 1 AND 128),
    coordinator_device_id TEXT NOT NULL CHECK (length(coordinator_device_id) BETWEEN 1 AND 128),
    public_key BLOB NOT NULL CHECK (length(public_key) = 32),
    key_algorithm TEXT NOT NULL CHECK (key_algorithm = 'ed25519'),
    observed_at_millis INTEGER NOT NULL CHECK (observed_at_millis > 0)
  )
''';

const shopSiteEnrollmentEvidenceV25Sql = '''
  CREATE TABLE IF NOT EXISTS shop_site_enrollment_evidence (
    evidence_digest TEXT PRIMARY KEY NOT NULL CHECK (length(evidence_digest) = 64),
    action TEXT NOT NULL CHECK (action IN ('approve', 'revoke')),
    tenant_id TEXT NOT NULL CHECK (length(tenant_id) BETWEEN 1 AND 128),
    site_id TEXT NOT NULL CHECK (length(site_id) BETWEEN 1 AND 128),
    coordinator_device_id TEXT NOT NULL CHECK (length(coordinator_device_id) BETWEEN 1 AND 128),
    device_id TEXT NOT NULL CHECK (length(device_id) BETWEEN 1 AND 128),
    client_fingerprint TEXT NOT NULL CHECK (length(client_fingerprint) = 64),
    session_generation INTEGER NOT NULL CHECK (session_generation >= 0),
    observed_at_millis INTEGER NOT NULL CHECK (observed_at_millis > 0),
    authority_key_id TEXT NOT NULL CHECK (length(authority_key_id) BETWEEN 1 AND 128),
    evidence_json TEXT NOT NULL CHECK (json_valid(evidence_json))
  )
''';

const shopSiteRequestNoncesV25Sql = '''
  CREATE TABLE IF NOT EXISTS shop_site_request_nonces (
    client_fingerprint TEXT NOT NULL CHECK (length(client_fingerprint) = 64),
    nonce TEXT NOT NULL CHECK (length(nonce) BETWEEN 22 AND 128),
    expires_at_millis INTEGER NOT NULL CHECK (expires_at_millis > 0),
    consumed_at_millis INTEGER NOT NULL CHECK (consumed_at_millis > 0),
    PRIMARY KEY (client_fingerprint, nonce)
  )
''';

const shopSiteDevicesFingerprintUniqueV25Sql = '''
  CREATE UNIQUE INDEX IF NOT EXISTS shop_site_devices_fingerprint_unique
  ON shop_site_devices(public_key_fingerprint)
''';

Map<String, String> shopConnectedEnrollmentSchemaDefinitionsV25() => {
  'shop_site_devices_fingerprint_unique':
      shopSiteDevicesFingerprintUniqueV25Sql,
  'shop_site_pairing_nonces': shopSitePairingNoncesV25Sql,
  'shop_site_pairing_nonces_update_guard':
      shopSitePairingNoncesUpdateGuardV25Sql,
  'shop_site_pairing_nonces_no_delete': shopImmutableTriggerV11Sql(
    table: 'shop_site_pairing_nonces',
    operation: 'delete',
    message: 'Connected pairing nonce history is immutable',
  ),
  'shop_site_pending_enrollments': shopSitePendingEnrollmentsV25Sql,
  'shop_site_enrollment_evidence': shopSiteEnrollmentEvidenceV25Sql,
  'shop_site_request_nonces': shopSiteRequestNoncesV25Sql,
  for (final table in const [
    'shop_site_pending_enrollments',
    'shop_site_enrollment_evidence',
    'shop_site_request_nonces',
  ]) ...{
    '${table}_no_update': shopImmutableTriggerV11Sql(
      table: table,
      operation: 'update',
      message: 'Connected authority evidence is immutable',
    ),
    '${table}_no_delete': shopImmutableTriggerV11Sql(
      table: table,
      operation: 'delete',
      message: 'Connected authority evidence is immutable',
    ),
  },
};

Map<String, String> shopConnectedSiteSchemaDefinitionsV25() => {
  ...shopConnectedSiteSchemaDefinitionsV24(),
  ...shopConnectedEnrollmentSchemaDefinitionsV25(),
};

const shopSiteCloudDispositionsV26Sql = '''
  CREATE TABLE IF NOT EXISTS shop_site_cloud_dispositions (
    event_row_id INTEGER PRIMARY KEY NOT NULL REFERENCES shop_site_events(event_row_id),
    disposition_kind TEXT NOT NULL CHECK (disposition_kind IN ('ack', 'conflict')),
    disposition_json TEXT NOT NULL CHECK (json_valid(disposition_json)),
    disposition_digest TEXT NOT NULL CHECK (length(disposition_digest) = 64),
    observed_at_millis INTEGER NOT NULL CHECK (observed_at_millis > 0)
  )
''';

Map<String, String> shopConnectedCloudDispositionSchemaDefinitionsV26() => {
  'shop_site_cloud_dispositions': shopSiteCloudDispositionsV26Sql,
  'shop_site_cloud_dispositions_no_update': shopImmutableTriggerV11Sql(
    table: 'shop_site_cloud_dispositions',
    operation: 'update',
    message: 'Connected cloud disposition evidence is immutable',
  ),
  'shop_site_cloud_dispositions_no_delete': shopImmutableTriggerV11Sql(
    table: 'shop_site_cloud_dispositions',
    operation: 'delete',
    message: 'Connected cloud disposition evidence is immutable',
  ),
  'shop_site_conflicts_no_update': shopImmutableTriggerV11Sql(
    table: 'shop_site_conflicts',
    operation: 'update',
    message: 'Connected conflict evidence is immutable',
  ),
  'shop_site_conflicts_no_delete': shopImmutableTriggerV11Sql(
    table: 'shop_site_conflicts',
    operation: 'delete',
    message: 'Connected conflict evidence is immutable',
  ),
};

Map<String, String> shopConnectedSiteSchemaDefinitionsV26() => {
  ...shopConnectedSiteSchemaDefinitionsV25(),
  ...shopConnectedCloudDispositionSchemaDefinitionsV26(),
};

/// Reconstructs every retained cloud disposition from canonical bytes and
/// binds it to the immutable local command/event plus its legacy ack/conflict
/// index rows. Shared by live-open and encrypted-backup verification.
bool shopConnectedCloudDispositionRowsValidV26({
  required Iterable<Map<String, Object?>> commands,
  required Iterable<Map<String, Object?>> events,
  required Iterable<Map<String, Object?>> cloudAcks,
  required Iterable<Map<String, Object?>> conflicts,
  required Iterable<Map<String, Object?>> dispositions,
}) {
  try {
    final commandById = <String, Map<String, Object?>>{
      for (final row in commands) row['command_id']! as String: row,
    };
    final eventByRowId = <int, Map<String, Object?>>{
      for (final row in events) row['event_row_id']! as int: row,
    };
    final cloudAckByRowId = <int, Map<String, Object?>>{
      for (final row in cloudAcks) row['event_row_id']! as int: row,
    };
    final conflictByCommand = <String, Map<String, Object?>>{
      for (final row in conflicts) row['command_id']! as String: row,
    };
    final seenRows = <int>{};
    for (final row in dispositions) {
      final eventRowId = row['event_row_id'];
      final kind = row['disposition_kind'];
      final encoded = row['disposition_json'];
      final digest = row['disposition_digest'];
      final observedAt = row['observed_at_millis'];
      if (eventRowId is! int ||
          !seenRows.add(eventRowId) ||
          (kind != 'ack' && kind != 'conflict') ||
          encoded is! String ||
          digest is! String ||
          observedAt is! int ||
          observedAt <= 0) {
        return false;
      }
      final decoded = jsonDecode(encoded);
      if (decoded is! Map ||
          canonicalConnectedSiteJson(decoded) != encoded ||
          connectedSiteSha256(decoded) != digest) {
        return false;
      }
      final event = eventByRowId[eventRowId];
      final cloudAck = cloudAckByRowId[eventRowId];
      if (event == null ||
          cloudAck == null ||
          cloudAck['cloud_event_id'] != '$kind:$digest' ||
          cloudAck['acknowledgement_digest'] != digest ||
          cloudAck['acknowledged_at_millis'] != observedAt) {
        return false;
      }
      final commandId = event['command_id'];
      final command = commandId is String ? commandById[commandId] : null;
      if (command == null) return false;
      if (kind == 'ack') {
        final ack = SiteCommandAckV1.fromJson(decoded);
        if ((ack.state != SiteCommandAckState.accepted &&
                ack.state != SiteCommandAckState.replayed) ||
            ack.commandId != commandId ||
            ack.commandDigest != command['command_digest'] ||
            ack.eventDigest != event['event_digest'] ||
            ack.canonicalVersion != event['aggregate_version']) {
          return false;
        }
      } else {
        final conflict = SiteConflictV1.fromJson(decoded);
        final retained = conflictByCommand[commandId];
        final createdAt = DateTime.parse(conflict.createdAt)
            .toUtc()
            .millisecondsSinceEpoch;
        if (conflict.state != SiteConflictState.quarantined ||
            conflict.commandId != commandId ||
            conflict.commandDigest != command['command_digest'] ||
            conflict.workspaceId != event['tenant_id'] ||
            conflict.siteId != event['site_id'] ||
            conflict.aggregateType != event['aggregate_type'] ||
            conflict.aggregateId != event['aggregate_id'] ||
            conflict.expectedVersion !=
                (event['aggregate_version'] as int) - 1 ||
            retained == null ||
            retained['conflict_id'] != conflict.conflictId ||
            retained['reason_code'] != conflict.reason ||
            retained['detail_digest'] != digest ||
            retained['state'] != 'quarantined' ||
            retained['created_at_millis'] != createdAt ||
            retained['resolved_at_millis'] != createdAt) {
          return false;
        }
      }
    }
    if (seenRows.length != cloudAckByRowId.length) return false;
    for (final conflict in conflicts) {
      final command = commandById[conflict['command_id']];
      if (command?['state'] == 'accepted') {
        final event = events
            .where((row) => row['command_id'] == conflict['command_id'])
            .firstOrNull;
        if (event == null || !seenRows.contains(event['event_row_id'])) {
          return false;
        }
      }
    }
    return true;
  } on Object {
    return false;
  }
}

/// Reconstructs the complete v25 pairing -> approval -> revocation chain.
///
/// This is shared by live-open and backup verification so a snapshot cannot
/// gain authority merely by satisfying SQLite's structural constraints.
bool shopConnectedEnrollmentRowsValidV25({
  required Iterable<Map<String, Object?>> pairingNonces,
  required Iterable<Map<String, Object?>> pendingEnrollments,
  required Iterable<Map<String, Object?>> enrollmentEvidence,
  required Iterable<Map<String, Object?>> devices,
  required Iterable<Map<String, Object?>> requestNonces,
}) {
  try {
    Map<String, Map<String, Object?>> uniqueBy(
      Iterable<Map<String, Object?>> rows,
      String key,
    ) {
      final result = <String, Map<String, Object?>>{};
      for (final row in rows) {
        final value = row[key];
        if (value is! String || result.containsKey(value)) {
          throw const FormatException('connected_enrollment_duplicate');
        }
        result[value] = row;
      }
      return result;
    }

    final nonces = uniqueBy(pairingNonces, 'nonce');
    final pending = uniqueBy(pendingEnrollments, 'client_fingerprint');
    final evidence = enrollmentEvidence.toList(growable: false);
    final deviceRows = devices.toList(growable: false);
    final deviceIds = <String>{};
    final deviceByFingerprint = <String, Map<String, Object?>>{};
    for (final device in deviceRows) {
      final deviceId = device['device_id'];
      final fingerprint = device['public_key_fingerprint'];
      if (deviceId is! String ||
          !deviceIds.add(deviceId) ||
          fingerprint is! String ||
          deviceByFingerprint.containsKey(fingerprint)) {
        return false;
      }
      deviceByFingerprint[fingerprint] = device;
    }

    for (final entry in pending.entries) {
      final row = entry.value;
      final nonce = nonces[row['nonce']];
      final key = row['public_key'];
      if (nonce == null || key is! List<int>) return false;
      if (nonce['consumed_at_millis'] != row['observed_at_millis'] ||
          nonce['tenant_id'] != row['tenant_id'] ||
          nonce['site_id'] != row['site_id'] ||
          nonce['coordinator_device_id'] != row['coordinator_device_id'] ||
          row['key_algorithm'] != 'ed25519' ||
          crypto.sha256.convert(key).toString() != entry.key) {
        return false;
      }
    }

    final approvals = <String, Map<String, Object?>>{};
    final revocations = <String, Map<String, Object?>>{};
    for (final row in evidence) {
      final raw = row['evidence_json'];
      if (raw is! String) return false;
      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic> ||
          canonicalConnectedSiteJson(decoded) != raw) {
        return false;
      }
      const columns = <String, String>{
        'action': 'action',
        'tenantId': 'tenant_id',
        'siteId': 'site_id',
        'coordinatorDeviceId': 'coordinator_device_id',
        'deviceId': 'device_id',
        'clientFingerprint': 'client_fingerprint',
        'sessionGeneration': 'session_generation',
        'observedAtMillis': 'observed_at_millis',
        'authorityKeyId': 'authority_key_id',
        'evidenceDigest': 'evidence_digest',
      };
      if (decoded.keys.toSet().difference({
            'schema',
            'action',
            'tenantId',
            'siteId',
            'coordinatorDeviceId',
            'deviceId',
            'clientFingerprint',
            'sessionGeneration',
            'observedAtMillis',
            'authorityKeyId',
            'signature',
            'evidenceDigest',
          }).isNotEmpty ||
          decoded.length != 12 ||
          decoded['schema'] != 'supermega.shop.owner-enrollment-evidence.v1' ||
          decoded['signature'] is! String) {
        return false;
      }
      for (final entry in columns.entries) {
        if (decoded[entry.key] != row[entry.value]) return false;
      }
      final signingPayload = Map<String, Object?>.from(decoded)
        ..remove('signature')
        ..remove('evidenceDigest');
      if (connectedSiteSha256(signingPayload) != row['evidence_digest']) {
        return false;
      }
      final fingerprint = row['client_fingerprint'];
      if (fingerprint is! String) return false;
      final paired = pending[fingerprint];
      if (paired == null ||
          paired['tenant_id'] != row['tenant_id'] ||
          paired['site_id'] != row['site_id'] ||
          paired['coordinator_device_id'] != row['coordinator_device_id'] ||
          (row['observed_at_millis'] as int) <
              (paired['observed_at_millis'] as int)) {
        return false;
      }
      final target = row['action'] == 'approve'
          ? approvals
          : row['action'] == 'revoke'
          ? revocations
          : null;
      if (target == null || target.containsKey(fingerprint)) return false;
      target[fingerprint] = row;
    }

    final managedDeviceEntries = deviceByFingerprint.entries.where(
      (entry) =>
          pending.containsKey(entry.key) ||
          approvals.containsKey(entry.key) ||
          revocations.containsKey(entry.key),
    );
    var managedDeviceCount = 0;
    for (final entry in managedDeviceEntries) {
      managedDeviceCount += 1;
      final device = entry.value;
      final approval = approvals[entry.key];
      final revocation = revocations[entry.key];
      if (approval == null ||
          approval['device_id'] != device['device_id'] ||
          approval['tenant_id'] != device['tenant_id'] ||
          approval['site_id'] != device['site_id'] ||
          approval['observed_at_millis'] != device['enrolled_at_millis']) {
        return false;
      }
      if (device['state'] == 'active') {
        if (revocation != null ||
            approval['session_generation'] != device['session_generation'] ||
            device['revoked_at_millis'] != null) {
          return false;
        }
      } else if (device['state'] == 'revoked') {
        if (revocation == null ||
            revocation['device_id'] != device['device_id'] ||
            revocation['tenant_id'] != device['tenant_id'] ||
            revocation['site_id'] != device['site_id'] ||
            revocation['observed_at_millis'] != device['revoked_at_millis'] ||
            revocation['session_generation'] != device['session_generation'] ||
            (revocation['session_generation'] as int) <=
                (approval['session_generation'] as int) ||
            (revocation['observed_at_millis'] as int) <
                (approval['observed_at_millis'] as int)) {
          return false;
        }
      } else {
        return false;
      }
    }
    if (approvals.length != managedDeviceCount ||
        revocations.keys.any(
          (fingerprint) => !approvals.containsKey(fingerprint),
        )) {
      return false;
    }

    final seenRequests = <String>{};
    for (final row in requestNonces) {
      final fingerprint = row['client_fingerprint'];
      final nonce = row['nonce'];
      final consumed = row['consumed_at_millis'];
      final expires = row['expires_at_millis'];
      if (fingerprint is! String ||
          nonce is! String ||
          consumed is! int ||
          expires is! int ||
          consumed >= expires ||
          !deviceByFingerprint.containsKey(fingerprint) ||
          !seenRequests.add('$fingerprint\u0000$nonce')) {
        return false;
      }
    }
    return true;
  } on Object {
    return false;
  }
}

bool shopConnectedStockReservationRowsValidV24({
  required Iterable<Map<String, Object?>> commands,
  required Iterable<Map<String, Object?>> events,
  required Iterable<Map<String, Object?>> headers,
  required Iterable<Map<String, Object?>> lines,
  required Iterable<Map<String, Object?>> transitions,
  required Iterable<Map<String, Object?>> sales,
  required Iterable<Map<String, Object?>> trustedTimes,
  required Iterable<Map<String, Object?>> scopeBindings,
  required Iterable<Map<String, Object?>> tenderBindings,
  required Iterable<Map<String, Object?>> pendingCashCheckouts,
  required Iterable<Map<String, Object?>> walletCheckoutIntents,
}) {
  try {
    final commandById = <String, Map<String, Object?>>{
      for (final row in commands) row['command_id']! as String: row,
    };
    final eventByCommand = <String, Map<String, Object?>>{};
    for (final row in events) {
      final commandId = row['command_id'];
      if (commandId is! String ||
          eventByCommand.putIfAbsent(commandId, () => row) != row) {
        return false;
      }
    }
    bool eventMatches({
      required Map<String, Object?> event,
      required String commandId,
      required String tenantId,
      required String siteId,
      required String aggregateType,
      required String aggregateId,
      required String eventType,
      required Map<String, Object?> payload,
    }) {
      final createdAt = event['created_at_millis'];
      final eventId = event['event_id'];
      final aggregateVersion = event['aggregate_version'];
      if (createdAt is! int ||
          createdAt <= 0 ||
          eventId is! String ||
          aggregateVersion is! int ||
          aggregateVersion <= 0 ||
          event['command_id'] != commandId ||
          event['tenant_id'] != tenantId ||
          event['site_id'] != siteId ||
          event['aggregate_type'] != aggregateType ||
          event['aggregate_id'] != aggregateId ||
          event['event_type'] != eventType ||
          event['payload_json'] != canonicalConnectedSiteJson(payload)) {
        return false;
      }
      final envelope = <String, Object?>{
        'eventId': eventId,
        'workspaceId': tenantId,
        'siteId': siteId,
        'aggregateType': aggregateType,
        'aggregateId': aggregateId,
        'aggregateVersion': aggregateVersion,
        'eventType': eventType,
        'occurredAt': DateTime.fromMillisecondsSinceEpoch(
          createdAt,
          isUtc: true,
        ).toIso8601String(),
        'payload': payload,
      };
      return event['event_digest'] == connectedSiteSha256(envelope);
    }

    final saleById = <String, Map<String, Object?>>{
      for (final row in sales) row['id']! as String: row,
    };
    final trustedByScope = <String, int>{};
    for (final row in trustedTimes) {
      final tenantId = row['tenant_id'];
      final siteId = row['site_id'];
      final observed = row['observed_at_millis'];
      if (tenantId is! String ||
          siteId is! String ||
          observed is! int ||
          observed <= 0) {
        return false;
      }
      trustedByScope['$tenantId\u0000$siteId'] = observed;
    }
    final scopeRows = scopeBindings.toList(growable: false);
    if (scopeRows.length > 1) return false;
    String? boundScope;
    if (scopeRows.isNotEmpty) {
      final row = scopeRows.single;
      final tenantId = row['tenant_id'];
      final siteId = row['site_id'];
      final singleton = row['singleton'];
      final boundAt = row['bound_at_millis'];
      final evidenceDigest = row['enrollment_evidence_digest'];
      if (singleton != 1 ||
          tenantId is! String ||
          siteId is! String ||
          evidenceDigest is! String ||
          !RegExp(r'^[0-9a-f]{64}$').hasMatch(evidenceDigest) ||
          boundAt is! int ||
          boundAt <= 0) {
        return false;
      }
      boundScope = '$tenantId\u0000$siteId';
    }
    final linesByReservation = <String, List<Map<String, Object?>>>{};
    for (final row in lines) {
      final reservationId = row['reservation_id'];
      final productId = row['product_id'];
      final quantity = row['quantity'];
      if (reservationId is! String ||
          productId is! String ||
          quantity is! int ||
          quantity < 1 ||
          quantity > 1000) {
        return false;
      }
      linesByReservation.putIfAbsent(reservationId, () => []).add(row);
    }
    final transitionsByReservation = <String, List<Map<String, Object?>>>{};
    for (final row in transitions) {
      final reservationId = row['reservation_id'];
      if (reservationId is! String) return false;
      transitionsByReservation.putIfAbsent(reservationId, () => []).add(row);
    }
    final knownReservations = <String>{};
    final headerByReservation = <String, Map<String, Object?>>{};
    for (final header in headers) {
      final reservationId = header['reservation_id'];
      final commandId = header['command_id'];
      if (reservationId is! String || commandId is! String) return false;
      if (!knownReservations.add(reservationId)) return false;
      headerByReservation[reservationId] = header;
      if (boundScope != '${header['tenant_id']}\u0000${header['site_id']}') {
        return false;
      }
      final command = commandById[commandId];
      final reserveEvent = eventByCommand[commandId];
      if (command == null ||
          command['tenant_id'] != header['tenant_id'] ||
          command['site_id'] != header['site_id'] ||
          command['actor_id'] != header['actor_id'] ||
          command['device_id'] != header['device_id'] ||
          command['capability'] != header['capability'] ||
          reserveEvent == null) {
        return false;
      }
      final storedLines = linesByReservation[reservationId] ?? const [];
      if (storedLines.isEmpty) return false;
      final terminalRows = transitionsByReservation[reservationId] ?? const [];
      if (terminalRows.length > 1) return false;
      final legacy = header['legacy_source'] == 1;
      if (legacy) {
        if (header['reservation_json'] != null ||
            header['workflow_type'] != null ||
            header['subject_id'] != null ||
            terminalRows.any(
              (row) =>
                  row['legacy_source'] != 1 || row['transition_json'] != null,
            )) {
          return false;
        }
        continue;
      }
      if (header['legacy_source'] != 0 ||
          header['reservation_json'] is! String ||
          header['workflow_type'] is! String ||
          header['subject_id'] is! String) {
        return false;
      }
      final reservation = ConnectedStockReservationV1.fromJson(
        jsonDecode(header['reservation_json']! as String),
      );
      if (reservation.state != ConnectedStockReservationState.held ||
          reservation.stateVersion != 1 ||
          reservation.reservationId != reservationId ||
          reservation.workspaceId != header['tenant_id'] ||
          reservation.siteId != header['site_id'] ||
          reservation.actorId != header['actor_id'] ||
          reservation.deviceId != header['device_id'] ||
          reservation.capability.name != header['capability'] ||
          reservation.workflowType.name != header['workflow_type'] ||
          reservation.subjectId != header['subject_id'] ||
          reservation.basketDigest != header['basket_digest'] ||
          reservation.reservationDigest !=
              header['initial_reservation_digest'] ||
          DateTime.parse(reservation.issuedAt).millisecondsSinceEpoch !=
              header['issued_at_millis'] ||
          DateTime.parse(reservation.expiresAt).millisecondsSinceEpoch !=
              header['expires_at_millis'] ||
          canonicalConnectedSiteJson(reservation.toJson()) !=
              header['reservation_json']) {
        return false;
      }
      final reservePayload = <String, Object?>{
        'contract': _shopConnectedStockReservePayloadContract,
        'reservation': reservation.toJson(),
      };
      if (command['payload_digest'] != connectedSiteSha256(reservePayload) ||
          !eventMatches(
            event: reserveEvent,
            commandId: commandId,
            tenantId: reservation.workspaceId,
            siteId: reservation.siteId,
            aggregateType: reservation.workflowType.name,
            aggregateId: reservation.subjectId,
            eventType: shopConnectedStockReservedEventType,
            payload: reservePayload,
          )) {
        return false;
      }
      final expectedLines = reservation.lines;
      storedLines.sort(
        (left, right) => (left['product_id']! as String).compareTo(
          right['product_id']! as String,
        ),
      );
      if (storedLines.length != expectedLines.length) return false;
      for (var index = 0; index < expectedLines.length; index++) {
        if (storedLines[index]['product_id'] !=
                expectedLines[index].productId ||
            storedLines[index]['quantity'] != expectedLines[index].quantity) {
          return false;
        }
      }
      if (terminalRows.isEmpty) continue;
      final terminal = terminalRows.single;
      if (terminal['legacy_source'] != 0 ||
          terminal['transition_json'] is! String) {
        return false;
      }
      final transition = ConnectedStockReservationTransitionV1.fromJson(
        jsonDecode(terminal['transition_json']! as String),
      );
      if (canonicalConnectedSiteJson(transition.before.toJson()) !=
              canonicalConnectedSiteJson(reservation.toJson()) ||
          transition.before.state.name != terminal['from_state'] ||
          transition.after.state.name != terminal['to_state'] ||
          transition.before.reservationDigest != terminal['before_digest'] ||
          transition.after.reservationDigest != terminal['after_digest'] ||
          transition.transitionDigest != terminal['transition_digest'] ||
          canonicalConnectedSiteJson(transition.toJson()) !=
              terminal['transition_json'] ||
          DateTime.parse(transition.transitionedAt).millisecondsSinceEpoch !=
              terminal['occurred_at_millis']) {
        return false;
      }
      if (transition.after.state == ConnectedStockReservationState.committed) {
        final saleId = terminal['sale_id'];
        final binding = transition.saleBinding;
        final sale = saleId is String ? saleById[saleId] : null;
        if (binding == null ||
            sale == null ||
            binding.saleId != saleId ||
            binding.saleCommandId != sale['operation_id'] ||
            binding.saleCommandDigest !=
                connectedSiteSha256({
                  'operationId': sale['operation_id'],
                  'requestFingerprint': sale['request_fingerprint'],
                })) {
          return false;
        }
      } else if (terminal['sale_id'] != null) {
        return false;
      }
      if (transition.after.state == ConnectedStockReservationState.released) {
        final releaseCommandId = terminal['operation_id'];
        if (releaseCommandId is! String) return false;
        final releaseCommand = commandById[releaseCommandId];
        final releaseEvent = eventByCommand[releaseCommandId];
        final releasePayload = <String, Object?>{
          'contract': _shopConnectedStockReleasePayloadContract,
          'reservationId': reservation.reservationId,
          'expectedReservationDigest': reservation.reservationDigest,
          'targetState': ConnectedStockReservationState.released.name,
          'reason': transition.reason,
        };
        if (releaseCommand == null ||
            releaseEvent == null ||
            releaseCommand['payload_digest'] !=
                connectedSiteSha256(releasePayload) ||
            !eventMatches(
              event: releaseEvent,
              commandId: releaseCommandId,
              tenantId: reservation.workspaceId,
              siteId: reservation.siteId,
              aggregateType: reservation.workflowType.name,
              aggregateId: reservation.subjectId,
              eventType: shopConnectedStockReleasedEventType,
              payload: releasePayload,
            )) {
          return false;
        }
      } else {
        final identityDigest = connectedSiteSha256({
          'reservationId': reservation.reservationId,
          'transitionDigest': transition.transitionDigest,
          'state': transition.after.state.name,
        });
        final terminalCommandId = 'terminal:$identityDigest';
        final terminalCommand = commandById[terminalCommandId];
        final terminalEvent = eventByCommand[terminalCommandId];
        final terminalPayload = <String, Object?>{
          'contract': 'supermega.shop.connected-stock-terminal.v1',
          'operationId':
              transition.after.state == ConnectedStockReservationState.committed
              ? transition.saleBinding!.saleCommandId
              : terminal['operation_id'],
          'reservationId': reservation.reservationId,
          'beforeDigest': reservation.reservationDigest,
          'afterDigest': transition.after.reservationDigest,
          'state': transition.after.state.name,
          'transitionDigest': transition.transitionDigest,
          'transition': transition.toJson(),
        };
        final terminalEventType =
            transition.after.state == ConnectedStockReservationState.committed
            ? shopConnectedStockCommittedEventType
            : shopConnectedStockExpiredEventType;
        if (terminalCommand == null ||
            terminalEvent == null ||
            terminalCommand['payload_digest'] !=
                connectedSiteSha256(terminalPayload) ||
            !eventMatches(
              event: terminalEvent,
              commandId: terminalCommandId,
              tenantId: reservation.workspaceId,
              siteId: reservation.siteId,
              aggregateType: reservation.workflowType.name,
              aggregateId: reservation.subjectId,
              eventType: terminalEventType,
              payload: terminalPayload,
            )) {
          return false;
        }
      }
      if (transition.after.state == ConnectedStockReservationState.committed ||
          transition.after.state == ConnectedStockReservationState.expired) {
        final observed =
            trustedByScope['${reservation.workspaceId}\u0000${reservation.siteId}'];
        if (observed == null ||
            observed < (terminal['occurred_at_millis']! as int)) {
          return false;
        }
      }
    }
    if (pendingCashCheckouts.any((row) => row['operation_id'] is! String) ||
        walletCheckoutIntents.any(
          (row) =>
              row['operation_id'] is! String ||
              !const {
                'pending',
                'cancelled',
                'completed',
              }.contains(row['state']),
        )) {
      return false;
    }
    final seenTenderOperations = <String>{};
    for (final row in tenderBindings) {
      final operationId = row['operation_id'];
      final tenderKind = row['tender_kind'];
      final reservationId = row['reservation_id'];
      final createdAt = row['created_at_millis'];
      if (operationId is! String ||
          operationId.isEmpty ||
          tenderKind is! String ||
          !const {'cash', 'wallet'}.contains(tenderKind) ||
          !seenTenderOperations.add('$operationId\u0000$tenderKind') ||
          reservationId is! String ||
          createdAt is! int ||
          createdAt <= 0) {
        return false;
      }
      final header = headerByReservation[reservationId];
      if (header == null ||
          header['legacy_source'] != 0 ||
          header['reservation_json'] is! String) {
        return false;
      }
      final reservation = ConnectedStockReservationV1.fromJson(
        jsonDecode(header['reservation_json']! as String),
      );
      final payload = <String, Object>{
        'contract': 'supermega.shop.connected-tender-reservation.v1',
        'operationId': operationId,
        'tenderKind': tenderKind,
        'reservationId': reservation.reservationId,
        'reservationDigest': reservation.reservationDigest,
        'workspaceId': reservation.workspaceId,
        'siteId': reservation.siteId,
        'workflowType': reservation.workflowType.name,
        'subjectId': reservation.subjectId,
        'basketDigest': reservation.basketDigest,
      };
      if (row['reservation_digest'] != reservation.reservationDigest ||
          row['tenant_id'] != reservation.workspaceId ||
          row['site_id'] != reservation.siteId ||
          row['workflow_type'] != reservation.workflowType.name ||
          row['subject_id'] != reservation.subjectId ||
          row['basket_digest'] != reservation.basketDigest ||
          row['binding_digest'] != connectedSiteSha256(payload) ||
          (tenderKind == 'wallet' &&
              reservation.workflowType !=
                  ConnectedStockWorkflowType.retailCart) ||
          trustedByScope['${reservation.workspaceId}\u0000${reservation.siteId}'] ==
              null ||
          trustedByScope['${reservation.workspaceId}\u0000${reservation.siteId}']! <
              createdAt) {
        return false;
      }
    }
    return (knownReservations.isEmpty
            ? boundScope == null
            : boundScope != null) &&
        linesByReservation.keys.every(knownReservations.contains) &&
        transitionsByReservation.keys.every(knownReservations.contains) &&
        trustedByScope.keys.every((scope) {
          return headers.any(
            (header) =>
                '${header['tenant_id']}\u0000${header['site_id']}' == scope,
          );
        });
  } on Object {
    return false;
  }
}

final shopKnownBaseObjectNames = <String>{
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
  'shop_pending_cash_checkouts',
  'shop_pending_cash_checkouts_insert_guard',
  'shop_pending_cash_checkouts_no_update',
  'shop_pending_cash_checkouts_counter_freeze',
  'shop_pending_cash_checkouts_counter_delete_freeze',
  'shop_pending_cash_checkouts_cafe_freeze',
  'shop_pending_cash_checkouts_shift_freeze',
  ...{for (final name in shopConnectedSiteSchemaDefinitionsV26().keys) name},
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
  if (schemaVersion < 5 || schemaVersion > 26) return const {};
  return <String, Set<String>>{
    for (final entry in shopBaseTableColumnsV6.entries)
      if (schemaVersion >= 6 ||
          (entry.key != 'shop_cash_shifts' &&
              entry.key != 'shop_cash_shift_sales'))
        entry.key: <String>{
          ...entry.value,
          if (entry.key == 'shop_products' && schemaVersion >= 9)
            'reorder_level',
          if (entry.key == 'shop_sales' && schemaVersion >= 22)
            'cash_tendered_mmk',
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

const shopCashMovementsV18Sql = '''
  CREATE TABLE IF NOT EXISTS shop_cash_movements (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 1 AND 140),
    operation_id TEXT NOT NULL UNIQUE CHECK (length(operation_id) BETWEEN 1 AND 120),
    request_fingerprint TEXT NOT NULL CHECK (length(request_fingerprint) BETWEEN 2 AND 1024),
    shift_id TEXT NOT NULL REFERENCES shop_cash_shifts(id),
    store_ref TEXT NOT NULL REFERENCES shop_store_identity(store_ref),
    movement_kind TEXT NOT NULL CHECK (movement_kind IN ('cash_in', 'cash_out')),
    amount_mmk INTEGER NOT NULL CHECK (amount_mmk BETWEEN 1 AND 200000000000000),
    reason TEXT NOT NULL CHECK (reason IN ('float_top_up', 'petty_cash_expense', 'supplier_payment', 'bank_deposit', 'other')),
    authorization_receipt_id TEXT NOT NULL UNIQUE CHECK (length(authorization_receipt_id) = 36),
    authorization_receipt_digest TEXT NOT NULL CHECK (length(authorization_receipt_digest) = 64),
    authorization_workspace_id TEXT NOT NULL CHECK (length(authorization_workspace_id) BETWEEN 1 AND 128),
    authorized_actor_id TEXT NOT NULL CHECK (length(authorized_actor_id) BETWEEN 1 AND 128),
    authorized_actor_label TEXT NOT NULL CHECK (length(authorized_actor_label) BETWEEN 1 AND 160),
    authorized_actor_role TEXT NOT NULL CHECK (authorized_actor_role = 'owner'),
    authorization_capability TEXT NOT NULL CHECK (authorization_capability = 'shop.cash_shift.move'),
    authorization_source TEXT NOT NULL CHECK (authorization_source = 'managed_membership_receipt_v1'),
    authorization_command_digest TEXT NOT NULL CHECK (length(authorization_command_digest) = 64),
    authorization_finalization_request_id TEXT NOT NULL CHECK (length(authorization_finalization_request_id) = 36),
    authorization_issued_at_millis INTEGER NOT NULL CHECK (authorization_issued_at_millis > 0),
    authorization_finalized_at_millis INTEGER NOT NULL CHECK (authorization_finalized_at_millis = authorization_issued_at_millis),
    authorization_verified_at_millis INTEGER NOT NULL CHECK (authorization_verified_at_millis = authorization_issued_at_millis),
    authorization_expires_at_millis INTEGER NOT NULL CHECK (authorization_expires_at_millis - authorization_issued_at_millis = 300000),
    authorization_key_id TEXT NOT NULL CHECK (length(authorization_key_id) BETWEEN 1 AND 32),
    authorization_signature TEXT NOT NULL CHECK (length(authorization_signature) = 86),
    created_at_millis INTEGER NOT NULL CHECK (created_at_millis > 0)
  )
''';

const shopCashMovementsShiftIndexV18Sql = '''
  CREATE INDEX IF NOT EXISTS shop_cash_movements_shift_id
  ON shop_cash_movements(shift_id, created_at_millis, id)
''';

const shopCashMovementsRequireOpenShiftV18Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_cash_movements_require_open_shift
  BEFORE INSERT ON shop_cash_movements
  WHEN NOT EXISTS (
    SELECT 1 FROM shop_cash_shifts
    WHERE id = NEW.shift_id AND state = 'open'
  )
  BEGIN
    SELECT RAISE(ABORT, 'Cash movement requires its open cash shift');
  END
''';

Map<String, String> shopCashMovementSchemaDefinitionsV18() => <String, String>{
  'shop_cash_movements': shopCashMovementsV18Sql,
  'shop_cash_movements_shift_id': shopCashMovementsShiftIndexV18Sql,
  'shop_cash_movements_require_open_shift':
      shopCashMovementsRequireOpenShiftV18Sql,
  'shop_cash_movements_no_update': shopImmutableTriggerV11Sql(
    table: 'shop_cash_movements',
    operation: 'update',
    message: 'Shop cash movement history is immutable',
  ),
  'shop_cash_movements_no_delete': shopImmutableTriggerV11Sql(
    table: 'shop_cash_movements',
    operation: 'delete',
    message: 'Shop cash movement history is immutable',
  ),
};

const shopCafeOrdersV19Sql = '''
  CREATE TABLE IF NOT EXISTS shop_cafe_orders (
    id TEXT PRIMARY KEY NOT NULL CHECK (length(id) BETWEEN 1 AND 120),
    state TEXT NOT NULL CHECK (state IN ('open', 'held', 'completed')),
    state_revision INTEGER NOT NULL CHECK (state_revision >= 0),
    ticket_version INTEGER NOT NULL CHECK (ticket_version >= 1),
    ticket_json TEXT NOT NULL CHECK (length(ticket_json) BETWEEN 2 AND 262144),
    total_mmk INTEGER NOT NULL CHECK (total_mmk BETWEEN 0 AND 2000000000),
    last_command_id TEXT NOT NULL UNIQUE CHECK (length(last_command_id) BETWEEN 1 AND 120),
    last_command_fingerprint TEXT NOT NULL CHECK (length(last_command_fingerprint) = 64),
    last_state_operation_id TEXT UNIQUE,
    last_state_fingerprint TEXT,
    completed_sale_id TEXT UNIQUE REFERENCES shop_sales(id),
    created_at_millis INTEGER NOT NULL CHECK (created_at_millis > 0),
    updated_at_millis INTEGER NOT NULL CHECK (updated_at_millis >= created_at_millis),
    CHECK ((state = 'completed' AND completed_sale_id IS NOT NULL)
      OR (state != 'completed' AND completed_sale_id IS NULL)),
    CHECK ((state_revision = 0 AND last_state_operation_id IS NULL
      AND last_state_fingerprint IS NULL)
      OR (state_revision > 0 AND last_state_operation_id IS NOT NULL
      AND length(last_state_operation_id) BETWEEN 1 AND 120
      AND last_state_fingerprint IS NOT NULL
      AND length(last_state_fingerprint) = 64))
  )
''';

const shopCafeOrderStateEventsV19Sql = '''
  CREATE TABLE IF NOT EXISTS shop_cafe_order_state_events (
    operation_id TEXT PRIMARY KEY NOT NULL CHECK (length(operation_id) BETWEEN 1 AND 120),
    order_id TEXT NOT NULL REFERENCES shop_cafe_orders(id),
    request_fingerprint TEXT NOT NULL CHECK (length(request_fingerprint) = 64),
    from_state TEXT NOT NULL CHECK (from_state IN ('open', 'held')),
    to_state TEXT NOT NULL CHECK (to_state IN ('open', 'held', 'completed')),
    expected_state_revision INTEGER NOT NULL CHECK (expected_state_revision >= 0),
    resulting_state_revision INTEGER NOT NULL CHECK (resulting_state_revision = expected_state_revision + 1),
    sale_id TEXT REFERENCES shop_sales(id),
    created_at_millis INTEGER NOT NULL CHECK (created_at_millis > 0),
    CHECK ((to_state = 'completed' AND sale_id IS NOT NULL)
      OR (to_state != 'completed' AND sale_id IS NULL))
  )
''';

const shopCafeOrdersUpdatedV19Sql = '''
  CREATE INDEX IF NOT EXISTS shop_cafe_orders_updated
  ON shop_cafe_orders(state, updated_at_millis DESC, id)
''';

const shopCafeOrdersGuardUpdateV19Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_cafe_orders_guard_update
  BEFORE UPDATE ON shop_cafe_orders
  WHEN NOT (
    (OLD.state != 'completed'
      AND NEW.id IS OLD.id
      AND NEW.state IS OLD.state
      AND NEW.state_revision IS OLD.state_revision
      AND NEW.ticket_version = OLD.ticket_version + 1
      AND NEW.last_command_id IS NOT OLD.last_command_id
      AND NEW.last_command_fingerprint IS NOT OLD.last_command_fingerprint
      AND NEW.last_state_operation_id IS OLD.last_state_operation_id
      AND NEW.last_state_fingerprint IS OLD.last_state_fingerprint
      AND NEW.completed_sale_id IS OLD.completed_sale_id
      AND NEW.created_at_millis IS OLD.created_at_millis
      AND NEW.updated_at_millis >= OLD.updated_at_millis)
    OR
    (OLD.state != 'completed'
      AND NEW.id IS OLD.id
      AND NEW.ticket_version IS OLD.ticket_version
      AND NEW.ticket_json IS OLD.ticket_json
      AND NEW.total_mmk IS OLD.total_mmk
      AND NEW.last_command_id IS OLD.last_command_id
      AND NEW.last_command_fingerprint IS OLD.last_command_fingerprint
      AND NEW.state_revision = OLD.state_revision + 1
      AND NEW.last_state_operation_id IS NOT OLD.last_state_operation_id
      AND NEW.last_state_fingerprint IS NOT OLD.last_state_fingerprint
      AND NEW.created_at_millis IS OLD.created_at_millis
      AND NEW.updated_at_millis >= OLD.updated_at_millis
      AND ((OLD.state = 'open' AND NEW.state = 'held' AND NEW.completed_sale_id IS NULL)
        OR (OLD.state = 'held' AND NEW.state = 'open' AND NEW.completed_sale_id IS NULL)
        OR (NEW.state = 'completed' AND NEW.completed_sale_id IS NOT NULL))
      AND EXISTS (
        SELECT 1 FROM shop_cafe_order_state_events event
        WHERE event.operation_id = NEW.last_state_operation_id
          AND event.order_id = OLD.id
          AND event.request_fingerprint = NEW.last_state_fingerprint
          AND event.from_state = OLD.state
          AND event.to_state = NEW.state
          AND event.expected_state_revision = OLD.state_revision
          AND event.resulting_state_revision = NEW.state_revision
          AND event.sale_id IS NEW.completed_sale_id
      ))
  )
  BEGIN
    SELECT RAISE(ABORT, 'Cafe order transition is invalid');
  END
''';

Map<String, String> shopCafeOrderSchemaDefinitionsV19() => <String, String>{
  'shop_cafe_orders': shopCafeOrdersV19Sql,
  'shop_cafe_order_state_events': shopCafeOrderStateEventsV19Sql,
  'shop_cafe_orders_updated': shopCafeOrdersUpdatedV19Sql,
  'shop_cafe_orders_guard_update': shopCafeOrdersGuardUpdateV19Sql,
  'shop_cafe_orders_no_delete': shopImmutableTriggerV11Sql(
    table: 'shop_cafe_orders',
    operation: 'delete',
    message: 'Cafe order history is immutable',
  ),
  'shop_cafe_order_state_events_no_update': shopImmutableTriggerV11Sql(
    table: 'shop_cafe_order_state_events',
    operation: 'update',
    message: 'Cafe order state history is immutable',
  ),
  'shop_cafe_order_state_events_no_delete': shopImmutableTriggerV11Sql(
    table: 'shop_cafe_order_state_events',
    operation: 'delete',
    message: 'Cafe order state history is immutable',
  ),
};

const shopCafeOrderCancellationsV20Sql = '''
  CREATE TABLE IF NOT EXISTS shop_cafe_order_cancellations (
    operation_id TEXT PRIMARY KEY NOT NULL CHECK (length(operation_id) BETWEEN 1 AND 120),
    order_id TEXT NOT NULL UNIQUE REFERENCES shop_cafe_orders(id),
    request_fingerprint TEXT NOT NULL CHECK (length(request_fingerprint) = 64),
    from_state TEXT NOT NULL CHECK (from_state IN ('open', 'held')),
    expected_state_revision INTEGER NOT NULL CHECK (expected_state_revision >= 0),
    ticket_version INTEGER NOT NULL CHECK (ticket_version >= 1),
    ticket_fingerprint TEXT NOT NULL CHECK (length(ticket_fingerprint) = 64),
    created_at_millis INTEGER NOT NULL CHECK (created_at_millis > 0)
  )
''';

const shopCafeOrderCancellationInsertGuardV20Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_cafe_order_cancellations_insert_guard
  BEFORE INSERT ON shop_cafe_order_cancellations
  WHEN NOT EXISTS (
    SELECT 1 FROM shop_cafe_orders order_row
    WHERE order_row.id = NEW.order_id
      AND order_row.state = NEW.from_state
      AND order_row.state != 'completed'
      AND order_row.state_revision = NEW.expected_state_revision
      AND order_row.ticket_version = NEW.ticket_version
      AND order_row.last_command_fingerprint = NEW.ticket_fingerprint
      AND order_row.completed_sale_id IS NULL
  )
  BEGIN
    SELECT RAISE(ABORT, 'Cafe order cancellation does not match current order');
  END
''';

const shopCafeOrderCancelledMutationGuardV20Sql = '''
  CREATE TRIGGER IF NOT EXISTS shop_cafe_orders_cancelled_no_update
  BEFORE UPDATE ON shop_cafe_orders
  WHEN EXISTS (
    SELECT 1 FROM shop_cafe_order_cancellations cancellation
    WHERE cancellation.order_id = OLD.id
  )
  BEGIN
    SELECT RAISE(ABORT, 'Cancelled cafe order is immutable');
  END
''';

Map<String, String> shopCafeCancellationSchemaDefinitionsV20() =>
    <String, String>{
      'shop_cafe_order_cancellations': shopCafeOrderCancellationsV20Sql,
      'shop_cafe_order_cancellations_insert_guard':
          shopCafeOrderCancellationInsertGuardV20Sql,
      'shop_cafe_orders_cancelled_no_update':
          shopCafeOrderCancelledMutationGuardV20Sql,
      'shop_cafe_order_cancellations_no_update': shopImmutableTriggerV11Sql(
        table: 'shop_cafe_order_cancellations',
        operation: 'update',
        message: 'Cafe order cancellation history is immutable',
      ),
      'shop_cafe_order_cancellations_no_delete': shopImmutableTriggerV11Sql(
        table: 'shop_cafe_order_cancellations',
        operation: 'delete',
        message: 'Cafe order cancellation history is immutable',
      ),
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
  unifiedV17,
  unifiedV18,
  unifiedV19,
  unifiedV20,
  unifiedV21,
  unifiedV22,
  unifiedV23,
  unifiedV24,
  unifiedV25,
}

enum ShopConnectedSiteCommandStatus { accepted, replayed, conflict }

class ShopConnectedSiteCommandResult {
  const ShopConnectedSiteCommandResult({
    required this.status,
    required this.commandId,
    required this.ackDigest,
    required this.canonicalVersion,
    required this.eventSequence,
    required this.eventDigest,
    this.conflictCode,
  });

  final ShopConnectedSiteCommandStatus status;
  final String commandId;
  final String ackDigest;
  final int canonicalVersion;
  final int? eventSequence;
  final String? eventDigest;
  final String? conflictCode;
}

abstract interface class ShopConnectedSiteCoordinatorTimeAuthority {
  Future<int> readValidatedNowMillis({
    required String tenantId,
    required String siteId,
  });
}

class ShopConnectedSiteTimeUnavailable
    implements ShopConnectedSiteCoordinatorTimeAuthority {
  const ShopConnectedSiteTimeUnavailable();

  @override
  Future<int> readValidatedNowMillis({
    required String tenantId,
    required String siteId,
  }) => throw StateError('Connected-site trusted time is unavailable.');
}

enum ShopConnectedStockReservationDisposition { accepted, replayed, conflict }

const shopConnectedStockReservedEventType = 'shop.connected_stock.reserved.v1';
const shopConnectedStockReleasedEventType = 'shop.connected_stock.released.v1';
const shopConnectedStockCommittedEventType =
    'shop.connected_stock.committed.v1';
const shopConnectedStockExpiredEventType = 'shop.connected_stock.expired.v1';
const _shopConnectedStockReservePayloadContract =
    'supermega.shop.connected-stock-reserve.v1';
const _shopConnectedStockReleasePayloadContract =
    'supermega.shop.connected-stock-release.v1';

class ShopConnectedStockReservationResult {
  const ShopConnectedStockReservationResult({
    required this.disposition,
    required this.canonicalVersion,
    required this.eventDigest,
    required this.ackDigest,
    this.conflictCode,
    this.reservation,
    this.transition,
  });

  final ShopConnectedStockReservationDisposition disposition;
  final int canonicalVersion;
  final String? eventDigest;
  final String ackDigest;
  final String? conflictCode;
  final ConnectedStockReservationV1? reservation;
  final ConnectedStockReservationTransitionV1? transition;
}

class ShopConnectedStockReservationLifecycleInput {
  const ShopConnectedStockReservationLifecycleInput.release({
    required this.reservationId,
    required this.expectedReservationDigest,
    required this.reason,
  }) : targetState = ConnectedStockReservationState.released;

  final String reservationId;
  final String expectedReservationDigest;
  final String reason;
  final ConnectedStockReservationState targetState;
}

class ShopConnectedSiteCommandInput {
  const ShopConnectedSiteCommandInput({
    required this.commandId,
    required this.tenantId,
    required this.siteId,
    required this.actorId,
    required this.deviceId,
    required this.aggregateType,
    required this.aggregateId,
    required this.capability,
    required this.expectedVersion,
    required this.payloadDigest,
    required this.leaseDigest,
    required this.commandDigest,
    required this.eventId,
    required this.eventType,
    required this.eventPayloadJson,
    required this.eventDigest,
    required this.ackDigest,
    required this.auditAction,
    required this.auditMetadataDigest,
    required this.createdAtMillis,
    this.reservationId,
    this.reservationProductId,
    this.reservationQuantity,
    this.reservationExpiresAtMillis,
    this.stockReservation,
    this.stockReservationLifecycle,
  });

  final String commandId;
  final String tenantId;
  final String siteId;
  final String actorId;
  final String deviceId;
  final String aggregateType;
  final String aggregateId;
  final String capability;
  final int expectedVersion;
  final String payloadDigest;
  final String leaseDigest;
  final String commandDigest;
  final String eventId;
  final String eventType;
  final String eventPayloadJson;
  final String eventDigest;
  final String ackDigest;
  final String auditAction;
  final String auditMetadataDigest;
  final int createdAtMillis;
  final String? reservationId;
  final String? reservationProductId;
  final int? reservationQuantity;
  final int? reservationExpiresAtMillis;
  final ConnectedStockReservationV1? stockReservation;
  final ShopConnectedStockReservationLifecycleInput? stockReservationLifecycle;
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
        throw StateError('The staged Shop restore did not reach schema v26.');
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

  factory ShopDatabase.testOnlyWithSaleAndCashShiftClock({
    QueryExecutor? executor,
    required DateTime Function() clock,
  }) {
    if (!_testMutationBypassAvailable) {
      throw UnsupportedError(
        'The sale and cash-shift test clock is unavailable in product builds.',
      );
    }
    return ShopDatabase.withCorrectionReceiptVerifier(
      executor: executor,
      correctionReceiptVerifier: ShopCorrectionReceiptVerifier.production(),
      testOnlySaleAndCashShiftClock: clock,
    );
  }

  ShopDatabase.withCorrectionReceiptVerifier({
    QueryExecutor? executor,
    required this.correctionReceiptVerifier,
    bool testOnlyAllowUnconsumedAuthorization = false,
    DateTime Function()? testOnlySaleAndCashShiftClock,
  }) : assert(
         !testOnlyAllowUnconsumedAuthorization || _testMutationBypassAvailable,
         'Unconsumed correction authorization is unavailable in product builds.',
       ),
       _saleAndCashShiftClock = _testMutationBypassAvailable
           ? testOnlySaleAndCashShiftClock ?? DateTime.now
           : DateTime.now,
       testOnlyAllowUnconsumedAuthorization =
           testOnlyAllowUnconsumedAuthorization && _testMutationBypassAvailable,
       super(executor ?? driftDatabase(name: 'supermega_shop'));

  final ShopCorrectionReceiptVerifier correctionReceiptVerifier;
  final bool testOnlyAllowUnconsumedAuthorization;
  final DateTime Function() _saleAndCashShiftClock;

  int _saleAndCashShiftNowMillis() =>
      _saleAndCashShiftClock().millisecondsSinceEpoch;

  @override
  int get schemaVersion => 26;

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
      await _createCashMovementSchemaV18();
      await _createCafeOrderSchemaV19();
      await _createCafeCancellationSchemaV20();
      await _createPendingCashCheckoutSchemaV21();
      await _requireUnifiedV22Schema();
      await _createConnectedSiteSchemaV23();
      await _requireUnifiedV23Schema();
      await _createConnectedStockReservationSchemaV24();
      await _requireUnifiedV24Schema();
      await _createConnectedEnrollmentSchemaV25();
      await _requireUnifiedV25Schema();
      await _createConnectedCloudDispositionSchemaV26();
      await _requireUnifiedV26Schema();
    }),
    onUpgrade: (migrator, from, to) => transaction(() async {
      // Version 11 has two historical meanings. Classify the complete reserved
      // schema before the first DDL statement so a branch-hop database cannot
      // be silently relabelled or partially repaired.
      final origin = await _classifyUpgradeOrigin(from);
      if (from < 2) {
        await migrator.createTable(menuImportDrafts);
        await migrator.createTable(merchantWalletProfiles);
        await migrator.createTable(shopProducts);
        await migrator.createTable(shopSales);
        // Drift creates a missing v1 table from the current TableInfo. Keep
        // the bootstrap on the historical column shape while the strict
        // intermediate verifiers run; v22 adds the nullable column below.
        await customStatement(
          'ALTER TABLE shop_sales DROP COLUMN cash_tendered_mmk',
        );
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
      if (from < 17) {
        await _requireUnifiedV16Schema();
        await _createCorrectionConsumptionSchemaV17();
      }
      if (from < 18) {
        await _requireUnifiedV17Schema();
        await _createCashMovementSchemaV18();
      }
      if (from < 19) {
        await _requireUnifiedV18Schema();
        await _createCafeOrderSchemaV19();
      }
      await _requireUnifiedV19Schema(
        allowCafeV20: from >= 20,
        allowCashCheckoutV21: from >= 21,
        allowCashTenderV22: from >= 22,
        allowConnectedV23: from >= 23,
        allowReservationV24: from >= 24,
        allowEnrollmentV25: from >= 25,
      );
      if (from < 20) {
        await _createCafeCancellationSchemaV20();
      }
      await _requireUnifiedV20Schema(
        allowCashCheckoutV21: from >= 21,
        allowCashTenderV22: from >= 22,
        allowConnectedV23: from >= 23,
        allowReservationV24: from >= 24,
        allowEnrollmentV25: from >= 25,
      );
      if (from < 21) {
        await _createPendingCashCheckoutSchemaV21();
      }
      await _requireUnifiedV21Schema(
        allowCashTenderV22: from >= 22,
        allowConnectedV23: from >= 23,
        allowReservationV24: from >= 24,
        allowEnrollmentV25: from >= 25,
      );
      if (from < 22) {
        await _createCashTenderSchemaV22();
      }
      await _requireUnifiedV22Schema(
        allowConnectedV23: from >= 23,
        allowReservationV24: from >= 24,
        allowEnrollmentV25: from >= 25,
      );
      if (from < 23) {
        await _createConnectedSiteSchemaV23();
      }
      await _requireUnifiedV23Schema(
        allowReservationV24: from >= 24,
        allowEnrollmentV25: from >= 25,
      );
      if (from < 24) {
        await _migrateConnectedStockReservationSchemaV24();
      }
      await _requireUnifiedV24Schema(allowEnrollmentV25: from >= 25);
      if (from < 25) {
        await _createConnectedEnrollmentSchemaV25();
      }
      await _requireUnifiedV25Schema();
      if (from < 26) {
        await _createConnectedCloudDispositionSchemaV26();
      }
      await _requireUnifiedV26Schema();
    }),
    beforeOpen: (_) async {
      await customStatement('PRAGMA foreign_keys = ON');
      await _requireUnifiedV26Schema();
    },
  );

  Future<void> verifyReadyForUse() => _requireUnifiedV26Schema();

  /// Revalidates the complete immutable cloud-disposition chain before a
  /// reconstructed upload cursor is trusted in the current process.
  Future<void> verifyConnectedCloudDispositionEvidence() async {
    if (!await _v26ConnectedCloudDispositionRowsValid()) {
      throw StateError('Connected cloud disposition evidence is invalid.');
    }
  }

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

  Future<void> _createCashMovementSchemaV18() async {
    await _ensureColumn('shop_cash_shifts', 'cash_movement_count', 'INTEGER');
    await _ensureColumn('shop_cash_shifts', 'cash_in_total_mmk', 'INTEGER');
    await _ensureColumn('shop_cash_shifts', 'cash_out_total_mmk', 'INTEGER');
    await _ensureColumn(
      'shop_cash_shifts',
      'review_cash_movement_count',
      'INTEGER',
    );
    await _ensureColumn(
      'shop_cash_shifts',
      'review_cash_in_total_mmk',
      'INTEGER',
    );
    await _ensureColumn(
      'shop_cash_shifts',
      'review_cash_out_total_mmk',
      'INTEGER',
    );
    await customStatement(
      'UPDATE shop_cash_shifts SET cash_movement_count = 0, '
      'cash_in_total_mmk = 0, cash_out_total_mmk = 0, '
      'review_cash_movement_count = 0, review_cash_in_total_mmk = 0, '
      "review_cash_out_total_mmk = 0 WHERE state = 'closed' "
      'AND cash_movement_count IS NULL AND cash_in_total_mmk IS NULL '
      'AND cash_out_total_mmk IS NULL AND review_cash_movement_count IS NULL '
      'AND review_cash_in_total_mmk IS NULL '
      'AND review_cash_out_total_mmk IS NULL',
    );
    for (final definition in shopCashMovementSchemaDefinitionsV18().values) {
      await customStatement(definition);
    }
  }

  Future<void> _createCafeOrderSchemaV19() async {
    for (final definition in shopCafeOrderSchemaDefinitionsV19().values) {
      await customStatement(definition);
    }
  }

  Future<void> _createCafeCancellationSchemaV20() async {
    for (final definition
        in shopCafeCancellationSchemaDefinitionsV20().values) {
      await customStatement(definition);
    }
  }

  Future<void> _createPendingCashCheckoutSchemaV21() async {
    for (final definition
        in shopPendingCashCheckoutSchemaDefinitionsV21().values) {
      await customStatement(definition);
    }
  }

  Future<void> _createCashTenderSchemaV22() => _ensureColumn(
    'shop_sales',
    'cash_tendered_mmk',
    "INTEGER CHECK (cash_tendered_mmk IS NULL OR "
        "(payment_method = 'cash' AND cash_tendered_mmk >= total_mmk "
        'AND cash_tendered_mmk <= 200000000000000))',
  );

  Future<void> _createConnectedSiteSchemaV23() async {
    for (final definition in shopConnectedSiteSchemaDefinitionsV23().values) {
      await customStatement(definition);
    }
  }

  Future<void> _createConnectedStockReservationSchemaV24() async {
    for (final definition
        in shopConnectedStockReservationSchemaDefinitionsV24().values) {
      await customStatement(definition);
    }
  }

  Future<void> _createConnectedEnrollmentSchemaV25() async {
    for (final definition
        in shopConnectedEnrollmentSchemaDefinitionsV25().values) {
      await customStatement(definition);
    }
  }

  Future<void> _createConnectedCloudDispositionSchemaV26() async {
    for (final definition
        in shopConnectedCloudDispositionSchemaDefinitionsV26().values) {
      await customStatement(definition);
    }
  }

  Future<void> _migrateConnectedStockReservationSchemaV24() async {
    await _createConnectedStockReservationSchemaV24();
    final legacy = await customSelect(
      'SELECT reservation.*, command.tenant_id, command.site_id, '
      'command.actor_id, command.device_id, command.capability '
      'FROM shop_site_stock_reservations reservation '
      'JOIN shop_site_commands command ON command.command_id = reservation.command_id '
      'ORDER BY reservation.reservation_id',
    ).get();
    final legacyScopes = {
      for (final row in legacy)
        '${row.read<String>('tenant_id')}\u0000${row.read<String>('site_id')}',
    };
    if (legacyScopes.length > 1) {
      throw StateError(
        'Legacy connected stock reservations span multiple local scopes.',
      );
    }
    if (legacy.isNotEmpty) {
      final first = legacy.first;
      await customInsert(
        'INSERT INTO shop_connected_scope_binding '
        '(singleton, tenant_id, site_id, enrollment_evidence_digest, '
        'bound_at_millis) VALUES (1, ?, ?, ?, ?)',
        variables: [
          Variable<String>(first.read<String>('tenant_id')),
          Variable<String>(first.read<String>('site_id')),
          Variable<String>(
            await _sha256Hex(
              'legacy-v23-scope:${first.read<String>('tenant_id')}:'
              '${first.read<String>('site_id')}',
            ),
          ),
          Variable<int>(first.read<int>('created_at_millis')),
        ],
      );
    }
    for (final row in legacy) {
      final reservationId = row.read<String>('reservation_id');
      final productId = row.read<String>('product_id');
      final quantity = row.read<int>('quantity');
      final created = row.read<int>('created_at_millis');
      final linesDigest = await _sha256Hex(
        canonicalConnectedSiteJson([
          {'productId': productId, 'quantity': quantity},
        ]),
      );
      final initialDigest = await _sha256Hex(
        'legacy-v23:$reservationId:$linesDigest:$created',
      );
      await customInsert(
        'INSERT INTO shop_connected_stock_reservation_headers '
        '(reservation_id, command_id, tenant_id, site_id, actor_id, device_id, '
        'capability, workflow_type, subject_id, basket_digest, initial_reservation_digest, reservation_json, '
        'issued_at_millis, expires_at_millis, legacy_source) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, ?, ?, 1)',
        variables: [
          Variable<String>(reservationId),
          Variable<String>(row.read<String>('command_id')),
          Variable<String>(row.read<String>('tenant_id')),
          Variable<String>(row.read<String>('site_id')),
          Variable<String>(row.read<String>('actor_id')),
          Variable<String>(row.read<String>('device_id')),
          Variable<String>(row.read<String>('capability')),
          Variable<String>(linesDigest),
          Variable<String>(initialDigest),
          Variable<int>(created),
          Variable<int>(row.read<int>('expires_at_millis')),
        ],
      );
      await customInsert(
        'INSERT INTO shop_connected_stock_reservation_lines '
        '(reservation_id, product_id, quantity) VALUES (?, ?, ?)',
        variables: [
          Variable<String>(reservationId),
          Variable<String>(productId),
          Variable<int>(quantity),
        ],
      );
      final state = row.read<String>('state');
      if (state != 'held') {
        final resolved = row.read<int>('resolved_at_millis');
        final afterDigest = await _sha256Hex('$initialDigest:$state:$resolved');
        final transitionDigest = await _sha256Hex(
          'legacy-v23-transition:$reservationId:$state:$resolved',
        );
        await customInsert(
          'INSERT INTO shop_connected_stock_reservation_transitions '
          '(transition_id, operation_id, reservation_id, from_state, to_state, '
          'before_digest, after_digest, transition_digest, transition_json, '
          'sale_id, occurred_at_millis, legacy_source) '
          "VALUES (?, ?, ?, 'held', ?, ?, ?, ?, NULL, NULL, ?, 1)",
          variables: [
            Variable<String>('legacy-v23:$reservationId'),
            Variable<String>('legacy-v23:$reservationId'),
            Variable<String>(reservationId),
            Variable<String>(state),
            Variable<String>(initialDigest),
            Variable<String>(afterDigest),
            Variable<String>(transitionDigest),
            Variable<int>(resolved),
          ],
        );
      }
    }
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

  /// Refuses to expose a managed store until a non-forgeable authenticated
  /// session boundary exists.
  ///
  /// [ShopAuthenticatedWorkspaceSelection] remains a source-only attachment
  /// contract. It is publicly constructible and therefore is not accepted as
  /// runtime authentication. Ordinary unbound, device-local stores continue
  /// to open normally.
  Future<void> verifyManagedWorkspaceUnavailableWithoutSession() async {
    final binding = await readManagedWorkspaceBinding();
    if (binding == null) return;
    throw StateError(
      'This managed Shop requires its authenticated workspace session.',
    );
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
    if (from < 1 || from > 25) {
      throw StateError('This Shop database version cannot migrate to v26.');
    }
    if (from == 25) {
      await _requireUnifiedV25Schema();
      return _ShopUpgradeOrigin.unifiedV25;
    }
    if (from == 24) {
      await _requireUnifiedV24Schema();
      return _ShopUpgradeOrigin.unifiedV24;
    }
    if (from == 23) {
      await _requireUnifiedV23Schema();
      return _ShopUpgradeOrigin.unifiedV23;
    }
    if (from == 22) {
      await _requireUnifiedV22Schema();
      return _ShopUpgradeOrigin.unifiedV22;
    }
    if (from == 21) {
      await _requireUnifiedV21Schema();
      return _ShopUpgradeOrigin.unifiedV21;
    }
    if (from == 20) {
      await _requireUnifiedV20Schema();
      return _ShopUpgradeOrigin.unifiedV20;
    }
    if (from == 19) {
      await _requireUnifiedV19Schema();
      return _ShopUpgradeOrigin.unifiedV19;
    }
    if (from == 18) {
      await _requireUnifiedV18Schema();
      return _ShopUpgradeOrigin.unifiedV18;
    }
    if (from == 17) {
      await _requireUnifiedV17Schema();
      return _ShopUpgradeOrigin.unifiedV17;
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

  Future<void> _requireUnifiedV18Schema({
    bool allowCafeV19 = false,
    bool allowCafeV20 = false,
    bool allowCashCheckoutV21 = false,
    bool allowCashTenderV22 = false,
    bool allowConnectedV23 = false,
    bool allowReservationV24 = false,
    bool allowEnrollmentV25 = false,
    bool allowCloudV26 = false,
  }) async {
    await _requireDatabaseIntegrity();
    final objects = await _readSchemaObjects();
    final definitionGroups = [
      shopReversalSchemaDefinitionsV11(),
      shopWorkspaceSchemaDefinitionsV12(),
      shopAuthorizationProofSchemaDefinitionsV15(),
      shopMemberSchemaDefinitionsV16(),
      shopCorrectionConsumptionSchemaDefinitionsV17(),
      shopCashMovementSchemaDefinitionsV18(),
    ];
    final expectedTriggers = <String>{
      for (final definitions in definitionGroups)
        for (final entry in definitions.entries)
          if (canonicalShopSchemaSql(entry.value).startsWith('create trigger'))
            entry.key,
      if (allowCafeV19)
        for (final entry in shopCafeOrderSchemaDefinitionsV19().entries)
          if (canonicalShopSchemaSql(entry.value).startsWith('create trigger'))
            entry.key,
      if (allowCafeV20)
        for (final entry in shopCafeCancellationSchemaDefinitionsV20().entries)
          if (canonicalShopSchemaSql(entry.value).startsWith('create trigger'))
            entry.key,
      if (allowCashCheckoutV21)
        for (final entry
            in shopPendingCashCheckoutSchemaDefinitionsV21().entries)
          if (canonicalShopSchemaSql(entry.value).startsWith('create trigger'))
            entry.key,
      if (allowConnectedV23)
        for (final entry
            in (allowCloudV26
                    ? shopConnectedSiteSchemaDefinitionsV26()
                    : allowEnrollmentV25
                    ? shopConnectedSiteSchemaDefinitionsV25()
                    : allowReservationV24
                    ? shopConnectedSiteSchemaDefinitionsV24()
                    : shopConnectedSiteSchemaDefinitionsV23())
                .entries)
          if (canonicalShopSchemaSql(entry.value).startsWith('create trigger'))
            entry.key,
    };
    final actualTriggers = objects.entries
        .where((entry) => entry.value.type == 'trigger')
        .map((entry) => entry.key)
        .toSet();
    final expectedNames = {
      ..._expectedSchemaObjectNames(18),
      for (final definitions in definitionGroups) ...definitions.keys,
      'shop_business_profile',
      'shop_v13_migration_provenance',
      if (allowCafeV19) ...shopCafeOrderSchemaDefinitionsV19().keys,
      if (allowCafeV20) ...shopCafeCancellationSchemaDefinitionsV20().keys,
      if (allowCashCheckoutV21)
        ...shopPendingCashCheckoutSchemaDefinitionsV21().keys,
      if (allowConnectedV23)
        ...(allowCloudV26
            ? shopConnectedSiteSchemaDefinitionsV26().keys
            : allowEnrollmentV25
            ? shopConnectedSiteSchemaDefinitionsV25().keys
            : allowReservationV24
            ? shopConnectedSiteSchemaDefinitionsV24().keys
            : shopConnectedSiteSchemaDefinitionsV23().keys),
    };
    final valid =
        objects.values.every((object) => object.type != 'view') &&
        await _baseSchemaExact(allowCashTenderV22 ? 22 : 18, objects) &&
        _sameSchemaObjectNames(objects, expectedNames) &&
        await _reversalCashColumnState() == _ColumnGroupState.exact &&
        await _cashMovementColumnState() == _ColumnGroupState.exact &&
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
        await _v18CashMovementRowsValid() &&
        actualTriggers.length == expectedTriggers.length &&
        actualTriggers.containsAll(expectedTriggers);
    if (!valid) {
      throw StateError('The unified Shop v18 schema failed verification.');
    }
  }

  Future<bool> _v18CashMovementRowsValid() async {
    try {
      final movements = await customSelect('SELECT * FROM shop_cash_movements')
          .get();
      for (final movement in movements) {
        final authorization = ShopCorrectionAuthorization(
          contract: shopCorrectionAuthorizationReceiptContract,
          receiptId: movement.read<String>('authorization_receipt_id'),
          receiptDigest: movement.read<String>('authorization_receipt_digest'),
          workspaceId: movement.read<String>('authorization_workspace_id'),
          actorId: movement.read<String>('authorized_actor_id'),
          actorLabel: movement.read<String>('authorized_actor_label'),
          actorRole: movement.read<String>('authorized_actor_role'),
          capability: movement.read<String>('authorization_capability'),
          source: movement.read<String>('authorization_source'),
          commandDigest: movement.read<String>('authorization_command_digest'),
          finalizationRequestId: movement.read<String>(
            'authorization_finalization_request_id',
          ),
          finalizedAtMillis: movement.read<int>(
            'authorization_finalized_at_millis',
          ),
          issuedAtMillis: movement.read<int>('authorization_issued_at_millis'),
          expiresAtMillis: movement.read<int>(
            'authorization_expires_at_millis',
          ),
          keyId: movement.read<String>('authorization_key_id'),
          signature: movement.read<String>('authorization_signature'),
        );
        if (await _sha256Hex(movement.read<String>('request_fingerprint')) !=
            authorization.commandDigest) {
          return false;
        }
        if (!await correctionReceiptVerifier.verify(authorization)) {
          return false;
        }
      }
      final invalid = await customSelect('''
        SELECT 1 FROM shop_cash_movements movement
        LEFT JOIN shop_cash_shifts shift ON shift.id = movement.shift_id
        LEFT JOIN shop_managed_workspace_binding binding ON binding.singleton = 1
        LEFT JOIN shop_store_identity store ON store.singleton = 1
        WHERE shift.id IS NULL
          OR store.store_ref IS NULL
          OR movement.store_ref != store.store_ref
          OR binding.workspace_id IS NULL
          OR movement.authorization_workspace_id != binding.workspace_id
          OR movement.authorized_actor_id != binding.attached_actor_id
          OR movement.authorized_actor_role != 'owner'
          OR movement.authorization_capability != 'shop.cash_shift.move'
          OR movement.authorization_source != 'managed_membership_receipt_v1'
          OR movement.request_fingerprint != json_object(
            'contract', 'supermega.shop.cash-movement-command.v1',
            'operationId', movement.operation_id,
            'storeRef', movement.store_ref,
            'shiftId', movement.shift_id,
            'kind', movement.movement_kind,
            'amountMmk', movement.amount_mmk,
            'reason', movement.reason
          )
        LIMIT 1
        ''').getSingleOrNull();
      if (invalid != null) return false;
      final invalidShift = await customSelect('''
        SELECT 1 FROM shop_cash_shifts shift
        WHERE (shift.state = 'open' AND (
          shift.cash_movement_count IS NOT NULL
          OR shift.cash_in_total_mmk IS NOT NULL
          OR shift.cash_out_total_mmk IS NOT NULL
          OR shift.review_cash_movement_count IS NOT NULL
          OR shift.review_cash_in_total_mmk IS NOT NULL
          OR shift.review_cash_out_total_mmk IS NOT NULL
        )) OR (shift.state = 'closed' AND (
          shift.cash_movement_count IS NULL
          OR shift.cash_in_total_mmk IS NULL
          OR shift.cash_out_total_mmk IS NULL
          OR shift.review_cash_movement_count IS NULL
          OR shift.review_cash_in_total_mmk IS NULL
          OR shift.review_cash_out_total_mmk IS NULL
          OR shift.cash_movement_count != (
            SELECT COUNT(*) FROM shop_cash_movements movement
            WHERE movement.shift_id = shift.id
          )
          OR shift.cash_in_total_mmk != COALESCE((
            SELECT SUM(amount_mmk) FROM shop_cash_movements movement
            WHERE movement.shift_id = shift.id AND movement_kind = 'cash_in'
          ), 0)
          OR shift.cash_out_total_mmk != COALESCE((
            SELECT SUM(amount_mmk) FROM shop_cash_movements movement
            WHERE movement.shift_id = shift.id AND movement_kind = 'cash_out'
          ), 0)
          OR shift.review_cash_movement_count != (
            SELECT COUNT(*) FROM shop_cash_movements movement
            WHERE movement.shift_id = shift.id
          )
          OR shift.review_cash_in_total_mmk != COALESCE((
            SELECT SUM(amount_mmk) FROM shop_cash_movements movement
            WHERE movement.shift_id = shift.id AND movement_kind = 'cash_in'
          ), 0)
          OR shift.review_cash_out_total_mmk != COALESCE((
            SELECT SUM(amount_mmk) FROM shop_cash_movements movement
            WHERE movement.shift_id = shift.id AND movement_kind = 'cash_out'
          ), 0)
        )) LIMIT 1
        ''').getSingleOrNull();
      return invalidShift == null;
    } on Object {
      return false;
    }
  }

  Future<void> _requireUnifiedV19Schema({
    bool allowCafeV20 = false,
    bool allowCashCheckoutV21 = false,
    bool allowCashTenderV22 = false,
    bool allowConnectedV23 = false,
    bool allowReservationV24 = false,
    bool allowEnrollmentV25 = false,
    bool allowCloudV26 = false,
  }) async {
    await _requireUnifiedV18Schema(
      allowCafeV19: true,
      allowCafeV20: allowCafeV20,
      allowCashCheckoutV21: allowCashCheckoutV21,
      allowCashTenderV22: allowCashTenderV22,
      allowConnectedV23: allowConnectedV23,
      allowReservationV24: allowReservationV24,
      allowEnrollmentV25: allowEnrollmentV25,
      allowCloudV26: allowCloudV26,
    );
    final objects = await _readSchemaObjects();
    final definitions = shopCafeOrderSchemaDefinitionsV19();
    final expectedNames = {
      ..._expectedSchemaObjectNames(18),
      for (final group in [
        shopReversalSchemaDefinitionsV11(),
        shopWorkspaceSchemaDefinitionsV12(),
        shopAuthorizationProofSchemaDefinitionsV15(),
        shopMemberSchemaDefinitionsV16(),
        shopCorrectionConsumptionSchemaDefinitionsV17(),
        shopCashMovementSchemaDefinitionsV18(),
      ])
        ...group.keys,
      'shop_business_profile',
      'shop_v13_migration_provenance',
      ...definitions.keys,
      if (allowCafeV20) ...shopCafeCancellationSchemaDefinitionsV20().keys,
      if (allowCashCheckoutV21)
        ...shopPendingCashCheckoutSchemaDefinitionsV21().keys,
      if (allowConnectedV23)
        ...(allowCloudV26
            ? shopConnectedSiteSchemaDefinitionsV26().keys
            : allowEnrollmentV25
            ? shopConnectedSiteSchemaDefinitionsV25().keys
            : allowReservationV24
            ? shopConnectedSiteSchemaDefinitionsV24().keys
            : shopConnectedSiteSchemaDefinitionsV23().keys),
    };
    final valid =
        _sameSchemaObjectNames(objects, expectedNames) &&
        _definitionGroupExact(objects, definitions, definitions.keys.toSet()) &&
        await _v19CafeOrderRowsValid();
    if (!valid) {
      throw StateError('The unified Shop v19 schema failed verification.');
    }
  }

  Future<void> _requireUnifiedV20Schema({
    bool allowCashCheckoutV21 = false,
    bool allowCashTenderV22 = false,
    bool allowConnectedV23 = false,
    bool allowReservationV24 = false,
    bool allowEnrollmentV25 = false,
    bool allowCloudV26 = false,
  }) async {
    await _requireUnifiedV19Schema(
      allowCafeV20: true,
      allowCashCheckoutV21: allowCashCheckoutV21,
      allowCashTenderV22: allowCashTenderV22,
      allowConnectedV23: allowConnectedV23,
      allowReservationV24: allowReservationV24,
      allowEnrollmentV25: allowEnrollmentV25,
      allowCloudV26: allowCloudV26,
    );
    final objects = await _readSchemaObjects();
    final definitions = shopCafeCancellationSchemaDefinitionsV20();
    final valid =
        _definitionGroupExact(objects, definitions, definitions.keys.toSet()) &&
        await _v20CafeCancellationRowsValid();
    if (!valid) {
      throw StateError('The unified Shop v20 schema failed verification.');
    }
  }

  Future<void> _requireUnifiedV21Schema({
    bool allowCashTenderV22 = false,
    bool allowConnectedV23 = false,
    bool allowReservationV24 = false,
    bool allowEnrollmentV25 = false,
    bool allowCloudV26 = false,
  }) async {
    await _requireUnifiedV20Schema(
      allowCashCheckoutV21: true,
      allowCashTenderV22: allowCashTenderV22,
      allowConnectedV23: allowConnectedV23,
      allowReservationV24: allowReservationV24,
      allowEnrollmentV25: allowEnrollmentV25,
      allowCloudV26: allowCloudV26,
    );
    final objects = await _readSchemaObjects();
    final definitions = shopPendingCashCheckoutSchemaDefinitionsV21();
    if (!_definitionGroupExact(
      objects,
      definitions,
      definitions.keys.toSet(),
    )) {
      throw StateError(
        'The unified Shop v21 pending-cash schema failed verification.',
      );
    }
    if (!await _v21PendingCashCheckoutRowsValid()) {
      throw StateError(
        'The unified Shop v21 pending-cash rows failed verification.',
      );
    }
  }

  Future<bool> _v21PendingCashCheckoutRowsValid() async {
    try {
      final rows = await customSelect(
        'SELECT intent.*, sale.id AS sale_id, shift.id AS existing_shift_id, '
        'shift.state AS existing_shift_state, '
        'draft.operation_id AS draft_operation_id, '
        'draft.basket_json AS draft_basket_json, '
        'cafe.id AS cafe_order_id, cafe.state AS cafe_order_state, '
        'cafe.ticket_json AS cafe_ticket_json, '
        'member_card.member_id AS existing_member_id, '
        'member_card.revision AS existing_member_revision '
        'FROM shop_pending_cash_checkouts intent '
        'LEFT JOIN shop_sales sale ON sale.operation_id = intent.operation_id '
        'LEFT JOIN shop_cash_shifts shift '
        'ON shift.id = intent.captured_shift_id '
        'LEFT JOIN shop_counter_drafts draft '
        "ON intent.checkout_kind = 'counter' "
        'AND draft.operation_id = intent.subject_id '
        'LEFT JOIN shop_cafe_orders cafe '
        "ON intent.checkout_kind = 'cafe' AND cafe.id = intent.subject_id "
        'LEFT JOIN shop_member_cards member_card '
        'ON member_card.member_id = intent.member_id '
        'AND member_card.revision = intent.member_card_revision',
      ).get();
      for (final row in rows) {
        final operationId = row.read<String>('operation_id');
        final kind = row.read<String>('checkout_kind');
        final subjectId = row.read<String>('subject_id');
        final shiftId = row.readNullable<String>('captured_shift_id');
        final memberId = row.readNullable<String>('member_id');
        final memberCardRevision = row.readNullable<int>(
          'member_card_revision',
        );
        final subjectFingerprint = kind == 'counter'
            ? await _sha256Hex(
                row.readNullable<String>('draft_basket_json') ?? '',
              )
            : await _sha256Hex(
                row.readNullable<String>('cafe_ticket_json') ?? '',
              );
        final expectedFingerprint = await _cashCheckoutFingerprint(
          operationId: operationId,
          checkoutKind: kind,
          subjectId: subjectId,
          capturedShiftId: shiftId,
          subjectFingerprint: subjectFingerprint,
          memberId: memberId,
          memberCardRevision: memberCardRevision,
        );
        if (row.read<String>('request_fingerprint') != expectedFingerprint ||
            row.readNullable<String>('sale_id') != null ||
            (shiftId != null &&
                (row.readNullable<String>('existing_shift_id') != shiftId ||
                    row.readNullable<String>('existing_shift_state') !=
                        'open')) ||
            (memberId != null &&
                (row.readNullable<String>('existing_member_id') != memberId ||
                    row.readNullable<int>('existing_member_revision') !=
                        memberCardRevision)) ||
            (kind == 'counter' &&
                (subjectId != operationId ||
                    row.readNullable<String>('draft_operation_id') !=
                        subjectId)) ||
            (kind == 'cafe' &&
                (row.readNullable<String>('cafe_order_id') != subjectId ||
                    row.readNullable<String>('cafe_order_state') != 'open'))) {
          return false;
        }
      }
      return true;
    } on Object {
      return false;
    }
  }

  Future<void> _requireUnifiedV22Schema({
    bool allowConnectedV23 = false,
    bool allowReservationV24 = false,
    bool allowEnrollmentV25 = false,
    bool allowCloudV26 = false,
  }) async {
    await _requireUnifiedV21Schema(
      allowCashTenderV22: true,
      allowConnectedV23: allowConnectedV23,
      allowReservationV24: allowReservationV24,
      allowEnrollmentV25: allowEnrollmentV25,
      allowCloudV26: allowCloudV26,
    );
    final columns = await customSelect('PRAGMA table_info(shop_sales)').get();
    if (!columns.any(
          (row) => row.read<String>('name') == 'cash_tendered_mmk',
        ) ||
        !await _v22CashTenderRowsValid()) {
      throw StateError(
        'The unified Shop v22 cash-tender schema failed verification.',
      );
    }
  }

  Future<bool> _v22CashTenderRowsValid() async {
    try {
      final invalid = await customSelect(
        'SELECT 1 FROM shop_sales WHERE cash_tendered_mmk IS NOT NULL '
        "AND (payment_method != 'cash' OR cash_tendered_mmk < total_mmk "
        'OR cash_tendered_mmk > 200000000000000) LIMIT 1',
      ).getSingleOrNull();
      if (invalid != null) return false;
      final sales = await customSelect(
        'SELECT sale.id, sale.operation_id, sale.total_mmk, '
        'sale.cash_tendered_mmk, outbox.payload_json '
        'FROM shop_sales sale LEFT JOIN shop_sync_outbox outbox '
        'ON outbox.operation_id = sale.operation_id AND outbox.event_type IN '
        "('shop.cash_sale.completed.v1', 'shop.cafe_cash_sale.completed.v1') "
        "WHERE sale.payment_method = 'cash'",
      ).get();
      for (final sale in sales) {
        final payloadJson = sale.readNullable<String>('payload_json');
        if (payloadJson == null) return false;
        final payload = jsonDecode(payloadJson);
        final tender = sale.readNullable<int>('cash_tendered_mmk');
        final total = sale.read<int>('total_mmk');
        if (payload is! Map<String, dynamic> ||
            payload['saleId'] != sale.read<String>('id') ||
            payload['totalMmk'] != total ||
            payload['paymentMethod'] != 'cash' ||
            (tender == null
                ? payload.containsKey('cashTenderedMmk') ||
                      payload.containsKey('cashChangeMmk')
                : payload['cashTenderedMmk'] != tender ||
                      payload['cashChangeMmk'] != tender - total)) {
          return false;
        }
      }
      return true;
    } on Object {
      return false;
    }
  }

  Future<void> _requireUnifiedV23Schema({
    bool allowReservationV24 = false,
    bool allowEnrollmentV25 = false,
    bool allowCloudV26 = false,
  }) async {
    await _requireUnifiedV22Schema(
      allowConnectedV23: true,
      allowReservationV24: allowReservationV24,
      allowEnrollmentV25: allowEnrollmentV25,
      allowCloudV26: allowCloudV26,
    );
    final objects = await _readSchemaObjects();
    final definitions = shopConnectedSiteSchemaDefinitionsV23();
    if (!_definitionGroupExact(
          objects,
          definitions,
          definitions.keys.toSet(),
        ) ||
        !await _v23ConnectedSiteRowsValid()) {
      throw StateError(
        'The unified Shop v23 connected-site schema failed verification.',
      );
    }
  }

  Future<bool> _v23ConnectedSiteRowsValid() async {
    try {
      final invalidAccepted = await customSelect('''
        SELECT 1 FROM shop_site_commands command
        LEFT JOIN shop_site_events event ON event.command_id = command.command_id
        LEFT JOIN shop_site_command_acks ack ON ack.command_id = command.command_id
        LEFT JOIN shop_site_audit audit ON audit.command_id = command.command_id
        WHERE command.state = 'accepted' AND (
          event.command_id IS NULL OR ack.status != 'accepted' OR
          ack.event_row_id != event.event_row_id OR
          ack.site_sequence != event.site_sequence OR
          ack.canonical_version != event.aggregate_version OR
          audit.command_id IS NULL OR
          event.tenant_id != command.tenant_id OR
          event.site_id != command.site_id OR
          event.aggregate_type != command.aggregate_type OR
          event.aggregate_id != command.aggregate_id
        ) LIMIT 1
      ''').getSingleOrNull();
      if (invalidAccepted != null) return false;
      final invalidConflict = await customSelect('''
        SELECT 1 FROM shop_site_commands command
        LEFT JOIN shop_site_events event ON event.command_id = command.command_id
        LEFT JOIN shop_site_command_acks ack ON ack.command_id = command.command_id
        LEFT JOIN shop_site_conflicts conflict
          ON conflict.command_id = command.command_id
        WHERE command.state = 'conflict' AND (
          event.command_id IS NOT NULL OR ack.status != 'conflict' OR
          ack.event_row_id IS NOT NULL OR ack.site_sequence IS NOT NULL OR
          conflict.command_id IS NULL
        ) LIMIT 1
      ''').getSingleOrNull();
      if (invalidConflict != null) return false;
      final invalidAggregate = await customSelect('''
        SELECT 1 FROM shop_site_aggregate_versions aggregate_row
        LEFT JOIN shop_site_events event
          ON event.event_row_id = aggregate_row.last_event_row_id
        WHERE event.event_row_id IS NULL OR
          event.tenant_id != aggregate_row.tenant_id OR
          event.site_id != aggregate_row.site_id OR
          event.aggregate_type != aggregate_row.aggregate_type OR
          event.aggregate_id != aggregate_row.aggregate_id OR
          event.aggregate_version != aggregate_row.version OR
          event.site_sequence != aggregate_row.last_site_sequence OR
          aggregate_row.version != (
            SELECT MAX(candidate.aggregate_version) FROM shop_site_events candidate
            WHERE candidate.tenant_id = aggregate_row.tenant_id
              AND candidate.site_id = aggregate_row.site_id
              AND candidate.aggregate_type = aggregate_row.aggregate_type
              AND candidate.aggregate_id = aggregate_row.aggregate_id
          ) LIMIT 1
      ''').getSingleOrNull();
      if (invalidAggregate != null) return false;
      final missingAggregate = await customSelect('''
        SELECT 1 FROM shop_site_events event
        LEFT JOIN shop_site_aggregate_versions aggregate_row
          ON aggregate_row.tenant_id = event.tenant_id
          AND aggregate_row.site_id = event.site_id
          AND aggregate_row.aggregate_type = event.aggregate_type
          AND aggregate_row.aggregate_id = event.aggregate_id
        WHERE aggregate_row.aggregate_id IS NULL LIMIT 1
      ''').getSingleOrNull();
      if (missingAggregate != null) return false;
      final siteSequenceGap = await customSelect('''
        SELECT 1 FROM shop_site_events event
        WHERE event.site_sequence != (
          SELECT COUNT(*) FROM shop_site_events candidate
          WHERE candidate.tenant_id = event.tenant_id
            AND candidate.site_id = event.site_id
            AND candidate.site_sequence <= event.site_sequence
        ) LIMIT 1
      ''').getSingleOrNull();
      return siteSequenceGap == null;
    } on Object {
      return false;
    }
  }

  Future<void> _requireUnifiedV24Schema({
    bool allowEnrollmentV25 = false,
    bool allowCloudV26 = false,
  }) async {
    await _requireUnifiedV23Schema(
      allowReservationV24: true,
      allowEnrollmentV25: allowEnrollmentV25,
      allowCloudV26: allowCloudV26,
    );
    final objects = await _readSchemaObjects();
    final definitions = shopConnectedStockReservationSchemaDefinitionsV24();
    if (!_definitionGroupExact(
          objects,
          definitions,
          definitions.keys.toSet(),
        ) ||
        !await _v24ConnectedStockReservationRowsValid()) {
      throw StateError(
        'The unified Shop v24 connected-stock schema failed verification.',
      );
    }
  }

  Future<void> _requireUnifiedV25Schema({bool allowCloudV26 = false}) async {
    await _requireUnifiedV24Schema(
      allowEnrollmentV25: true,
      allowCloudV26: allowCloudV26,
    );
    final objects = await _readSchemaObjects();
    final definitions = shopConnectedEnrollmentSchemaDefinitionsV25();
    if (!_definitionGroupExact(
          objects,
          definitions,
          definitions.keys.toSet(),
        ) ||
        !await _v25ConnectedEnrollmentRowsValid()) {
      throw StateError(
        'The unified Shop v25 connected-enrollment schema failed verification.',
      );
    }
  }

  Future<void> _requireUnifiedV26Schema() async {
    await _requireUnifiedV25Schema(allowCloudV26: true);
    final objects = await _readSchemaObjects();
    final definitions = shopConnectedCloudDispositionSchemaDefinitionsV26();
    if (!_definitionGroupExact(
          objects,
          definitions,
          definitions.keys.toSet(),
        ) ||
        !await _v26ConnectedCloudDispositionRowsValid()) {
      throw StateError(
        'The unified Shop v26 cloud-disposition schema failed verification.',
      );
    }
  }

  Future<bool> _v26ConnectedCloudDispositionRowsValid() async {
    try {
      Future<List<Map<String, Object?>>> rows(String table) async =>
          (await customSelect('SELECT * FROM $table').get())
              .map((row) => Map<String, Object?>.from(row.data))
              .toList(growable: false);
      return shopConnectedCloudDispositionRowsValidV26(
        commands: await rows('shop_site_commands'),
        events: await rows('shop_site_events'),
        cloudAcks: await rows('shop_site_cloud_acks'),
        conflicts: await rows('shop_site_conflicts'),
        dispositions: await rows('shop_site_cloud_dispositions'),
      );
    } on Object {
      return false;
    }
  }

  Future<bool> _v25ConnectedEnrollmentRowsValid() async {
    try {
      Future<List<Map<String, Object?>>> rows(String table) async =>
          (await customSelect('SELECT * FROM $table').get())
              .map((row) => Map<String, Object?>.from(row.data))
              .toList(growable: false);
      return shopConnectedEnrollmentRowsValidV25(
        pairingNonces: await rows('shop_site_pairing_nonces'),
        pendingEnrollments: await rows('shop_site_pending_enrollments'),
        enrollmentEvidence: await rows('shop_site_enrollment_evidence'),
        devices: await rows('shop_site_devices'),
        requestNonces: await rows('shop_site_request_nonces'),
      );
    } on Object {
      return false;
    }
  }

  Future<bool> _v24ConnectedStockReservationRowsValid() async {
    try {
      Future<List<Map<String, Object?>>> rows(String sql) async =>
          (await customSelect(sql).get())
              .map((row) => Map<String, Object?>.from(row.data))
              .toList(growable: false);
      return shopConnectedStockReservationRowsValidV24(
        commands: await rows('SELECT * FROM shop_site_commands'),
        events: await rows('SELECT * FROM shop_site_events'),
        headers: await rows(
          'SELECT * FROM shop_connected_stock_reservation_headers',
        ),
        lines: await rows(
          'SELECT * FROM shop_connected_stock_reservation_lines',
        ),
        transitions: await rows(
          'SELECT * FROM shop_connected_stock_reservation_transitions',
        ),
        sales: await rows(
          'SELECT id, operation_id, request_fingerprint FROM shop_sales',
        ),
        trustedTimes: await rows('SELECT * FROM shop_connected_trusted_time'),
        scopeBindings: await rows('SELECT * FROM shop_connected_scope_binding'),
        tenderBindings: await rows(
          'SELECT * FROM shop_connected_tender_reservation_bindings',
        ),
        pendingCashCheckouts: await rows(
          'SELECT operation_id FROM shop_pending_cash_checkouts',
        ),
        walletCheckoutIntents: await rows(
          'SELECT operation_id, state FROM shop_wallet_checkout_intents',
        ),
      );
    } on Object {
      return false;
    }
  }

  Future<bool> _v20CafeCancellationRowsValid() async {
    try {
      final rows = await customSelect(
        'SELECT cancellation.*, order_row.state, order_row.state_revision, '
        'order_row.ticket_version AS current_ticket_version, '
        'order_row.last_command_fingerprint, order_row.completed_sale_id '
        'FROM shop_cafe_order_cancellations cancellation '
        'JOIN shop_cafe_orders order_row ON order_row.id = cancellation.order_id',
      ).get();
      for (final row in rows) {
        final operationId = row.read<String>('operation_id');
        final orderId = row.read<String>('order_id');
        final fromState = row.read<String>('from_state');
        final revision = row.read<int>('expected_state_revision');
        final ticketVersion = row.read<int>('ticket_version');
        final ticketFingerprint = row.read<String>('ticket_fingerprint');
        final createdAt = row.read<int>('created_at_millis');
        final fingerprint = cafeOrderCancellationFingerprint(
          operationId: operationId,
          orderId: orderId,
          ticketVersion: ticketVersion,
          ticketFingerprint: ticketFingerprint,
          stateRevision: revision,
          fromState: fromState,
        );
        if (row.read<String>('request_fingerprint') != fingerprint ||
            row.read<String>('state') != fromState ||
            row.read<int>('state_revision') != revision ||
            row.read<int>('current_ticket_version') != ticketVersion ||
            row.read<String>('last_command_fingerprint') != ticketFingerprint ||
            row.readNullable<String>('completed_sale_id') != null) {
          return false;
        }
        final outbox = await customSelect(
          'SELECT event_type, payload_json, created_at_millis '
          'FROM shop_sync_outbox WHERE operation_id = ?',
          variables: [Variable<String>(operationId)],
        ).getSingleOrNull();
        if (outbox == null ||
            outbox.read<String>('event_type') !=
                'shop.cafe_order.cancelled.v1' ||
            outbox.read<int>('created_at_millis') != createdAt) {
          return false;
        }
        final payload = jsonDecode(outbox.read<String>('payload_json'));
        if (payload is! Map ||
            payload['contract'] != 'supermega.shop.cafe-order-cancelled.v1' ||
            payload['operationId'] != operationId ||
            payload['orderId'] != orderId ||
            payload['ticketVersion'] != ticketVersion ||
            payload['ticketFingerprint'] != ticketFingerprint ||
            payload['fromState'] != fromState ||
            payload['stateRevision'] != revision ||
            payload['createdAtMillis'] != createdAt ||
            payload['kitchenStopConfirmed'] != false) {
          return false;
        }
      }
      return true;
    } on Object {
      return false;
    }
  }

  Future<bool> _v19CafeOrderRowsValid() async {
    try {
      final saleColumns = await customSelect('PRAGMA table_info(shop_sales)')
          .get();
      final hasCashTenderColumn = saleColumns.any(
        (row) => row.read<String>('name') == 'cash_tendered_mmk',
      );
      final dispatches = await customSelect(
        "SELECT operation_id, payload_json FROM shop_sync_outbox WHERE event_type = "
        "'shop.cafe_kitchen_dispatch.recorded.v1'",
      ).get();
      final dispatchHistory =
          <
            ({
              CafeOrderTicket ticket,
              List<CafeKitchenDispatchLine> lines,
              int historyStartVersion,
            })
          >[];
      for (final dispatch in dispatches) {
        final parsed = cafeKitchenDispatchFromPayload(
          jsonDecode(dispatch.read<String>('payload_json')),
        );
        dispatchHistory.add(parsed);
        if (dispatch.read<String>('operation_id') !=
            cafeKitchenDispatchOperationId(parsed.ticket)) {
          return false;
        }
      }
      final kitchenStatusRows = await customSelect(
        'SELECT operation_id, payload_json, created_at_millis '
        'FROM shop_sync_outbox WHERE event_type = ?',
        variables: const [Variable<String>(cafeKitchenStatusEventType)],
      ).get();
      final kitchenStatusEvents = <CafeKitchenStatusEvent>[];
      for (final row in kitchenStatusRows) {
        final event = CafeKitchenStatusEvent.fromJson(
          jsonDecode(row.read<String>('payload_json')),
        );
        if (row.read<String>('operation_id') != event.operationId ||
            row.read<int>('created_at_millis') != event.createdAtMillis) {
          return false;
        }
        kitchenStatusEvents.add(event);
      }
      if (!cafeKitchenStatusHistoryValid(
        kitchenStatusEvents,
        dispatchHistory,
      )) {
        return false;
      }
      final splitRows = await customSelect(
        'SELECT operation_id, event_type, payload_json, created_at_millis '
        'FROM shop_sync_outbox WHERE event_type IN (?, ?)',
        variables: const [
          Variable<String>(cafeOrderSplitEventType),
          Variable<String>(cafeOrderQuantitySplitEventType),
        ],
      ).get();
      final splitEvents = <CafeOrderSplitEvent>[];
      for (final row in splitRows) {
        final event = CafeOrderSplitEvent.fromJson(
          jsonDecode(row.read<String>('payload_json')),
        );
        if (row.read<String>('event_type') != event.eventType ||
            row.read<String>('operation_id') != event.operationId ||
            row.read<int>('created_at_millis') != event.createdAtMillis) {
          return false;
        }
        final stateRows = await customSelect(
          'SELECT from_state, to_state, resulting_state_revision, '
          'request_fingerprint '
          'FROM shop_cafe_order_state_events WHERE order_id = ? '
          'AND resulting_state_revision <= ? '
          'ORDER BY resulting_state_revision',
          variables: [
            Variable<String>(event.sourceOrderId),
            Variable<int>(event.expectedStateRevision),
          ],
        ).get();
        if (stateRows.length != event.expectedStateRevision) return false;
        var sourceState = 'open';
        for (var index = 0; index < stateRows.length; index++) {
          final stateRow = stateRows[index];
          if (stateRow.read<int>('resulting_state_revision') != index + 1 ||
              stateRow.read<String>('from_state') != sourceState ||
              stateRow.read<String>('request_fingerprint') !=
                  event.sourceStateEventFingerprints[index]) {
            return false;
          }
          sourceState = stateRow.read<String>('to_state');
        }
        if (sourceState != 'open') return false;
        splitEvents.add(event);
      }
      if (!cafeOrderSplitHistoryValid(
        splitEvents,
        dispatchHistory.map((dispatch) => dispatch.ticket),
      )) {
        return false;
      }
      final reversalRows = await customSelect(
        'SELECT operation_id, event_type, payload_json, created_at_millis '
        'FROM shop_sync_outbox WHERE event_type = ?',
        variables: const [Variable<String>(cafeOrderSplitReversalEventType)],
      ).get();
      final reversalEvents = <CafeOrderSplitReversalEvent>[];
      for (final row in reversalRows) {
        final event = CafeOrderSplitReversalEvent.fromJson(
          jsonDecode(row.read<String>('payload_json')),
        );
        if (row.read<String>('event_type') != event.eventType ||
            row.read<String>('operation_id') != event.operationId ||
            row.read<int>('created_at_millis') != event.createdAtMillis) {
          return false;
        }
        final cancellation = await customSelect(
          'SELECT * FROM shop_cafe_order_cancellations '
          'WHERE operation_id = ?',
          variables: [
            Variable<String>(event.destinationCancellationOperationId),
          ],
        ).getSingleOrNull();
        if (cancellation == null ||
            cancellation.read<String>('order_id') != event.destinationOrderId ||
            cancellation.read<int>('expected_state_revision') !=
                event.expectedDestinationStateRevision ||
            cancellation.read<int>('ticket_version') !=
                event.expectedDestinationTicketVersion ||
            cancellation.read<String>('ticket_fingerprint') !=
                event
                    .splitEvent
                    .destinationResultTicket
                    .lastCommandFingerprint ||
            cancellation.read<String>('request_fingerprint') !=
                event.destinationCancellationFingerprint) {
          return false;
        }
        reversalEvents.add(event);
      }
      if (!cafeOrderSplitReversalHistoryValid(
        reversalEvents,
        splitEvents,
        dispatchHistory.map((dispatch) => dispatch.ticket),
      )) {
        return false;
      }
      final orders = await customSelect('SELECT * FROM shop_cafe_orders').get();
      final currentTickets = [
        for (final order in orders)
          CafeOrderTicket.fromJson(
            jsonDecode(order.read<String>('ticket_json')),
          ),
      ];
      if (!cafeKitchenDispatchHistoryValid(dispatchHistory, currentTickets)) {
        return false;
      }
      for (var index = 0; index < orders.length; index++) {
        final order = orders[index];
        final ticket = currentTickets[index];
        if (ticket.id != order.read<String>('id') ||
            ticket.version != order.read<int>('ticket_version') ||
            ticket.lastCommandId != order.read<String>('last_command_id') ||
            ticket.lastCommandFingerprint !=
                order.read<String>('last_command_fingerprint') ||
            _cafeTicketTotalMmk(ticket) != order.read<int>('total_mmk')) {
          return false;
        }
        final kitchenDispatchByLine = <String, CafeKitchenDispatchLine>{};
        if (ticket.lines.any((line) => line.hasPreparationRoute)) {
          final dispatch = await customSelect(
            'SELECT event_type, payload_json FROM shop_sync_outbox '
            'WHERE operation_id = ?',
            variables: [
              Variable<String>(cafeKitchenDispatchOperationId(ticket)),
            ],
          ).getSingleOrNull();
          if (dispatch == null ||
              dispatch.read<String>('event_type') !=
                  'shop.cafe_kitchen_dispatch.recorded.v1') {
            return false;
          }
          final parsed = cafeKitchenDispatchFromPayload(
            jsonDecode(dispatch.read<String>('payload_json')),
          );
          if (parsed.ticket.lastCommandFingerprint !=
              ticket.lastCommandFingerprint) {
            return false;
          }
          kitchenDispatchByLine.addEntries(
            parsed.lines.map((line) => MapEntry(line.lineId, line)),
          );
        }
        final state = order.read<String>('state');
        final stateRevision = order.read<int>('state_revision');
        final saleId = order.readNullable<String>('completed_sale_id');
        final events = await customSelect(
          'SELECT * FROM shop_cafe_order_state_events WHERE order_id = ? '
          'ORDER BY resulting_state_revision',
          variables: [Variable<String>(ticket.id)],
        ).get();
        if (events.length != stateRevision) return false;
        var expectedState = 'open';
        for (var index = 0; index < events.length; index++) {
          final event = events[index];
          final eventSaleId = event.readNullable<String>('sale_id');
          final saleTender = eventSaleId == null
              ? null
              : await customSelect(
                  'SELECT ${hasCashTenderColumn ? 'cash_tendered_mmk' : 'NULL AS cash_tendered_mmk'} '
                  'FROM shop_sales WHERE id = ?',
                  variables: [Variable<String>(eventSaleId)],
                ).getSingleOrNull();
          final fingerprint = eventSaleId == null
              ? cafeOrderStateFingerprint(
                  operationId: event.read<String>('operation_id'),
                  orderId: ticket.id,
                  expectedStateRevision: index,
                  fromState: event.read<String>('from_state'),
                  toState: event.read<String>('to_state'),
                )
              : cafeOrderCashSaleFingerprint(
                  operationId: event.read<String>('operation_id'),
                  orderId: ticket.id,
                  ticketVersion: ticket.version,
                  stateRevision: index,
                  cashTenderedMmk: saleTender?.readNullable<int>(
                    'cash_tendered_mmk',
                  ),
                );
          if (event.read<int>('expected_state_revision') != index ||
              event.read<int>('resulting_state_revision') != index + 1 ||
              event.read<String>('from_state') != expectedState ||
              event.read<String>('request_fingerprint') != fingerprint ||
              (eventSaleId != null &&
                  (eventSaleId != event.read<String>('operation_id') ||
                      event.read<String>('to_state') != 'completed'))) {
            return false;
          }
          expectedState = event.read<String>('to_state');
        }
        if (expectedState != state ||
            (events.isEmpty
                ? order.readNullable<String>('last_state_operation_id') != null
                : events.last.read<String>('operation_id') !=
                      order.read<String>('last_state_operation_id')) ||
            (events.isNotEmpty &&
                events.last.read<String>('request_fingerprint') !=
                    order.read<String>('last_state_fingerprint'))) {
          return false;
        }
        if (state == 'completed') {
          if (saleId == null ||
              events.last.readNullable<String>('sale_id') != saleId) {
            return false;
          }
          final sale = await customSelect(
            'SELECT operation_id, request_fingerprint, total_mmk, '
            'payment_method, '
            '${hasCashTenderColumn ? 'cash_tendered_mmk' : 'NULL AS cash_tendered_mmk'}, '
            'created_at_millis '
            'FROM shop_sales WHERE id = ?',
            variables: [Variable<String>(saleId)],
          ).getSingleOrNull();
          if (sale == null ||
              sale.read<String>('operation_id') != saleId ||
              sale.read<String>('request_fingerprint') !=
                  events.last.read<String>('request_fingerprint') ||
              sale.read<int>('total_mmk') != _cafeTicketTotalMmk(ticket) ||
              sale.read<String>('payment_method') != 'cash') {
            return false;
          }
          final lines = await customSelect(
            'SELECT id, product_id, product_name, unit_price_mmk, quantity, '
            'line_total_mmk '
            'FROM shop_sale_lines WHERE sale_id = ?',
            variables: [Variable<String>(saleId)],
          ).get();
          if (lines.length != ticket.lines.length) return false;
          final byId = {
            for (final line in lines) line.read<String>('id'): line,
          };
          final movements = await customSelect(
            'SELECT id, product_id, quantity_delta, reason, created_at_millis '
            'FROM shop_stock_movements WHERE sale_id = ? '
            "AND reason = 'cafe_cash_sale'",
            variables: [Variable<String>(saleId)],
          ).get();
          if (movements.length != ticket.lines.length) return false;
          final invalidAdditionalMovement = await customSelect(
            'SELECT 1 FROM shop_stock_movements movement '
            'LEFT JOIN shop_sale_reversal_lines reversal_line '
            'ON reversal_line.stock_movement_id = movement.id '
            'LEFT JOIN shop_sale_reversals reversal '
            'ON reversal.id = reversal_line.reversal_id '
            'WHERE movement.sale_id = ? '
            "AND movement.reason != 'cafe_cash_sale' AND ("
            'reversal_line.stock_movement_id IS NULL '
            'OR reversal.sale_id != ? '
            "OR movement.reason != 'sale_reversal_restock' "
            'OR movement.product_id != reversal_line.product_id '
            'OR movement.quantity_delta != reversal_line.restock_quantity) '
            'LIMIT 1',
            variables: [Variable<String>(saleId), Variable<String>(saleId)],
          ).getSingleOrNull();
          if (invalidAdditionalMovement != null) return false;
          final movementsById = {
            for (final movement in movements)
              movement.read<String>('id'): movement,
          };
          final outbox = await customSelect(
            'SELECT event_type, payload_json, created_at_millis '
            'FROM shop_sync_outbox WHERE operation_id = ?',
            variables: [Variable<String>(saleId)],
          ).getSingleOrNull();
          if (outbox == null ||
              outbox.read<String>('event_type') !=
                  'shop.cafe_cash_sale.completed.v1' ||
              outbox.read<int>('created_at_millis') !=
                  sale.read<int>('created_at_millis')) {
            return false;
          }
          final payload = jsonDecode(outbox.read<String>('payload_json'));
          final cashTenderedMmk = sale.readNullable<int>('cash_tendered_mmk');
          if (payload is! Map<String, dynamic> ||
              payload['saleId'] != saleId ||
              payload['cafeOrderId'] != ticket.id ||
              payload['ticketVersion'] != ticket.version ||
              payload['totalMmk'] != _cafeTicketTotalMmk(ticket) ||
              payload['paymentMethod'] != 'cash' ||
              (cashTenderedMmk == null
                  ? payload.containsKey('cashTenderedMmk') ||
                        payload.containsKey('cashChangeMmk')
                  : payload['cashTenderedMmk'] != cashTenderedMmk ||
                        payload['cashChangeMmk'] !=
                            cashTenderedMmk - sale.read<int>('total_mmk')) ||
              payload['createdAtMillis'] !=
                  sale.read<int>('created_at_millis') ||
              jsonEncode(payload['serviceContext']) !=
                  jsonEncode(ticket.serviceContext?.toJson()) ||
              payload['lines'] is! List ||
              (payload['lines'] as List).length != ticket.lines.length) {
            return false;
          }
          final payloadLines = {
            for (final item in payload['lines'] as List)
              if (item is Map<String, dynamic>) item['lineId']: item,
          };
          if (payloadLines.length != ticket.lines.length) return false;
          for (final line in ticket.lines) {
            final saved = byId['$saleId:${line.id}'];
            final movement = movementsById['$saleId:${line.id}:cafe-sale'];
            final eventLine = payloadLines[line.id];
            final unit = _cafeLineUnitMmk(line);
            if (saved == null ||
                movement == null ||
                eventLine == null ||
                saved.read<String>('product_id') != line.productId ||
                saved.read<String>('product_name') !=
                    eventLine['productName'] ||
                saved.read<int>('unit_price_mmk') != unit ||
                saved.read<int>('quantity') != line.quantity ||
                saved.read<int>('line_total_mmk') != unit * line.quantity ||
                movement.read<String>('product_id') != line.productId ||
                movement.read<int>('quantity_delta') != -line.quantity ||
                movement.read<String>('reason') != 'cafe_cash_sale' ||
                movement.read<int>('created_at_millis') !=
                    sale.read<int>('created_at_millis') ||
                eventLine['productId'] != line.productId ||
                eventLine['quantity'] != line.quantity ||
                eventLine['unitPriceMmk'] != unit ||
                eventLine['lineTotalMmk'] != unit * line.quantity ||
                eventLine['remark'] != line.remark ||
                (line.hasPreparationRoute &&
                    (eventLine['preparationStation'] !=
                            line.preparationStation ||
                        eventLine['kitchenTicketId'] !=
                            kitchenDispatchByLine[line.id]?.ticketId ||
                        eventLine['kitchenTicketSequence'] !=
                            kitchenDispatchByLine[line.id]?.sequence)) ||
                jsonEncode(eventLine['modifiers']) !=
                    jsonEncode([
                      for (final modifier in line.modifiers) modifier.toJson(),
                    ])) {
              return false;
            }
          }
        } else if (saleId != null) {
          return false;
        }
      }
      return true;
    } on Object {
      return false;
    }
  }

  int _cafeLineUnitMmk(CafeOrderLine line) =>
      line.baseUnitPriceMmk +
      line.modifiers.fold<int>(0, (sum, item) => sum + item.priceDeltaMmk);

  int _cafeTicketTotalMmk(CafeOrderTicket ticket) => ticket.lines.fold<int>(
    0,
    (sum, line) => sum + _cafeLineUnitMmk(line) * line.quantity,
  );

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
        'cash_movement_count',
        'cash_in_total_mmk',
        'cash_out_total_mmk',
        'review_cash_movement_count',
        'review_cash_in_total_mmk',
        'review_cash_out_total_mmk',
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
        .where(
          (name) => !const {
            'cash_movement_count',
            'cash_in_total_mmk',
            'cash_out_total_mmk',
            'review_cash_movement_count',
            'review_cash_in_total_mmk',
            'review_cash_out_total_mmk',
          }.contains(name),
        )
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

  Future<_ColumnGroupState> _cashMovementColumnState() async {
    const names = [
      'cash_movement_count',
      'cash_in_total_mmk',
      'cash_out_total_mmk',
      'review_cash_movement_count',
      'review_cash_in_total_mmk',
      'review_cash_out_total_mmk',
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
    if (!_sameStrings(
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

  /// Applies one already authenticated connected-site command atomically.
  ///
  /// This persistence seam deliberately performs no signature verification or
  /// network enrollment. A caller must keep [connectedSiteEnabled] false until
  /// a production issuer, key store, and coordinator policy are injected. The
  /// database still rechecks the persisted device, lease, capability,
  /// revocation generation, aggregate version, and reservation invariant.
  Future<ShopConnectedSiteCommandResult> applyConnectedSiteCommand(
    ShopConnectedSiteCommandInput input, {
    required bool connectedSiteEnabled,
    ShopConnectedSiteCoordinatorTimeAuthority timeAuthority =
        const ShopConnectedSiteTimeUnavailable(),
  }) async {
    if (!connectedSiteEnabled) {
      throw StateError('Connected-site commands are disabled.');
    }
    _validateConnectedSiteCommandInput(input);
    final payload = _connectedSiteEventPayload(input.eventPayloadJson);
    final stockPayload = _connectedStockCommandPayload(input, payload);
    final canonicalPayloadJson = canonicalConnectedSiteJson(payload);
    final eventEnvelope = _connectedSiteEventEnvelope(
      input,
      aggregateVersion: input.expectedVersion + 1,
      payload: payload,
    );
    if (connectedSiteSha256(eventEnvelope) != input.eventDigest) {
      throw StateError('The connected-site event digest is invalid.');
    }
    return transaction(() async {
      final existing = await customSelect(
        'SELECT command.command_digest, command.state, command.tenant_id, '
        'command.site_id, command.actor_id, command.device_id, '
        'command.aggregate_type, command.aggregate_id, command.capability, '
        'command.expected_version, command.payload_digest, command.lease_digest, '
        'command.received_at_millis, ack.status, '
        'ack.site_sequence, ack.canonical_version, ack.ack_digest, '
        'event.event_digest, conflict.reason_code '
        'FROM shop_site_commands command '
        'JOIN shop_site_command_acks ack '
        'ON ack.command_id = command.command_id '
        'LEFT JOIN shop_site_events event ON event.command_id = command.command_id '
        'LEFT JOIN shop_site_conflicts conflict ON conflict.command_id = command.command_id '
        'WHERE command.command_id = ?',
        variables: [Variable<String>(input.commandId)],
      ).getSingleOrNull();
      if (existing != null) {
        if (existing.read<String>('command_digest') != input.commandDigest ||
            existing.read<String>('tenant_id') != input.tenantId ||
            existing.read<String>('site_id') != input.siteId ||
            existing.read<String>('actor_id') != input.actorId ||
            existing.read<String>('device_id') != input.deviceId ||
            existing.read<String>('aggregate_type') != input.aggregateType ||
            existing.read<String>('aggregate_id') != input.aggregateId ||
            existing.read<String>('capability') != input.capability ||
            existing.read<int>('expected_version') != input.expectedVersion ||
            existing.read<String>('payload_digest') != input.payloadDigest ||
            existing.read<String>('lease_digest') != input.leaseDigest ||
            existing.read<int>('received_at_millis') != input.createdAtMillis ||
            (existing.read<String>('state') == 'accepted' &&
                existing.readNullable<String>('event_digest') !=
                    input.eventDigest)) {
          throw StateError(
            'A connected-site command ID was reused with different bytes.',
          );
        }
        final accepted = existing.read<String>('state') == 'accepted';
        return ShopConnectedSiteCommandResult(
          status: accepted
              ? ShopConnectedSiteCommandStatus.replayed
              : ShopConnectedSiteCommandStatus.conflict,
          commandId: input.commandId,
          ackDigest: existing.read<String>('ack_digest'),
          canonicalVersion: existing.read<int>('canonical_version'),
          eventSequence: existing.readNullable<int>('site_sequence'),
          eventDigest: existing.readNullable<String>('event_digest'),
          conflictCode: existing.readNullable<String>('reason_code'),
        );
      }

      final trustedNow =
          stockPayload.reservation == null && stockPayload.lifecycle == null
          ? null
          : await _validatedConnectedSiteNow(
              timeAuthority,
              tenantId: input.tenantId,
              siteId: input.siteId,
            );

      final authority = await customSelect(
        'SELECT lease.capabilities_json, lease.session_generation, '
        'lease.revocation_generation, lease.issued_at_millis, '
        'lease.expires_at_millis, device.session_generation AS device_generation, '
        'device.state AS device_state, observation.generation AS observed_generation '
        'FROM shop_site_offline_leases lease '
        'JOIN shop_site_devices device ON device.device_id = lease.device_id '
        'LEFT JOIN shop_site_revocation_observations observation '
        'ON observation.tenant_id = lease.tenant_id '
        'AND observation.site_id = lease.site_id '
        'WHERE lease.payload_digest = ? AND lease.tenant_id = ? '
        'AND lease.site_id = ? AND lease.actor_id = ? AND lease.device_id = ?',
        variables: [
          Variable<String>(input.leaseDigest),
          Variable<String>(input.tenantId),
          Variable<String>(input.siteId),
          Variable<String>(input.actorId),
          Variable<String>(input.deviceId),
        ],
      ).getSingleOrNull();
      if (authority == null ||
          authority.read<String>('device_state') != 'active' ||
          authority.read<int>('session_generation') !=
              authority.read<int>('device_generation') ||
          authority.readNullable<int>('observed_generation') !=
              authority.read<int>('revocation_generation') ||
          input.createdAtMillis < authority.read<int>('issued_at_millis') ||
          input.createdAtMillis >= authority.read<int>('expires_at_millis')) {
        throw StateError('Connected-site authority is absent or expired.');
      }
      final capabilities = jsonDecode(
        authority.read<String>('capabilities_json'),
      );
      if (capabilities is! List ||
          capabilities.any((value) => value is! String) ||
          !capabilities.contains(input.capability)) {
        throw StateError('The offline lease lacks this capability.');
      }
      if (trustedNow != null) {
        const maxSkewMillis = 2 * 60 * 1000;
        if ((input.createdAtMillis - trustedNow).abs() > maxSkewMillis ||
            trustedNow < authority.read<int>('issued_at_millis') ||
            trustedNow >= authority.read<int>('expires_at_millis')) {
          throw StateError('Connected-site command time is outside policy.');
        }
        final reservation = stockPayload.reservation;
        if (reservation != null) {
          final issuedAt = DateTime.parse(reservation.issuedAt)
              .millisecondsSinceEpoch;
          final expiresAt = DateTime.parse(reservation.expiresAt)
              .millisecondsSinceEpoch;
          if ((issuedAt - trustedNow).abs() > maxSkewMillis ||
              expiresAt <= trustedNow ||
              expiresAt >
                  trustedNow + const Duration(hours: 24).inMilliseconds ||
              expiresAt > authority.read<int>('expires_at_millis')) {
            throw StateError(
              'Connected stock reservation time is outside policy.',
            );
          }
        }
      }

      final scopeBinding = trustedNow == null
          ? null
          : await customSelect(
              'SELECT tenant_id, site_id FROM shop_connected_scope_binding '
              'WHERE singleton = 1',
            ).getSingleOrNull();
      final scopeMatches =
          trustedNow == null ||
          (scopeBinding != null &&
              scopeBinding.read<String>('tenant_id') == input.tenantId &&
              scopeBinding.read<String>('site_id') == input.siteId);
      if (trustedNow != null && !scopeMatches) {
        throw StateError('Connected stock scope does not match this database.');
      }
      if (trustedNow != null && scopeMatches) {
        await _requireConnectedTrustedTimeNotRegressed(
          tenantId: input.tenantId,
          siteId: input.siteId,
          nowMillis: trustedNow,
        );
      }

      final aggregate = await customSelect(
        'SELECT version FROM shop_site_aggregate_versions '
        'WHERE tenant_id = ? AND site_id = ? AND aggregate_type = ? '
        'AND aggregate_id = ?',
        variables: [
          Variable<String>(input.tenantId),
          Variable<String>(input.siteId),
          Variable<String>(input.aggregateType),
          Variable<String>(input.aggregateId),
        ],
      ).getSingleOrNull();
      final currentVersion = aggregate?.read<int>('version') ?? 0;

      String? conflictReason;
      ConnectedStockReservationTransitionV1? lifecycleTransition;
      if (!scopeMatches) {
        conflictReason = 'connected_scope_mismatch';
      } else if (currentVersion != input.expectedVersion) {
        conflictReason = 'aggregate_version_mismatch';
      } else if (stockPayload.reservation != null) {
        for (final line in stockPayload.reservation!.lines) {
          final product = await customSelect(
            'SELECT on_hand FROM shop_products WHERE id = ? AND archived = 0',
            variables: [Variable<String>(line.productId)],
          ).getSingleOrNull();
          final reserved = await _readTotalReservedStockQuantity(
            line.productId,
          );
          if (product == null ||
              product.read<int>('on_hand') - reserved < line.quantity) {
            conflictReason = 'stock_reservation_unavailable';
            break;
          }
        }
      } else if (stockPayload.lifecycle case final lifecycle?) {
        final header = await customSelect(
          'SELECT reservation_json, legacy_source, workflow_type, subject_id, '
          'capability FROM '
          'shop_connected_stock_reservation_headers '
          'WHERE reservation_id = ? AND tenant_id = ? AND site_id = ? '
          'AND actor_id = ? AND device_id = ? '
          'AND workflow_type = ? AND subject_id = ? AND capability = ?',
          variables: [
            Variable<String>(lifecycle.reservationId),
            Variable<String>(input.tenantId),
            Variable<String>(input.siteId),
            Variable<String>(input.actorId),
            Variable<String>(input.deviceId),
            Variable<String>(input.aggregateType),
            Variable<String>(input.aggregateId),
            Variable<String>(input.capability),
          ],
        ).getSingleOrNull();
        if (header == null) {
          conflictReason = 'reservation_not_found';
        } else if (header.read<int>('legacy_source') == 1) {
          conflictReason = 'reservation_legacy_unadoptable';
        } else {
          final terminal = await customSelect(
            'SELECT 1 FROM shop_connected_stock_reservation_transitions '
            'WHERE reservation_id = ? LIMIT 1',
            variables: [Variable<String>(lifecycle.reservationId)],
          ).getSingleOrNull();
          if (terminal != null) {
            conflictReason = 'reservation_terminal';
          } else {
            final reservation = ConnectedStockReservationV1.fromJson(
              jsonDecode(header.read<String>('reservation_json')),
            );
            if (reservation.reservationDigest !=
                lifecycle.expectedReservationDigest) {
              conflictReason = 'reservation_digest_mismatch';
            } else if (trustedNow! <
                    DateTime.parse(reservation.issuedAt)
                        .millisecondsSinceEpoch ||
                trustedNow >=
                    DateTime.parse(reservation.expiresAt)
                        .millisecondsSinceEpoch) {
              conflictReason = 'reservation_time_invalid';
            } else {
              lifecycleTransition = transitionConnectedStockReservation(
                reservation: reservation,
                expectedReservationDigest: lifecycle.expectedReservationDigest,
                targetState: lifecycle.targetState,
                transitionedAt: _connectedSiteOccurredAt(trustedNow),
                reason: lifecycle.reason,
              );
            }
          }
        }
      }

      if (conflictReason != null) {
        if (trustedNow != null && scopeBinding != null && scopeMatches) {
          await _recordConnectedTrustedTime(
            tenantId: input.tenantId,
            siteId: input.siteId,
            nowMillis: trustedNow,
          );
        }
        final conflictDigest = await _sha256Hex(
          '${input.commandDigest}:$conflictReason:$currentVersion',
        );
        await customInsert(
          'INSERT INTO shop_site_commands '
          '(command_id, tenant_id, site_id, actor_id, device_id, aggregate_id, '
          'aggregate_type, capability, expected_version, payload_digest, lease_digest, '
          'command_digest, state, received_at_millis) '
          "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'conflict', ?)",
          variables: [
            Variable<String>(input.commandId),
            Variable<String>(input.tenantId),
            Variable<String>(input.siteId),
            Variable<String>(input.actorId),
            Variable<String>(input.deviceId),
            Variable<String>(input.aggregateId),
            Variable<String>(input.aggregateType),
            Variable<String>(input.capability),
            Variable<int>(input.expectedVersion),
            Variable<String>(input.payloadDigest),
            Variable<String>(input.leaseDigest),
            Variable<String>(input.commandDigest),
            Variable<int>(input.createdAtMillis),
          ],
        );
        await customInsert(
          'INSERT INTO shop_site_conflicts '
          '(conflict_id, command_id, reason_code, detail_digest, state, '
          "created_at_millis) VALUES (?, ?, ?, ?, 'pending', ?)",
          variables: [
            Variable<String>('conflict:${input.commandId}'),
            Variable<String>(input.commandId),
            Variable<String>(conflictReason),
            Variable<String>(conflictDigest),
            Variable<int>(input.createdAtMillis),
          ],
        );
        await customInsert(
          'INSERT INTO shop_site_command_acks '
          '(command_id, status, event_row_id, site_sequence, canonical_version, '
          "ack_digest, created_at_millis) VALUES (?, 'conflict', NULL, NULL, ?, ?, ?)",
          variables: [
            Variable<String>(input.commandId),
            Variable<int>(currentVersion),
            Variable<String>(conflictDigest),
            Variable<int>(input.createdAtMillis),
          ],
        );
        return ShopConnectedSiteCommandResult(
          status: ShopConnectedSiteCommandStatus.conflict,
          commandId: input.commandId,
          ackDigest: conflictDigest,
          canonicalVersion: currentVersion,
          eventSequence: null,
          eventDigest: null,
          conflictCode: conflictReason,
        );
      }

      final nextVersion = currentVersion + 1;
      if (trustedNow != null) {
        await _recordConnectedTrustedTime(
          tenantId: input.tenantId,
          siteId: input.siteId,
          nowMillis: trustedNow,
        );
      }
      await customInsert(
        'INSERT INTO shop_site_commands '
        '(command_id, tenant_id, site_id, actor_id, device_id, aggregate_id, '
        'aggregate_type, capability, expected_version, payload_digest, lease_digest, '
        'command_digest, state, received_at_millis) '
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'accepted', ?)",
        variables: [
          Variable<String>(input.commandId),
          Variable<String>(input.tenantId),
          Variable<String>(input.siteId),
          Variable<String>(input.actorId),
          Variable<String>(input.deviceId),
          Variable<String>(input.aggregateId),
          Variable<String>(input.aggregateType),
          Variable<String>(input.capability),
          Variable<int>(input.expectedVersion),
          Variable<String>(input.payloadDigest),
          Variable<String>(input.leaseDigest),
          Variable<String>(input.commandDigest),
          Variable<int>(input.createdAtMillis),
        ],
      );
      final nextSiteSequenceRow = await customSelect(
        'SELECT COALESCE(MAX(site_sequence), 0) + 1 AS next_sequence '
        'FROM shop_site_events WHERE tenant_id = ? AND site_id = ?',
        variables: [
          Variable<String>(input.tenantId),
          Variable<String>(input.siteId),
        ],
      ).getSingle();
      final siteSequence = nextSiteSequenceRow.read<int>('next_sequence');
      final eventRowId = await customInsert(
        'INSERT INTO shop_site_events '
        '(site_sequence, event_id, command_id, tenant_id, site_id, '
        'aggregate_type, aggregate_id, '
        'aggregate_version, event_type, payload_json, event_digest, '
        'created_at_millis) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        variables: [
          Variable<int>(siteSequence),
          Variable<String>(input.eventId),
          Variable<String>(input.commandId),
          Variable<String>(input.tenantId),
          Variable<String>(input.siteId),
          Variable<String>(input.aggregateType),
          Variable<String>(input.aggregateId),
          Variable<int>(nextVersion),
          Variable<String>(input.eventType),
          Variable<String>(canonicalPayloadJson),
          Variable<String>(input.eventDigest),
          Variable<int>(input.createdAtMillis),
        ],
      );
      await customInsert(
        'INSERT INTO shop_site_aggregate_versions '
        '(tenant_id, site_id, aggregate_type, aggregate_id, version, '
        'last_event_row_id, last_site_sequence, updated_at_millis) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?) '
        'ON CONFLICT(tenant_id, site_id, aggregate_type, aggregate_id) DO UPDATE SET '
        'version = excluded.version, '
        'last_event_row_id = excluded.last_event_row_id, '
        'last_site_sequence = excluded.last_site_sequence, '
        'updated_at_millis = excluded.updated_at_millis',
        variables: [
          Variable<String>(input.tenantId),
          Variable<String>(input.siteId),
          Variable<String>(input.aggregateType),
          Variable<String>(input.aggregateId),
          Variable<int>(nextVersion),
          Variable<int>(eventRowId),
          Variable<int>(siteSequence),
          Variable<int>(input.createdAtMillis),
        ],
      );
      if (stockPayload.reservation != null) {
        await _insertConnectedStockReservation(
          stockPayload.reservation!,
          commandId: input.commandId,
        );
      }
      if (lifecycleTransition != null) {
        await _insertConnectedStockTransition(
          lifecycleTransition,
          operationId: input.commandId,
          saleId: null,
        );
      }
      await customInsert(
        'INSERT INTO shop_site_audit '
        '(audit_id, command_id, actor_id, action, metadata_digest, '
        'created_at_millis) VALUES (?, ?, ?, ?, ?, ?)',
        variables: [
          Variable<String>('audit:${input.commandId}'),
          Variable<String>(input.commandId),
          Variable<String>(input.actorId),
          Variable<String>(input.auditAction),
          Variable<String>(input.auditMetadataDigest),
          Variable<int>(input.createdAtMillis),
        ],
      );
      await customInsert(
        'INSERT INTO shop_site_command_acks '
        '(command_id, status, event_row_id, site_sequence, canonical_version, '
        "ack_digest, created_at_millis) VALUES (?, 'accepted', ?, ?, ?, ?, ?)",
        variables: [
          Variable<String>(input.commandId),
          Variable<int>(eventRowId),
          Variable<int>(siteSequence),
          Variable<int>(nextVersion),
          Variable<String>(input.ackDigest),
          Variable<int>(input.createdAtMillis),
        ],
      );
      return ShopConnectedSiteCommandResult(
        status: ShopConnectedSiteCommandStatus.accepted,
        commandId: input.commandId,
        ackDigest: input.ackDigest,
        canonicalVersion: nextVersion,
        eventSequence: siteSequence,
        eventDigest: input.eventDigest,
        conflictCode: null,
      );
    });
  }

  /// Reconstructs strict wire events from immutable database rows.
  ///
  /// [tenantId] is the local persistence name for the wire `workspaceId`.
  /// Construction of [ConnectedSitePendingEvent] revalidates the complete
  /// canonical event-envelope digest and fails closed on any stored mismatch.
  Future<List<ConnectedSitePendingEvent>> readConnectedSitePendingEvents({
    required String tenantId,
    required String siteId,
    required int afterSequence,
    int limit = 100,
  }) async {
    final id = RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$');
    if (!id.hasMatch(tenantId) ||
        !id.hasMatch(siteId) ||
        afterSequence < 0 ||
        limit < 1 ||
        limit > 500) {
      throw ArgumentError('Connected-site pending-event query is invalid.');
    }
    final rows = await customSelect(
      'SELECT event.site_sequence, event.event_id, event.aggregate_type, '
      'event.aggregate_id, event.aggregate_version, event.event_type, '
      'event.payload_json, event.event_digest, event.created_at_millis, '
      'command.command_id, command.command_digest '
      'FROM shop_site_events event '
      'JOIN shop_site_commands command ON command.command_id = event.command_id '
      'WHERE event.tenant_id = ? AND event.site_id = ? '
      'AND event.site_sequence > ? ORDER BY event.site_sequence LIMIT ?',
      variables: [
        Variable<String>(tenantId),
        Variable<String>(siteId),
        Variable<int>(afterSequence),
        Variable<int>(limit),
      ],
    ).get();
    return rows
        .map((row) {
          final payload = _connectedSiteEventPayload(
            row.read<String>('payload_json'),
          );
          final event = <String, Object?>{
            'eventId': row.read<String>('event_id'),
            'workspaceId': tenantId,
            'siteId': siteId,
            'aggregateType': row.read<String>('aggregate_type'),
            'aggregateId': row.read<String>('aggregate_id'),
            'aggregateVersion': row.read<int>('aggregate_version'),
            'eventType': row.read<String>('event_type'),
            'occurredAt': _connectedSiteOccurredAt(
              row.read<int>('created_at_millis'),
            ),
            'payload': payload,
          };
          return ConnectedSitePendingEvent(
            cursor: row.read<int>('site_sequence'),
            commandId: row.read<String>('command_id'),
            commandDigest: row.read<String>('command_digest'),
            event: event,
            eventDigest: row.read<String>('event_digest'),
          );
        })
        .toList(growable: false);
  }

  Future<void> _insertConnectedStockReservation(
    ConnectedStockReservationV1 reservation, {
    required String commandId,
  }) async {
    await customInsert(
      'INSERT INTO shop_connected_stock_reservation_headers '
      '(reservation_id, command_id, tenant_id, site_id, actor_id, device_id, '
      'capability, workflow_type, subject_id, basket_digest, '
      'initial_reservation_digest, reservation_json, issued_at_millis, '
      'expires_at_millis, legacy_source) '
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)',
      variables: [
        Variable<String>(reservation.reservationId),
        Variable<String>(commandId),
        Variable<String>(reservation.workspaceId),
        Variable<String>(reservation.siteId),
        Variable<String>(reservation.actorId),
        Variable<String>(reservation.deviceId),
        Variable<String>(reservation.capability.name),
        Variable<String>(reservation.workflowType.name),
        Variable<String>(reservation.subjectId),
        Variable<String>(reservation.basketDigest),
        Variable<String>(reservation.reservationDigest),
        Variable<String>(canonicalConnectedSiteJson(reservation.toJson())),
        Variable<int>(
          DateTime.parse(reservation.issuedAt).millisecondsSinceEpoch,
        ),
        Variable<int>(
          DateTime.parse(reservation.expiresAt).millisecondsSinceEpoch,
        ),
      ],
    );
    for (final line in reservation.lines) {
      await customInsert(
        'INSERT INTO shop_connected_stock_reservation_lines '
        '(reservation_id, product_id, quantity) VALUES (?, ?, ?)',
        variables: [
          Variable<String>(reservation.reservationId),
          Variable<String>(line.productId),
          Variable<int>(line.quantity),
        ],
      );
    }
  }

  Future<int> _readConnectedHeldQuantity(
    String productId, {
    String? excludingReservationId,
  }) async {
    final row = await customSelect(
      'SELECT COALESCE(SUM(line.quantity), 0) AS quantity '
      'FROM shop_connected_stock_reservation_lines line '
      'JOIN shop_connected_stock_reservation_headers header '
      'ON header.reservation_id = line.reservation_id '
      'WHERE line.product_id = ? '
      "AND (? = '' OR header.reservation_id != ?) "
      'AND NOT EXISTS (SELECT 1 FROM shop_connected_stock_reservation_transitions transition_row '
      'WHERE transition_row.reservation_id = header.reservation_id)',
      variables: [
        Variable<String>(productId),
        Variable<String>(excludingReservationId ?? ''),
        Variable<String>(excludingReservationId ?? ''),
      ],
    ).getSingle();
    return row.read<int>('quantity');
  }

  Future<int> _readPendingWalletReservedQuantity(
    String productId, {
    String? excludingOperationId,
  }) async {
    final rows = await customSelect(
      'SELECT intent.operation_id, intent.basket_json, '
      'binding.operation_id AS connected_binding_operation_id '
      'FROM shop_wallet_checkout_intents intent '
      'LEFT JOIN shop_connected_tender_reservation_bindings binding '
      "ON binding.operation_id = intent.operation_id AND binding.tender_kind = 'wallet' "
      "WHERE intent.state = 'pending'",
    ).get();
    var quantity = 0;
    for (final row in rows) {
      if (row.read<String>('operation_id') == excludingOperationId) continue;
      if (row.readNullable<String>('connected_binding_operation_id') != null) {
        continue;
      }
      final decoded = jsonDecode(row.read<String>('basket_json'));
      if (decoded is! List) {
        throw StateError('The pending wallet basket is invalid.');
      }
      for (final value in decoded) {
        if (value is Map && value['productId'] == productId) {
          final lineQuantity = value['quantity'];
          if (lineQuantity is! int || lineQuantity < 1) {
            throw StateError('The pending wallet basket is invalid.');
          }
          quantity += lineQuantity;
        }
      }
    }
    return quantity;
  }

  Future<int> _readTotalReservedStockQuantity(
    String productId, {
    String? excludingConnectedReservationId,
    String? excludingPendingCashOperationId,
    String? excludingWalletOperationId,
    bool includeWallet = true,
  }) async {
    final connected = await _readConnectedHeldQuantity(
      productId,
      excludingReservationId: excludingConnectedReservationId,
    );
    final cash = await readPendingCashReservedQuantity(
      productId,
      excludingOperationId: excludingPendingCashOperationId,
    );
    final wallet = includeWallet
        ? await _readPendingWalletReservedQuantity(
            productId,
            excludingOperationId: excludingWalletOperationId,
          )
        : 0;
    final total = connected + cash + wallet;
    if (total > 2000000000) {
      throw StateError('Reserved stock exceeds the supported range.');
    }
    return total;
  }

  /// Shared stock-availability oracle for transaction-scoped sale workflows.
  ///
  /// Callers completing an existing hold must exclude only that exact hold.
  /// The query includes connected reservations, pending cash checkouts, and
  /// pending wallet checkouts in the caller's current SQLite transaction.
  Future<int> readReservedStockQuantity(
    String productId, {
    String? excludingConnectedReservationId,
    String? excludingPendingCashOperationId,
    String? excludingWalletOperationId,
  }) => _readTotalReservedStockQuantity(
    productId,
    excludingConnectedReservationId: excludingConnectedReservationId,
    excludingPendingCashOperationId: excludingPendingCashOperationId,
    excludingWalletOperationId: excludingWalletOperationId,
  );

  Map<String, Object> _connectedTenderBindingPayload({
    required String operationId,
    required String tenderKind,
    required ConnectedStockReservationV1 reservation,
  }) => {
    'contract': 'supermega.shop.connected-tender-reservation.v1',
    'operationId': operationId,
    'tenderKind': tenderKind,
    'reservationId': reservation.reservationId,
    'reservationDigest': reservation.reservationDigest,
    'workspaceId': reservation.workspaceId,
    'siteId': reservation.siteId,
    'workflowType': reservation.workflowType.name,
    'subjectId': reservation.subjectId,
    'basketDigest': reservation.basketDigest,
  };

  Future<void> _insertConnectedTenderReservationBinding({
    required String operationId,
    required String tenderKind,
    required ConnectedStockReservationV1 reservation,
    required int createdAtMillis,
  }) async {
    final payload = _connectedTenderBindingPayload(
      operationId: operationId,
      tenderKind: tenderKind,
      reservation: reservation,
    );
    await customInsert(
      'INSERT OR IGNORE INTO shop_connected_tender_reservation_bindings '
      '(operation_id, tender_kind, reservation_id, reservation_digest, '
      'tenant_id, site_id, workflow_type, subject_id, basket_digest, '
      'binding_digest, created_at_millis) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      variables: [
        Variable<String>(operationId),
        Variable<String>(tenderKind),
        Variable<String>(reservation.reservationId),
        Variable<String>(reservation.reservationDigest),
        Variable<String>(reservation.workspaceId),
        Variable<String>(reservation.siteId),
        Variable<String>(reservation.workflowType.name),
        Variable<String>(reservation.subjectId),
        Variable<String>(reservation.basketDigest),
        Variable<String>(connectedSiteSha256(payload)),
        Variable<int>(createdAtMillis),
      ],
    );
    await _requireConnectedTenderReservationBinding(
      operationId: operationId,
      tenderKind: tenderKind,
      reservation: reservation,
    );
  }

  Future<void> _requireConnectedTenderReservationBinding({
    required String operationId,
    required String tenderKind,
    required ConnectedStockReservationV1? reservation,
  }) async {
    final row = await customSelect(
      'SELECT reservation_id, reservation_digest, tenant_id, site_id, '
      'workflow_type, subject_id, basket_digest, binding_digest '
      'FROM shop_connected_tender_reservation_bindings WHERE operation_id = ? '
      'AND tender_kind = ?',
      variables: [Variable<String>(operationId), Variable<String>(tenderKind)],
    ).getSingleOrNull();
    if (row == null && reservation == null) return;
    if (row == null || reservation == null) {
      throw StateError(
        'The pending tender connected reservation binding changed.',
      );
    }
    final payload = _connectedTenderBindingPayload(
      operationId: operationId,
      tenderKind: tenderKind,
      reservation: reservation,
    );
    if (row.read<String>('reservation_id') != reservation.reservationId ||
        row.read<String>('reservation_digest') !=
            reservation.reservationDigest ||
        row.read<String>('tenant_id') != reservation.workspaceId ||
        row.read<String>('site_id') != reservation.siteId ||
        row.read<String>('workflow_type') != reservation.workflowType.name ||
        row.read<String>('subject_id') != reservation.subjectId ||
        row.read<String>('basket_digest') != reservation.basketDigest ||
        row.read<String>('binding_digest') != connectedSiteSha256(payload)) {
      throw StateError(
        'The pending tender connected reservation binding changed.',
      );
    }
  }

  /// Verifies that an already-persisted cash or wallet intent adopted exactly
  /// the reservation supplied by its owning sale transaction.
  Future<void> requireConnectedTenderReservationBindingForSale({
    required String operationId,
    required String tenderKind,
    required ConnectedStockReservationV1? reservation,
  }) => _requireConnectedTenderReservationBinding(
    operationId: operationId,
    tenderKind: tenderKind,
    reservation: reservation,
  );

  /// Verifies an idempotent completed-sale replay without reading fresh time.
  ///
  /// A committed transition is immutable proof of the reservation and sale
  /// command bytes that were accepted by the original transaction.
  Future<void> requireConnectedStockReservationSaleReplay({
    required String saleId,
    required String saleCommandId,
    required String saleRequestFingerprint,
    required ConnectedStockReservationV1? reservation,
  }) async {
    final rows = await customSelect(
      'SELECT transition_json FROM '
      'shop_connected_stock_reservation_transitions '
      "WHERE to_state = 'committed' AND sale_id = ?",
      variables: [Variable<String>(saleId)],
    ).get();
    if (reservation == null) {
      if (rows.isNotEmpty) {
        throw StateError(
          'The completed sale requires its connected reservation.',
        );
      }
      return;
    }
    if (rows.length != 1 ||
        rows.single.readNullable<String>('transition_json') == null) {
      throw StateError('The connected reservation is not bound to this sale.');
    }
    final transition = ConnectedStockReservationTransitionV1.fromJson(
      jsonDecode(rows.single.read<String>('transition_json')),
    );
    final saleCommandDigest = connectedSiteSha256({
      'operationId': saleCommandId,
      'requestFingerprint': saleRequestFingerprint,
    });
    if (canonicalConnectedSiteJson(transition.before.toJson()) !=
            canonicalConnectedSiteJson(reservation.toJson()) ||
        transition.saleBinding?.saleId != saleId ||
        transition.saleBinding?.saleCommandId != saleCommandId ||
        transition.saleBinding?.saleCommandDigest != saleCommandDigest) {
      throw StateError('The connected reservation is not bound to this sale.');
    }
  }

  Future<int> _validatedConnectedSiteNow(
    ShopConnectedSiteCoordinatorTimeAuthority authority, {
    required String tenantId,
    required String siteId,
  }) async {
    final now = await authority.readValidatedNowMillis(
      tenantId: tenantId,
      siteId: siteId,
    );
    if (now <= 0) {
      throw StateError('Connected-site trusted time is invalid.');
    }
    return now;
  }

  Future<void> _recordConnectedTrustedTime({
    required String tenantId,
    required String siteId,
    required int nowMillis,
  }) async {
    await _requireConnectedTrustedTimeNotRegressed(
      tenantId: tenantId,
      siteId: siteId,
      nowMillis: nowMillis,
    );
    await customInsert(
      'INSERT INTO shop_connected_trusted_time '
      '(tenant_id, site_id, observed_at_millis) VALUES (?, ?, ?) '
      'ON CONFLICT(tenant_id, site_id) DO UPDATE SET '
      'observed_at_millis = excluded.observed_at_millis',
      variables: [
        Variable<String>(tenantId),
        Variable<String>(siteId),
        Variable<int>(nowMillis),
      ],
    );
  }

  Future<void> _requireConnectedTrustedTimeNotRegressed({
    required String tenantId,
    required String siteId,
    required int nowMillis,
  }) async {
    final prior = await customSelect(
      'SELECT observed_at_millis FROM shop_connected_trusted_time '
      'WHERE tenant_id = ? AND site_id = ?',
      variables: [Variable<String>(tenantId), Variable<String>(siteId)],
    ).getSingleOrNull();
    if (prior != null && prior.read<int>('observed_at_millis') > nowMillis) {
      throw StateError('Connected-site trusted time regressed.');
    }
  }

  /// Validates an exact connected hold for adoption by an outer sale
  /// transaction and persists the coordinator's nondecreasing trusted time.
  ///
  /// A café or other owner must call this inside the same [transaction] that
  /// writes its sale, stock movements, outbox event, receipt, and terminal
  /// reservation transition.
  Future<int> validateConnectedStockReservationForSale({
    required ConnectedStockReservationV1 reservation,
    required String operationId,
    required ConnectedStockWorkflowType workflowType,
    required ShopStaffCapability capability,
    required String subjectId,
    required Map<String, int> productQuantities,
    required ShopConnectedSiteCoordinatorTimeAuthority timeAuthority,
  }) async {
    final binding = await customSelect(
      'SELECT tenant_id, site_id FROM shop_connected_scope_binding '
      'WHERE singleton = 1',
    ).getSingleOrNull();
    if (binding == null ||
        binding.read<String>('tenant_id') != reservation.workspaceId ||
        binding.read<String>('site_id') != reservation.siteId) {
      throw StateError('Connected stock scope does not match this database.');
    }
    final nowMillis = await _validatedConnectedSiteNow(
      timeAuthority,
      tenantId: reservation.workspaceId,
      siteId: reservation.siteId,
    );
    await _recordConnectedTrustedTime(
      tenantId: reservation.workspaceId,
      siteId: reservation.siteId,
      nowMillis: nowMillis,
    );
    await _requireAdoptableConnectedStockReservation(
      reservation,
      operationId: operationId,
      workflowType: workflowType,
      capability: capability,
      subjectId: subjectId,
      productQuantities: productQuantities,
      nowMillis: nowMillis,
    );
    return nowMillis;
  }

  /// Commits a previously validated connected hold inside the owner's outer
  /// sale transaction. The referenced sale must already exist in that same
  /// transaction, so rollback removes the sale and transition together.
  Future<ConnectedStockReservationTransitionV1>
  commitConnectedStockReservationForSale({
    required ConnectedStockReservationV1 reservation,
    required String saleId,
    required String saleCommandId,
    required String saleCommandDigest,
    required ConnectedStockWorkflowType workflowType,
    required ShopStaffCapability capability,
    required String subjectId,
    required Map<String, int> productQuantities,
    required int validatedNowMillis,
  }) async {
    final trustedTime = await customSelect(
      'SELECT observed_at_millis FROM shop_connected_trusted_time '
      'WHERE tenant_id = ? AND site_id = ?',
      variables: [
        Variable<String>(reservation.workspaceId),
        Variable<String>(reservation.siteId),
      ],
    ).getSingleOrNull();
    if (trustedTime == null ||
        trustedTime.read<int>('observed_at_millis') != validatedNowMillis) {
      throw StateError(
        'The connected reservation trusted-time validation is unavailable.',
      );
    }
    await _requireAdoptableConnectedStockReservation(
      reservation,
      operationId: saleCommandId,
      workflowType: workflowType,
      capability: capability,
      subjectId: subjectId,
      productQuantities: productQuantities,
      nowMillis: validatedNowMillis,
    );
    final sale = await customSelect(
      'SELECT 1 FROM shop_sales WHERE id = ? AND operation_id = ?',
      variables: [Variable<String>(saleId), Variable<String>(saleCommandId)],
    ).getSingleOrNull();
    if (sale == null) {
      throw StateError(
        'The connected reservation sale is not in this transaction.',
      );
    }
    final committedAt = DateTime.fromMillisecondsSinceEpoch(
      validatedNowMillis,
      isUtc: true,
    ).toIso8601String();
    final binding = ConnectedStockSaleBindingV1.create(
      reservation: reservation,
      saleId: saleId,
      saleCommandId: saleCommandId,
      saleCommandDigest: saleCommandDigest,
      committedAt: committedAt,
    );
    final transition = transitionConnectedStockReservation(
      reservation: reservation,
      expectedReservationDigest: reservation.reservationDigest,
      targetState: ConnectedStockReservationState.committed,
      transitionedAt: committedAt,
      reason: 'sale_committed',
      saleBinding: binding,
    );
    await _insertConnectedStockTransition(
      transition,
      operationId:
          'commit:${connectedSiteSha256({'saleCommandId': saleCommandId})}',
      saleId: saleId,
    );
    await _appendConnectedStockTerminalSiteEvent(
      transition,
      operationId: saleCommandId,
    );
    return transition;
  }

  Future<ShopConnectedStockReservationResult> expireConnectedStockReservation({
    required String tenantId,
    required String siteId,
    required String reservationId,
    required String expectedReservationDigest,
    required String operationId,
    required ShopConnectedSiteCoordinatorTimeAuthority timeAuthority,
    bool connectedSiteEnabled = false,
  }) {
    if (!connectedSiteEnabled) {
      throw StateError('Connected-site reservation expiry is disabled.');
    }
    return _transitionConnectedStockReservation(
      tenantId: tenantId,
      siteId: siteId,
      reservationId: reservationId,
      expectedReservationDigest: expectedReservationDigest,
      operationId: operationId,
      reason: 'trusted_time_expiry',
      targetState: ConnectedStockReservationState.expired,
      timeAuthority: timeAuthority,
    );
  }

  Future<ShopConnectedStockReservationResult>
  _transitionConnectedStockReservation({
    required String tenantId,
    required String siteId,
    required String reservationId,
    required String expectedReservationDigest,
    required String operationId,
    required String reason,
    required ConnectedStockReservationState targetState,
    required ShopConnectedSiteCoordinatorTimeAuthority timeAuthority,
  }) async {
    return transaction(() async {
      final replay = await customSelect(
        'SELECT reservation_id, to_state, before_digest, transition_json, '
        'transition_digest FROM '
        'shop_connected_stock_reservation_transitions WHERE operation_id = ?',
        variables: [Variable<String>(operationId)],
      ).getSingleOrNull();
      if (replay != null) {
        final json = replay.readNullable<String>('transition_json');
        if (json == null) {
          final expectedDigest = connectedSiteSha256({
            'contract': 'supermega.shop.legacy-stock-transition.v1',
            'tenantId': tenantId,
            'siteId': siteId,
            'reservationId': reservationId,
            'expectedReservationDigest': expectedReservationDigest,
            'targetState': targetState.name,
            'reason': reason,
            'operationId': operationId,
          });
          if (replay.read<String>('reservation_id') != reservationId ||
              replay.read<String>('before_digest') !=
                  expectedReservationDigest ||
              replay.read<String>('to_state') != targetState.name ||
              replay.read<String>('transition_digest') != expectedDigest) {
            throw StateError(
              'A reservation operation ID was reused differently.',
            );
          }
          return ShopConnectedStockReservationResult(
            disposition: ShopConnectedStockReservationDisposition.replayed,
            canonicalVersion: 2,
            eventDigest: expectedDigest,
            ackDigest: expectedDigest,
          );
        }
        final transition = ConnectedStockReservationTransitionV1.fromJson(
          jsonDecode(json),
        );
        if (transition.before.reservationId != reservationId ||
            transition.before.workspaceId != tenantId ||
            transition.before.siteId != siteId ||
            transition.before.reservationDigest != expectedReservationDigest ||
            transition.after.state != targetState ||
            transition.reason != reason) {
          throw StateError(
            'A reservation operation ID was reused differently.',
          );
        }
        return ShopConnectedStockReservationResult(
          disposition: ShopConnectedStockReservationDisposition.replayed,
          canonicalVersion: transition.after.stateVersion,
          eventDigest: transition.transitionDigest,
          ackDigest: transition.transitionDigest,
          transition: transition,
        );
      }
      final now = await _validatedConnectedSiteNow(
        timeAuthority,
        tenantId: tenantId,
        siteId: siteId,
      );
      final binding = await customSelect(
        'SELECT tenant_id, site_id FROM shop_connected_scope_binding '
        'WHERE singleton = 1',
      ).getSingleOrNull();
      if (binding == null ||
          binding.read<String>('tenant_id') != tenantId ||
          binding.read<String>('site_id') != siteId) {
        throw StateError('Connected stock scope does not match this database.');
      }
      await _recordConnectedTrustedTime(
        tenantId: tenantId,
        siteId: siteId,
        nowMillis: now,
      );
      final header = await customSelect(
        'SELECT reservation_json, legacy_source, initial_reservation_digest, '
        'issued_at_millis, expires_at_millis FROM '
        'shop_connected_stock_reservation_headers '
        'WHERE reservation_id = ? AND tenant_id = ? AND site_id = ?',
        variables: [
          Variable<String>(reservationId),
          Variable<String>(tenantId),
          Variable<String>(siteId),
        ],
      ).getSingleOrNull();
      if (header == null) {
        return ShopConnectedStockReservationResult(
          disposition: ShopConnectedStockReservationDisposition.conflict,
          canonicalVersion: 0,
          eventDigest: null,
          ackDigest: expectedReservationDigest,
          conflictCode: 'reservation_not_found',
        );
      }
      if (header.read<int>('legacy_source') == 1) {
        if (targetState != ConnectedStockReservationState.expired) {
          return ShopConnectedStockReservationResult(
            disposition: ShopConnectedStockReservationDisposition.conflict,
            canonicalVersion: 1,
            eventDigest: null,
            ackDigest: expectedReservationDigest,
            conflictCode: 'reservation_legacy_unadoptable',
          );
        }
        final storedDigest = header.read<String>('initial_reservation_digest');
        if (storedDigest != expectedReservationDigest) {
          return ShopConnectedStockReservationResult(
            disposition: ShopConnectedStockReservationDisposition.conflict,
            canonicalVersion: 1,
            eventDigest: storedDigest,
            ackDigest: storedDigest,
            conflictCode: 'reservation_digest_mismatch',
          );
        }
        final terminal = await customSelect(
          'SELECT after_digest FROM '
          'shop_connected_stock_reservation_transitions '
          'WHERE reservation_id = ? LIMIT 1',
          variables: [Variable<String>(reservationId)],
        ).getSingleOrNull();
        if (terminal != null) {
          return ShopConnectedStockReservationResult(
            disposition: ShopConnectedStockReservationDisposition.conflict,
            canonicalVersion: 2,
            eventDigest: terminal.read<String>('after_digest'),
            ackDigest: terminal.read<String>('after_digest'),
            conflictCode: 'reservation_terminal',
          );
        }
        if (now < header.read<int>('expires_at_millis')) {
          return ShopConnectedStockReservationResult(
            disposition: ShopConnectedStockReservationDisposition.conflict,
            canonicalVersion: 1,
            eventDigest: null,
            ackDigest: storedDigest,
            conflictCode: 'reservation_not_expired',
          );
        }
        final afterDigest = connectedSiteSha256({
          'contract': 'supermega.shop.legacy-stock-after.v1',
          'reservationId': reservationId,
          'beforeDigest': storedDigest,
          'targetState': targetState.name,
          'occurredAtMillis': now,
        });
        final transitionDigest = connectedSiteSha256({
          'contract': 'supermega.shop.legacy-stock-transition.v1',
          'tenantId': tenantId,
          'siteId': siteId,
          'reservationId': reservationId,
          'expectedReservationDigest': storedDigest,
          'targetState': targetState.name,
          'reason': reason,
          'operationId': operationId,
        });
        await customInsert(
          'INSERT INTO shop_connected_stock_reservation_transitions '
          '(transition_id, operation_id, reservation_id, from_state, to_state, '
          'before_digest, after_digest, transition_digest, transition_json, '
          'sale_id, occurred_at_millis, legacy_source) '
          "VALUES (?, ?, ?, 'held', 'expired', ?, ?, ?, NULL, NULL, ?, 1)",
          variables: [
            Variable<String>(
              'transition:${connectedSiteSha256({'operationId': operationId})}',
            ),
            Variable<String>(operationId),
            Variable<String>(reservationId),
            Variable<String>(storedDigest),
            Variable<String>(afterDigest),
            Variable<String>(transitionDigest),
            Variable<int>(now),
          ],
        );
        return ShopConnectedStockReservationResult(
          disposition: ShopConnectedStockReservationDisposition.accepted,
          canonicalVersion: 2,
          eventDigest: transitionDigest,
          ackDigest: transitionDigest,
        );
      }
      final priorTransition = await customSelect(
        'SELECT to_state, after_digest FROM '
        'shop_connected_stock_reservation_transitions WHERE reservation_id = ?',
        variables: [Variable<String>(reservationId)],
      ).getSingleOrNull();
      if (priorTransition != null) {
        return ShopConnectedStockReservationResult(
          disposition: ShopConnectedStockReservationDisposition.conflict,
          canonicalVersion: 2,
          eventDigest: priorTransition.read<String>('after_digest'),
          ackDigest: priorTransition.read<String>('after_digest'),
          conflictCode: 'reservation_terminal',
        );
      }
      final reservation = ConnectedStockReservationV1.fromJson(
        jsonDecode(header.read<String>('reservation_json')),
      );
      if (reservation.reservationDigest != expectedReservationDigest) {
        return ShopConnectedStockReservationResult(
          disposition: ShopConnectedStockReservationDisposition.conflict,
          canonicalVersion: reservation.stateVersion,
          eventDigest: reservation.reservationDigest,
          ackDigest: reservation.reservationDigest,
          conflictCode: 'reservation_digest_mismatch',
        );
      }
      final at = DateTime.fromMillisecondsSinceEpoch(
        now,
        isUtc: true,
      ).toIso8601String();
      final transition = transitionConnectedStockReservation(
        reservation: reservation,
        expectedReservationDigest: expectedReservationDigest,
        targetState: targetState,
        transitionedAt: at,
        reason: reason,
      );
      await _insertConnectedStockTransition(
        transition,
        operationId: operationId,
        saleId: null,
      );
      if (targetState == ConnectedStockReservationState.expired) {
        await _appendConnectedStockTerminalSiteEvent(
          transition,
          operationId: operationId,
        );
      }
      return ShopConnectedStockReservationResult(
        disposition: ShopConnectedStockReservationDisposition.accepted,
        canonicalVersion: transition.after.stateVersion,
        eventDigest: transition.transitionDigest,
        ackDigest: transition.transitionDigest,
        transition: transition,
      );
    });
  }

  Future<void> _insertConnectedStockTransition(
    ConnectedStockReservationTransitionV1 transition, {
    required String operationId,
    required String? saleId,
  }) async {
    await customInsert(
      'INSERT INTO shop_connected_stock_reservation_transitions '
      '(transition_id, operation_id, reservation_id, from_state, to_state, '
      'before_digest, after_digest, transition_digest, transition_json, sale_id, '
      'occurred_at_millis, legacy_source) '
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULLIF(?, ''), ?, 0)",
      variables: [
        Variable<String>(
          'transition:${connectedSiteSha256({'operationId': operationId})}',
        ),
        Variable<String>(operationId),
        Variable<String>(transition.before.reservationId),
        Variable<String>(transition.before.state.name),
        Variable<String>(transition.after.state.name),
        Variable<String>(transition.before.reservationDigest),
        Variable<String>(transition.after.reservationDigest),
        Variable<String>(transition.transitionDigest),
        Variable<String>(canonicalConnectedSiteJson(transition.toJson())),
        Variable<String>(saleId ?? ''),
        Variable<int>(
          DateTime.parse(transition.transitionedAt).millisecondsSinceEpoch,
        ),
      ],
    );
  }

  /// Appends a coordinator-derived terminal reservation event atomically with
  /// the sale or expiry transaction. The synthetic command retains the
  /// authenticated authority of the original hold; it never invents a new
  /// actor, lease, device, or client signature.
  Future<void> _appendConnectedStockTerminalSiteEvent(
    ConnectedStockReservationTransitionV1 transition, {
    required String operationId,
  }) async {
    final state = transition.after.state;
    if (state != ConnectedStockReservationState.committed &&
        state != ConnectedStockReservationState.expired) {
      throw StateError('Only terminal stock events can be appended here.');
    }
    final source = await customSelect(
      'SELECT header.tenant_id, header.site_id, header.actor_id, '
      'header.device_id, header.capability, header.workflow_type, '
      'header.subject_id, command.lease_digest, command.received_at_millis '
      'FROM shop_connected_stock_reservation_headers header '
      'JOIN shop_site_commands command ON command.command_id = header.command_id '
      'WHERE header.reservation_id = ? AND header.legacy_source = 0',
      variables: [Variable<String>(transition.before.reservationId)],
    ).getSingleOrNull();
    if (source == null) {
      throw StateError('Connected reservation event authority is unavailable.');
    }
    final tenantId = source.read<String>('tenant_id');
    final siteId = source.read<String>('site_id');
    final aggregateType = source.read<String>('workflow_type');
    final aggregateId = source.read<String>('subject_id');
    final occurredAtMillis = DateTime.parse(transition.transitionedAt)
        .millisecondsSinceEpoch;
    final eventType = state == ConnectedStockReservationState.committed
        ? shopConnectedStockCommittedEventType
        : shopConnectedStockExpiredEventType;
    final payload = <String, Object?>{
      'contract': 'supermega.shop.connected-stock-terminal.v1',
      'operationId': operationId,
      'reservationId': transition.before.reservationId,
      'beforeDigest': transition.before.reservationDigest,
      'afterDigest': transition.after.reservationDigest,
      'state': state.name,
      'transitionDigest': transition.transitionDigest,
      'transition': transition.toJson(),
    };
    final payloadJson = canonicalConnectedSiteJson(payload);
    final payloadDigest = connectedSiteSha256(payload);
    final identityDigest = connectedSiteSha256({
      'reservationId': transition.before.reservationId,
      'transitionDigest': transition.transitionDigest,
      'state': state.name,
    });
    final commandId = 'terminal:$identityDigest';
    final eventId = 'terminal-event:$identityDigest';
    final existing = await customSelect(
      'SELECT event.event_digest, event.payload_json, event.event_type, '
      'event.aggregate_version '
      'FROM shop_site_commands command JOIN shop_site_events event '
      'ON event.command_id = command.command_id WHERE command.command_id = ?',
      variables: [Variable<String>(commandId)],
    ).getSingleOrNull();
    final versionRow = await customSelect(
      'SELECT version FROM shop_site_aggregate_versions WHERE tenant_id = ? '
      'AND site_id = ? AND aggregate_type = ? AND aggregate_id = ?',
      variables: [
        Variable<String>(tenantId),
        Variable<String>(siteId),
        Variable<String>(aggregateType),
        Variable<String>(aggregateId),
      ],
    ).getSingleOrNull();
    if (versionRow == null) {
      throw StateError('Connected reservation aggregate is unavailable.');
    }
    final nextVersion = existing == null
        ? versionRow.read<int>('version') + 1
        : existing.read<int>('aggregate_version');
    final eventEnvelope = <String, Object?>{
      'eventId': eventId,
      'workspaceId': tenantId,
      'siteId': siteId,
      'aggregateType': aggregateType,
      'aggregateId': aggregateId,
      'aggregateVersion': nextVersion,
      'eventType': eventType,
      'occurredAt': _connectedSiteOccurredAt(occurredAtMillis),
      'payload': payload,
    };
    final eventDigest = connectedSiteSha256(eventEnvelope);
    if (existing != null) {
      if (existing.read<String>('event_digest') != eventDigest ||
          existing.read<String>('payload_json') != payloadJson ||
          existing.read<String>('event_type') != eventType) {
        throw StateError('Connected terminal event identity changed.');
      }
      return;
    }
    final commandDigest = connectedSiteSha256({
      'contract': 'supermega.shop.connected-stock-terminal-command.v1',
      'commandId': commandId,
      'workspaceId': tenantId,
      'siteId': siteId,
      'actorId': source.read<String>('actor_id'),
      'deviceId': source.read<String>('device_id'),
      'aggregateType': aggregateType,
      'aggregateId': aggregateId,
      'expectedVersion': nextVersion - 1,
      'payloadDigest': payloadDigest,
      'leaseDigest': source.read<String>('lease_digest'),
    });
    await customInsert(
      'INSERT INTO shop_site_commands '
      '(command_id, tenant_id, site_id, actor_id, device_id, aggregate_id, '
      'aggregate_type, capability, expected_version, payload_digest, '
      'lease_digest, command_digest, state, received_at_millis) '
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'accepted', ?)",
      variables: [
        Variable<String>(commandId),
        Variable<String>(tenantId),
        Variable<String>(siteId),
        Variable<String>(source.read<String>('actor_id')),
        Variable<String>(source.read<String>('device_id')),
        Variable<String>(aggregateId),
        Variable<String>(aggregateType),
        Variable<String>(source.read<String>('capability')),
        Variable<int>(nextVersion - 1),
        Variable<String>(payloadDigest),
        Variable<String>(source.read<String>('lease_digest')),
        Variable<String>(commandDigest),
        Variable<int>(source.read<int>('received_at_millis')),
      ],
    );
    final sequenceRow = await customSelect(
      'SELECT COALESCE(MAX(site_sequence), 0) + 1 AS next_sequence '
      'FROM shop_site_events WHERE tenant_id = ? AND site_id = ?',
      variables: [Variable<String>(tenantId), Variable<String>(siteId)],
    ).getSingle();
    final siteSequence = sequenceRow.read<int>('next_sequence');
    final eventRowId = await customInsert(
      'INSERT INTO shop_site_events '
      '(site_sequence, event_id, command_id, tenant_id, site_id, '
      'aggregate_type, aggregate_id, aggregate_version, event_type, '
      'payload_json, event_digest, created_at_millis) '
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      variables: [
        Variable<int>(siteSequence),
        Variable<String>(eventId),
        Variable<String>(commandId),
        Variable<String>(tenantId),
        Variable<String>(siteId),
        Variable<String>(aggregateType),
        Variable<String>(aggregateId),
        Variable<int>(nextVersion),
        Variable<String>(eventType),
        Variable<String>(payloadJson),
        Variable<String>(eventDigest),
        Variable<int>(occurredAtMillis),
      ],
    );
    final updatedAggregate = await customUpdate(
      'UPDATE shop_site_aggregate_versions SET version = ?, '
      'last_event_row_id = ?, last_site_sequence = ?, updated_at_millis = ? '
      'WHERE tenant_id = ? AND site_id = ? AND aggregate_type = ? '
      'AND aggregate_id = ? AND version = ?',
      variables: [
        Variable<int>(nextVersion),
        Variable<int>(eventRowId),
        Variable<int>(siteSequence),
        Variable<int>(occurredAtMillis),
        Variable<String>(tenantId),
        Variable<String>(siteId),
        Variable<String>(aggregateType),
        Variable<String>(aggregateId),
        Variable<int>(nextVersion - 1),
      ],
    );
    if (updatedAggregate != 1) {
      throw StateError('Connected reservation aggregate changed.');
    }
    await customInsert(
      'INSERT INTO shop_site_audit '
      '(audit_id, command_id, actor_id, action, metadata_digest, '
      'created_at_millis) VALUES (?, ?, ?, ?, ?, ?)',
      variables: [
        Variable<String>('audit:$commandId'),
        Variable<String>(commandId),
        Variable<String>(source.read<String>('actor_id')),
        Variable<String>('connected_stock_${state.name}'),
        Variable<String>(transition.transitionDigest),
        Variable<int>(occurredAtMillis),
      ],
    );
    await customInsert(
      'INSERT INTO shop_site_command_acks '
      '(command_id, status, event_row_id, site_sequence, canonical_version, '
      "ack_digest, created_at_millis) VALUES (?, 'accepted', ?, ?, ?, ?, ?)",
      variables: [
        Variable<String>(commandId),
        Variable<int>(eventRowId),
        Variable<int>(siteSequence),
        Variable<int>(nextVersion),
        Variable<String>(eventDigest),
        Variable<int>(occurredAtMillis),
      ],
    );
  }

  Future<void> _requireAdoptableConnectedStockReservation(
    ConnectedStockReservationV1 reservation, {
    required String operationId,
    required ConnectedStockWorkflowType workflowType,
    required ShopStaffCapability capability,
    required String subjectId,
    required Map<String, int> productQuantities,
    required int nowMillis,
  }) async {
    if (reservation.state != ConnectedStockReservationState.held ||
        reservation.workflowType != workflowType ||
        reservation.capability != capability ||
        reservation.subjectId != subjectId ||
        DateTime.parse(reservation.expiresAt).millisecondsSinceEpoch <=
            nowMillis ||
        reservation.lines.length != productQuantities.length ||
        reservation.lines.any(
          (line) => productQuantities[line.productId] != line.quantity,
        )) {
      throw StateError('The connected reservation does not match this sale.');
    }
    final header = await customSelect(
      'SELECT tenant_id, site_id, workflow_type, subject_id, capability, basket_digest, '
      'initial_reservation_digest, reservation_json, legacy_source '
      'FROM shop_connected_stock_reservation_headers WHERE reservation_id = ?',
      variables: [Variable<String>(reservation.reservationId)],
    ).getSingleOrNull();
    if (header == null) {
      throw StateError('The connected reservation was not found.');
    }
    if (header.read<int>('legacy_source') == 1 ||
        header.read<String>('tenant_id') != reservation.workspaceId ||
        header.read<String>('site_id') != reservation.siteId ||
        header.read<String>('workflow_type') != workflowType.name ||
        header.read<String>('subject_id') != reservation.subjectId ||
        header.read<String>('capability') != capability.name ||
        header.read<String>('basket_digest') != reservation.basketDigest ||
        header.read<String>('initial_reservation_digest') !=
            reservation.reservationDigest ||
        canonicalConnectedSiteJson(
              jsonDecode(header.read<String>('reservation_json')),
            ) !=
            canonicalConnectedSiteJson(reservation.toJson())) {
      throw StateError('The connected reservation scope or bytes changed.');
    }
    final terminal = await customSelect(
      'SELECT 1 FROM shop_connected_stock_reservation_transitions '
      'WHERE reservation_id = ? LIMIT 1',
      variables: [Variable<String>(reservation.reservationId)],
    ).getSingleOrNull();
    if (terminal != null) {
      throw StateError('The connected reservation is already terminal.');
    }
    // The sale operation is independently bound in the immutable sale binding;
    // subject identity must match before any stock or money row is written.
    if (operationId.isEmpty) {
      throw StateError('The connected sale operation is invalid.');
    }
  }

  Map<String, Object?> _connectedSiteEventPayload(String payloadJson) {
    final Object? decoded;
    try {
      decoded = jsonDecode(payloadJson);
    } on FormatException {
      throw ArgumentError('Connected-site event JSON is invalid.');
    }
    if (decoded is! Map) {
      throw ArgumentError('Connected-site event payload must be an object.');
    }
    final payload = decoded.cast<String, Object?>();
    // The shared canonicalizer rejects non-JSON values, floating point values,
    // and malformed map keys before the payload can reach durable storage.
    canonicalConnectedSiteJson(payload);
    return payload;
  }

  ({
    ConnectedStockReservationV1? reservation,
    ShopConnectedStockReservationLifecycleInput? lifecycle,
  })
  _connectedStockCommandPayload(
    ShopConnectedSiteCommandInput input,
    Map<String, Object?> payload,
  ) {
    final reservationSidecar = input.stockReservation;
    final lifecycleSidecar = input.stockReservationLifecycle;
    if (reservationSidecar == null && lifecycleSidecar == null) {
      if (input.eventType == shopConnectedStockReservedEventType ||
          input.eventType == shopConnectedStockReleasedEventType ||
          payload['contract'] == _shopConnectedStockReservePayloadContract ||
          payload['contract'] == _shopConnectedStockReleasePayloadContract) {
        throw ArgumentError(
          'Connected stock events require their exact persistence sidecar.',
        );
      }
      return (reservation: null, lifecycle: null);
    }
    if (reservationSidecar != null) {
      if (input.eventType != shopConnectedStockReservedEventType ||
          payload['contract'] != _shopConnectedStockReservePayloadContract ||
          payload['reservation'] == null) {
        throw ArgumentError('Connected stock reserve event is invalid.');
      }
      final reservation = ConnectedStockReservationV1.fromJson(
        payload['reservation'],
      );
      final expected = <String, Object?>{
        'contract': _shopConnectedStockReservePayloadContract,
        'reservation': reservation.toJson(),
      };
      if (canonicalConnectedSiteJson(payload) !=
              canonicalConnectedSiteJson(expected) ||
          canonicalConnectedSiteJson(reservation.toJson()) !=
              canonicalConnectedSiteJson(reservationSidecar.toJson()) ||
          input.payloadDigest != connectedSiteSha256(expected)) {
        throw StateError(
          'Connected stock reserve payload bytes are not authorized.',
        );
      }
      return (reservation: reservation, lifecycle: null);
    }
    final lifecycle = lifecycleSidecar!;
    final expected = <String, Object?>{
      'contract': _shopConnectedStockReleasePayloadContract,
      'reservationId': lifecycle.reservationId,
      'expectedReservationDigest': lifecycle.expectedReservationDigest,
      'targetState': lifecycle.targetState.name,
      'reason': lifecycle.reason,
    };
    if (input.eventType != shopConnectedStockReleasedEventType ||
        canonicalConnectedSiteJson(payload) !=
            canonicalConnectedSiteJson(expected) ||
        input.payloadDigest != connectedSiteSha256(expected)) {
      throw StateError(
        'Connected stock release payload bytes are not authorized.',
      );
    }
    return (reservation: null, lifecycle: lifecycle);
  }

  /// Immutably binds this local inventory to an authenticated enrollment
  /// scope before any connected stock command is accepted.
  ///
  /// The caller must supply the digest of its independently verified
  /// enrollment evidence. Commands can never create this authority binding.
  Future<void> bindConnectedStockScopeForEnrollment({
    required String tenantId,
    required String siteId,
    required String enrollmentEvidenceDigest,
    required int boundAtMillis,
    bool connectedSiteEnabled = false,
  }) => transaction(() async {
    if (!connectedSiteEnabled ||
        !RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$').hasMatch(tenantId) ||
        !RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$').hasMatch(siteId) ||
        !RegExp(r'^[0-9a-f]{64}$').hasMatch(enrollmentEvidenceDigest) ||
        boundAtMillis <= 0) {
      throw StateError('Connected stock enrollment binding is invalid.');
    }
    final existing = await customSelect(
      'SELECT tenant_id, site_id, enrollment_evidence_digest, '
      'bound_at_millis FROM shop_connected_scope_binding WHERE singleton = 1',
    ).getSingleOrNull();
    if (existing != null) {
      if (existing.read<String>('tenant_id') != tenantId ||
          existing.read<String>('site_id') != siteId ||
          existing.read<String>('enrollment_evidence_digest') !=
              enrollmentEvidenceDigest ||
          existing.read<int>('bound_at_millis') != boundAtMillis) {
        throw StateError('Connected stock scope does not match this database.');
      }
      return;
    }
    final history = await customSelect(
      'SELECT 1 FROM shop_connected_stock_reservation_headers LIMIT 1',
    ).getSingleOrNull();
    final authority = await customSelect(
      'SELECT 1 FROM shop_site_devices device '
      'JOIN shop_site_offline_leases lease '
      'ON lease.device_id = device.device_id '
      'AND lease.tenant_id = device.tenant_id '
      'AND lease.site_id = device.site_id '
      'WHERE device.tenant_id = ? AND device.site_id = ? '
      "AND device.state = 'active' LIMIT 1",
      variables: [Variable<String>(tenantId), Variable<String>(siteId)],
    ).getSingleOrNull();
    if (history != null || authority == null) {
      throw StateError('Connected stock enrollment authority is unavailable.');
    }
    await customInsert(
      'INSERT INTO shop_connected_scope_binding '
      '(singleton, tenant_id, site_id, enrollment_evidence_digest, '
      'bound_at_millis) VALUES (1, ?, ?, ?, ?)',
      variables: [
        Variable<String>(tenantId),
        Variable<String>(siteId),
        Variable<String>(enrollmentEvidenceDigest),
        Variable<int>(boundAtMillis),
      ],
    );
  });

  Map<String, Object?> _connectedSiteEventEnvelope(
    ShopConnectedSiteCommandInput input, {
    required int aggregateVersion,
    required Map<String, Object?> payload,
  }) => <String, Object?>{
    'eventId': input.eventId,
    'workspaceId': input.tenantId,
    'siteId': input.siteId,
    'aggregateType': input.aggregateType,
    'aggregateId': input.aggregateId,
    'aggregateVersion': aggregateVersion,
    'eventType': input.eventType,
    'occurredAt': _connectedSiteOccurredAt(input.createdAtMillis),
    'payload': payload,
  };

  String _connectedSiteOccurredAt(int millis) =>
      DateTime.fromMillisecondsSinceEpoch(
        millis,
        isUtc: true,
      ).toIso8601String();

  void _validateConnectedSiteCommandInput(ShopConnectedSiteCommandInput input) {
    final id = RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$');
    final digest = RegExp(r'^[0-9a-f]{64}$');
    final values = [
      input.commandId,
      input.tenantId,
      input.siteId,
      input.actorId,
      input.deviceId,
      input.aggregateType,
      input.aggregateId,
      input.capability,
      input.eventId,
      input.eventType,
      input.auditAction,
    ];
    if (values.any((value) => !id.hasMatch(value)) ||
        input.expectedVersion < 0 ||
        input.createdAtMillis <= 0 ||
        !digest.hasMatch(input.payloadDigest) ||
        !digest.hasMatch(input.leaseDigest) ||
        !digest.hasMatch(input.commandDigest) ||
        !digest.hasMatch(input.eventDigest) ||
        !digest.hasMatch(input.ackDigest) ||
        !digest.hasMatch(input.auditMetadataDigest)) {
      throw ArgumentError('Connected-site command values are invalid.');
    }
    _connectedSiteEventPayload(input.eventPayloadJson);
    final reservationFields = [
      input.reservationId,
      input.reservationProductId,
      input.reservationQuantity,
      input.reservationExpiresAtMillis,
    ];
    final hasReservation = reservationFields.every((value) => value != null);
    if (reservationFields.any((value) => value != null) || hasReservation) {
      throw ArgumentError('Connected-site reservation values are invalid.');
    }
    final reservation = input.stockReservation;
    final lifecycle = input.stockReservationLifecycle;
    if (reservation != null && lifecycle != null) {
      throw ArgumentError(
        'A connected-site command cannot hold and release stock together.',
      );
    }
    if (reservation != null &&
        (reservation.workspaceId != input.tenantId ||
            reservation.siteId != input.siteId ||
            reservation.actorId != input.actorId ||
            reservation.deviceId != input.deviceId ||
            reservation.workflowType.name != input.aggregateType ||
            reservation.subjectId != input.aggregateId ||
            reservation.capability.name != input.capability ||
            reservation.state != ConnectedStockReservationState.held ||
            reservation.stateVersion != 1 ||
            DateTime.parse(reservation.issuedAt).millisecondsSinceEpoch !=
                input.createdAtMillis)) {
      throw ArgumentError('Connected-site reservation scope is invalid.');
    }
    if (lifecycle != null &&
        (!id.hasMatch(lifecycle.reservationId) ||
            !digest.hasMatch(lifecycle.expectedReservationDigest) ||
            !id.hasMatch(lifecycle.reason) ||
            lifecycle.targetState != ConnectedStockReservationState.released)) {
      throw ArgumentError('Connected-site reservation lifecycle is invalid.');
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
    required String expectedCategory,
    required int expectedPriceMmk,
    required String? expectedBarcode,
    required String name,
    required String category,
    required int priceMmk,
    required String? barcode,
    String? staffActorId,
    ShopStaffCommandAuthorizer staffAuthorizer =
        const ShopStaffCommandAuthorizationUnavailable(),
  }) async {
    final cleanOperationId = operationId.trim();
    final cleanProductId = productId.trim();
    final cleanName = name.trim();
    final cleanCategory = category.trim();
    final oldCategory = expectedCategory.trim();
    final cleanBarcode = _optionalText(barcode);
    final oldBarcode = _optionalText(expectedBarcode);
    if (cleanOperationId.isEmpty ||
        cleanOperationId.length > 120 ||
        cleanProductId.isEmpty ||
        cleanProductId.length > 100 ||
        cleanName.isEmpty ||
        cleanName.length > 160 ||
        cleanCategory.length > 80 ||
        oldCategory.length > 80 ||
        priceMmk < 0 ||
        priceMmk > 2000000000 ||
        (cleanBarcode != null && cleanBarcode.length > 64) ||
        _usesReservedMemberCardNamespace(cleanBarcode)) {
      throw ArgumentError('Product values are invalid.');
    }
    await transaction(() async {
      await _authorizeManagedStaffCommand(
        authorizer: staffAuthorizer,
        capability: ShopStaffCapability.productDetailsWrite,
        commandId: cleanOperationId,
        expectedVersion: expectedPriceMmk,
        claimedActorId: staffActorId,
      );
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
        final legacyReplay =
            previousEvent.eventType == 'catalog.product.updated.v1' &&
            data is Map<String, dynamic> &&
            data['productId'] == cleanProductId &&
            data['name'] == cleanName &&
            data['priceMmk'] == priceMmk &&
            data['barcode'] == cleanBarcode &&
            data['previousName'] == expectedName &&
            data['previousPriceMmk'] == expectedPriceMmk &&
            data['previousBarcode'] == oldBarcode &&
            product.name == cleanName &&
            product.category == oldCategory &&
            cleanCategory == oldCategory &&
            product.priceMmk == priceMmk &&
            product.barcode == cleanBarcode;
        final currentReplay =
            previousEvent.eventType == 'catalog.product.updated.v2' &&
            data is Map<String, dynamic> &&
            data['productId'] == cleanProductId &&
            data['name'] == cleanName &&
            data['category'] == cleanCategory &&
            data['priceMmk'] == priceMmk &&
            data['barcode'] == cleanBarcode &&
            data['previousName'] == expectedName &&
            data['previousCategory'] == oldCategory &&
            data['previousPriceMmk'] == expectedPriceMmk &&
            data['previousBarcode'] == oldBarcode &&
            product.name == cleanName &&
            product.category == cleanCategory &&
            product.priceMmk == priceMmk &&
            product.barcode == cleanBarcode;
        if (legacyReplay || currentReplay) {
          return;
        }
        throw StateError('This product edit was already used differently.');
      }
      if (product.name != expectedName ||
          product.category != oldCategory ||
          product.priceMmk != expectedPriceMmk ||
          product.barcode != oldBarcode) {
        throw StateError('Product changed. Reopen this item.');
      }
      if (product.name == cleanName &&
          product.category == cleanCategory &&
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
                    row.category.equals(oldCategory) &
                    row.priceMmk.equals(expectedPriceMmk) &
                    (oldBarcode == null
                        ? row.barcode.isNull()
                        : row.barcode.equals(oldBarcode)),
              ))
              .write(
                ShopProductsCompanion(
                  name: Value(cleanName),
                  category: Value(cleanCategory),
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
          eventType: 'catalog.product.updated.v2',
          payloadJson: jsonEncode({
            'productId': cleanProductId,
            'name': cleanName,
            'category': cleanCategory,
            'priceMmk': priceMmk,
            'barcode': cleanBarcode,
            'previousName': product.name,
            'previousCategory': product.category,
            'previousPriceMmk': product.priceMmk,
            'previousBarcode': product.barcode,
          }),
          createdAtMillis: now,
        ),
      );
    });
  }

  /// Read immutable stock activity for one product, newest first.
  ///
  /// This is deliberately a read-only projection of the existing audit rows;
  /// it does not infer an actor when the movement predates managed staff
  /// identity or otherwise lacks one.
  Future<List<ShopStockMovement>> readRecentStockMovements(
    String productId, {
    int limit = 20,
  }) async {
    final cleanProductId = productId.trim();
    if (cleanProductId.isEmpty ||
        cleanProductId.length > 100 ||
        limit < 1 ||
        limit > 100) {
      throw ArgumentError('Stock activity query is invalid.');
    }
    return (select(shopStockMovements)
          ..where((row) => row.productId.equals(cleanProductId))
          ..orderBy([
            (row) => OrderingTerm.desc(row.createdAtMillis),
            (row) => OrderingTerm.desc(row.id),
          ])
          ..limit(limit))
        .get();
  }

  Future<int> readPendingCashReservedQuantity(
    String productId, {
    String? excludingOperationId,
  }) async {
    final rows = await customSelect(
      'SELECT intent.operation_id, intent.checkout_kind, '
      'draft.operation_id AS draft_operation_id, '
      'draft.basket_json, draft.updated_at_millis, cafe.ticket_json, '
      'binding.operation_id AS connected_binding_operation_id '
      'FROM shop_pending_cash_checkouts intent '
      'LEFT JOIN shop_connected_tender_reservation_bindings binding '
      "ON binding.operation_id = intent.operation_id AND binding.tender_kind = 'cash' "
      'LEFT JOIN shop_counter_drafts draft '
      "ON intent.checkout_kind = 'counter' "
      'AND draft.operation_id = intent.subject_id '
      'LEFT JOIN shop_cafe_orders cafe '
      "ON intent.checkout_kind = 'cafe' "
      'AND cafe.id = intent.subject_id AND cafe.state = ? ',
      variables: const [Variable<String>('open')],
    ).get();
    var quantity = 0;
    for (final row in rows) {
      if (row.read<String>('operation_id') == excludingOperationId) continue;
      if (row.readNullable<String>('connected_binding_operation_id') != null) {
        continue;
      }
      final kind = row.read<String>('checkout_kind');
      final pendingQuantity = kind == 'counter'
          ? _decodeCounterDraft(
                  operationId: row.read<String>('draft_operation_id'),
                  basketJson: row.read<String>('basket_json'),
                  updatedAtMillis: row.read<int>('updated_at_millis'),
                ).quantities[productId] ??
                0
          : CafeOrderTicket.fromJson(
                  jsonDecode(row.read<String>('ticket_json')),
                ).lines
                .where((line) => line.productId == productId)
                .fold<int>(0, (total, line) => total + line.quantity);
      quantity += pendingQuantity;
      if (quantity > 2000000000) {
        throw StateError(
          'Pending cash checkout quantity exceeds the supported stock range.',
        );
      }
    }
    return quantity;
  }

  /// Apply a reviewed local stock receipt or physical count exactly once.
  /// The expected balance prevents a stale count from erasing a later sale.
  Future<int> changeStock({
    required String operationId,
    required String productId,
    required String kind,
    required int quantity,
    required int expectedOnHand,
    String? staffActorId,
    ShopStaffCommandAuthorizer staffAuthorizer =
        const ShopStaffCommandAuthorizationUnavailable(),
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
      await _authorizeManagedStaffCommand(
        authorizer: staffAuthorizer,
        capability: ShopStaffCapability.stockChange,
        commandId: cleanOperationId,
        expectedVersion: expectedOnHand,
        claimedActorId: staffActorId,
      );
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
        final reservedQuantity = await _readTotalReservedStockQuantity(
          cleanProductId,
        );
        if (resultingOnHand < reservedQuantity) {
          throw StateError(
            'Finish or cancel reserved sales before counting this item below '
            'their saved quantity.',
          );
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

  /// Requires trusted staff authority only for an irreversibly managed store.
  /// Unbound, single-device Core remains anonymous and offline-first.
  Future<void> authorizeManagedStaffCommand({
    required ShopStaffCommandAuthorizer authorizer,
    required ShopStaffCapability capability,
    required String commandId,
    required int expectedVersion,
    String? claimedActorId,
  }) => _authorizeManagedStaffCommand(
    authorizer: authorizer,
    capability: capability,
    commandId: commandId,
    expectedVersion: expectedVersion,
    claimedActorId: claimedActorId,
  );

  Future<void> _authorizeManagedStaffCommand({
    required ShopStaffCommandAuthorizer authorizer,
    required ShopStaffCapability capability,
    required String commandId,
    required int expectedVersion,
    required String? claimedActorId,
  }) async {
    final binding = await readManagedWorkspaceBinding();
    if (binding == null) return;
    final storeRef = await readStoreRef();
    authorizer.authorize(
      ShopStaffCommandAuthorizationRequest(
        workspaceId: binding.workspaceId,
        storeRef: storeRef,
        storeBindingActorId: binding.attachedActorId,
        claimedActorId: claimedActorId,
        commandId: commandId,
        capability: capability,
        expectedVersion: expectedVersion,
      ),
    );
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

  static bool _usesReservedMemberCardNamespace(String? value) =>
      value != null && value.toUpperCase().startsWith('SMC1.');

  Future<String> _memberCardDigest(String token) =>
      _sha256Hex('supermega.shop.member-card.lookup.v1\u0000$token');

  /// Legacy v15 catalogs could use the later member-card prefix. Preserve
  /// those merchant codes, but keep member-card identification unavailable
  /// while any active or archived product makes the namespace ambiguous.
  Future<bool> memberCardIdentificationAvailable() async {
    final collision = await customSelect(
      "SELECT 1 FROM shop_products "
      "WHERE upper(COALESCE(barcode, '')) LIKE 'SMC1.%' "
      "OR upper(COALESCE(sku, '')) LIKE 'SMC1.%' LIMIT 1",
    ).getSingleOrNull();
    return collision == null;
  }

  bool _memberCardTokenIsCanonical(String token) {
    return isCanonicalShopMemberCardToken(token);
  }

  Future<ShopMemberCardMatch?> _lookupKnownMemberCard(String token) async {
    final clean = token.trim();
    if (!_memberCardTokenIsCanonical(clean) ||
        !await memberCardIdentificationAvailable()) {
      return null;
    }
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
    if (!_memberCardTokenIsCanonical(clean) ||
        !await memberCardIdentificationAvailable()) {
      return null;
    }
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
    ConnectedStockReservationV1? connectedStockReservation,
    ShopConnectedSiteCoordinatorTimeAuthority connectedTimeAuthority =
        const ShopConnectedSiteTimeUnavailable(),
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
      final pendingCash = await customSelect(
        'SELECT operation_id FROM shop_pending_cash_checkouts LIMIT 1',
      ).getSingleOrNull();
      if (pendingCash != null) {
        throw StateError(
          'Cancel or finish the pending cash checkout before starting a wallet payment.',
        );
      }
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
          if (connectedStockReservation != null)
            'connectedReservation': connectedStockReservation.toJson(),
        });
        if (prior.state == 'pending' &&
            prior.paymentMethod == paymentMethod &&
            prior.requestFingerprint == retryFingerprint) {
          await _requireConnectedTenderReservationBinding(
            operationId: cleanOperationId,
            tenderKind: 'wallet',
            reservation: connectedStockReservation,
          );
          return prior;
        }
        if (prior.state == 'cancelled' &&
            prior.paymentMethod == paymentMethod &&
            prior.requestFingerprint == retryFingerprint &&
            connectedStockReservation != null) {
          await _requireConnectedTenderReservationBinding(
            operationId: cleanOperationId,
            tenderKind: 'wallet',
            reservation: connectedStockReservation,
          );
          await validateConnectedStockReservationForSale(
            reservation: connectedStockReservation,
            operationId: cleanOperationId,
            workflowType: ConnectedStockWorkflowType.retailCart,
            capability: ShopStaffCapability.counterSale,
            subjectId: cleanOperationId,
            productQuantities: quantities,
            timeAuthority: connectedTimeAuthority,
          );
          final reopened = await customUpdate(
            "UPDATE shop_wallet_checkout_intents SET state = 'pending' "
            "WHERE operation_id = ? AND state = 'cancelled'",
            variables: [Variable<String>(cleanOperationId)],
          );
          if (reopened != 1) {
            throw StateError('This wallet checkout could not be reopened.');
          }
          return PendingWalletCheckout(
            operationId: prior.operationId,
            paymentMethod: prior.paymentMethod,
            requestFingerprint: prior.requestFingerprint,
            totalMmk: prior.totalMmk,
            merchantPhone: prior.merchantPhone,
            merchantQrPayload: prior.merchantQrPayload,
            lines: prior.lines,
            state: 'pending',
            createdAtMillis: prior.createdAtMillis,
            member: prior.member,
          );
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
        if (connectedStockReservation != null)
          'connectedReservation': connectedStockReservation.toJson(),
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

      final connectedNow = connectedStockReservation == null
          ? null
          : await validateConnectedStockReservationForSale(
              reservation: connectedStockReservation,
              operationId: cleanOperationId,
              workflowType: ConnectedStockWorkflowType.retailCart,
              capability: ShopStaffCapability.counterSale,
              subjectId: cleanOperationId,
              productQuantities: quantities,
              timeAuthority: connectedTimeAuthority,
            );

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
        final reserved = await _readTotalReservedStockQuantity(
          product.id,
          excludingConnectedReservationId:
              connectedStockReservation?.reservationId,
        );
        if (product.onHand - reserved < line.value) {
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
      if (connectedStockReservation != null) {
        await _insertConnectedTenderReservationBinding(
          operationId: cleanOperationId,
          tenderKind: 'wallet',
          reservation: connectedStockReservation,
          createdAtMillis: connectedNow!,
        );
      }
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
        final connectedBinding = await customSelect(
          'SELECT reservation_id FROM '
          'shop_connected_tender_reservation_bindings '
          "WHERE operation_id = ? AND tender_kind = 'wallet'",
          variables: [Variable<String>(operationId)],
        ).getSingleOrNull();
        if (connectedBinding != null) {
          final released = await customSelect(
            'SELECT 1 FROM shop_connected_stock_reservation_transitions '
            "WHERE reservation_id = ? AND to_state = 'released'",
            variables: [
              Variable<String>(connectedBinding.read<String>('reservation_id')),
            ],
          ).getSingleOrNull();
          if (released == null) {
            throw StateError(
              'Release the connected stock reservation before resuming '
              'under a new sale ID.',
            );
          }
        }
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
    cashMovementCount: row.readNullable<int>('cash_movement_count'),
    cashInTotalMmk: row.readNullable<int>('cash_in_total_mmk'),
    cashOutTotalMmk: row.readNullable<int>('cash_out_total_mmk'),
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
      if (shift.cashMovementCount == null ||
          shift.cashInTotalMmk == null ||
          shift.cashOutTotalMmk == null) {
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
      final cashMovementRows = await customSelect(
        'SELECT id, movement_kind, amount_mmk, reason, '
        'authorized_actor_label, created_at_millis '
        'FROM shop_cash_movements WHERE shift_id = ? '
        'ORDER BY created_at_millis, id',
        variables: [Variable<String>(cleanShiftId)],
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
          cashMovementCount: shift.cashMovementCount!,
          cashInTotalMmk: shift.cashInTotalMmk!,
          cashOutTotalMmk: shift.cashOutTotalMmk!,
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
        cashMovements: [
          for (final movement in cashMovementRows)
            ShopOperationalCashMovement(
              id: movement.read<String>('id'),
              kind: movement.read<String>('movement_kind'),
              amountMmk: movement.read<int>('amount_mmk'),
              reason: movement.read<String>('reason'),
              actorLabel: movement.read<String>('authorized_actor_label'),
              createdAtMillis: movement.read<int>('created_at_millis'),
            ),
        ],
      );
    });
  }

  Future<ShopCashMovementCommand> prepareCashMovementCommand({
    required String operationId,
    required String shiftId,
    required String kind,
    required int amountMmk,
    required String reason,
  }) async {
    final cleanOperationId = _boundedCorrectionText(
      operationId,
      field: 'Cash movement operation ID',
      maximum: 120,
    );
    final cleanShiftId = _boundedCorrectionText(
      shiftId,
      field: 'Cash shift ID',
      maximum: 120,
    );
    final cleanKind = kind.trim();
    final cleanReason = reason.trim();
    if (!const {'cash_in', 'cash_out'}.contains(cleanKind) ||
        !const {
          'float_top_up',
          'petty_cash_expense',
          'supplier_payment',
          'bank_deposit',
          'other',
        }.contains(cleanReason) ||
        amountMmk <= 0 ||
        amountMmk > 200000000000000) {
      throw ArgumentError('Cash movement details are invalid.');
    }
    final storeRef = await readStoreRef();
    final fingerprint = jsonEncode({
      'contract': 'supermega.shop.cash-movement-command.v1',
      'operationId': cleanOperationId,
      'storeRef': storeRef,
      'shiftId': cleanShiftId,
      'kind': cleanKind,
      'amountMmk': amountMmk,
      'reason': cleanReason,
    });
    return ShopCashMovementCommand(
      operationId: cleanOperationId,
      storeRef: storeRef,
      shiftId: cleanShiftId,
      kind: cleanKind,
      amountMmk: amountMmk,
      reason: cleanReason,
      requestFingerprint: fingerprint,
      commandDigest: await _sha256Hex(fingerprint),
    );
  }

  Future<List<ShopCashMovement>> readCashMovements(String shiftId) async {
    final cleanShiftId = _boundedCorrectionText(
      shiftId,
      field: 'Cash shift ID',
      maximum: 120,
    );
    final rows = await customSelect(
      'SELECT * FROM shop_cash_movements WHERE shift_id = ? '
      'ORDER BY created_at_millis, id',
      variables: [Variable<String>(cleanShiftId)],
    ).get();
    return [for (final row in rows) _cashMovementFromRow(row)];
  }

  ShopCashMovement _cashMovementFromRow(QueryRow row) => ShopCashMovement(
    id: row.read<String>('id'),
    operationId: row.read<String>('operation_id'),
    storeRef: row.read<String>('store_ref'),
    shiftId: row.read<String>('shift_id'),
    kind: row.read<String>('movement_kind'),
    amountMmk: row.read<int>('amount_mmk'),
    reason: row.read<String>('reason'),
    workspaceId: row.read<String>('authorization_workspace_id'),
    actorId: row.read<String>('authorized_actor_id'),
    actorLabel: row.read<String>('authorized_actor_label'),
    createdAtMillis: row.read<int>('created_at_millis'),
  );

  /// Records one owner-authorized drawer movement.
  ///
  /// The default production receipt verifier has no keys. The client transport
  /// can request `shop.cash_shift.move`, but this API remains fail closed until
  /// the managed owner issuer and its pinned key are reviewed and deployed.
  /// Tests may inject an explicit synthetic signer.
  Future<ShopCashMovement> recordCashMovement({
    required ShopCashMovementCommand command,
    required ShopCorrectionAuthorization authorization,
  }) async {
    final expected = await prepareCashMovementCommand(
      operationId: command.operationId,
      shiftId: command.shiftId,
      kind: command.kind,
      amountMmk: command.amountMmk,
      reason: command.reason,
    );
    if (expected.requestFingerprint != command.requestFingerprint ||
        expected.commandDigest != command.commandDigest ||
        authorization.contract != shopCorrectionAuthorizationReceiptContract ||
        authorization.capability != 'shop.cash_shift.move' ||
        authorization.actorRole != 'owner' ||
        authorization.source != 'managed_membership_receipt_v1' ||
        authorization.commandDigest != command.commandDigest ||
        authorization.finalizationRequestId == null ||
        authorization.finalizedAtMillis != authorization.issuedAtMillis ||
        authorization.expiresAtMillis - authorization.issuedAtMillis !=
            const Duration(minutes: 5).inMilliseconds ||
        !await correctionReceiptVerifier.verify(authorization)) {
      throw StateError('Cash movement owner authorization is invalid.');
    }
    final now = _saleAndCashShiftNowMillis();
    if (now < authorization.issuedAtMillis ||
        now > authorization.expiresAtMillis) {
      throw StateError('Cash movement owner authorization expired.');
    }
    return transaction(() async {
      final binding = await readManagedWorkspaceBinding();
      final storeRef = await readStoreRef();
      if (binding == null ||
          binding.workspaceId != authorization.workspaceId ||
          binding.attachedActorId != authorization.actorId ||
          storeRef != command.storeRef) {
        throw StateError(
          'Cash movement authorization does not match this workspace.',
        );
      }
      final prior = await customSelect(
        'SELECT * FROM shop_cash_movements WHERE operation_id = ?',
        variables: [Variable<String>(command.operationId)],
      ).getSingleOrNull();
      if (prior != null) {
        if (prior.read<String>('request_fingerprint') !=
                command.requestFingerprint ||
            prior.read<String>('authorization_receipt_id') !=
                authorization.receiptId ||
            prior.read<String>('authorization_receipt_digest') !=
                authorization.receiptDigest ||
            prior.read<String>('authorization_command_digest') !=
                command.commandDigest) {
          throw StateError(
            'A cash movement operation ID was reused with new details.',
          );
        }
        return _cashMovementFromRow(prior);
      }
      final reusedProof = await customSelect(
        'SELECT 1 FROM shop_correction_authorization_proofs '
        'WHERE receipt_id = ? LIMIT 1',
        variables: [Variable<String>(authorization.receiptId)],
      ).getSingleOrNull();
      if (reusedProof != null) {
        throw StateError('This owner authorization was already used.');
      }
      final shift = await customSelect(
        "SELECT 1 FROM shop_cash_shifts WHERE id = ? AND state = 'open'",
        variables: [Variable<String>(command.shiftId)],
      ).getSingleOrNull();
      if (shift == null) {
        throw StateError('The cash shift changed. Review again.');
      }
      if (command.kind == 'cash_out') {
        final review = await readCashShiftReview(command.shiftId);
        if (command.amountMmk > review.expectedCashMmk) {
          throw StateError('Cash out exceeds the recorded drawer cash.');
        }
      }
      final id = 'cash-movement-${command.operationId}';
      await customInsert(
        'INSERT INTO shop_cash_movements '
        '(id, operation_id, request_fingerprint, shift_id, store_ref, movement_kind, '
        'amount_mmk, reason, authorization_receipt_id, '
        'authorization_receipt_digest, authorization_workspace_id, '
        'authorized_actor_id, authorized_actor_label, authorized_actor_role, '
        'authorization_capability, authorization_source, '
        'authorization_command_digest, authorization_finalization_request_id, '
        'authorization_issued_at_millis, authorization_finalized_at_millis, '
        'authorization_verified_at_millis, authorization_expires_at_millis, '
        'authorization_key_id, authorization_signature, created_at_millis) '
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        variables: [
          Variable<String>(id),
          Variable<String>(command.operationId),
          Variable<String>(command.requestFingerprint),
          Variable<String>(command.shiftId),
          Variable<String>(command.storeRef),
          Variable<String>(command.kind),
          Variable<int>(command.amountMmk),
          Variable<String>(command.reason),
          Variable<String>(authorization.receiptId),
          Variable<String>(authorization.receiptDigest),
          Variable<String>(authorization.workspaceId),
          Variable<String>(authorization.actorId),
          Variable<String>(authorization.actorLabel),
          Variable<String>(authorization.actorRole),
          Variable<String>(authorization.capability),
          Variable<String>(authorization.source),
          Variable<String>(authorization.commandDigest),
          Variable<String>(authorization.finalizationRequestId!),
          Variable<int>(authorization.issuedAtMillis),
          Variable<int>(authorization.finalizedAtMillis!),
          Variable<int>(authorization.issuedAtMillis),
          Variable<int>(authorization.expiresAtMillis),
          Variable<String>(authorization.keyId),
          Variable<String>(authorization.signature),
          Variable<int>(now),
        ],
      );
      await into(shopSyncOutbox).insert(
        ShopSyncOutboxCompanion.insert(
          operationId: command.operationId,
          eventType: 'shop.cash_shift.movement_recorded.v1',
          payloadJson: jsonEncode({
            'cashMovementId': id,
            'shiftId': command.shiftId,
            'storeRef': command.storeRef,
            'kind': command.kind,
            'amountMmk': command.amountMmk,
            'reason': command.reason,
            'workspaceId': authorization.workspaceId,
            'actorId': authorization.actorId,
            'createdAtMillis': now,
          }),
          createdAtMillis: now,
        ),
      );
      final inserted = await customSelect(
        'SELECT * FROM shop_cash_movements WHERE id = ?',
        variables: [Variable<String>(id)],
      ).getSingle();
      return _cashMovementFromRow(inserted);
    });
  }

  Future<ShopCashShift> openCashShift({
    required String operationId,
    required String operatorLabel,
    required int openingFloatMmk,
    String? staffActorId,
    ShopStaffCommandAuthorizer staffAuthorizer =
        const ShopStaffCommandAuthorizationUnavailable(),
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
      await _authorizeManagedStaffCommand(
        authorizer: staffAuthorizer,
        capability: ShopStaffCapability.cashShiftManage,
        commandId: cleanOperationId,
        expectedVersion: 0,
        claimedActorId: staffActorId,
      );
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
      final now = _saleAndCashShiftNowMillis();
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

  Future<String> _cashCheckoutFingerprint({
    required String operationId,
    required String checkoutKind,
    required String subjectId,
    required String? capturedShiftId,
    required String subjectFingerprint,
    required String? memberId,
    required int? memberCardRevision,
  }) => _sha256Hex(
    jsonEncode({
      'contract': 'supermega.shop.pending-cash-checkout.v1',
      'operationId': operationId,
      'checkoutKind': checkoutKind,
      'subjectId': subjectId,
      'capturedShiftId': capturedShiftId,
      'subjectFingerprint': subjectFingerprint,
      'memberId': memberId,
      'memberCardRevision': memberCardRevision,
    }),
  );

  Future<String> _cashCheckoutSubjectFingerprint({
    required String checkoutKind,
    required String subjectId,
  }) async {
    if (checkoutKind == 'counter') {
      final row = await customSelect(
        'SELECT basket_json FROM shop_counter_drafts WHERE operation_id = ?',
        variables: [Variable<String>(subjectId)],
      ).getSingleOrNull();
      if (row == null) {
        throw StateError('The counter sale changed. Review it again.');
      }
      return _sha256Hex(row.read<String>('basket_json'));
    }
    final row = await customSelect(
      "SELECT ticket_json FROM shop_cafe_orders WHERE id = ? AND state = 'open'",
      variables: [Variable<String>(subjectId)],
    ).getSingleOrNull();
    if (row == null) {
      throw StateError('The café order changed. Refresh and review it.');
    }
    return _sha256Hex(row.read<String>('ticket_json'));
  }

  Future<Map<String, int>> _cashCheckoutSubjectQuantities({
    required String checkoutKind,
    required String subjectId,
  }) async {
    if (checkoutKind == 'counter') {
      final row = await customSelect(
        'SELECT basket_json, updated_at_millis FROM shop_counter_drafts '
        'WHERE operation_id = ?',
        variables: [Variable<String>(subjectId)],
      ).getSingleOrNull();
      if (row == null) {
        throw StateError('The counter sale changed. Review it again.');
      }
      return _decodeCounterDraft(
        operationId: subjectId,
        basketJson: row.read<String>('basket_json'),
        updatedAtMillis: row.read<int>('updated_at_millis'),
      ).quantities;
    }
    final row = await customSelect(
      "SELECT ticket_json FROM shop_cafe_orders WHERE id = ? AND state = 'open'",
      variables: [Variable<String>(subjectId)],
    ).getSingleOrNull();
    if (row == null) {
      throw StateError('The café order changed. Refresh and review it.');
    }
    final quantities = <String, int>{};
    for (final line in CafeOrderTicket.fromJson(
      jsonDecode(row.read<String>('ticket_json')),
    ).lines) {
      quantities.update(
        line.productId,
        (quantity) => quantity + line.quantity,
        ifAbsent: () => line.quantity,
      );
    }
    return quantities;
  }

  ShopPendingCashCheckout _pendingCashCheckoutFromRow(QueryRow row) =>
      ShopPendingCashCheckout(
        operationId: row.read<String>('operation_id'),
        checkoutKind: row.read<String>('checkout_kind'),
        subjectId: row.read<String>('subject_id'),
        capturedShiftId: row.readNullable<String>('captured_shift_id'),
        memberId: row.readNullable<String>('member_id'),
        memberCardRevision: row.readNullable<int>('member_card_revision'),
        requestFingerprint: row.read<String>('request_fingerprint'),
        createdAtMillis: row.read<int>('created_at_millis'),
      );

  Future<ShopPendingCashCheckout?> readPendingCashCheckout({
    required String checkoutKind,
    required String subjectId,
  }) async {
    final row = await customSelect(
      'SELECT * FROM shop_pending_cash_checkouts '
      'WHERE checkout_kind = ? AND subject_id = ?',
      variables: [Variable<String>(checkoutKind), Variable<String>(subjectId)],
    ).getSingleOrNull();
    return row == null ? null : _pendingCashCheckoutFromRow(row);
  }

  Future<ShopPendingCashCheckout> beginPendingCashCheckout({
    required String operationId,
    required String checkoutKind,
    required String subjectId,
    String? memberId,
    int? memberCardRevision,
    ConnectedStockReservationV1? connectedStockReservation,
    ShopConnectedSiteCoordinatorTimeAuthority connectedTimeAuthority =
        const ShopConnectedSiteTimeUnavailable(),
  }) => transaction(() async {
    final cleanOperationId = operationId.trim();
    final cleanSubjectId = subjectId.trim();
    if (cleanOperationId.isEmpty ||
        cleanOperationId.length > 120 ||
        cleanSubjectId.isEmpty ||
        cleanSubjectId.length > 120 ||
        !const {'counter', 'cafe'}.contains(checkoutKind) ||
        (checkoutKind == 'counter' && cleanOperationId != cleanSubjectId) ||
        ((memberId == null) != (memberCardRevision == null)) ||
        (memberCardRevision != null && memberCardRevision < 1) ||
        (checkoutKind == 'cafe' && memberId != null)) {
      throw ArgumentError('Pending cash checkout identity is invalid.');
    }
    final pendingWallet = await customSelect(
      "SELECT operation_id FROM shop_wallet_checkout_intents WHERE state = 'pending' LIMIT 1",
    ).getSingleOrNull();
    if (pendingWallet != null) {
      throw StateError(
        'Finish or cancel the pending wallet checkout before starting a cash checkout.',
      );
    }
    final existing = await readPendingCashCheckout(
      checkoutKind: checkoutKind,
      subjectId: cleanSubjectId,
    );
    if (existing != null) {
      await _requireConnectedTenderReservationBinding(
        operationId: cleanOperationId,
        tenderKind: 'cash',
        reservation: connectedStockReservation,
      );
      return existing;
    }
    final subjectFingerprint = await _cashCheckoutSubjectFingerprint(
      checkoutKind: checkoutKind,
      subjectId: cleanSubjectId,
    );
    final subjectQuantities = await _cashCheckoutSubjectQuantities(
      checkoutKind: checkoutKind,
      subjectId: cleanSubjectId,
    );
    final connectedWorkflow = checkoutKind == 'counter'
        ? ConnectedStockWorkflowType.retailCart
        : ConnectedStockWorkflowType.cafeOrder;
    final connectedCapability = checkoutKind == 'counter'
        ? ShopStaffCapability.counterSale
        : ShopStaffCapability.cafeOrderWrite;
    final connectedNow = connectedStockReservation == null
        ? null
        : await validateConnectedStockReservationForSale(
            reservation: connectedStockReservation,
            operationId: cleanOperationId,
            workflowType: connectedWorkflow,
            capability: connectedCapability,
            subjectId: cleanSubjectId,
            productQuantities: subjectQuantities,
            timeAuthority: connectedTimeAuthority,
          );
    for (final entry in subjectQuantities.entries) {
      final product = await customSelect(
        'SELECT name, on_hand FROM shop_products WHERE id = ?',
        variables: [Variable<String>(entry.key)],
      ).getSingleOrNull();
      if (product == null) {
        throw StateError('A selected product is no longer available.');
      }
      final alreadyReserved = await _readTotalReservedStockQuantity(
        entry.key,
        excludingConnectedReservationId:
            connectedStockReservation?.reservationId,
      );
      final available = product.read<int>('on_hand') - alreadyReserved;
      if (entry.value > available) {
        throw ShopStockUnavailableException(
          productName: product.read<String>('name'),
          available: available < 0 ? 0 : available,
          requiredQuantity: entry.value,
        );
      }
    }
    if (memberId != null) {
      final card = await customSelect(
        'SELECT 1 FROM shop_member_cards '
        'WHERE member_id = ? AND revision = ? AND state = ?',
        variables: [
          Variable<String>(memberId),
          Variable<int>(memberCardRevision!),
          const Variable<String>('active'),
        ],
      ).getSingleOrNull();
      if (card == null) {
        throw StateError('The member card is unavailable.');
      }
    }
    final shift = await readOpenCashShift();
    final fingerprint = await _cashCheckoutFingerprint(
      operationId: cleanOperationId,
      checkoutKind: checkoutKind,
      subjectId: cleanSubjectId,
      capturedShiftId: shift?.id,
      subjectFingerprint: subjectFingerprint,
      memberId: memberId,
      memberCardRevision: memberCardRevision,
    );
    final createdAt = _saleAndCashShiftNowMillis();
    await customInsert(
      'INSERT INTO shop_pending_cash_checkouts '
      '(operation_id, checkout_kind, subject_id, captured_shift_id, '
      'member_id, member_card_revision, request_fingerprint, created_at_millis) '
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      variables: [
        Variable<String>(cleanOperationId),
        Variable<String>(checkoutKind),
        Variable<String>(cleanSubjectId),
        Variable<String>(shift?.id),
        Variable<String>(memberId),
        Variable<int>(memberCardRevision),
        Variable<String>(fingerprint),
        Variable<int>(createdAt),
      ],
    );
    if (connectedStockReservation != null) {
      await _insertConnectedTenderReservationBinding(
        operationId: cleanOperationId,
        tenderKind: 'cash',
        reservation: connectedStockReservation,
        createdAtMillis: connectedNow!,
      );
    }
    return ShopPendingCashCheckout(
      operationId: cleanOperationId,
      checkoutKind: checkoutKind,
      subjectId: cleanSubjectId,
      capturedShiftId: shift?.id,
      memberId: memberId,
      memberCardRevision: memberCardRevision,
      requestFingerprint: fingerprint,
      createdAtMillis: createdAt,
    );
  });

  Future<void> cancelPendingCashCheckout({
    required String checkoutKind,
    required String subjectId,
  }) => transaction(() async {
    final pending = await readPendingCashCheckout(
      checkoutKind: checkoutKind,
      subjectId: subjectId,
    );
    if (pending == null) return;
    final sale = await customSelect(
      'SELECT 1 FROM shop_sales WHERE operation_id = ?',
      variables: [Variable<String>(pending.operationId)],
    ).getSingleOrNull();
    if (sale != null) {
      throw StateError('The cash sale is already committed.');
    }
    await customUpdate(
      'DELETE FROM shop_pending_cash_checkouts '
      'WHERE operation_id = ? AND checkout_kind = ? AND subject_id = ?',
      variables: [
        Variable<String>(pending.operationId),
        Variable<String>(pending.checkoutKind),
        Variable<String>(pending.subjectId),
      ],
    );
  });

  Future<ShopPendingCashCheckout> requirePendingCashCheckout({
    required String operationId,
    required String checkoutKind,
    required String subjectId,
  }) async {
    final pending = await readPendingCashCheckout(
      checkoutKind: checkoutKind,
      subjectId: subjectId,
    );
    if (pending == null || pending.operationId != operationId) {
      throw StateError('The pending cash checkout is unavailable.');
    }
    final expectedFingerprint = await _cashCheckoutFingerprint(
      operationId: pending.operationId,
      checkoutKind: pending.checkoutKind,
      subjectId: pending.subjectId,
      capturedShiftId: pending.capturedShiftId,
      subjectFingerprint: await _cashCheckoutSubjectFingerprint(
        checkoutKind: pending.checkoutKind,
        subjectId: pending.subjectId,
      ),
      memberId: pending.memberId,
      memberCardRevision: pending.memberCardRevision,
    );
    if (pending.requestFingerprint != expectedFingerprint) {
      throw StateError('The pending cash checkout is invalid.');
    }
    final activeShift = await readOpenCashShift();
    if (activeShift?.id != pending.capturedShiftId) {
      throw const ShopCashShiftChangedException();
    }
    return pending;
  }

  Future<void> consumePendingCashCheckout({
    required String operationId,
    required String checkoutKind,
    required String subjectId,
  }) async {
    final changed = await customUpdate(
      'DELETE FROM shop_pending_cash_checkouts WHERE operation_id = ? '
      'AND checkout_kind = ? AND subject_id = ?',
      variables: [
        Variable<String>(operationId),
        Variable<String>(checkoutKind),
        Variable<String>(subjectId),
      ],
    );
    if (changed != 1) {
      throw StateError('The pending cash checkout changed.');
    }
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
        COALESCE(SUM(CASE WHEN s.payment_method = 'kbzpay' THEN 1 ELSE 0 END), 0) AS kbzpay_count,
        COALESCE(SUM(CASE WHEN s.payment_method = 'kbzpay' THEN s.total_mmk ELSE 0 END), 0) AS kbzpay_total,
        COALESCE(SUM(CASE WHEN s.payment_method = 'wavepay' THEN 1 ELSE 0 END), 0) AS wavepay_count,
        COALESCE(SUM(CASE WHEN s.payment_method = 'wavepay' THEN s.total_mmk ELSE 0 END), 0) AS wavepay_total,
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
    final movementTotals = await customSelect(
      '''
      SELECT COUNT(*) AS movement_count,
        COALESCE(SUM(CASE WHEN movement_kind = 'cash_in' THEN amount_mmk ELSE 0 END), 0) AS cash_in_total,
        COALESCE(SUM(CASE WHEN movement_kind = 'cash_out' THEN amount_mmk ELSE 0 END), 0) AS cash_out_total
      FROM shop_cash_movements WHERE shift_id = ?
      ''',
      variables: [Variable<String>(shiftId)],
    ).getSingle();
    final cashTotal = salesTotals.read<int>('cash_total');
    final drawerOutflow = reversalTotals.read<int>('drawer_outflow');
    final cashInTotal = movementTotals.read<int>('cash_in_total');
    final cashOutTotal = movementTotals.read<int>('cash_out_total');
    if (cashTotal > 200000000000000 - shift.openingFloatMmk ||
        cashInTotal > 200000000000000 - shift.openingFloatMmk - cashTotal) {
      throw StateError('Cash shift total exceeds the supported limit.');
    }
    final cashBeforeOutflows = shift.openingFloatMmk + cashTotal + cashInTotal;
    if (drawerOutflow > cashBeforeOutflows ||
        cashOutTotal > cashBeforeOutflows - drawerOutflow) {
      throw StateError(
        'Cash outflows exceed this shift\'s recorded drawer cash.',
      );
    }
    return ShopCashShiftReview(
      shift: shift,
      cashSalesCount: salesTotals.read<int>('cash_count'),
      cashSalesTotalMmk: cashTotal,
      walletSalesCount: salesTotals.read<int>('wallet_count'),
      walletSalesTotalMmk: salesTotals.read<int>('wallet_total'),
      kbzpaySalesCount: salesTotals.read<int>('kbzpay_count'),
      kbzpaySalesTotalMmk: salesTotals.read<int>('kbzpay_total'),
      wavepaySalesCount: salesTotals.read<int>('wavepay_count'),
      wavepaySalesTotalMmk: salesTotals.read<int>('wavepay_total'),
      cashReversalCount: reversalTotals.read<int>('reversal_count'),
      cashReversalTotalMmk: reversalTotals.read<int>('reversal_total'),
      cashDrawerOutflowMmk: drawerOutflow,
      cashMovementCount: movementTotals.read<int>('movement_count'),
      cashInTotalMmk: cashInTotal,
      cashOutTotalMmk: cashOutTotal,
      expectedCashMmk: cashBeforeOutflows - drawerOutflow - cashOutTotal,
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
    int seenCashMovementCount = 0,
    int seenCashInTotalMmk = 0,
    int seenCashOutTotalMmk = 0,
    String? staffActorId,
    ShopStaffCommandAuthorizer staffAuthorizer =
        const ShopStaffCommandAuthorizationUnavailable(),
  }) async {
    final cleanOperationId = operationId.trim();
    if (shiftId.trim().isEmpty ||
        cleanOperationId.isEmpty ||
        cleanOperationId.length > 120 ||
        seenSaleCount < 0 ||
        seenCashTotalMmk < 0 ||
        seenCashReversalCount < 0 ||
        seenCashDrawerOutflowMmk < 0 ||
        seenCashMovementCount < 0 ||
        seenCashInTotalMmk < 0 ||
        seenCashOutTotalMmk < 0 ||
        countedCashMmk < 0 ||
        countedCashMmk > 200000000000000) {
      throw ArgumentError('Cash shift close details are invalid.');
    }
    return transaction(() async {
      await _authorizeManagedStaffCommand(
        authorizer: staffAuthorizer,
        capability: ShopStaffCapability.cashShiftManage,
        commandId: cleanOperationId,
        expectedVersion: seenSaleCount,
        claimedActorId: staffActorId,
      );
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
                seenCashDrawerOutflowMmk ||
            (previous.readNullable<int>('review_cash_movement_count') ?? 0) !=
                seenCashMovementCount ||
            (previous.readNullable<int>('review_cash_in_total_mmk') ?? 0) !=
                seenCashInTotalMmk ||
            (previous.readNullable<int>('review_cash_out_total_mmk') ?? 0) !=
                seenCashOutTotalMmk) {
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
      final pendingCashReversal = await customSelect(
        'SELECT intent.consumption_request_id '
        'FROM shop_correction_consumption_intents AS intent '
        'LEFT JOIN shop_correction_consumptions AS consumption '
        'ON consumption.consumption_request_id = intent.consumption_request_id '
        'WHERE consumption.consumption_request_id IS NULL '
        "AND intent.capability = 'shop.sale.reverse' "
        'AND json_valid(intent.recovery_envelope_json) '
        'AND json_extract(intent.recovery_envelope_json, ?1) = ?2 '
        "AND json_extract(intent.recovery_envelope_json, '\$.command.originalPaymentMethod') = 'cash' "
        "AND json_extract(intent.recovery_envelope_json, '\$.command.expectedCashShiftId') = ?3 "
        'LIMIT 1',
        variables: [
          const Variable<String>(r'$.contract'),
          const Variable<String>(_shopFullSaleCorrectionRecoveryContract),
          Variable<String>(shiftId),
        ],
      ).getSingleOrNull();
      if (pendingCashReversal != null) {
        throw StateError(
          'Finish the pending cash return before closing this shift.',
        );
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
      if (review.cashMovementCount != seenCashMovementCount ||
          review.cashInTotalMmk != seenCashInTotalMmk ||
          review.cashOutTotalMmk != seenCashOutTotalMmk) {
        throw StateError(
          'Shift activity changed. Review the cash shift again.',
        );
      }
      final now = _saleAndCashShiftNowMillis();
      final difference = countedCashMmk - review.expectedCashMmk;
      final changed = await customUpdate(
        'UPDATE shop_cash_shifts SET state = ?, close_operation_id = ?, '
        'closed_at_millis = ?, cash_sales_count = ?, cash_sales_total_mmk = ?, '
        'wallet_sales_count = ?, wallet_sales_total_mmk = ?, '
        'expected_cash_mmk = ?, counted_cash_mmk = ?, difference_mmk = ?, '
        'review_sale_count = ?, review_cash_total_mmk = ?, '
        'cash_reversal_count = ?, cash_reversal_total_mmk = ?, '
        'cash_drawer_outflow_mmk = ?, review_cash_reversal_count = ?, '
        'review_cash_drawer_outflow_mmk = ?, cash_movement_count = ?, '
        'cash_in_total_mmk = ?, cash_out_total_mmk = ?, '
        'review_cash_movement_count = ?, review_cash_in_total_mmk = ?, '
        'review_cash_out_total_mmk = ? '
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
          Variable<int>(review.cashMovementCount),
          Variable<int>(review.cashInTotalMmk),
          Variable<int>(review.cashOutTotalMmk),
          Variable<int>(seenCashMovementCount),
          Variable<int>(seenCashInTotalMmk),
          Variable<int>(seenCashOutTotalMmk),
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
            'cashMovementCount': review.cashMovementCount,
            'cashInTotalMmk': review.cashInTotalMmk,
            'cashOutTotalMmk': review.cashOutTotalMmk,
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
      if (sale.cashTenderedMmk != null) 'cashTenderedMmk': sale.cashTenderedMmk,
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
      'SELECT COUNT(*) AS sale_count, COALESCE(SUM(total_mmk), 0) AS total_mmk, '
      "COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_mmk ELSE 0 END), 0) AS cash_total_mmk, "
      "COALESCE(SUM(CASE WHEN payment_method = 'kbzpay' THEN total_mmk ELSE 0 END), 0) AS kbzpay_total_mmk, "
      "COALESCE(SUM(CASE WHEN payment_method = 'wavepay' THEN total_mmk ELSE 0 END), 0) AS wavepay_total_mmk "
      'FROM shop_sales WHERE created_at_millis >= ? AND created_at_millis < ?',
      variables: [Variable<int>(startAtMillis), Variable<int>(endAtMillis)],
    ).getSingle();
    final reversed = await customSelect(
      'SELECT COUNT(*) AS reversal_count, '
      'COALESCE(SUM(original_total_mmk), 0) AS total_mmk, '
      "COALESCE(SUM(CASE WHEN original_payment_method = 'cash' THEN original_total_mmk ELSE 0 END), 0) AS cash_total_mmk, "
      "COALESCE(SUM(CASE WHEN original_payment_method = 'kbzpay' THEN original_total_mmk ELSE 0 END), 0) AS kbzpay_total_mmk, "
      "COALESCE(SUM(CASE WHEN original_payment_method = 'wavepay' THEN original_total_mmk ELSE 0 END), 0) AS wavepay_total_mmk "
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
      grossCashSalesMmk: gross.read<int>('cash_total_mmk'),
      grossKbzpaySalesMmk: gross.read<int>('kbzpay_total_mmk'),
      grossWavepaySalesMmk: gross.read<int>('wavepay_total_mmk'),
      reversalCount: reversed.read<int>('reversal_count'),
      reversalMmk: reversed.read<int>('total_mmk'),
      cashReversalMmk: reversed.read<int>('cash_total_mmk'),
      kbzpayReversalMmk: reversed.read<int>('kbzpay_total_mmk'),
      wavepayReversalMmk: reversed.read<int>('wavepay_total_mmk'),
      pendingWalletReversalCount: pendingWallet.read<int>('reversal_count'),
      pendingWalletReversalMmk: pendingWallet.read<int>('total_mmk'),
    );
  }

  Future<ShopSaleReceipt> recordCashSale({
    required String operationId,
    required List<ShopSaleLineInput> lines,
    int? cashTenderedMmk,
    bool requirePendingCashCheckout = false,
    String? staffActorId,
    ShopStaffCommandAuthorizer staffAuthorizer =
        const ShopStaffCommandAuthorizationUnavailable(),
    ConnectedStockReservationV1? connectedStockReservation,
    ShopConnectedSiteCoordinatorTimeAuthority connectedTimeAuthority =
        const ShopConnectedSiteTimeUnavailable(),
  }) => recordSale(
    operationId: operationId,
    lines: lines,
    paymentMethod: 'cash',
    cashTenderedMmk: cashTenderedMmk,
    cashCheckoutSubjectId: requirePendingCashCheckout ? operationId : null,
    staffActorId: staffActorId,
    staffAuthorizer: staffAuthorizer,
    connectedStockReservation: connectedStockReservation,
    connectedTimeAuthority: connectedTimeAuthority,
  );

  Future<ShopSaleReceipt> recordSale({
    required String operationId,
    required List<ShopSaleLineInput> lines,
    required String paymentMethod,
    int? cashTenderedMmk,
    String? walletCheckoutOperationId,
    int? expectedTotalMmk,
    Map<String, int>? expectedUnitPricesMmk,
    Map<String, String>? expectedProductNames,
    String? memberCardToken,
    String? cashCheckoutSubjectId,
    String? staffActorId,
    ShopStaffCommandAuthorizer staffAuthorizer =
        const ShopStaffCommandAuthorizationUnavailable(),
    ConnectedStockReservationV1? connectedStockReservation,
    ShopConnectedSiteCoordinatorTimeAuthority connectedTimeAuthority =
        const ShopConnectedSiteTimeUnavailable(),
  }) async {
    final cleanOperationId = operationId.trim();
    final cleanWalletCheckoutId = walletCheckoutOperationId?.trim();
    const supportedPaymentMethods = {'cash', 'kbzpay', 'wavepay'};
    if (cleanOperationId.isEmpty ||
        cleanOperationId.length > 120 ||
        lines.isEmpty ||
        lines.length > 100 ||
        !supportedPaymentMethods.contains(paymentMethod) ||
        (cashTenderedMmk != null &&
            (paymentMethod != 'cash' ||
                cashTenderedMmk < 0 ||
                cashTenderedMmk > 200000000000000)) ||
        (expectedTotalMmk != null &&
            (expectedTotalMmk < 0 || paymentMethod != 'cash')) ||
        (expectedUnitPricesMmk != null && paymentMethod != 'cash') ||
        (expectedProductNames != null && paymentMethod != 'cash') ||
        (cashCheckoutSubjectId != null && paymentMethod != 'cash') ||
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
    final checkoutFingerprint = paymentMethod == 'cash'
        ? selectedMember == null && cashTenderedMmk == null
              ? jsonEncode(fingerprintLines)
              : jsonEncode({
                  'cashTenderedMmk': ?cashTenderedMmk,
                  if (selectedMember != null) ...{
                    'memberId': selectedMember.memberId,
                    'memberCardRevision': selectedMember.cardRevision,
                  },
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
    final fingerprint = connectedStockReservation == null
        ? checkoutFingerprint
        : jsonEncode({
            'checkoutFingerprint': checkoutFingerprint,
            'connectedReservation': connectedStockReservation.toJson(),
            'saleOperationId': cleanOperationId,
          });

    return transaction(() async {
      await _authorizeManagedStaffCommand(
        authorizer: staffAuthorizer,
        capability: ShopStaffCapability.counterSale,
        commandId: cleanOperationId,
        expectedVersion: 0,
        claimedActorId: staffActorId,
      );
      await _rejectHeldSaleOperation(cleanOperationId);
      if (paymentMethod != 'cash' &&
          await readPendingCashCheckout(
                checkoutKind: 'counter',
                subjectId: cleanOperationId,
              ) !=
              null) {
        throw StateError(
          'Cancel the pending cash checkout before confirming a wallet payment.',
        );
      }
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
        final committedRows = await customSelect(
          'SELECT transition_json FROM '
          'shop_connected_stock_reservation_transitions '
          "WHERE to_state = 'committed' AND sale_id = ?",
          variables: [Variable<String>(priorSale.id)],
        ).get();
        if (connectedStockReservation == null) {
          if (committedRows.isNotEmpty) {
            throw StateError(
              'The completed sale requires its connected reservation.',
            );
          }
        } else {
          if (committedRows.length != 1 ||
              committedRows.single.readNullable<String>('transition_json') ==
                  null) {
            throw StateError(
              'The connected reservation is not bound to this sale.',
            );
          }
          final transition = ConnectedStockReservationTransitionV1.fromJson(
            jsonDecode(committedRows.single.read<String>('transition_json')),
          );
          final saleCommandDigest = connectedSiteSha256({
            'operationId': cleanOperationId,
            'requestFingerprint': fingerprint,
          });
          if (canonicalConnectedSiteJson(transition.before.toJson()) !=
                  canonicalConnectedSiteJson(
                    connectedStockReservation.toJson(),
                  ) ||
              transition.saleBinding?.saleId != priorSale.id ||
              transition.saleBinding?.saleCommandId != cleanOperationId ||
              transition.saleBinding?.saleCommandDigest != saleCommandDigest) {
            throw StateError(
              'The connected reservation is not bound to this sale.',
            );
          }
        }
        await clearCounterSaleDraft(cleanOperationId);
        return ShopSaleReceipt(
          id: priorSale.id,
          operationId: priorSale.operationId,
          totalMmk: priorSale.totalMmk,
          createdAtMillis: priorSale.createdAtMillis,
          paymentMethod: priorSale.paymentMethod,
          cashTenderedMmk: priorSale.cashTenderedMmk,
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

      if (cashCheckoutSubjectId != null) {
        final pendingCash = await requirePendingCashCheckout(
          operationId: cleanOperationId,
          checkoutKind: 'counter',
          subjectId: cashCheckoutSubjectId,
        );
        await _requireConnectedTenderReservationBinding(
          operationId: cleanOperationId,
          tenderKind: 'cash',
          reservation: connectedStockReservation,
        );
        if (pendingCash.memberId != selectedMember?.memberId ||
            pendingCash.memberCardRevision != selectedMember?.cardRevision) {
          throw StateError(
            'The pending cash checkout member changed. Cancel it and review the basket.',
          );
        }
        final draft = await readCounterSaleDraft();
        if (draft == null ||
            draft.operationId != cashCheckoutSubjectId ||
            draft.quantities.length != productQuantities.length ||
            productQuantities.entries.any(
              (entry) => draft.quantities[entry.key] != entry.value,
            )) {
          throw StateError(
            'The pending cash checkout does not match the saved basket.',
          );
        }
      }

      final connectedNow = connectedStockReservation == null
          ? null
          : await validateConnectedStockReservationForSale(
              reservation: connectedStockReservation,
              operationId: cleanOperationId,
              workflowType: ConnectedStockWorkflowType.retailCart,
              capability: ShopStaffCapability.counterSale,
              subjectId: cashCheckoutSubjectId ?? cleanOperationId,
              productQuantities: productQuantities,
              timeAuthority: connectedTimeAuthority,
            );

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
        await _requireConnectedTenderReservationBinding(
          operationId: cleanWalletCheckoutId,
          tenderKind: 'wallet',
          reservation: connectedStockReservation,
        );
        final expectedIntentFingerprint = jsonEncode({
          'paymentMethod': paymentMethod,
          if (selectedMember case final member?) ...{
            'memberId': member.memberId,
            'memberCardRevision': member.cardRevision,
          },
          'lines': fingerprintLines,
          if (connectedStockReservation != null)
            'connectedReservation': connectedStockReservation.toJson(),
        });
        if (intent.paymentMethod != paymentMethod ||
            intent.requestFingerprint != expectedIntentFingerprint) {
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
      if (cashTenderedMmk != null && cashTenderedMmk < totalMmk) {
        throw StateError('Cash received is less than the sale total.');
      }
      if (walletIntentTotalMmk != null && totalMmk != walletIntentTotalMmk) {
        throw StateError('The saved wallet amount does not match this sale.');
      }

      final activeShift = await readOpenCashShift();
      if (activeShift != null && paymentMethod == 'cash') {
        final review = await readCashShiftReview(activeShift.id);
        final grossCashBeforeSale =
            activeShift.openingFloatMmk +
            review.cashSalesTotalMmk +
            review.cashInTotalMmk;
        if (totalMmk > 200000000000000 - grossCashBeforeSale) {
          throw StateError(
            'This cash shift reached its supported limit. Close the shift '
            'before recording another cash sale.',
          );
        }
      }
      final now = _saleAndCashShiftNowMillis();
      final saleId = cleanOperationId;
      await into(shopSales).insert(
        ShopSalesCompanion.insert(
          id: saleId,
          operationId: cleanOperationId,
          requestFingerprint: fingerprint,
          totalMmk: totalMmk,
          paymentMethod: Value(paymentMethod),
          cashTenderedMmk: Value(cashTenderedMmk),
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
        final reservedByOthers = await _readTotalReservedStockQuantity(
          product.id,
          excludingConnectedReservationId:
              connectedStockReservation?.reservationId,
          excludingPendingCashOperationId: cashCheckoutSubjectId == null
              ? null
              : cleanOperationId,
          excludingWalletOperationId: cleanWalletCheckoutId,
        );
        final requiredOnHand = quantity + reservedByOthers;
        final changedRows = await customUpdate(
          'UPDATE shop_products '
          'SET on_hand = on_hand - ?, updated_at_millis = ? '
          'WHERE id = ? AND on_hand >= ? AND (archived = 0 OR ? = 1)',
          variables: [
            Variable<int>(quantity),
            Variable<int>(now),
            Variable<String>(product.id),
            Variable<int>(requiredOnHand),
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
            if (cashTenderedMmk != null) ...{
              'cashTenderedMmk': cashTenderedMmk,
              'cashChangeMmk': cashTenderedMmk - totalMmk,
            },
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
      if (cashCheckoutSubjectId != null) {
        await consumePendingCashCheckout(
          operationId: cleanOperationId,
          checkoutKind: 'counter',
          subjectId: cashCheckoutSubjectId,
        );
      }
      if (connectedStockReservation != null) {
        final saleCommandDigest = connectedSiteSha256({
          'operationId': cleanOperationId,
          'requestFingerprint': fingerprint,
        });
        await commitConnectedStockReservationForSale(
          reservation: connectedStockReservation,
          saleId: saleId,
          saleCommandId: cleanOperationId,
          saleCommandDigest: saleCommandDigest,
          workflowType: ConnectedStockWorkflowType.retailCart,
          capability: ShopStaffCapability.counterSale,
          subjectId: cashCheckoutSubjectId ?? cleanOperationId,
          productQuantities: productQuantities,
          validatedNowMillis: connectedNow!,
        );
      }
      await clearCounterSaleDraft(cleanOperationId);
      return ShopSaleReceipt(
        id: saleId,
        operationId: cleanOperationId,
        totalMmk: totalMmk,
        createdAtMillis: now,
        paymentMethod: paymentMethod,
        cashTenderedMmk: cashTenderedMmk,
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
    ShopSaleHistoryFilter filter = ShopSaleHistoryFilter.all,
  }) async {
    if (limit < 1 || limit > 100) {
      throw ArgumentError.value(limit, 'limit', 'Use between 1 and 100 sales.');
    }
    if (offset < 0) {
      throw ArgumentError.value(offset, 'offset', 'Use a non-negative offset.');
    }
    final search = query.trim();
    final conditions = <String>[];
    final variables = <Variable>[];
    if (search.isNotEmpty) {
      conditions.add(
        '(instr(lower(sale.id), lower(?)) > 0 OR EXISTS '
        '(SELECT 1 FROM shop_sale_lines AS line '
        'WHERE line.sale_id = sale.id '
        'AND instr(lower(line.product_name), lower(?)) > 0))',
      );
      variables.addAll([
        Variable.withString(search),
        Variable.withString(search),
      ]);
    }
    switch (filter) {
      case ShopSaleHistoryFilter.all:
        break;
      case ShopSaleHistoryFilter.cash:
      case ShopSaleHistoryFilter.kbzpay:
      case ShopSaleHistoryFilter.wavepay:
        conditions.add('sale.payment_method = ?');
        variables.add(Variable.withString(filter.name));
        break;
      case ShopSaleHistoryFilter.reversed:
        conditions.add('reversal.sale_id IS NOT NULL');
    }
    final matchingIds = await customSelect(
      'SELECT sale.id FROM shop_sales AS sale '
      'LEFT JOIN shop_sale_reversals AS reversal '
      'ON reversal.sale_id = sale.id '
      '${conditions.isEmpty ? '' : 'WHERE ${conditions.join(' AND ')} '} '
      'ORDER BY COALESCE(reversal.created_at_millis, sale.created_at_millis) DESC, '
      'sale.id DESC LIMIT ? OFFSET ?',
      variables: [
        ...variables,
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
          cashTenderedMmk: sale.cashTenderedMmk,
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
