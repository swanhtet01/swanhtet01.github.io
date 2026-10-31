/// Managed staff roles understood by the native Shop policy.
///
/// These names are policy inputs only. A caller-provided role is never proof
/// of authority; [ShopStaffCommandAuthorizer] must obtain the current role from
/// a trusted, session-bound managed identity before returning successfully.
enum ShopStaffRole {
  owner,
  manager,
  cashierCounter,
  stockStaff,
  cafeWaiter,
  cafeKitchenBar,
}

/// Smallest operational capabilities shared by retail and cafe stores.
enum ShopStaffCapability {
  counterSale,
  stockChange,
  productDetailsWrite,
  cashShiftManage,
  cafeOrderWrite,
  cafeKitchenStatus,
  cafeCashComplete,
  managementRead,
}

/// Role-to-capability mapping. This is not an authentication mechanism.
abstract final class ShopStaffRolePolicy {
  static bool allows(ShopStaffRole role, ShopStaffCapability capability) {
    return switch (role) {
      ShopStaffRole.owner || ShopStaffRole.manager => true,
      ShopStaffRole.cashierCounter => const {
        ShopStaffCapability.counterSale,
        ShopStaffCapability.cashShiftManage,
        ShopStaffCapability.cafeCashComplete,
      }.contains(capability),
      ShopStaffRole.stockStaff => capability == ShopStaffCapability.stockChange,
      ShopStaffRole.cafeWaiter =>
        capability == ShopStaffCapability.cafeOrderWrite,
      ShopStaffRole.cafeKitchenBar =>
        capability == ShopStaffCapability.cafeKitchenStatus,
    };
  }
}

/// Exact store command which a trusted managed-session adapter must approve.
///
/// The adapter must bind its current actor, membership, role, session
/// generation, revocation state and server time to [workspaceId]. It must also
/// reject offline use until a separately reviewed signed offline-grant contract
/// exists. The native app intentionally has no such production adapter yet.
class ShopStaffCommandAuthorizationRequest {
  const ShopStaffCommandAuthorizationRequest({
    required this.workspaceId,
    required this.storeRef,
    required this.storeBindingActorId,
    required this.claimedActorId,
    required this.commandId,
    required this.capability,
    required this.expectedVersion,
  });

  final String workspaceId;
  final String storeRef;

  /// Actor that irreversibly attached this local store. It identifies the
  /// binding provenance; it does not imply that every command is by that actor.
  final String storeBindingActorId;
  final String? claimedActorId;
  final String commandId;
  final ShopStaffCapability capability;
  final int expectedVersion;
}

/// Trusted boundary for managed staff commands.
///
/// Implementations must fail closed. Raw role strings, local preferences and a
/// bearer token without verified workspace membership are insufficient.
abstract interface class ShopStaffCommandAuthorizer {
  /// Checks a previously verified current session without network I/O.
  ///
  /// Any managed membership refresh must finish before a store transaction
  /// starts; this method deliberately cannot hold a SQLite transaction open
  /// while contacting a provider.
  void authorize(ShopStaffCommandAuthorizationRequest request);
}

class ShopStaffCommandAuthorizationUnavailable
    implements ShopStaffCommandAuthorizer {
  const ShopStaffCommandAuthorizationUnavailable();

  @override
  void authorize(ShopStaffCommandAuthorizationRequest request) {
    throw const ShopStaffAuthorizationException(
      'shop_staff_authorization_unavailable',
    );
  }
}

/// One already-verified staff actor plus the adapter that rechecks commands.
///
/// This value does not authenticate a caller. Production code may construct an
/// active context only from a trusted managed-session service which has already
/// verified membership, role, generation and revocation state. Keeping the
/// actor and authorizer together prevents screens from accidentally forwarding
/// only a role label or bearer identity. The default remains fail closed.
class ShopStaffCommandContext {
  const ShopStaffCommandContext.active({
    required this.actorId,
    required this.authorizer,
  }) : assert(actorId != '');

  const ShopStaffCommandContext.unavailable()
    : actorId = null,
      authorizer = const ShopStaffCommandAuthorizationUnavailable();

  final String? actorId;
  final ShopStaffCommandAuthorizer authorizer;
}

class ShopStaffAuthorizationException implements Exception {
  const ShopStaffAuthorizationException(this.code);

  final String code;

  @override
  String toString() => code;
}
