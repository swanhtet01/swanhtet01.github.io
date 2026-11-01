import 'dart:io';

import 'shop_connected_platform_security.dart';
import 'shop_connected_runtime.dart';
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
  Future<void> start({
    required String bindAddress,
    required ConnectedEphemeralTlsIdentity tlsIdentity,
  });

  Future<void> stop();
}

/// Adapts the reviewed TLS-only protocol server to the runtime host boundary.
/// The server still enforces its own default-off flag, private address, exact
/// pairing endpoint, certificate fingerprint and request authorization.
class SiteCoordinatorServerTransport implements ConnectedCoordinatorTransport {
  SiteCoordinatorServerTransport(this.server);

  final SiteCoordinatorServer server;

  @override
  Future<void> start({
    required String bindAddress,
    required ConnectedEphemeralTlsIdentity tlsIdentity,
  }) async {
    final address = InternetAddress.tryParse(bindAddress);
    if (address == null || address.type != InternetAddressType.IPv4) {
      throw StateError('connected_site_bind_rejected');
    }
    final identity = CoordinatorTlsIdentity.fromPem(
      certificateChainPem: tlsIdentity.certificatePem,
      privateKeyPem: tlsIdentity.privateKeyPem,
    );
    if (identity.leafCertificateSha256 !=
        tlsIdentity.certificateFingerprintSha256) {
      throw StateError('connected_site_tls_identity_mismatch');
    }
    await server.start(
      address: address,
      port: server.pairingResponse.port,
      tlsIdentity: identity,
    );
  }

  @override
  Future<void> stop() => server.stop();
}

/// One transactional host lifecycle for the native visible service and Dart
/// TLS listener. Any partial start is rolled back in reverse order. A stop
/// attempts both layers and fails closed if either cannot be confirmed.
class ConnectedCoordinatorRuntimeHost implements ConnectedCoordinatorHost {
  ConnectedCoordinatorRuntimeHost({
    required this.platform,
    required this.transport,
  });

  final ConnectedCoordinatorPlatformLifecycle platform;
  final ConnectedCoordinatorTransport transport;

  bool _platformStarted = false;
  bool _transportStarted = false;

  @override
  Future<void> start({
    required String bindAddress,
    required ConnectedPlatformIdentity identity,
    required ConnectedEphemeralTlsIdentity tlsIdentity,
  }) async {
    if (_platformStarted || _transportStarted) {
      throw StateError('connected_coordinator_host_already_started');
    }
    try {
      await platform.start(coordinatorAlias: identity.alias);
      _platformStarted = true;
      await transport.start(bindAddress: bindAddress, tlsIdentity: tlsIdentity);
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
    var confirmed = true;
    if (_transportStarted) {
      try {
        await transport.stop();
      } catch (_) {
        confirmed = false;
      } finally {
        _transportStarted = false;
      }
    }
    if (_platformStarted) {
      try {
        await platform.stop();
      } catch (_) {
        confirmed = false;
      } finally {
        _platformStarted = false;
      }
    }
    return confirmed;
  }

  @override
  Future<void> stop() async {
    Object? failure;
    StackTrace? failureStack;
    if (_transportStarted) {
      try {
        await transport.stop();
      } catch (error, stackTrace) {
        failure = error;
        failureStack = stackTrace;
      } finally {
        _transportStarted = false;
      }
    }
    if (_platformStarted) {
      try {
        await platform.stop();
      } catch (error, stackTrace) {
        failure ??= error;
        failureStack ??= stackTrace;
      } finally {
        _platformStarted = false;
      }
    }
    if (failure != null) {
      Error.throwWithStackTrace(failure, failureStack!);
    }
  }
}
