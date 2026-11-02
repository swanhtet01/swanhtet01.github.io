import 'dart:io';

import 'package:flutter/services.dart';

import 'shop_connected_platform_security.dart';
import 'shop_connected_runtime.dart';
import 'shop_connected_site_enrollment_store.dart';
import 'shop_site_coordinator.dart';

/// Visible native lifecycle required before the Dart TLS listener may accept
/// private-LAN traffic. Platform implementations must keep their own feature
/// gate fail closed and must not report [markListening] until the listener is
/// already bound.
abstract interface class ConnectedCoordinatorPlatformLifecycle {
  Future<void> start({required String coordinatorAlias});

  Future<void> markListening({required String coordinatorAlias});

  Future<void> stop();
}

const connectedCoordinatorServiceChannel =
    'dev.supermega.supermega_shop/connected_coordinator_service_v1';
const _connectedCoordinatorRequestSchema =
    'supermega.connected-coordinator-service-request.v1';
const _connectedCoordinatorStatusSchema =
    'supermega.connected-coordinator-status.v1';

typedef ConnectedCoordinatorPlatformInvoker = Future<Object?> Function(
  String method,
  Map<String, Object> arguments,
);

/// Fail-closed Android bridge for the visible foreground-service lifecycle.
/// It never assumes that requesting a service means Android started it: start
/// polls the persisted native status, and listening is acknowledged only after
/// the native side confirms the exact alias and active-listener state.
class MethodChannelConnectedCoordinatorPlatformLifecycle
    implements ConnectedCoordinatorPlatformLifecycle {
  MethodChannelConnectedCoordinatorPlatformLifecycle({
    MethodChannel? channel,
    ConnectedCoordinatorPlatformInvoker? invoke,
    Future<void> Function(Duration duration)? delay,
    this.startPollAttempts = 40,
    this.startPollInterval = const Duration(milliseconds: 50),
  }) : assert(startPollAttempts > 0),
       _channel =
           channel ?? const MethodChannel(connectedCoordinatorServiceChannel),
       _invokeOverride = invoke,
       _delay = delay ?? Future<void>.delayed;

  final MethodChannel _channel;
  final ConnectedCoordinatorPlatformInvoker? _invokeOverride;
  final Future<void> Function(Duration duration) _delay;
  final int startPollAttempts;
  final Duration startPollInterval;

  String? _alias;
  bool _nativeMayBeStarted = false;

  Future<Object?> _invoke(String method, Map<String, Object> arguments) =>
      _invokeOverride?.call(method, arguments) ??
      _channel.invokeMethod<Object?>(method, arguments);

  @override
  Future<void> start({required String coordinatorAlias}) async {
    if (_alias != null || _nativeMayBeStarted) {
      throw StateError('connected_coordinator_platform_already_started');
    }
    _nativeMayBeStarted = true;
    try {
      var status = _status(
        await _invoke('start', <String, Object>{
          'schema': _connectedCoordinatorRequestSchema,
          'coordinatorAlias': coordinatorAlias,
        }),
      );
      for (
        var attempt = 0;
        status.state == 'starting' && attempt < startPollAttempts;
        attempt += 1
      ) {
        await _delay(startPollInterval);
        status = _status(
          await _invoke('status', const <String, Object>{
            'schema': _connectedCoordinatorRequestSchema,
          }),
        );
      }
      if (status.state != 'running' ||
          status.coordinatorAlias != coordinatorAlias ||
          status.lanListenerActive ||
          status.connectedOperationEnabled) {
        throw StateError('connected_coordinator_platform_start_unconfirmed');
      }
      _alias = coordinatorAlias;
    } catch (error, stackTrace) {
      try {
        await _stopNative();
      } catch (_) {
        Error.throwWithStackTrace(
          StateError('connected_coordinator_platform_cleanup_unconfirmed'),
          stackTrace,
        );
      }
      Error.throwWithStackTrace(error, stackTrace);
    }
  }

  @override
  Future<void> markListening({required String coordinatorAlias}) async {
    if (_alias != coordinatorAlias) {
      throw StateError('connected_coordinator_platform_alias_mismatch');
    }
    final status = _status(
      await _invoke('markListening', <String, Object>{
        'schema': _connectedCoordinatorRequestSchema,
        'coordinatorAlias': coordinatorAlias,
      }),
    );
    if (status.state != 'running' ||
        status.coordinatorAlias != coordinatorAlias ||
        !status.lanListenerActive ||
        !status.connectedOperationEnabled) {
      throw StateError('connected_coordinator_platform_listening_unconfirmed');
    }
  }

  @override
  Future<void> stop() async {
    await _stopNative();
    _alias = null;
  }

  Future<void> _stopNative() async {
    final status = _status(
      await _invoke('stop', const <String, Object>{
        'schema': _connectedCoordinatorRequestSchema,
      }),
    );
    if (status.state != 'stopped' ||
        status.coordinatorAlias != null ||
        status.lanListenerActive ||
        status.connectedOperationEnabled) {
      throw StateError('connected_coordinator_platform_stop_unconfirmed');
    }
    _nativeMayBeStarted = false;
  }

  _ConnectedCoordinatorPlatformStatus _status(Object? value) {
    if (value is! Map) {
      throw StateError('connected_coordinator_platform_status_invalid');
    }
    final map = value.map<String, Object?>((key, value) {
      if (key is! String) {
        throw StateError('connected_coordinator_platform_status_invalid');
      }
      return MapEntry(key, value);
    });
    const fields = <String>{
      'schema',
      'state',
      'reason',
      'coordinatorAlias',
      'lanListenerActive',
      'connectedOperationEnabled',
      'restartPolicy',
      'updatedAt',
    };
    if (map.keys.toSet().difference(fields).isNotEmpty ||
        fields.difference(map.keys.toSet()).isNotEmpty ||
        map['schema'] != _connectedCoordinatorStatusSchema ||
        map['state'] is! String ||
        map['reason'] is! String ||
        map['coordinatorAlias'] != null && map['coordinatorAlias'] is! String ||
        map['lanListenerActive'] is! bool ||
        map['connectedOperationEnabled'] is! bool ||
        map['restartPolicy'] != 'sticky_when_ready' ||
        map['updatedAt'] is! String) {
      throw StateError('connected_coordinator_platform_status_invalid');
    }
    final status = _ConnectedCoordinatorPlatformStatus(
      state: map['state']! as String,
      coordinatorAlias: map['coordinatorAlias'] as String?,
      lanListenerActive: map['lanListenerActive']! as bool,
      connectedOperationEnabled: map['connectedOperationEnabled']! as bool,
    );
    if (!const <String>{
          'starting',
          'running',
          'stopped',
          'unavailable',
        }.contains(status.state) ||
        (status.state != 'running' &&
            (status.lanListenerActive || status.connectedOperationEnabled)) ||
        status.lanListenerActive != status.connectedOperationEnabled) {
      throw StateError('connected_coordinator_platform_status_invalid');
    }
    return status;
  }
}

