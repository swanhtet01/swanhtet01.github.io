import 'dart:convert';

import 'package:crypto/crypto.dart' as crypto;

import 'shop_correction_receipt.dart';

const shopCorrectionLineageContract = 'supermega.shop.correction-lineage.v1';
const shopCorrectionConsumptionContract =
    'supermega.shop.correction-consumption.v1';

final _uuid = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
);
final _digest = RegExp(r'^[0-9a-f]{64}$');
final _keyId = RegExp(r'^[a-z0-9][a-z0-9._-]{0,31}$');
final _signature = RegExp(r'^[A-Za-z0-9_-]{86}$');
final _identifier = RegExp(r'^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$');

class ShopCorrectionLineage {
  const ShopCorrectionLineage({
    required this.activationRequestId,
    required this.workspaceId,
    required this.actorId,
    required this.lineageId,
    required this.lineageEpoch,
    required this.previousLineageId,
    required this.previousLineageEpoch,
    required this.consumptionOrdinal,
    required this.consumptionDigest,
    required this.activatedAtMillis,
  });

  final String activationRequestId;
  final String workspaceId;
  final String actorId;
  final String lineageId;
  final int lineageEpoch;
  final String? previousLineageId;
  final int? previousLineageEpoch;
  final int consumptionOrdinal;
  final String? consumptionDigest;
  final int activatedAtMillis;

  bool get isStructurallyValid =>
      _uuid.hasMatch(activationRequestId) &&
      _identifier.hasMatch(workspaceId) &&
      _identifier.hasMatch(actorId) &&
      _uuid.hasMatch(lineageId) &&
      lineageEpoch >= 1 &&
      ((lineageEpoch == 1 &&
              previousLineageId == null &&
              previousLineageEpoch == null) ||
          (lineageEpoch > 1 &&
              previousLineageId != null &&
              _uuid.hasMatch(previousLineageId!) &&
              previousLineageId != lineageId &&
              previousLineageEpoch == lineageEpoch - 1)) &&
      consumptionOrdinal >= 0 &&
      ((consumptionOrdinal == 0 && consumptionDigest == null) ||
          (consumptionOrdinal > 0 &&
              consumptionDigest != null &&
              _digest.hasMatch(consumptionDigest!))) &&
      activatedAtMillis > 0;
}

class ShopCorrectionConsumptionProof {
  const ShopCorrectionConsumptionProof({
    required this.consumptionId,
    required this.consumptionRequestId,
    required this.authorizationReceiptId,
    required this.authorizationReceiptDigest,
    required this.workspaceId,
    required this.actorId,
    required this.capability,
    required this.semanticTargetId,
    required this.commandDigest,
    required this.lineageId,
    required this.lineageEpoch,
    required this.consumptionOrdinal,
    required this.previousConsumptionDigest,
    required this.historyDigest,
    required this.consumedAtMillis,
    required this.keyId,
    required this.signature,
  });

  final String consumptionId;
  final String consumptionRequestId;
  final String authorizationReceiptId;
  final String authorizationReceiptDigest;
  final String workspaceId;
  final String actorId;
  final String capability;
  final String semanticTargetId;
  final String commandDigest;
  final String lineageId;
  final int lineageEpoch;
  final int consumptionOrdinal;
  final String? previousConsumptionDigest;
  final String historyDigest;
  final int consumedAtMillis;
  final String keyId;
  final String signature;

  String recomputeHistoryDigest() {
    final projection = jsonEncode(<String, Object?>{
      'consumptionId': consumptionId,
      'consumptionRequestId': consumptionRequestId,
      'authorizationReceiptId': authorizationReceiptId,
      'authorizationReceiptDigest': authorizationReceiptDigest,
      'workspaceId': workspaceId,
      'actorId': actorId,
      'capability': capability,
      'semanticTargetId': semanticTargetId,
      'commandDigest': commandDigest,
      'lineageId': lineageId,
      'lineageEpoch': lineageEpoch,
      'consumptionOrdinal': consumptionOrdinal,
      'previousConsumptionDigest': previousConsumptionDigest,
      'consumedAtMillis': consumedAtMillis,
      'moneyMovementPerformed': false,
      'localMutationPerformed': false,
    });
    return crypto.sha256
        .convert(utf8.encode('$shopCorrectionConsumptionContract\n$projection'))
        .toString();
  }

