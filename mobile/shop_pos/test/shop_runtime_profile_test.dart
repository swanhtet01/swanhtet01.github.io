import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_runtime_profile.dart';

void main() {
  test('exact generated production tuple preserves production defaults', () {
    for (final identity
        in ShopRuntimeConfiguration.productionPlatformIdentities) {
      final profile = ShopRuntimeConfiguration.resolve(
        runtimeProfile: 'production',
        qaProfile: '',
        buildIdentityProfile: 'production',
        buildIdentityQaProfile: '',
        platformIdentity: identity,
        supabaseUrl: 'https://project.supabase.co',
        supabaseKey: 'public-test-value',
        apiBaseUrl: 'https://app.supermega.dev',
        connectedOrders: true,
      );

      expect(profile.profile, ShopRuntimeProfile.production);
      expect(profile.profileId, isEmpty);
      expect(profile.capabilities.networkPrinter, isTrue);
      expect(profile.capabilities.externalFileSaving, isTrue);
      expect(profile.capabilities.cashMovementAuthorization, isFalse);
    }
  });

  test('checked-in generated production identity starts without defines', () {
    final profile = ShopRuntimeConfiguration.fromEnvironment();

    expect(profile.profile, ShopRuntimeProfile.production);
    expect(profile.profileId, isEmpty);
    expect(profile.platformIdentity, 'production-current');
    expect(profile.capabilities.cashMovementAuthorization, isFalse);
  });

  test('exact generated QA tuple is fail-closed and synthetic only', () {
    for (final identity in ShopRuntimeConfiguration.qaPlatformIdentities) {
      final profile = _qaProfile(platformIdentity: identity);

      expect(profile.profile, ShopRuntimeProfile.syntheticQa);
      expect(profile.profileId, ShopRuntimeConfiguration.qaProfileId);
      expect(profile.capabilities.syntheticEvidence, isTrue);
      expect(profile.capabilities.loopbackPrinter, isTrue);
      expect(profile.capabilities.managedAuth, isFalse);
      expect(profile.capabilities.correctionAuthorization, isFalse);
      expect(profile.capabilities.cashMovementAuthorization, isFalse);
      expect(profile.capabilities.connectedOrders, isFalse);
      expect(profile.capabilities.networkPrinter, isFalse);
      expect(profile.capabilities.camera, isFalse);
      expect(profile.capabilities.gallery, isFalse);
      expect(profile.capabilities.remoteImport, isFalse);
      expect(profile.capabilities.externalFileSaving, isFalse);
    }
  });

  for (final mutation in <String, ShopRuntimeConfiguration Function()>{
    'missing runtime profile': () => _qaProfile(runtimeProfile: ''),
    'missing QA id': () => _qaProfile(qaProfile: ''),
    'production build identity': () =>
        _qaProfile(buildIdentityProfile: 'production'),
    'wrong generated QA id': () =>
        _qaProfile(buildIdentityQaProfile: 'synthetic-qa-v2'),
    'production platform identity': () =>
        _qaProfile(platformIdentity: 'production-current'),
    'unrecognized platform identity': () =>
        _qaProfile(platformIdentity: 'dev.example.unreviewed.qa'),
    'unknown runtime profile': () => _qaProfile(runtimeProfile: 'qa'),
  }.entries) {
    test('${mutation.key} is rejected', () {
      expect(mutation.value, throwsStateError);
    });
  }

  for (final mutation in <String, ShopRuntimeConfiguration Function()>{
    'Supabase URL': () => _qaProfile(supabaseUrl: 'https://example.test'),
    'Supabase key': () => _qaProfile(supabaseKey: 'public-test-value'),
    'API URL': () => _qaProfile(apiBaseUrl: 'https://app.supermega.dev'),
    'connected orders': () => _qaProfile(connectedOrders: true),
  }.entries) {
    test('QA rejects ${mutation.key}', () {
      expect(mutation.value, throwsStateError);
    });
  }

  test('unknown production identity is rejected', () {
    expect(
      () => ShopRuntimeConfiguration.resolve(
        runtimeProfile: 'production',
        qaProfile: '',
        buildIdentityProfile: 'production',
        buildIdentityQaProfile: '',
        platformIdentity: 'dev.example.unreviewed.production',
      ),
      throwsStateError,
    );
  });
}

ShopRuntimeConfiguration _qaProfile({
  String runtimeProfile = ShopRuntimeConfiguration.qaRuntimeToken,
  String qaProfile = ShopRuntimeConfiguration.qaProfileId,
  String buildIdentityProfile = ShopRuntimeConfiguration.qaRuntimeToken,
  String buildIdentityQaProfile = ShopRuntimeConfiguration.qaProfileId,
  String platformIdentity = 'dev.supermega.supermega_shop.qa',
  String supabaseUrl = '',
  String supabaseKey = '',
  String apiBaseUrl = '',
  bool connectedOrders = false,
}) => ShopRuntimeConfiguration.resolve(
  runtimeProfile: runtimeProfile,
  qaProfile: qaProfile,
  buildIdentityProfile: buildIdentityProfile,
  buildIdentityQaProfile: buildIdentityQaProfile,
  platformIdentity: platformIdentity,
  supabaseUrl: supabaseUrl,
  supabaseKey: supabaseKey,
  apiBaseUrl: apiBaseUrl,
  connectedOrders: connectedOrders,
);