class _ConnectedCoordinatorPlatformStatus {
  const _ConnectedCoordinatorPlatformStatus({
    required this.state,
    required this.coordinatorAlias,
    required this.lanListenerActive,
    required this.connectedOperationEnabled,
  });

  final String state;
  final String? coordinatorAlias;
  final bool lanListenerActive;
  final bool connectedOperationEnabled;
}

const connectedWindowsCoordinatorHostChannel =
    'dev.supermega.supermega_shop/connected_coordinator_host_v1';
const _connectedWindowsCoordinatorRequestSchema =
    'supermega.connected-coordinator-host-request.v1';
const _connectedWindowsCoordinatorStatusSchema =
    'supermega.connected-coordinator-host-status.v1';

/// Windows app-host lifecycle matching the Dart TLS listener. The native host
/// owns the single-instance mutex while Dart owns protocol transport; neither
/// layer may advertise shared writes until both have confirmed the transition.
class MethodChannelWindowsConnectedCoordinatorPlatformLifecycle
    implements ConnectedCoordinatorPlatformLifecycle {
  MethodChannelWindowsConnectedCoordinatorPlatformLifecycle({
    MethodChannel? channel,
    ConnectedCoordinatorPlatformInvoker? invoke,
  }) : _channel =
           channel ??
           const MethodChannel(connectedWindowsCoordinatorHostChannel),
       _invokeOverride = invoke;

  final MethodChannel _channel;
  final ConnectedCoordinatorPlatformInvoker? _invokeOverride;
  String? _alias;
  bool _nativeMayBeStarted = false;

  Future<Object?> _invoke(String method, Map<String, Object> arguments) =>
      _invokeOverride?.call(method, arguments) ??
      _channel.invokeMethod<Object?>(method, arguments);

  @override
  Future<void> start({required String coordinatorAlias}) async {
    if (_alias != null || _nativeMayBeStarted) {
      throw StateError('connected_windows_coordinator_already_started');
    }
    _nativeMayBeStarted = true;
    try {
      final status = _status(
        await _invoke('start', <String, Object>{
          'schema': _connectedWindowsCoordinatorRequestSchema,
          'coordinatorAlias': coordinatorAlias,
        }),
      );
      if (!status.featureEnabled ||
          !status.ownerHeld ||
          !status.restartCleanupComplete ||
          !status.visibleStatusRequired ||
          status.state != 'running' ||
          status.coordinatorAlias != coordinatorAlias ||
          status.transportListening ||
          status.sharedWritesAvailable) {
        throw StateError('connected_windows_coordinator_start_unconfirmed');
      }
      _alias = coordinatorAlias;
    } catch (error, stackTrace) {
      try {
        await _stopNative();
      } catch (_) {
        Error.throwWithStackTrace(
          StateError('connected_windows_coordinator_cleanup_unconfirmed'),
          stackTrace,
        );
      }
      Error.throwWithStackTrace(error, stackTrace);
    }
  }

  @override
  Future<void> markListening({required String coordinatorAlias}) async {
    if (_alias != coordinatorAlias) {
      throw StateError('connected_windows_coordinator_alias_mismatch');
    }
    final status = _status(
      await _invoke('markListening', <String, Object>{
        'schema': _connectedWindowsCoordinatorRequestSchema,
        'coordinatorAlias': coordinatorAlias,
      }),
    );
    if (!status.featureEnabled ||
        !status.ownerHeld ||
        !status.restartCleanupComplete ||
        !status.visibleStatusRequired ||
        status.state != 'running' ||
        status.coordinatorAlias != coordinatorAlias ||
        !status.transportListening ||
        !status.sharedWritesAvailable) {
      throw StateError('connected_windows_coordinator_listening_unconfirmed');
    }
  }

  @override
  Future<void> stop() async {
    await _stopNative();
    _alias = null;
  }

  Future<void> _stopNative() async {
    final status = _status(
      await _invoke('stop', const <String, Object>{
        'schema': _connectedWindowsCoordinatorRequestSchema,
      }),
    );
    if (status.ownerHeld ||
        status.transportListening ||
        status.sharedWritesAvailable ||
        status.coordinatorAlias != null ||
        !status.restartCleanupComplete ||
        !status.visibleStatusRequired ||
        !const <String>{'stopped', 'disabled'}.contains(status.state)) {
      throw StateError('connected_windows_coordinator_stop_unconfirmed');
    }
    _nativeMayBeStarted = false;
  }

  _ConnectedWindowsCoordinatorStatus _status(Object? value) {
    if (value is! Map) {
      throw StateError('connected_windows_coordinator_status_invalid');
    }
    final map = value.map<String, Object?>((key, value) {
      if (key is! String) {
        throw StateError('connected_windows_coordinator_status_invalid');
      }
      return MapEntry(key, value);
    });
    const fields = <String>{
      'schema',
      'state',
      'featureEnabled',
      'ownerHeld',
      'transportListening',
      'sharedWritesAvailable',
      'coordinatorAlias',
      'restartCleanupComplete',
      'visibleStatusRequired',
      'lastError',
    };
    if (map.keys.toSet().difference(fields).isNotEmpty ||
        fields.difference(map.keys.toSet()).isNotEmpty ||
        map['schema'] != _connectedWindowsCoordinatorStatusSchema ||
        map['state'] is! String ||
        map['featureEnabled'] is! bool ||
        map['ownerHeld'] is! bool ||
        map['transportListening'] is! bool ||
        map['sharedWritesAvailable'] is! bool ||
        (map['coordinatorAlias'] != null &&
            map['coordinatorAlias'] is! String) ||
        map['restartCleanupComplete'] is! bool ||
        map['visibleStatusRequired'] is! bool ||
        map['lastError'] is! String) {
      throw StateError('connected_windows_coordinator_status_invalid');
    }
    final status = _ConnectedWindowsCoordinatorStatus(
      state: map['state']! as String,
      featureEnabled: map['featureEnabled']! as bool,
      ownerHeld: map['ownerHeld']! as bool,
      transportListening: map['transportListening']! as bool,
      sharedWritesAvailable: map['sharedWritesAvailable']! as bool,
      coordinatorAlias: map['coordinatorAlias'] as String?,
      restartCleanupComplete: map['restartCleanupComplete']! as bool,
      visibleStatusRequired: map['visibleStatusRequired']! as bool,
    );
    if (status.transportListening != status.sharedWritesAvailable ||
        (status.transportListening &&
            (!status.featureEnabled ||
                !status.ownerHeld ||
                status.state != 'running'))) {
      throw StateError('connected_windows_coordinator_status_invalid');
    }
    return status;
  }
}

