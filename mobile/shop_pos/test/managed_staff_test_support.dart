import 'package:supermega_shop/shop_database.dart';
import 'package:supermega_shop/shop_staff_authorization.dart';

/// Strict synthetic staff session for managed-store fixture setup only.
///
/// This never enters product code. It binds the exact persisted workspace,
/// store identity, attaching actor, claimed actor, and owner role so tests that
/// need managed correction history do not bypass the staff boundary implicitly.
Future<ShopStaffCommandAuthorizer> managedOwnerTestAuthorizer(
  ShopDatabase database,
) async {
  final binding = await database.readManagedWorkspaceBinding();
  if (binding == null) {
    throw StateError('The synthetic managed staff session needs a binding.');
  }
  return _ManagedOwnerTestAuthorizer(
    workspaceId: binding.workspaceId,
    storeRef: await database.readStoreRef(),
    bindingActorId: binding.attachedActorId,
  );
}

class _ManagedOwnerTestAuthorizer implements ShopStaffCommandAuthorizer {
  const _ManagedOwnerTestAuthorizer({
    required this.workspaceId,
    required this.storeRef,
    required this.bindingActorId,
  });

  final String workspaceId;
  final String storeRef;
  final String bindingActorId;

  @override
  void authorize(ShopStaffCommandAuthorizationRequest request) {
    if (request.workspaceId != workspaceId ||
        request.storeRef != storeRef ||
        request.storeBindingActorId != bindingActorId ||
        request.claimedActorId != bindingActorId ||
        !ShopStaffRolePolicy.allows(ShopStaffRole.owner, request.capability)) {
      throw const ShopStaffAuthorizationException(
        'synthetic_managed_owner_authorization_invalid',
      );
    }
  }
}

extension ManagedOwnerTestOperations on ShopDatabase {
  Future<ShopCashShift> openManagedTestCashShift({
    required String operationId,
    required String operatorLabel,
    required int openingFloatMmk,
  }) async {
    final binding = await readManagedWorkspaceBinding();
    if (binding == null) {
      return openCashShift(
        operationId: operationId,
        operatorLabel: operatorLabel,
        openingFloatMmk: openingFloatMmk,
      );
    }
    return openCashShift(
      operationId: operationId,
      operatorLabel: operatorLabel,
      openingFloatMmk: openingFloatMmk,
      staffActorId: binding.attachedActorId,
      staffAuthorizer: await managedOwnerTestAuthorizer(this),
    );
  }

  Future<ShopCashShift> closeManagedTestCashShift({
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
  }) async {
    final binding = await readManagedWorkspaceBinding();
    if (binding == null) {
      return closeCashShift(
        shiftId: shiftId,
        operationId: operationId,
        seenSaleCount: seenSaleCount,
        seenCashTotalMmk: seenCashTotalMmk,
        countedCashMmk: countedCashMmk,
        seenCashReversalCount: seenCashReversalCount,
        seenCashDrawerOutflowMmk: seenCashDrawerOutflowMmk,
        seenCashMovementCount: seenCashMovementCount,
        seenCashInTotalMmk: seenCashInTotalMmk,
        seenCashOutTotalMmk: seenCashOutTotalMmk,
      );
    }
    return closeCashShift(
      shiftId: shiftId,
      operationId: operationId,
      seenSaleCount: seenSaleCount,
      seenCashTotalMmk: seenCashTotalMmk,
      countedCashMmk: countedCashMmk,
      seenCashReversalCount: seenCashReversalCount,
      seenCashDrawerOutflowMmk: seenCashDrawerOutflowMmk,
      seenCashMovementCount: seenCashMovementCount,
      seenCashInTotalMmk: seenCashInTotalMmk,
      seenCashOutTotalMmk: seenCashOutTotalMmk,
      staffActorId: binding.attachedActorId,
      staffAuthorizer: await managedOwnerTestAuthorizer(this),
    );
  }

  Future<ShopSaleReceipt> recordManagedTestCashSale({
    required String operationId,
    required List<ShopSaleLineInput> lines,
    bool requirePendingCashCheckout = false,
  }) async {
    final binding = await readManagedWorkspaceBinding();
    if (binding == null) {
      return recordCashSale(
        operationId: operationId,
        lines: lines,
        requirePendingCashCheckout: requirePendingCashCheckout,
      );
    }
    return recordCashSale(
      operationId: operationId,
      lines: lines,
      requirePendingCashCheckout: requirePendingCashCheckout,
      staffActorId: binding.attachedActorId,
      staffAuthorizer: await managedOwnerTestAuthorizer(this),
    );
  }

  Future<ShopSaleReceipt> recordManagedTestSale({
    required String operationId,
    required List<ShopSaleLineInput> lines,
    required String paymentMethod,
    String? walletCheckoutOperationId,
    int? expectedTotalMmk,
    Map<String, int>? expectedUnitPricesMmk,
    Map<String, String>? expectedProductNames,
    String? memberCardToken,
    String? cashCheckoutSubjectId,
  }) async {
    final binding = await readManagedWorkspaceBinding();
    return recordSale(
      operationId: operationId,
      lines: lines,
      paymentMethod: paymentMethod,
      walletCheckoutOperationId: walletCheckoutOperationId,
      expectedTotalMmk: expectedTotalMmk,
      expectedUnitPricesMmk: expectedUnitPricesMmk,
      expectedProductNames: expectedProductNames,
      memberCardToken: memberCardToken,
      cashCheckoutSubjectId: cashCheckoutSubjectId,
      staffActorId: binding?.attachedActorId,
      staffAuthorizer: binding == null
          ? const ShopStaffCommandAuthorizationUnavailable()
          : await managedOwnerTestAuthorizer(this),
    );
  }
}
