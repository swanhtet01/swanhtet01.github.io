import 'dart:async';

import 'shop_connected_runtime.dart';
import 'shop_runtime_profile.dart';

enum ConnectedApplicationState {
  uninitialized,
  disabled,
  blocked,
  ready,
  running,
  stopping,
  failed,
}

/// Application-owned boundary for the connected-site runtime.
///
/// The shipping profiles currently keep [ShopRuntimeCapabilities.connectedSite]
/// false. Initializing this boundary is therefore network-silent: it does not
/// construct platform identities, invoke a platform channel, or open a LAN
/// listener. A future enabled profile must inject a fully reviewed runtime and
/// still call [start] with issuer-backed enrollment data explicitly.
class ShopConnectedApplicationBoundary {
  ShopConnectedApplicationBoundary({required this.capabilities, this._runtime});

  final ShopRuntimeCapabilities capabilities;
  final ConnectedRuntimeControl? _runtime;

  ConnectedApplicationState _state = ConnectedApplicationState.uninitialized;
  String? _reason;
  Future<void> _operationTail = Future<void>.value();

  ConnectedApplicationState get state => _state;
  String? get reason => _reason;

  Future<void> initialize() => _serialize(() async {
    if (_state != ConnectedApplicationState.uninitialized) {
      throw StateError('connected_application_already_initialized');
    }
    if (!capabilities.connectedSite) {
      _state = ConnectedApplicationState.disabled;
      _reason = 'connected_site_capability_disabled';
      return;
    }
    if (_runtime == null) {
      _state = ConnectedApplicationState.blocked;
      _reason = 'connected_site_runtime_unavailable';
      return;
    }
    _state = ConnectedApplicationState.ready;
    _reason = null;
  });

  Future<void> start(ConnectedRuntimeStartRequest request) =>
      _serialize(() async {
        if (!capabilities.connectedSite ||
            _state == ConnectedApplicationState.disabled) {
          throw StateError('connected_site_capability_disabled');
        }
        final connectedRuntime = _runtime;
        if (connectedRuntime == null ||
            _state == ConnectedApplicationState.blocked) {
          throw StateError('connected_site_runtime_unavailable');
        }
        if (_state != ConnectedApplicationState.ready) {
          throw StateError('connected_application_not_ready');
        }
        if (!identical(request.capabilities, capabilities)) {
          throw StateError('connected_site_capabilities_mismatch');
        }
        try {
          await connectedRuntime.start(request);
          _state = ConnectedApplicationState.running;
          _reason = null;
        } catch (_) {
          _state = ConnectedApplicationState.failed;
          _reason = 'connected_site_start_failed';
          rethrow;
        }
      });

  Future<void> revalidate() => _serialize(() async {
    final connectedRuntime = _runtime;
    if (_state != ConnectedApplicationState.running ||
        connectedRuntime == null) {
      throw StateError('connected_application_not_running');
    }
    try {
      await connectedRuntime.revalidate();
    } catch (_) {
      _state = ConnectedApplicationState.failed;
      _reason = 'connected_site_revalidation_failed';
      rethrow;
    }
  });

  /// Stops an owned runtime. Disabled and never-started boundaries are no-ops.
  /// A failed stop remains visible and retryable instead of claiming cleanup.
  Future<void> close() => _serialize(() async {
    final connectedRuntime = _runtime;
    if (_state == ConnectedApplicationState.uninitialized ||
        _state == ConnectedApplicationState.disabled ||
        _state == ConnectedApplicationState.blocked ||
        _state == ConnectedApplicationState.ready) {
      return;
    }
    if (connectedRuntime == null) {
      _state = ConnectedApplicationState.failed;
      _reason = 'connected_site_cleanup_unavailable';
      throw StateError('connected_site_cleanup_unavailable');
    }
    _state = ConnectedApplicationState.stopping;
    try {
      await connectedRuntime.stop();
      _state = ConnectedApplicationState.ready;
      _reason = null;
    } catch (_) {
      _state = ConnectedApplicationState.failed;
      _reason = 'connected_site_cleanup_unconfirmed';
      rethrow;
    }
  });

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

ShopConnectedApplicationBoundary resolveShopConnectedApplicationBoundary({
  required ShopRuntimeCapabilities capabilities,
  ShopConnectedApplicationBoundary? boundary,
}) {
  final resolved =
      boundary ?? ShopConnectedApplicationBoundary(capabilities: capabilities);
  if (!identical(resolved.capabilities, capabilities)) {
    throw StateError('connected_site_capabilities_mismatch');
  }
  return resolved;
}
