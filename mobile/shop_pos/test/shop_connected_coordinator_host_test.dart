import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_coordinator_host.dart';
import 'package:supermega_shop/shop_connected_platform_security.dart';

void main() {
  late _Platform platform;
  late _Transport transport;
  late ConnectedCoordinatorRuntimeHost host;

  setUp(() {
    platform = _Platform();
    transport = _Transport();
    host = ConnectedCoordinatorRuntimeHost(
      platform: platform,
      transport: transport,
    );
  });

  test(
    'start exposes platform before transport and marks listening last',
    () async {
      await host.start(
        bindAddress: '192.168.10.4',
        identity: _identity(),
        tlsIdentity: _tls(),
      );
      expect(platform.events, [
        'platform.start:site-primary',
        'platform.listening:site-primary',
      ]);
      expect(transport.events, ['transport.start:192.168.10.4']);
      expect(platform.timeline, [
        'platform.start:site-primary',
        'transport.start:192.168.10.4',
        'platform.listening:site-primary',
      ]);

      await host.stop();
      expect(platform.timeline.takeLast(2), [
        'transport.stop',
        'platform.stop',
      ]);
    },
  );

  test('platform start failure never opens transport', () async {
    platform.failStart = true;
    await expectLater(
      host.start(
        bindAddress: '192.168.10.4',
        identity: _identity(),
        tlsIdentity: _tls(),
      ),
      throwsA(isA<StateError>()),
    );
    expect(transport.events, isEmpty);
    expect(platform.events, ['platform.start:site-primary']);
  });

  test('transport failure stops the visible platform lifecycle', () async {
    transport.failStart = true;
    await expectLater(
      host.start(
        bindAddress: '192.168.10.4',
        identity: _identity(),
        tlsIdentity: _tls(),
      ),
      throwsA(isA<StateError>()),
    );
    expect(platform.timeline, [
      'platform.start:site-primary',
      'transport.start:192.168.10.4',
      'platform.stop',
    ]);
  });

  test('visible-listening failure closes transport then platform', () async {
    platform.failListening = true;
    await expectLater(
      host.start(
        bindAddress: '192.168.10.4',
        identity: _identity(),
        tlsIdentity: _tls(),
      ),
      throwsA(isA<StateError>()),
    );
    expect(platform.timeline, [
      'platform.start:site-primary',
      'transport.start:192.168.10.4',
      'platform.listening:site-primary',
      'transport.stop',
      'platform.stop',
    ]);
  });

  test(
    'cleanup failure is explicit and a later stop stays idempotent',
    () async {
      platform.failListening = true;
      transport.failStop = true;
      await expectLater(
        host.start(
          bindAddress: '192.168.10.4',
          identity: _identity(),
          tlsIdentity: _tls(),
        ),
        throwsA(
          isA<StateError>().having(
            (error) => error.message,
            'message',
            'connected_coordinator_host_cleanup_unconfirmed',
          ),
        ),
      );
      await host.stop();
    },
  );

  test('duplicate start is rejected without a second side effect', () async {
    await host.start(
      bindAddress: '192.168.10.4',
      identity: _identity(),
      tlsIdentity: _tls(),
    );
    await expectLater(
      host.start(
        bindAddress: '192.168.10.4',
        identity: _identity(),
        tlsIdentity: _tls(),
      ),
      throwsA(isA<StateError>()),
    );
    expect(
      transport.events.where((event) => event.startsWith('transport.start')),
      hasLength(1),
    );
  });

  test(
    'Android bridge confirms start, listener, and stop transitions',
    () async {
      final native = _NativeLifecycle(<Object?>[
        _status(state: 'starting', alias: 'site-primary'),
        _status(state: 'running', alias: 'site-primary'),
        _status(state: 'running', alias: 'site-primary', listening: true),
        _status(state: 'stopped'),
      ]);
      final bridge = MethodChannelConnectedCoordinatorPlatformLifecycle(
        invoke: native.invoke,
        delay: (_) async {},
        startPollAttempts: 2,
      );

      await bridge.start(coordinatorAlias: 'site-primary');
      await bridge.markListening(coordinatorAlias: 'site-primary');
      await bridge.stop();

      expect(native.methods, ['start', 'status', 'markListening', 'stop']);
      expect(native.arguments.first, {
        'schema': 'supermega.connected-coordinator-service-request.v1',
        'coordinatorAlias': 'site-primary',
      });
    },
  );

  test(
    'Android bridge rejects an already-active listener during start',
    () async {
      final native = _NativeLifecycle(<Object?>[
        _status(state: 'running', alias: 'site-primary', listening: true),
        _status(state: 'stopped'),
      ]);
      final bridge = MethodChannelConnectedCoordinatorPlatformLifecycle(
        invoke: native.invoke,
        delay: (_) async {},
      );

      await expectLater(
        bridge.start(coordinatorAlias: 'site-primary'),
        throwsA(
          isA<StateError>().having(
            (error) => error.message,
            'message',
            'connected_coordinator_platform_start_unconfirmed',
          ),
        ),
      );
      expect(native.methods, ['start', 'stop']);
    },
  );

  test(
    'Android bridge rejects malformed or inconsistent native status',
    () async {
      final malformed = _status(state: 'running', alias: 'site-primary')
        ..['unexpected'] = true;
      final native = _NativeLifecycle(<Object?>[
        malformed,
        _status(state: 'stopped'),
      ]);
      final bridge = MethodChannelConnectedCoordinatorPlatformLifecycle(
        invoke: native.invoke,
        delay: (_) async {},
      );

      await expectLater(
        bridge.start(coordinatorAlias: 'site-primary'),
        throwsA(
          isA<StateError>().having(
            (error) => error.message,
            'message',
            'connected_coordinator_platform_status_invalid',
          ),
        ),
      );
    },
  );
}

