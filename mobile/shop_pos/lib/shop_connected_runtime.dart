import 'dart:async';

import 'shop_connected_platform_security.dart';

enum ConnectedRuntimeState {
  stopped,
  starting,
  running,
  paused,
  stopping,
  failed,
}

enum ConnectedRuntimeAuthorityState { active, expired, revoked, unavailable }

class ConnectedRuntimeException implements Exception {
  const ConnectedRuntimeException(this.code);

  final String code;

  @override
  String toString() => 'ConnectedRuntimeException($code)';
}

class ConnectedRuntimeStartRequest {
  const ConnectedRuntimeStartRequest({
    required this.connectedSiteCapability,
    required this.bindAddress,
    required this.workspaceId,
    required this.siteId,
    required this.coordinatorDeviceId,
    required this.identityAlias,
    required this.expectedIdentity,
  });

  final bool connectedSiteCapability;
  final String bindAddress;
  final String workspaceId;
  final String siteId;
  final String coordinatorDeviceId;
  final String identityAlias;
  final ConnectedPlatformIdentity expectedIdentity;
}

abstract interface class ConnectedRuntimeReadiness {
  Future<bool> databaseReady();

  Future<bool> enrollmentApproved({
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required String keyId,
  });

  Future<ConnectedRuntimeAuthorityState> authorityState({
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
  });
}

abstract interface class ConnectedSharedWriteGate {
  Future<void> pause(String reason);

  Future<void> resume();
}

abstract interface class ConnectedCoordinatorHost {
  Future<void> start({
    required String bindAddress,
    required ConnectedPlatformIdentity identity,
    required ConnectedEphemeralTlsIdentity tlsIdentity,
  });

  Future<void> stop();
}

class ShopConnectedRuntime {
  ShopConnectedRuntime({
    required this.platformSecurity,
    required this.readiness,
    required this.sharedWrites,
    required this.coordinator,
  });

  final ConnectedPlatformSecurity platformSecurity;
  final ConnectedRuntimeReadiness readiness;
  final ConnectedSharedWriteGate sharedWrites;
  final ConnectedCoordinatorHost coordinator;

  ConnectedRuntimeState _state = ConnectedRuntimeState.stopped;
  ConnectedRuntimeStartRequest? _request;
  ConnectedEphemeralTlsIdentity? _tlsIdentity;
  String? _pauseReason;

  ConnectedRuntimeState get state => _state;
  String? get pauseReason => _pauseReason;

  Future<void> start(ConnectedRuntimeStartRequest request) async {
    if (_state != ConnectedRuntimeState.stopped) {
      throw const ConnectedRuntimeException(
        'connected_runtime_already_started',
      );
    }
    _state = ConnectedRuntimeState.starting;
    await sharedWrites.pause('connected_runtime_starting');
    try {
      await _verify(request);
      final identity = await platformSecurity.loadIdentity(
        alias: request.identityAlias,
      );
      if (!identity.matches(request.expectedIdentity)) {
        throw const ConnectedRuntimeException(
          'connected_runtime_identity_mismatch',
        );
      }
      final tlsIdentity = await platformSecurity.openTlsIdentity(
        alias: request.identityAlias,
        sealedTlsMaterialId: identity.sealedTlsMaterialId,
      );
      if (tlsIdentity.certificateFingerprintSha256 !=
          identity.tlsCertificateFingerprintSha256) {
        tlsIdentity.dispose();
        throw const ConnectedRuntimeException(
          'connected_runtime_tls_identity_mismatch',
        );
      }
      _tlsIdentity = tlsIdentity;
      await coordinator.start(
        bindAddress: request.bindAddress,
        identity: identity,
        tlsIdentity: tlsIdentity,
      );
      _request = request;
      _pauseReason = null;
      _state = ConnectedRuntimeState.running;
      await sharedWrites.resume();
    } catch (error) {
      if (_tlsIdentity != null) {
        try {
          await coordinator.stop();
        } catch (_) {
          // Startup remains failed and writes remain paused. The inability to
          // confirm host stop is reported instead of claiming a clean stop.
          _pauseReason = 'connected_runtime_stop_unconfirmed';
        }
      }
      _tlsIdentity?.dispose();
      _tlsIdentity = null;
      _request = null;
      _state = ConnectedRuntimeState.failed;
      _pauseReason = _errorCode(error);
      await sharedWrites.pause(_pauseReason!);
      if (error is ConnectedRuntimeException ||
          error is ConnectedPlatformSecurityException) {
        rethrow;
      }
      throw const ConnectedRuntimeException('connected_runtime_start_failed');
    }
  }

