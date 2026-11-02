import 'dart:async';

import 'shop_connected_platform_security.dart';
import 'shop_runtime_profile.dart';
import 'shop_site_coordinator.dart';

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
    required this.capabilities,
    required this.bindAddress,
    required this.workspaceId,
    required this.siteId,
    required this.coordinatorDeviceId,
    required this.identityAlias,
    required this.expectedIdentity,
  });

  final ShopRuntimeCapabilities capabilities;
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
    required ConnectedPlatformIdentity identity,
  });

  Future<ConnectedRuntimeAuthorityState> authorityState({
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required ConnectedPlatformIdentity identity,
  });
}

abstract interface class ConnectedSharedWriteGate {
  Future<void> pause(String reason);

  Future<void> resume();
}

/// One in-process gate shared by the application runtime and coordinator
/// dispatcher. It starts paused, so binding a listener can never make commands
/// writable before runtime authority and enrollment checks have completed.
class ShopConnectedSharedWriteGate
    implements ConnectedSharedWriteGate, CoordinatorSharedWriteAvailability {
  bool _available = false;
  String _pauseReason = 'connected_runtime_not_started';
  int _activeWrites = 0;
  Completer<void>? _drained;

  @override
  bool get sharedWritesAvailable => _available;

  String get pauseReason => _pauseReason;

  int get activeWrites => _activeWrites;

  @override
  bool tryBeginSharedWrite() {
    if (!_available) return false;
    _activeWrites += 1;
    return true;
  }

  @override
  void endSharedWrite() {
    if (_activeWrites <= 0) {
      throw StateError('connected_site_shared_write_not_started');
    }
    _activeWrites -= 1;
    if (_activeWrites == 0 && _drained != null && !_drained!.isCompleted) {
      _drained!.complete();
      _drained = null;
    }
  }

  @override
  Future<void> pause(String reason) async {
    final normalized = reason.trim();
    if (normalized.isEmpty || normalized.length > 160) {
      throw ArgumentError.value(reason, 'reason', 'invalid pause reason');
    }
    _available = false;
    _pauseReason = normalized;
    if (_activeWrites > 0) {
      await (_drained ??= Completer<void>()).future;
    }
  }

  @override
  Future<void> resume() async {
    if (_activeWrites != 0) {
      throw StateError('connected_site_shared_write_drain_incomplete');
    }
    _available = true;
    _pauseReason = '';
  }
}

abstract interface class ConnectedCoordinatorHost {
  ConnectedSharedWriteGate get sharedWrites;

  Future<void> start({
    required String bindAddress,
    required ConnectedPlatformIdentity identity,
    required ConnectedEphemeralTlsIdentity tlsIdentity,
  });

  Future<void> stop();
}

abstract interface class ConnectedRuntimeControl {
  ConnectedRuntimeState get state;

  Future<void> start(ConnectedRuntimeStartRequest request);

  Future<void> revalidate();

  Future<void> stop();
}

class ShopConnectedRuntime implements ConnectedRuntimeControl {
  ShopConnectedRuntime({
    required this.platformSecurity,
    required this.readiness,
    required this.sharedWrites,
    required this.coordinator,
  }) {
    if (!identical(sharedWrites, coordinator.sharedWrites)) {
      throw StateError('connected_runtime_shared_write_gate_mismatch');
    }
  }

  final ConnectedPlatformSecurity platformSecurity;
  final ConnectedRuntimeReadiness readiness;
  final ConnectedSharedWriteGate sharedWrites;
  final ConnectedCoordinatorHost coordinator;

  ConnectedRuntimeState _state = ConnectedRuntimeState.stopped;
  ConnectedRuntimeStartRequest? _request;
  ConnectedEphemeralTlsIdentity? _tlsIdentity;
  String? _pauseReason;
  Future<void> _operationTail = Future<void>.value();

  @override
  ConnectedRuntimeState get state => _state;
  String? get pauseReason => _pauseReason;

  @override
  Future<void> start(ConnectedRuntimeStartRequest request) =>
      _serialize(() => _start(request));

