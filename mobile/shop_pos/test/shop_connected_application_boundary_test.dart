import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_application_boundary.dart';
import 'package:supermega_shop/shop_connected_platform_security.dart';
import 'package:supermega_shop/shop_connected_runtime.dart';
import 'package:supermega_shop/shop_runtime_profile.dart';

void main() {
  test(
    'shipping production profile initializes network-silent and disabled',
    () async {
      final runtime = _Runtime();
      final boundary = ShopConnectedApplicationBoundary(
        capabilities: ShopRuntimeCapabilities.production,
        runtime: runtime,
      );

      await boundary.initialize();

      expect(boundary.state, ConnectedApplicationState.disabled);
      expect(boundary.reason, 'connected_site_capability_disabled');
      expect(runtime.calls, isEmpty);
      await boundary.close();
      expect(runtime.calls, isEmpty);
    },
  );

  test(
    'enabled capability without reviewed runtime is visibly blocked',
    () async {
      final boundary = ShopConnectedApplicationBoundary(
        capabilities: _enabledCapabilities,
      );

      await boundary.initialize();

      expect(boundary.state, ConnectedApplicationState.blocked);
      expect(boundary.reason, 'connected_site_runtime_unavailable');
      await expectLater(
        boundary.start(_request(_enabledCapabilities)),
        throwsA(isA<StateError>()),
      );
    },
  );

  test(
    'enabled boundary owns start revalidation and deterministic stop',
    () async {
      final runtime = _Runtime();
      final boundary = ShopConnectedApplicationBoundary(
        capabilities: _enabledCapabilities,
        runtime: runtime,
      );

      await boundary.initialize();
      await boundary.start(_request(_enabledCapabilities));
      await boundary.revalidate();
      await boundary.close();

      expect(runtime.calls, ['start', 'revalidate', 'stop']);
      expect(boundary.state, ConnectedApplicationState.ready);
    },
  );

  test('capability substitution fails before runtime invocation', () async {
    final runtime = _Runtime();
    final boundary = ShopConnectedApplicationBoundary(
      capabilities: _enabledCapabilities,
      runtime: runtime,
    );
    await boundary.initialize();

    await expectLater(
      boundary.start(_request(_otherEnabledCapabilities)),
      throwsA(isA<StateError>()),
    );

    expect(runtime.calls, isEmpty);
    expect(boundary.state, ConnectedApplicationState.ready);
  });

  test('application composition rejects an enabled boundary substitution', () {
    final boundary = ShopConnectedApplicationBoundary(
      capabilities: _enabledCapabilities,
      runtime: _Runtime(),
    );

    expect(
      () => resolveShopConnectedApplicationBoundary(
        capabilities: ShopRuntimeCapabilities.production,
        boundary: boundary,
      ),
      throwsA(isA<StateError>()),
    );
    expect(boundary.state, ConnectedApplicationState.uninitialized);
  });

  test('failed cleanup remains visible and retryable', () async {
    final runtime = _Runtime(stopFailures: 1);
    final boundary = ShopConnectedApplicationBoundary(
      capabilities: _enabledCapabilities,
      runtime: runtime,
    );
    await boundary.initialize();
    await boundary.start(_request(_enabledCapabilities));

    await expectLater(boundary.close(), throwsA(isA<StateError>()));
    expect(boundary.state, ConnectedApplicationState.failed);
    expect(boundary.reason, 'connected_site_cleanup_unconfirmed');

    await boundary.close();
    expect(runtime.calls, ['start', 'stop', 'stop']);
    expect(boundary.state, ConnectedApplicationState.ready);
  });
}

class _Runtime implements ConnectedRuntimeControl {
  _Runtime({this.stopFailures = 0});

  int stopFailures;
  final List<String> calls = [];
  ConnectedRuntimeState _state = ConnectedRuntimeState.stopped;

  @override
  ConnectedRuntimeState get state => _state;

  @override
  Future<void> start(ConnectedRuntimeStartRequest request) async {
    calls.add('start');
    _state = ConnectedRuntimeState.running;
  }

  @override
  Future<void> revalidate() async {
    calls.add('revalidate');
  }

  @override
  Future<void> stop() async {
    calls.add('stop');
    if (stopFailures > 0) {
      stopFailures -= 1;
      throw StateError('stop_failed');
    }
    _state = ConnectedRuntimeState.stopped;
  }
}

ConnectedRuntimeStartRequest _request(ShopRuntimeCapabilities capabilities) =>
    ConnectedRuntimeStartRequest(
      capabilities: capabilities,
      bindAddress: '192.168.1.2',
      workspaceId: 'workspace-1',
      siteId: 'site-1',
      coordinatorDeviceId: 'device-1',
      identityAlias: 'coordinator-1',
      expectedIdentity: _identity(),
    );

ConnectedPlatformIdentity _identity() {
  final publicKey = Uint8List.fromList(List<int>.generate(32, (i) => i));
  return ConnectedPlatformIdentity(
    alias: 'coordinator-1',
    keyId: 'key-1',
    algorithm: 'ed25519',
    publicKeyBase64: base64Encode(publicKey),
    publicKeyFingerprintSha256: crypto.sha256.convert(publicKey).toString(),
    tlsCertificateFingerprintSha256:
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    sealedTlsMaterialId: 'sealed-1',
  );
}

const _enabledCapabilities = ShopRuntimeCapabilities(
  managedAuth: true,
  correctionAuthorization: true,
  cashMovementAuthorization: false,
  connectedOrders: true,
  connectedSite: true,
  networkPrinter: true,
  camera: true,
  gallery: true,
  remoteImport: true,
  externalFileSaving: true,
  syntheticEvidence: false,
  loopbackPrinter: false,
);

const _otherEnabledCapabilities = ShopRuntimeCapabilities(
  managedAuth: true,
  correctionAuthorization: false,
  cashMovementAuthorization: false,
  connectedOrders: false,
  connectedSite: true,
  networkPrinter: false,
  camera: false,
  gallery: false,
  remoteImport: false,
  externalFileSaving: false,
  syntheticEvidence: false,
  loopbackPrinter: false,
);