class _ConnectedWindowsCoordinatorStatus {
  const _ConnectedWindowsCoordinatorStatus({
    required this.state,
    required this.featureEnabled,
    required this.ownerHeld,
    required this.transportListening,
    required this.sharedWritesAvailable,
    required this.coordinatorAlias,
    required this.restartCleanupComplete,
    required this.visibleStatusRequired,
  });

  final String state;
  final bool featureEnabled;
  final bool ownerHeld;
  final bool transportListening;
  final bool sharedWritesAvailable;
  final String? coordinatorAlias;
  final bool restartCleanupComplete;
  final bool visibleStatusRequired;
}

class UnavailableConnectedCoordinatorPlatformLifecycle
    implements ConnectedCoordinatorPlatformLifecycle {
  const UnavailableConnectedCoordinatorPlatformLifecycle();

  Never _unavailable() =>
      throw StateError('connected_coordinator_platform_unavailable');

  @override
  Future<void> start({required String coordinatorAlias}) async =>
      _unavailable();

  @override
  Future<void> markListening({required String coordinatorAlias}) async =>
      _unavailable();

  @override
  Future<void> stop() async => _unavailable();
}

abstract interface class ConnectedCoordinatorTransport {
  ConnectedSharedWriteGate get sharedWrites;

  Future<void> prepare({
    required String bindAddress,
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required ConnectedPlatformIdentity identity,
    required ConnectedEphemeralTlsIdentity tlsIdentity,
  });

