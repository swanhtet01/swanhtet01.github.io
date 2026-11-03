import 'package:crypto/crypto.dart' as crypto;
import 'package:cryptography/cryptography.dart';
import 'package:supermega_shop/shop_connected_cloud_feed_v41_verifier.dart';

/// Public test pins derived only from source-controlled synthetic seeds.
/// Never reconstruct these pins from a database, artifact, or environment.
Future<ShopCloudFeedV41FirstPageTrust> v41ProcessFixtureTrust() async {
  Future<List<int>> publicKey(int seed) async =>
      (await (await Ed25519().newKeyPairFromSeed(
        List.filled(32, seed),
      )).extractPublicKey()).bytes;

  final clientKey = await publicKey(18);
  final fingerprint = crypto.sha256.convert(clientKey).toString();
  return ShopCloudFeedV41FirstPageTrust(
    workspaceId: 'workspace_v41_fixture',
    siteId: 'site_v41_fixture',
    actorId: 'actor_fixture',
    deviceId: 'device_v41_fixture',
    coordinatorDeviceId: 'counter_v41_fixture',
    clientFingerprint: fingerprint,
    clientSigningKeyId: fingerprint,
    sessionGeneration: 1,
    authoritySequence: 1,
    revocationGeneration: 1,
    cloudIssuerGeneration: 1,
    coordinatorBindingDigest: 'c' * 64,
    coordinatorBindingGeneration: 1,
    timeAuthorityKeyId: 'time_fixture',
    timeAuthorityKeyGeneration: 1,
    timeAuthorityEpoch: 1,
    feedIssuerKeys: {'feed_fixture': await publicKey(23)},
    cloudApprovalIssuerKeys: {'cloud_fixture': await publicKey(22)},
    leaseIssuerKeys: {'lease_fixture': await publicKey(20)},
    authorityIssuerKeys: {'authority_fixture': await publicKey(19)},
    ownerIssuerKeys: {'owner_fixture': await publicKey(17)},
    timeAuthorityKeys: {'time_fixture': await publicKey(21)},
    clientKeys: {fingerprint: clientKey},
  );
}