  Future<bool> verify(ShopCorrectionReceiptVerifier verifier) async {
    if (!_uuid.hasMatch(consumptionId) ||
        !_uuid.hasMatch(consumptionRequestId) ||
        !_uuid.hasMatch(authorizationReceiptId) ||
        !_digest.hasMatch(authorizationReceiptDigest) ||
        !_identifier.hasMatch(workspaceId) ||
        !_identifier.hasMatch(actorId) ||
        !const {
          'shop.sale.reverse',
          'shop.sale.reconcile_wallet',
        }.contains(capability) ||
        semanticTargetId.isEmpty ||
        semanticTargetId.length > 120 ||
        !_digest.hasMatch(commandDigest) ||
        !_uuid.hasMatch(lineageId) ||
        lineageEpoch < 1 ||
        consumptionOrdinal < 1 ||
        !((consumptionOrdinal == 1 && previousConsumptionDigest == null) ||
            (consumptionOrdinal > 1 &&
                previousConsumptionDigest != null &&
                _digest.hasMatch(previousConsumptionDigest!))) ||
        !_digest.hasMatch(historyDigest) ||
        consumedAtMillis <= 0 ||
        !_keyId.hasMatch(keyId) ||
        !_signature.hasMatch(signature) ||
        historyDigest != recomputeHistoryDigest()) {
      return false;
    }
    return verifier.verifySignedDigest(
      keyId: keyId,
      digest: historyDigest,
      signature: signature,
    );
  }
}

class ShopCorrectionReconciliationStatus {
  const ShopCorrectionReconciliationStatus({
    required this.workspaceId,
    required this.requestedLineageId,
    required this.requestedLineageEpoch,
    required this.activeLineageId,
    required this.activeLineageEpoch,
    required this.serverConsumptionOrdinal,
    required this.serverConsumptionDigest,
    required this.localConsumptionOrdinal,
    required this.localConsumptionDigest,
    required this.state,
  });

  final String workspaceId;
  final String requestedLineageId;
  final int requestedLineageEpoch;
  final String activeLineageId;
  final int activeLineageEpoch;
  final int serverConsumptionOrdinal;
  final String? serverConsumptionDigest;
  final int localConsumptionOrdinal;
  final String? localConsumptionDigest;
  final String state;
}

class ShopLocalCorrectionLineageState {
  const ShopLocalCorrectionLineageState({
    required this.lineage,
    required this.lifecycleState,
  });

  final ShopCorrectionLineage lineage;
  final String lifecycleState;

  bool get canConsume => lifecycleState == 'active';
}

class ShopCorrectionConsumptionIntent {
  const ShopCorrectionConsumptionIntent({
    required this.consumptionRequestId,
    required this.localOperationId,
    required this.authorizationReceiptId,
    required this.authorizationReceiptDigest,
    required this.workspaceId,
    required this.actorId,
    required this.capability,
    required this.semanticTargetId,
    required this.commandDigest,
    required this.lineageId,
    required this.lineageEpoch,
    required this.createdAtMillis,
    this.recoveryEnvelopeJson,
  });

  final String consumptionRequestId;
  final String localOperationId;
  final String authorizationReceiptId;
  final String authorizationReceiptDigest;
  final String workspaceId;
  final String actorId;
  final String capability;
  final String semanticTargetId;
  final String commandDigest;
  final String lineageId;
  final int lineageEpoch;
  final int createdAtMillis;
  final String? recoveryEnvelopeJson;
}