  Future<void> start({
    required String bindAddress,
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required ConnectedPlatformIdentity identity,
    required ConnectedEphemeralTlsIdentity tlsIdentity,
  });

  Future<void> stop();
}

/// Adapts the reviewed TLS-only protocol server to the runtime host boundary.
/// The server still enforces its own default-off flag, private address, exact
/// pairing endpoint, certificate fingerprint and request authorization.
class SiteCoordinatorServerTransport implements ConnectedCoordinatorTransport {
  SiteCoordinatorServerTransport({
    required this.server,
    this.enrollment,
    required this.sharedWrites,
    DateTime Function()? now,
  }) : now = now ?? (() => DateTime.now().toUtc()) {
    if (!identical(server.sharedWriteAvailability, sharedWrites)) {
      throw StateError('connected_transport_shared_write_gate_mismatch');
    }
  }

  final SiteCoordinatorServer server;
  final ShopConnectedSiteEnrollmentStore? enrollment;
  final DateTime Function() now;
  _ConnectedPreparedTransport? _prepared;

  @override
  final ConnectedSharedWriteGate sharedWrites;

  @override
  Future<void> prepare({
    required String bindAddress,
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required ConnectedPlatformIdentity identity,
    required ConnectedEphemeralTlsIdentity tlsIdentity,
  }) async {
    final pairing = server.pairingResponse;
    if (_prepared != null || server.isRunning) {
      throw StateError('connected_transport_already_prepared');
    }
    if (workspaceId != pairing.workspaceId ||
        siteId != pairing.siteId ||
        coordinatorDeviceId != pairing.coordinatorDeviceId ||
        bindAddress != pairing.address ||
        identity.tlsCertificateFingerprintSha256 != pairing.certificateSha256 ||
        tlsIdentity.certificateFingerprintSha256 != pairing.certificateSha256) {
      throw StateError('connected_transport_runtime_scope_mismatch');
    }
    pairing.requireValidAt(now());
    final registrar = enrollment;
    if (registrar == null) {
      throw StateError('connected_transport_enrollment_unavailable');
    }
    await registrar.registerPairingNonce(
      tenantId: pairing.workspaceId,
      siteId: pairing.siteId,
      coordinatorDeviceId: pairing.coordinatorDeviceId,
      nonce: pairing.nonce,
      issuedAtMillis: DateTime.parse(pairing.issuedAt)
          .toUtc()
          .millisecondsSinceEpoch,
      expiresAtMillis: DateTime.parse(pairing.expiresAt)
          .toUtc()
          .millisecondsSinceEpoch,
    );
    _prepared = _ConnectedPreparedTransport(
      bindAddress: bindAddress,
      workspaceId: workspaceId,
      siteId: siteId,
      coordinatorDeviceId: coordinatorDeviceId,
      identityAlias: identity.alias,
      certificateFingerprintSha256: tlsIdentity.certificateFingerprintSha256,
    );
  }

