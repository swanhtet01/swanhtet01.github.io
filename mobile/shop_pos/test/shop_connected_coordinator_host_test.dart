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
