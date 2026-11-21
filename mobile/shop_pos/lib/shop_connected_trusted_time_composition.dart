import 'shop_connected_trusted_time_contract.dart';
import 'shop_connected_trusted_time_store.dart';
import 'shop_database.dart';

final class ConnectedTrustedTimeScope {
  ConnectedTrustedTimeScope({
    required this.workspaceId,
    required this.siteId,
    required this.coordinatorDeviceId,
    required this.clientDeviceId,
    required this.clientFingerprint,
    required this.sessionGeneration,
    required this.coordinatorBindingDigest,
    required this.coordinatorBindingGeneration,
  }) {
    // Reuse the canonical protocol parser as the single scope grammar.
    ConnectedTrustedTimeChallengeV1(
      workspaceId: workspaceId,
      siteId: siteId,
      coordinatorDeviceId: coordinatorDeviceId,
      clientDeviceId: clientDeviceId,
      clientFingerprint: clientFingerprint,
      sessionGeneration: sessionGeneration,
      coordinatorBindingDigest: coordinatorBindingDigest,
      coordinatorBindingGeneration: coordinatorBindingGeneration,
      nonce: 'trusted_time_scope_validation_1',
      bootSessionId: '0' * 64,
      startedMonotonicMillis: 0,
    );
  }

  final String workspaceId;
  final String siteId;
  final String coordinatorDeviceId;
  final String clientDeviceId;
  final String clientFingerprint;
  final int sessionGeneration;
  final String coordinatorBindingDigest;
  final int coordinatorBindingGeneration;
}

abstract interface class ConnectedTrustedTimeObservationExchange {
  Future<ConnectedTrustedTimeObservationV1> observe({
    required ConnectedTrustedTimeAuthorityApprovalV1 approval,
    required ConnectedTrustedTimeChallengeV1 challenge,
  });
}

abstract interface class ConnectedTrustedTimeNonceSource {
  String createNonce();
}

final class ShopConnectedTrustedTimeDependencies {
  ShopConnectedTrustedTimeDependencies({
    required this.database,
    required this.scope,
    required this.approval,
    required this.verifier,
    required this.clock,
    required this.exchange,
    required this.nonceSource,
  }) {
    if (approval.workspaceId != scope.workspaceId ||
        approval.siteId != scope.siteId ||
        approval.coordinatorDeviceId != scope.coordinatorDeviceId ||
        approval.coordinatorBindingDigest != scope.coordinatorBindingDigest ||
        approval.coordinatorBindingGeneration !=
            scope.coordinatorBindingGeneration) {
      throw StateError('connected_trusted_time_composition_scope_mismatch');
    }
  }

  final ShopDatabase database;
  final ConnectedTrustedTimeScope scope;
  final ConnectedTrustedTimeAuthorityApprovalV1 approval;
  final ConnectedTrustedTimeAuthorityVerifier verifier;
  final ConnectedTrustedTimePlatformClock clock;
  final ConnectedTrustedTimeObservationExchange exchange;
  final ConnectedTrustedTimeNonceSource nonceSource;
}

final class ShopConnectedTrustedTimeComposition {
  const ShopConnectedTrustedTimeComposition._(this.runtime);

  final ShopConnectedTrustedTimeRuntime? runtime;
  bool get enabled => runtime != null;

  static ShopConnectedTrustedTimeComposition resolve({
    required bool connectedSiteEnabled,
    ShopConnectedTrustedTimeDependencies Function()? dependencies,
  }) {
    if (!connectedSiteEnabled) {
      return const ShopConnectedTrustedTimeComposition._(null);
    }
    if (dependencies == null) {
      throw StateError('connected_trusted_time_dependencies_required');
    }
    final input = dependencies();
    final approval = _snapshotApproval(input.approval);
    return ShopConnectedTrustedTimeComposition._(
      ShopConnectedTrustedTimeRuntime._(
        scope: input.scope,
        approval: approval,
        clock: input.clock,
        exchange: input.exchange,
        nonceSource: input.nonceSource,
        store: ShopConnectedTrustedTimeStore(
          database: input.database,
          clock: input.clock,
          verifier: input.verifier,
        ),
      ),
    );
  }
}

