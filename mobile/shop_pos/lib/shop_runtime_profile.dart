import 'shop_build_identity.g.dart';

enum ShopRuntimeProfile {
  production,
  syntheticQa;

  static ShopRuntimeProfile resolve() =>
      ShopRuntimeConfiguration.fromEnvironment().profile;
}

class ShopRuntimeCapabilities {
  const ShopRuntimeCapabilities({
    required this.managedAuth,
    required this.correctionAuthorization,
    required this.connectedOrders,
    required this.networkPrinter,
    required this.camera,
    required this.gallery,
    required this.remoteImport,
    required this.externalFileSaving,
    required this.syntheticEvidence,
    required this.loopbackPrinter,
  });

  final bool managedAuth;
  final bool correctionAuthorization;
  final bool connectedOrders;
  final bool networkPrinter;
  final bool camera;
  final bool gallery;
  final bool remoteImport;
  final bool externalFileSaving;
  final bool syntheticEvidence;
  final bool loopbackPrinter;

  static const production = ShopRuntimeCapabilities(
    managedAuth: true,
    correctionAuthorization: true,
    connectedOrders: true,
    networkPrinter: true,
    camera: true,
    gallery: true,
    remoteImport: true,
    externalFileSaving: true,
    syntheticEvidence: false,
    loopbackPrinter: false,
  );

  static const syntheticQa = ShopRuntimeCapabilities(
    managedAuth: false,
    correctionAuthorization: false,
    connectedOrders: false,
    networkPrinter: false,
    camera: false,
    gallery: false,
    remoteImport: false,
    externalFileSaving: false,
    syntheticEvidence: true,
    loopbackPrinter: true,
  );
}

class ShopRuntimeConfiguration {
  const ShopRuntimeConfiguration._({
    required this.profile,
    required this.profileId,
    required this.platformIdentity,
    required this.capabilities,
  });

  static const qaRuntimeToken = 'synthetic_qa_v1';
  static const qaProfileId = 'synthetic-qa-v1';
  static const qaPlatformIdentities = <String>{
    'dev.supermega.supermega_shop.qa',
    'dev.supermega.supermegaShop.qa',
    'dev.supermega.supermega_shop.qa.windows',
  };

  final ShopRuntimeProfile profile;
  final String profileId;
  final String platformIdentity;
  final ShopRuntimeCapabilities capabilities;

  bool get isSyntheticQa => profile == ShopRuntimeProfile.syntheticQa;

  factory ShopRuntimeConfiguration.fromEnvironment() =>
      ShopRuntimeConfiguration.resolve(
        runtimeProfile: const String.fromEnvironment('SHOP_RUNTIME_PROFILE'),
        qaProfile: const String.fromEnvironment('SHOP_QA_PROFILE_ID'),
        buildIdentityProfile: shopBuildIdentityProfile,
        buildIdentityQaProfile: shopBuildIdentityQaProfileId,
        platformIdentity: shopBuildIdentityPlatformIdentity,
        supabaseUrl: const String.fromEnvironment('SUPABASE_URL'),
        supabaseKey: const String.fromEnvironment('SUPABASE_PUBLISHABLE_KEY'),
        apiBaseUrl: const String.fromEnvironment('SHOP_API_BASE_URL'),
        connectedOrders: const bool.fromEnvironment(
          'SHOP_CONNECTED_ORDERS_ENABLED',
        ),
      );

  factory ShopRuntimeConfiguration.resolve({
    required String runtimeProfile,
    required String qaProfile,
    required String buildIdentityProfile,
    required String buildIdentityQaProfile,
    required String platformIdentity,
    String supabaseUrl = '',
    String supabaseKey = '',
    String apiBaseUrl = '',
    bool connectedOrders = false,
  }) {
    final runtime = runtimeProfile.trim();
    final profileId = qaProfile.trim();
    final buildProfile = buildIdentityProfile.trim();
    final buildQaProfile = buildIdentityQaProfile.trim();
    final identity = platformIdentity.trim();
    final anyQaSignal =
        runtime.isNotEmpty ||
        profileId.isNotEmpty ||
        buildProfile != 'production' ||
        buildQaProfile.isNotEmpty;

    if (!anyQaSignal) {
      if (identity.isEmpty) {
        throw StateError('shop_build_identity_missing');
      }
      return ShopRuntimeConfiguration._(
        profile: ShopRuntimeProfile.production,
        profileId: '',
        platformIdentity: identity,
        capabilities: ShopRuntimeCapabilities.production,
      );
    }

    final exactQaTuple =
        runtime == qaRuntimeToken &&
        profileId == qaProfileId &&
        buildProfile == qaRuntimeToken &&
        buildQaProfile == qaProfileId &&
        qaPlatformIdentities.contains(identity);
    if (!exactQaTuple) {
      throw StateError('shop_runtime_profile_unknown_or_partial');
    }

    if (supabaseUrl.trim().isNotEmpty ||
        supabaseKey.trim().isNotEmpty ||
        apiBaseUrl.trim().isNotEmpty ||
        connectedOrders) {
      throw StateError('shop_qa_external_io_forbidden');
    }
    return ShopRuntimeConfiguration._(
      profile: ShopRuntimeProfile.syntheticQa,
      profileId: qaProfileId,
      platformIdentity: identity,
      capabilities: ShopRuntimeCapabilities.syntheticQa,
    );
  }
}