  @override
  Future<void> start({
    required String bindAddress,
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required ConnectedPlatformIdentity identity,
    required ConnectedEphemeralTlsIdentity tlsIdentity,
  }) async {
    final request = _ConnectedPreparedTransport(
      bindAddress: bindAddress,
      workspaceId: workspaceId,
      siteId: siteId,
      coordinatorDeviceId: coordinatorDeviceId,
      identityAlias: identity.alias,
      certificateFingerprintSha256: tlsIdentity.certificateFingerprintSha256,
    );
    if (_prepared != request) {
      throw StateError('connected_transport_not_prepared');
    }
    final address = InternetAddress.tryParse(bindAddress);
    if (address == null || address.type != InternetAddressType.IPv4) {
      throw StateError('connected_site_bind_rejected');
    }
    final coordinatorTlsIdentity = CoordinatorTlsIdentity.fromPem(
      certificateChainPem: tlsIdentity.certificatePem,
      privateKeyPem: tlsIdentity.privateKeyPem,
    );
    if (coordinatorTlsIdentity.leafCertificateSha256 !=
        tlsIdentity.certificateFingerprintSha256) {
      throw StateError('connected_site_tls_identity_mismatch');
    }
    await server.start(
      address: address,
      port: server.pairingResponse.port,
      tlsIdentity: coordinatorTlsIdentity,
    );
  }

  @override
  Future<void> stop() async {
    try {
      await server.stop();
    } finally {
      _prepared = null;
    }
  }
}

class _ConnectedPreparedTransport {
  const _ConnectedPreparedTransport({
    required this.bindAddress,
    required this.workspaceId,
    required this.siteId,
    required this.coordinatorDeviceId,
    required this.identityAlias,
    required this.certificateFingerprintSha256,
  });