  Future<void> _start(ConnectedRuntimeStartRequest request) async {
    if (_state != ConnectedRuntimeState.stopped) {
      throw const ConnectedRuntimeException(
        'connected_runtime_already_started',
      );
    }
    _state = ConnectedRuntimeState.starting;
    await sharedWrites.pause('connected_runtime_starting');
    try {
      await _verifyPreIdentity(request);
      final identity = await platformSecurity.loadIdentity(
        alias: request.identityAlias,
      );
      if (!identity.matches(request.expectedIdentity)) {
        throw const ConnectedRuntimeException(
          'connected_runtime_identity_mismatch',
        );
      }
      if (!await readiness.enrollmentApproved(
        workspaceId: request.workspaceId,
        siteId: request.siteId,
        coordinatorDeviceId: request.coordinatorDeviceId,
        identity: identity,
      )) {
        throw const ConnectedRuntimeException(
          'connected_runtime_enrollment_unapproved',
        );
      }
      await _verifyAuthority(request, identity);
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
      var failureCode = _errorCode(error);
      if (_tlsIdentity != null) {
        try {
          await coordinator.stop();
        } catch (_) {
          // Startup remains failed and writes remain paused. The inability to
          // confirm host stop is reported instead of claiming a clean stop.
          failureCode = 'connected_runtime_stop_unconfirmed';
        }
      }
      _tlsIdentity?.dispose();
      _tlsIdentity = null;
      _request = null;
      _state = ConnectedRuntimeState.failed;
      _pauseReason = failureCode;
      await sharedWrites.pause(_pauseReason!);
      if (failureCode == 'connected_runtime_stop_unconfirmed') {
        throw const ConnectedRuntimeException(
          'connected_runtime_stop_unconfirmed',
        );
      }
      if (error is ConnectedRuntimeException ||
          error is ConnectedPlatformSecurityException) {
        rethrow;
      }
      throw const ConnectedRuntimeException('connected_runtime_start_failed');
    }
  }

  @override
  Future<void> revalidate() => _serialize(_revalidate);

  Future<void> _revalidate() async {
    final request = _request;
    if (_state != ConnectedRuntimeState.running || request == null) {
      throw const ConnectedRuntimeException('connected_runtime_not_running');
    }
    try {
      await _verifyPreIdentity(request);
      final identity = await platformSecurity.loadIdentity(
        alias: request.identityAlias,
      );
      if (!identity.matches(request.expectedIdentity)) {
        throw const ConnectedRuntimeException(
          'connected_runtime_identity_mismatch',
        );
      }
      if (!await readiness.enrollmentApproved(
        workspaceId: request.workspaceId,
        siteId: request.siteId,
        coordinatorDeviceId: request.coordinatorDeviceId,
        identity: identity,
      )) {
        throw const ConnectedRuntimeException(
          'connected_runtime_enrollment_unapproved',
        );
      }
      await _verifyAuthority(request, identity);
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

  @override
  Future<void> stop() => _serialize(_stop);

  Future<void> _stop() async {
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

  Future<void> _verifyPreIdentity(ConnectedRuntimeStartRequest request) async {
    if (!request.capabilities.connectedSite) {
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
  }

  Future<void> _verifyAuthority(
    ConnectedRuntimeStartRequest request,
    ConnectedPlatformIdentity identity,
  ) async {
    final authority = await readiness.authorityState(
      workspaceId: request.workspaceId,
      siteId: request.siteId,
      coordinatorDeviceId: request.coordinatorDeviceId,
      identity: identity,
    );
    if (authority != ConnectedRuntimeAuthorityState.active) {
      throw ConnectedRuntimeException(
        'connected_runtime_authority_${authority.name}',
      );
    }
  }

  Future<T> _serialize<T>(Future<T> Function() operation) {
    final completer = Completer<T>();
    _operationTail = _operationTail.then((_) async {
      try {
        completer.complete(await operation());
      } catch (error, stackTrace) {
        completer.completeError(error, stackTrace);
      }
    });
    return completer.future;
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