final _timeline = <String>[];

class _Platform implements ConnectedCoordinatorPlatformLifecycle {
  final events = <String>[];
  final timeline = _timeline..clear();
  bool failStart = false;
  bool failListening = false;

  @override
  Future<void> start({required String coordinatorAlias}) async {
    final event = 'platform.start:$coordinatorAlias';
    events.add(event);
    timeline.add(event);
    if (failStart) throw StateError('synthetic_platform_start');
  }

  @override
  Future<void> markListening({required String coordinatorAlias}) async {
    final event = 'platform.listening:$coordinatorAlias';
    events.add(event);
    timeline.add(event);
    if (failListening) throw StateError('synthetic_platform_listening');
  }

  @override
  Future<void> stop() async {
    events.add('platform.stop');
    timeline.add('platform.stop');
  }
}

class _Transport implements ConnectedCoordinatorTransport {
  final events = <String>[];
  final timeline = _timeline;
  bool failStart = false;
  bool failStop = false;

  @override
  Future<void> start({
    required String bindAddress,
    required ConnectedEphemeralTlsIdentity tlsIdentity,
  }) async {
    final event = 'transport.start:$bindAddress';
    events.add(event);
    timeline.add(event);
    if (failStart) throw StateError('synthetic_transport_start');
  }

  @override
  Future<void> stop() async {
    events.add('transport.stop');
    timeline.add('transport.stop');
    if (failStop) throw StateError('synthetic_transport_stop');
  }
}

ConnectedPlatformIdentity _identity() {
  final publicKey = Uint8List.fromList(List<int>.generate(32, (i) => i));
  return ConnectedPlatformIdentity(
    alias: 'site-primary',
    keyId: 'site-primary-signing',
    algorithm: 'ed25519',
    publicKeyBase64: base64Encode(publicKey),
    publicKeyFingerprintSha256: crypto.sha256.convert(publicKey).toString(),
    tlsCertificateFingerprintSha256: 'b' * 64,
    sealedTlsMaterialId: 'site-primary-tls',
  );
}

ConnectedEphemeralTlsIdentity _tls() => ConnectedEphemeralTlsIdentity(
  certificatePem: Uint8List.fromList([1]),
  privateKeyPem: Uint8List.fromList([2]),
  certificateFingerprintSha256: 'b' * 64,
);

extension<T> on Iterable<T> {
  List<T> takeLast(int count) => skip(length - count).toList();
}

Map<String, Object?> _status({
  required String state,
  String? alias,
  bool listening = false,
}) => <String, Object?>{
  'schema': 'supermega.connected-coordinator-status.v1',
  'state': state,
  'reason': state == 'running' ? 'ready' : 'synthetic',
  'coordinatorAlias': alias,
  'lanListenerActive': listening,
  'connectedOperationEnabled': listening,
  'restartPolicy': 'sticky_when_ready',
  'updatedAt': '2026-11-01T00:00:00.000Z',
};

class _NativeLifecycle {
  _NativeLifecycle(this.responses);

  final List<Object?> responses;
  final methods = <String>[];
  final arguments = <Map<String, Object>>[];

  Future<Object?> invoke(String method, Map<String, Object> arguments) async {
    methods.add(method);
    this.arguments.add(arguments);
    if (responses.isEmpty) throw StateError('missing_synthetic_response');
    return responses.removeAt(0);
  }
}
