/// The native Shop does not yet have a trusted plan/session entitlement
/// adapter. Kitchen dispatch therefore stays unavailable unless an already
/// verified capability decision is injected by a reviewed caller.
///
/// This seam is deliberately synchronous: a future managed adapter must verify
/// its server-authentic entitlement before entering the SQLite transaction. A
/// caller-provided tier name or boolean is not authority.
abstract interface class ShopCafeKitchenEntitlement {
  bool get allowsKitchenDispatch;

  void requireKitchenDispatch({
    required String orderId,
    required String commandId,
  });
}

class ShopCafeKitchenEntitlementUnavailable
    implements ShopCafeKitchenEntitlement {
  const ShopCafeKitchenEntitlementUnavailable();

  @override
  bool get allowsKitchenDispatch => false;

  @override
  void requireKitchenDispatch({
    required String orderId,
    required String commandId,
  }) {
    throw const ShopCafeKitchenEntitlementException(
      'shop_cafe_kitchen_entitlement_unavailable',
    );
  }
}

class ShopCafeKitchenEntitlementException implements Exception {
  const ShopCafeKitchenEntitlementException(this.code);

  final String code;

  @override
  String toString() => code;
}
