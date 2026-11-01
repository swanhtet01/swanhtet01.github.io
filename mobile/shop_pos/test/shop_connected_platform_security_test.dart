import 'dart:convert';

import 'package:crypto/crypto.dart' as crypto;
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_platform_security.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel(connectedPlatformSecurityChannel);
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;

  tearDown(() async {
    messenger.setMockMethodCallHandler(channel, null);
  });

  test('default adapter fails closed for every secret operation', () async {
    const adapter = UnavailableConnectedPlatformSecurity();
    await expectLater(
      adapter.loadIdentity(alias: 'coordinator-1'),
      throwsA(_securityCode('platform_security_unavailable')),
    );
    await expectLater(
      adapter.sign(alias: 'coordinator-1', payload: Uint8List.fromList([1])),
      throwsA(_securityCode('platform_security_unavailable')),
    );
    await expectLater(
      adapter.openTlsIdentity(
        alias: 'coordinator-1',
        sealedTlsMaterialId: 'tls-1',
      ),
      throwsA(_securityCode('platform_security_unavailable')),
    );
    await expectLater(
      adapter.deleteIdentity(alias: 'coordinator-1'),
      throwsA(_securityCode('platform_security_unavailable')),
    );
  });

  test('identity requires exact keys, ed25519, and public-key digest', () {
    final valid = _identityJson();
    expect(ConnectedPlatformIdentity.fromJson(valid).keyId, 'key-1');

    expect(
      () => ConnectedPlatformIdentity.fromJson({...valid, 'extra': 'value'}),
      throwsA(_securityCode('platform_identity_invalid')),
    );
    expect(
      () => ConnectedPlatformIdentity.fromJson({...valid, 'algorithm': 'rsa'}),
      throwsA(_securityCode('platform_key_algorithm_unsupported')),
    );
    expect(
      () => ConnectedPlatformIdentity.fromJson({
        ...valid,
        'publicKeyFingerprintSha256': '0' * 64,
      }),
      throwsA(_securityCode('platform_public_key_fingerprint_mismatch')),
    );
    expect(
      () => ConnectedPlatformIdentity.fromJson({...valid, 'alias': '../key'}),
      throwsA(_securityCode('platform_alias_invalid')),
    );
  });

  test('channel validates responses and never includes private material in identity', () async {
    final calls = <MethodCall>[];
    messenger.setMockMethodCallHandler(channel, (call) async {
      calls.add(call);
      return _identityJson();
    });
    final adapter = MethodChannelConnectedPlatformSecurity(channel: channel);
    final identity = await adapter.loadIdentity(alias: 'coordinator-1');
    expect(identity.keyId, 'key-1');
    expect(calls.single.method, 'loadIdentity');
    expect(calls.single.arguments, {
      'schema': 'supermega.connected-platform-request.v1',
      'alias': 'coordinator-1',
    });
    expect(identity.toString(), isNot(contains('PRIVATE')));
  });

  test('channel rejects malformed signatures and confirms deletion', () async {
    final adapter = MethodChannelConnectedPlatformSecurity(channel: channel);
    messenger.setMockMethodCallHandler(channel, (call) async {
      if (call.method == 'sign') return Uint8List(63);
      if (call.method == 'deleteIdentity') return false;
      fail('unexpected call');
    });
    await expectLater(
      adapter.sign(alias: 'coordinator-1', payload: Uint8List.fromList([1])),
      throwsA(_securityCode('platform_signature_invalid')),
    );
    await expectLater(
      adapter.deleteIdentity(alias: 'coordinator-1'),
      throwsA(_securityCode('platform_identity_delete_unconfirmed')),
    );
  });

  test('ephemeral TLS bytes are redacted and zeroized on disposal', () async {
    messenger.setMockMethodCallHandler(channel, (call) async {
      expect(call.method, 'openTlsIdentity');
      return {
        'schema': 'supermega.connected-platform-tls-identity.v1',
        'certificatePem': Uint8List.fromList(utf8.encode('CERTIFICATE')),
        'privateKeyPem': Uint8List.fromList(utf8.encode('PRIVATE-KEY')),
        'certificateFingerprintSha256': 'b' * 64,
      };
    });
    final adapter = MethodChannelConnectedPlatformSecurity(channel: channel);
    final tls = await adapter.openTlsIdentity(
      alias: 'coordinator-1',
      sealedTlsMaterialId: 'tls-1',
    );
    expect(tls.toString(), isNot(contains('PRIVATE-KEY')));
    expect(tls.privateKeyPem, isNot(everyElement(0)));
    tls.dispose();
    expect(tls.isDisposed, isTrue);
    expect(tls.privateKeyPem, everyElement(0));
    expect(tls.certificatePem, everyElement(0));
  });
}

Map<String, Object> _identityJson() {
  final publicKey = Uint8List.fromList(List<int>.generate(32, (i) => i));
  return {
    'schema': 'supermega.connected-platform-identity.v1',
    'alias': 'coordinator-1',
    'keyId': 'key-1',
    'algorithm': 'ed25519',
    'publicKeyBase64': base64Encode(publicKey),
    'publicKeyFingerprintSha256': crypto.sha256.convert(publicKey).toString(),
    'tlsCertificateFingerprintSha256': 'b' * 64,
    'sealedTlsMaterialId': 'tls-1',
  };
}

Matcher _securityCode(String code) => isA<ConnectedPlatformSecurityException>()
    .having((error) => error.code, 'code', code);
