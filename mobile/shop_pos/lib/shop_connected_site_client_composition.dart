import 'shop_connected_platform_security.dart';
import 'shop_connected_site_attempt_store.dart';
import 'shop_connected_site_client.dart';
import 'shop_connected_site_contracts.dart';
import 'shop_connected_site_device_signer.dart';
import 'shop_connected_site_replica_store.dart';
import 'shop_database.dart';

/// Explicit dependencies for one joining-device LAN client.
///
/// No dependency is discovered from ambient state. In particular, this does
/// not create keys, import coordinator approval, issue staff leases, or enable
/// connected operation in a shipping profile.
class ShopConnectedSiteClientDependencies {
  const ShopConnectedSiteClientDependencies({
    required this.database,
    required this.pairing,
    required this.approvedBindingDigest,
    required this.deviceId,
    required this.identity,
    required this.platformSecurity,
    required this.approvalVerifier,
    this.transport = const DartIoConnectedSiteHttpTransport(),
    required this.now,
    this.nonce,
  });

  final ShopDatabase database;
  final CoordinatorPairingV1 pairing;
  final String approvedBindingDigest;
  final String deviceId;
  final ConnectedPlatformIdentity identity;
  final ConnectedPlatformSecurity platformSecurity;
  final ConnectedCoordinatorApprovalVerifier approvalVerifier;
  final ConnectedSiteHttpTransport transport;
  final DateTime Function() now;
  final String Function()? nonce;
}

/// Default-off composition receipt for a secondary/joining Shop device.
class ShopConnectedSiteClientComposition {
  const ShopConnectedSiteClientComposition._(this.runtime);

  final ShopConnectedSiteClientRuntime? runtime;
  bool get enabled => runtime != null;

  /// [dependencies] is deliberately lazy: a disabled profile cannot load a
  /// platform identity, open the database, or construct a network transport.
  static ShopConnectedSiteClientComposition resolve({
    required bool connectedSiteEnabled,
    ShopConnectedSiteClientDependencies Function()? dependencies,
  }) {
    if (!connectedSiteEnabled || dependencies == null) {
      return const ShopConnectedSiteClientComposition._(null);
    }
    final input = dependencies();
    final signer = ConnectedPlatformDeviceSigner(
      identity: input.identity,
      deviceId: input.deviceId,
      platformSecurity: input.platformSecurity,
    );
    final attempts = ShopConnectedSiteAttemptStore(
      database: input.database,
      approvalVerifier: input.approvalVerifier,
      runtimeEnabled: true,
      now: input.now,
    );
    final client = SiteCoordinatorClient(
      pairing: input.pairing,
      bindingDigest: input.approvedBindingDigest,
      signer: signer,
      attempts: attempts,
      transport: input.transport,
      runtimeEnabled: true,
      now: input.now,
      nonce: input.nonce,
    );
    final replica = ShopConnectedSiteReplicaStore(
      database: input.database,
      localWorkspaceId: input.pairing.workspaceId,
      localSiteId: input.pairing.siteId,
      localClientDeviceId: input.deviceId,
      localClientFingerprint: signer.clientFingerprint,
      localClientSigningKeyId: signer.signingKeyId,
      approvedBindingDigest: input.approvedBindingDigest,
      bindingResolver: attempts,
      runtimeEnabled: true,
    );
    return ShopConnectedSiteClientComposition._(
      ShopConnectedSiteClientRuntime._(
        pairing: input.pairing,
        bindingDigest: input.approvedBindingDigest,
        signer: signer,
        attempts: attempts,
        client: client,
        replica: replica,
        now: input.now,
      ),
    );
  }
}

/// Narrow, read-only replica synchronization boundary.
///
/// It exposes no tender, shift, correction, receipt, or authoritative stock
/// mutation API. Every fetch is bracketed by approval resolution; the replica
/// store performs the second resolution inside its transaction before applying
/// the untrusted response.
class ShopConnectedSiteClientRuntime {
  const ShopConnectedSiteClientRuntime._({
    required this._pairing,
    required this._bindingDigest,
    required this._signer,
    required this._attempts,
    required this._client,
    required this._replica,
    required this._now,
  });

  final CoordinatorPairingV1 _pairing;
  final String _bindingDigest;
  final ConnectedSiteDeviceSigner _signer;
  final ConnectedSiteCommandAttemptStore _attempts;
  final SiteCoordinatorClient _client;
  final ShopConnectedSiteReplicaStore _replica;
  final DateTime Function() _now;

  Future<void> pair() => _client.pair();

  Future<int?> continuationCursor() => _replica.continuationCursor(
    workspaceId: _pairing.workspaceId,
    siteId: _pairing.siteId,
    clientFingerprint: _signer.clientFingerprint,
  );

  Future<bool> sharedWritesPaused() => _replica.sharedWritesPaused(
    workspaceId: _pairing.workspaceId,
    siteId: _pairing.siteId,
    clientFingerprint: _signer.clientFingerprint,
  );

  Future<List<Map<String, Object?>>> readProjections() =>
      _replica.readProjections(
        workspaceId: _pairing.workspaceId,
        siteId: _pairing.siteId,
        clientFingerprint: _signer.clientFingerprint,
      );

  Future<void> synchronizeOnce() async {
    try {
      final binding = await _requireExactBinding();
      final cursor = await _replica.continuationCursor(
        workspaceId: _pairing.workspaceId,
        siteId: _pairing.siteId,
        clientFingerprint: _signer.clientFingerprint,
      );
      if (cursor == null) {
        final snapshot = await _client.readSnapshot();
        await _replica.applySnapshot(
          snapshot: snapshot,
          clientFingerprint: _signer.clientFingerprint,
          certificateSha256: binding.certificateSha256,
          observedAtMillis: _now().toUtc().millisecondsSinceEpoch,
        );
      } else {
        final delta = await _client.readDelta(cursor);
        await _replica.applyDelta(
          delta: delta,
          clientFingerprint: _signer.clientFingerprint,
          certificateSha256: binding.certificateSha256,
          observedAtMillis: _now().toUtc().millisecondsSinceEpoch,
        );
      }
    } on Object {
      try {
        await _replica.markBindingUnavailable(
          workspaceId: _pairing.workspaceId,
          siteId: _pairing.siteId,
          clientFingerprint: _signer.clientFingerprint,
          observedAtMillis: _now().toUtc().millisecondsSinceEpoch,
        );
      } on Object {
        // A missing initial replica is already fail-closed. Preserve the
        // original synchronization error.
      }
      rethrow;
    }
  }

  Future<ConnectedSiteApprovedBinding> _requireExactBinding() async {
    final binding = await _attempts.resolveActiveBinding(
      bindingDigest: _bindingDigest,
      workspaceId: _pairing.workspaceId,
      siteId: _pairing.siteId,
      clientDeviceId: _signer.deviceId,
      clientFingerprint: _signer.clientFingerprint,
      clientSigningKeyId: _signer.signingKeyId,
    );
    if (binding.workspaceId != _pairing.workspaceId ||
        binding.siteId != _pairing.siteId ||
        binding.coordinatorDeviceId != _pairing.coordinatorDeviceId ||
        binding.address != _pairing.address ||
        binding.port != _pairing.port ||
        binding.certificateSha256 != _pairing.certificateSha256 ||
        binding.clientDeviceId != _signer.deviceId ||
        binding.clientFingerprint != _signer.clientFingerprint ||
        binding.clientSigningKeyId != _signer.signingKeyId) {
      throw StateError('connected_client_binding_substituted');
    }
    return binding;
  }
}