ShopCorrectionAuthorization? shopFullSaleRecoveryAuthorization(
  String? encoded, {
  required String localOperationId,
  required String authorizationReceiptId,
  required String authorizationReceiptDigest,
  required String workspaceId,
  required String actorId,
  required String capability,
  required String semanticTargetId,
  required String commandDigest,
}) {
  if (encoded == null || capability != 'shop.sale.reverse') return null;
  try {
    final decoded = jsonDecode(encoded);
    if (decoded is! Map<String, dynamic> ||
        jsonEncode(decoded) != encoded ||
        decoded.length != 3 ||
        decoded['contract'] !=
            'supermega.shop.full-sale-correction-recovery.v1' ||
        decoded['command'] is! Map<String, dynamic> ||
        decoded['authorization'] is! Map<String, dynamic>) {
      return null;
    }
    final command = decoded['command'] as Map<String, dynamic>;
    final authorization = decoded['authorization'] as Map<String, dynamic>;
    const commandKeys = {
      'operationId',
      'saleId',
      'saleSnapshotDigest',
      'requestFingerprint',
      'commandDigest',
      'originalTotalMmk',
      'originalPaymentMethod',
      'restockItems',
      'reason',
      'cashReturnConfirmed',
      'expectedCashShiftId',
      'paymentResolution',
    };
    const authorizationKeys = {
      'contract',
      'receiptId',
      'receiptDigest',
      'workspaceId',
      'actorId',
      'actorLabel',
      'actorRole',
      'capability',
      'source',
      'commandDigest',
      'finalizationRequestId',
      'finalizedAtMillis',
      'issuedAtMillis',
      'expiresAtMillis',
      'keyId',
      'signature',
    };
    if (command.length != commandKeys.length ||
        !command.keys.toSet().containsAll(commandKeys) ||
        authorization.length != authorizationKeys.length ||
        !authorization.keys.toSet().containsAll(authorizationKeys)) {
      return null;
    }
    final fingerprint = command['requestFingerprint'];
    if (command['operationId'] != localOperationId ||
        command['saleId'] != semanticTargetId ||
        command['commandDigest'] != commandDigest ||
        fingerprint is! String ||
        crypto.sha256.convert(utf8.encode(fingerprint)).toString() !=
            commandDigest ||
        command['saleSnapshotDigest'] is! String ||
        command['originalTotalMmk'] is! int ||
        command['originalPaymentMethod'] is! String ||
        command['restockItems'] is! bool ||
        command['reason'] is! String ||
        command['cashReturnConfirmed'] is! bool ||
        command['paymentResolution'] is! String ||
        (command['expectedCashShiftId'] != null &&
            command['expectedCashShiftId'] is! String) ||
        authorization['contract'] !=
            shopCorrectionAuthorizationReceiptContract ||
        authorization['receiptId'] != authorizationReceiptId ||
        authorization['receiptDigest'] != authorizationReceiptDigest ||
        authorization['workspaceId'] != workspaceId ||
        authorization['actorId'] != actorId ||
        authorization['actorLabel'] is! String ||
        authorization['actorRole'] != 'owner' ||
        authorization['capability'] != capability ||
        authorization['source'] != 'managed_membership_receipt_v1' ||
        authorization['commandDigest'] != commandDigest ||
        authorization['finalizationRequestId'] is! String ||
        authorization['finalizedAtMillis'] is! int ||
        authorization['issuedAtMillis'] is! int ||
        authorization['expiresAtMillis'] is! int ||
        authorization['keyId'] is! String ||
        authorization['signature'] is! String) {
      return null;
    }
    final result = ShopCorrectionAuthorization(
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
      finalizationRequestId: authorization['finalizationRequestId'] as String,
      finalizedAtMillis: authorization['finalizedAtMillis'] as int,
      issuedAtMillis: authorization['issuedAtMillis'] as int,
      expiresAtMillis: authorization['expiresAtMillis'] as int,
      keyId: authorization['keyId'] as String,
      signature: authorization['signature'] as String,
    );
    return shopCorrectionAuthorizationReceiptDigestMatches(
          receiptDigest: result.receiptDigest,
          source: result.source,
          receiptId: result.receiptId,
          workspaceId: result.workspaceId,
          actorId: result.actorId,
          actorLabel: result.actorLabel,
          actorRole: result.actorRole,
          capability: result.capability,
          commandDigest: result.commandDigest,
          finalizationRequestId: result.finalizationRequestId!,
          finalizedAtMillis: result.finalizedAtMillis!,
          issuedAtMillis: result.issuedAtMillis,
          expiresAtMillis: result.expiresAtMillis,
        )
        ? result
        : null;
  } on Object {
    return null;
  }
}

/// Synthetic tests implement this boundary without opening network access.
/// The production HTTP adapter remains unavailable until the global server
/// gate and reviewed public-key pins are deliberately enabled.
abstract interface class ShopCorrectionConsumptionGateway {
  Future<ShopCorrectionLineage> activateLineage({
    required String activationRequestId,
    required String lineageId,
    required String? expectedPreviousLineageId,
    required int? expectedPreviousLineageEpoch,
    required int localConsumptionOrdinal,
    required String? localConsumptionDigest,
  });

  Future<ShopCorrectionConsumptionProof> consume({
    required String consumptionRequestId,
    required ShopCorrectionAuthorization authorization,
    required String lineageId,
    required int lineageEpoch,
    required String semanticTargetId,
  });

  Future<ShopCorrectionReconciliationStatus> status({
    required String lineageId,
    required int lineageEpoch,
    required int localConsumptionOrdinal,
    required String? localConsumptionDigest,
  });
}