final class ShopConnectedTrustedTimeRuntime
    implements ShopConnectedSiteCoordinatorTimeAuthority {
  const ShopConnectedTrustedTimeRuntime._({
    required this._scope,
    required this._approval,
    required this._clock,
    required this._exchange,
    required this._nonceSource,
    required this._store,
  });

  final ConnectedTrustedTimeScope _scope;
  final ConnectedTrustedTimeAuthorityApprovalV1 _approval;
  final ConnectedTrustedTimePlatformClock _clock;
  final ConnectedTrustedTimeObservationExchange _exchange;
  final ConnectedTrustedTimeNonceSource _nonceSource;
  final ShopConnectedTrustedTimeStore _store;

  Future<ConnectedTrustedTimeAccepted> refresh() async {
    final challenge = ConnectedTrustedTimeChallengeV1(
      workspaceId: _scope.workspaceId,
      siteId: _scope.siteId,
      coordinatorDeviceId: _scope.coordinatorDeviceId,
      clientDeviceId: _scope.clientDeviceId,
      clientFingerprint: _scope.clientFingerprint,
      sessionGeneration: _scope.sessionGeneration,
      coordinatorBindingDigest: _scope.coordinatorBindingDigest,
      coordinatorBindingGeneration: _scope.coordinatorBindingGeneration,
      nonce: _nonceSource.createNonce(),
      bootSessionId: await _clock.bootSessionId(),
      startedMonotonicMillis: await _clock.monotonicMillis(),
    );
    final capability = await _store.retainChallenge(
      approval: _approval,
      challenge: challenge,
    );
    try {
      final observation = await _exchange.observe(
        approval: _approval,
        challenge: challenge,
      );
      return await _store.complete(
        capability: capability,
        approval: _approval,
        observation: observation,
      );
    } on Object {
      _store.abandon(capability);
      rethrow;
    }
  }

  Future<int?> effectiveTimeMillis() => _store.effectiveTimeMillis(
    workspaceId: _scope.workspaceId,
    siteId: _scope.siteId,
    coordinatorDeviceId: _scope.coordinatorDeviceId,
    clientDeviceId: _scope.clientDeviceId,
    clientFingerprint: _scope.clientFingerprint,
    sessionGeneration: _scope.sessionGeneration,
    coordinatorBindingDigest: _scope.coordinatorBindingDigest,
    coordinatorBindingGeneration: _scope.coordinatorBindingGeneration,
  );

  @override
  Future<int> readValidatedNowMillis({
    required String tenantId,
    required String siteId,
  }) async {
    if (tenantId != _scope.workspaceId || siteId != _scope.siteId) {
      throw StateError('connected_trusted_time_scope_mismatch');
    }
    final effective = await effectiveTimeMillis();
    if (effective == null) {
      throw StateError('connected_trusted_time_unavailable');
    }
    return effective;
  }
}

ConnectedTrustedTimeAuthorityApprovalV1 _snapshotApproval(
  ConnectedTrustedTimeAuthorityApprovalV1 approval,
) => ConnectedTrustedTimeAuthorityApprovalV1(
  workspaceId: approval.workspaceId,
  siteId: approval.siteId,
  coordinatorDeviceId: approval.coordinatorDeviceId,
  coordinatorBindingDigest: approval.coordinatorBindingDigest,
  coordinatorBindingGeneration: approval.coordinatorBindingGeneration,
  authorityKeyId: approval.authorityKeyId,
  authorityKeyFingerprint: approval.authorityKeyFingerprint,
  authorityKeyGeneration: approval.authorityKeyGeneration,
  issuedAtMillis: approval.issuedAtMillis,
  expiresAtMillis: approval.expiresAtMillis,
  ownerAuthorityKeyId: approval.ownerAuthorityKeyId,
  ownerAuthoritySignature: approval.ownerAuthoritySignature,
);