  Future<void> revalidate() async {
    final request = _request;
    if (_state != ConnectedRuntimeState.running || request == null) {
      throw const ConnectedRuntimeException('connected_runtime_not_running');
    }
    try {
      await _verify(request);
      final identity = await platformSecurity.loadIdentity(
        alias: request.identityAlias,
      );
      if (!identity.matches(request.expectedIdentity)) {
        throw const ConnectedRuntimeException(
          'connected_runtime_identity_mismatch',
        );
      }
    } catch (error) {
      _state = ConnectedRuntimeState.paused;
      _pauseReason = _errorCode(error);
      await sharedWrites.pause(_pauseReason!);
      try {
        await coordinator.stop();
      } catch (_) {
        _state = ConnectedRuntimeState.failed;
        _pauseReason = 'connected_runtime_stop_unconfirmed';
        await sharedWrites.pause(_pauseReason!);
        throw const ConnectedRuntimeException(
          'connected_runtime_stop_unconfirmed',
        );
      } finally {
        _tlsIdentity?.dispose();
        _tlsIdentity = null;
      }
      if (error is ConnectedRuntimeException ||
          error is ConnectedPlatformSecurityException) {
        rethrow;
      }
      throw const ConnectedRuntimeException(
        'connected_runtime_revalidation_failed',
      );
    }
  }

  Future<void> stop() async {
    if (_state == ConnectedRuntimeState.stopped) return;
    _state = ConnectedRuntimeState.stopping;
    await sharedWrites.pause('connected_runtime_stopped');
    try {
      await coordinator.stop();
    } catch (_) {
      _state = ConnectedRuntimeState.failed;
      _pauseReason = 'connected_runtime_stop_unconfirmed';
      await sharedWrites.pause(_pauseReason!);
      throw const ConnectedRuntimeException(
        'connected_runtime_stop_unconfirmed',
      );
    } finally {
      _tlsIdentity?.dispose();
      _tlsIdentity = null;
      _request = null;
      if (_state != ConnectedRuntimeState.failed) {
        _pauseReason = 'connected_runtime_stopped';
        _state = ConnectedRuntimeState.stopped;
      }
    }
  }

  Future<void> _verify(ConnectedRuntimeStartRequest request) async {
    if (!request.connectedSiteCapability) {
      throw const ConnectedRuntimeException(
        'connected_runtime_capability_disabled',
      );
    }
    if (!_isPrivateNumericAddress(request.bindAddress)) {
      throw const ConnectedRuntimeException(
        'connected_runtime_private_address_required',
      );
    }
    if (!await readiness.databaseReady()) {
      throw const ConnectedRuntimeException(
        'connected_runtime_database_unready',
      );
    }
    if (!await readiness.enrollmentApproved(
      workspaceId: request.workspaceId,
      siteId: request.siteId,
      coordinatorDeviceId: request.coordinatorDeviceId,
      keyId: request.expectedIdentity.keyId,
    )) {
      throw const ConnectedRuntimeException(
        'connected_runtime_enrollment_unapproved',
      );
    }
    final authority = await readiness.authorityState(
      workspaceId: request.workspaceId,
      siteId: request.siteId,
      coordinatorDeviceId: request.coordinatorDeviceId,
    );
    if (authority != ConnectedRuntimeAuthorityState.active) {
      throw ConnectedRuntimeException(
        'connected_runtime_authority_${authority.name}',
      );
    }
  }
}

String _errorCode(Object error) => switch (error) {
  ConnectedRuntimeException() => error.code,
  ConnectedPlatformSecurityException() => error.code,
  _ => 'connected_runtime_failure',
};

bool _isPrivateNumericAddress(String value) {
  final parts = value.split('.');
  if (parts.length != 4) return false;
  final octets = <int>[];
  for (final part in parts) {
    if (part.isEmpty || (part.length > 1 && part.startsWith('0'))) return false;
    final parsed = int.tryParse(part);
    if (parsed == null || parsed < 0 || parsed > 255) return false;
    octets.add(parsed);
  }
  return octets[0] == 10 ||
      (octets[0] == 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] == 192 && octets[1] == 168);
}