  final String bindAddress;
  final String workspaceId;
  final String siteId;
  final String coordinatorDeviceId;
  final String identityAlias;
  final String certificateFingerprintSha256;

  @override
  bool operator ==(Object other) =>
      other is _ConnectedPreparedTransport &&
      other.bindAddress == bindAddress &&
      other.workspaceId == workspaceId &&
      other.siteId == siteId &&
      other.coordinatorDeviceId == coordinatorDeviceId &&
      other.identityAlias == identityAlias &&
      other.certificateFingerprintSha256 == certificateFingerprintSha256;

  @override
  int get hashCode => Object.hash(
    bindAddress,
    workspaceId,
    siteId,
    coordinatorDeviceId,
    identityAlias,
    certificateFingerprintSha256,
  );
}

/// One transactional host lifecycle for the native visible service and Dart
/// TLS listener. Any partial start is rolled back in reverse order. A stop
/// attempts both layers and fails closed if either cannot be confirmed.
class ConnectedCoordinatorRuntimeHost implements ConnectedCoordinatorHost {
  ConnectedCoordinatorRuntimeHost({
    required this.platform,
    required this.transport,
    required this.sharedWrites,
  }) {
    if (!identical(transport.sharedWrites, sharedWrites)) {
      throw StateError('connected_host_shared_write_gate_mismatch');
    }
  }

  final ConnectedCoordinatorPlatformLifecycle platform;
  final ConnectedCoordinatorTransport transport;

  @override
  final ConnectedSharedWriteGate sharedWrites;

  bool _platformStarted = false;
  bool _transportStarted = false;
  bool _transportPrepared = false;

  @override
  Future<void> start({
    required String bindAddress,
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required ConnectedPlatformIdentity identity,
    required ConnectedEphemeralTlsIdentity tlsIdentity,
  }) async {
    if (_platformStarted || _transportStarted || _transportPrepared) {
      throw StateError('connected_coordinator_host_already_started');
    }
    try {
      await transport.prepare(
        bindAddress: bindAddress,
        workspaceId: workspaceId,
        siteId: siteId,
        coordinatorDeviceId: coordinatorDeviceId,
        identity: identity,
        tlsIdentity: tlsIdentity,
      );
      _transportPrepared = true;
      await platform.start(coordinatorAlias: identity.alias);
      _platformStarted = true;
      await transport.start(
        bindAddress: bindAddress,
        workspaceId: workspaceId,
        siteId: siteId,
        coordinatorDeviceId: coordinatorDeviceId,
        identity: identity,
        tlsIdentity: tlsIdentity,
      );
      _transportStarted = true;
      await platform.markListening(coordinatorAlias: identity.alias);
    } catch (error, stackTrace) {
      final cleanupConfirmed = await _rollbackStart();
      if (!cleanupConfirmed) {
        Error.throwWithStackTrace(
          StateError('connected_coordinator_host_cleanup_unconfirmed'),
          stackTrace,
        );
      }
      Error.throwWithStackTrace(error, stackTrace);
    }
  }

  Future<bool> _rollbackStart() async {
    if (_transportStarted || _transportPrepared) {
      try {
        await transport.stop();
        _transportStarted = false;
        _transportPrepared = false;
      } catch (_) {
        // Keep the transport and visible platform marked started. A listener
        // with unknown stop outcome must remain visible and retryable.
        return false;
      }
    }
    if (_platformStarted) {
      try {
        await platform.stop();
        _platformStarted = false;
      } catch (_) {
        return false;
      }
    }
    return true;
  }

  @override
  Future<void> stop() async {
    if (_transportStarted || _transportPrepared) {
      try {
        await transport.stop();
        _transportStarted = false;
        _transportPrepared = false;
      } catch (error, stackTrace) {
        Error.throwWithStackTrace(error, stackTrace);
      }
    }
    if (_platformStarted) {
      try {
        await platform.stop();
        _platformStarted = false;
      } catch (error, stackTrace) {
        Error.throwWithStackTrace(error, stackTrace);
      }
    }
  }
}
