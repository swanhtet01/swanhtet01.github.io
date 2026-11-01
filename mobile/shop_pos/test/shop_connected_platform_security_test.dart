import 'dart:convert';

import 'package:crypto/crypto.dart' as crypto;
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_platform_security.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';

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
      adapter.prepareIdentity(
        alias: 'coordinator-1',
        workspaceId: 'workspace-1',
        siteId: 'site-1',
        deviceId: 'device-1',
        sessionGeneration: 1,
      ),
      throwsA(_securityCode('platform_security_unavailable')),
    );
    final unavailableBundle = _enrollmentBundle();
    await expectLater(
      adapter.completeIdentityEnrollment(bundle: unavailableBundle),
      throwsA(_securityCode('platform_security_unavailable')),
    );
    expect(unavailableBundle.isDisposed, isTrue);
    await expectLater(
      adapter.abortIdentity(alias: 'coordinator-1', requestDigest: 'a' * 64),
      throwsA(_securityCode('platform_security_unavailable')),
    );
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

  test(
    'prepare identity validates canonical native request and bindings',
    () async {
      final calls = <MethodCall>[];
      messenger.setMockMethodCallHandler(channel, (call) async {
        calls.add(call);
        return _enrollmentRequestJson();
      });
      final adapter = MethodChannelConnectedPlatformSecurity(channel: channel);
      final request = await adapter.prepareIdentity(
        alias: 'coordinator-1',
        workspaceId: 'workspace-1',
        siteId: 'site-1',
        deviceId: 'device-1',
        sessionGeneration: 7,
      );
      expect(request.signingAlgorithm, 'ed25519');
      expect(request.tlsAlgorithm, 'ecdsa-p256');
      expect(
        connectedSiteSha256(request.signingPayload),
        request.requestDigest,
      );
      expect(calls.single.method, 'prepareIdentity');
      expect(calls.single.arguments, {
        'schema': 'supermega.connected-platform-prepare-request.v1',
        'alias': 'coordinator-1',
        'workspaceId': 'workspace-1',
        'siteId': 'site-1',
        'deviceId': 'device-1',
        'sessionGeneration': 7,
      });
    },
  );

  test(
    'prepare identity rejects altered digest and substituted device',
    () async {
      final adapter = MethodChannelConnectedPlatformSecurity(channel: channel);
      messenger.setMockMethodCallHandler(channel, (_) async {
        return {..._enrollmentRequestJson(), 'requestDigest': '0' * 64};
      });
      await expectLater(
        adapter.prepareIdentity(
          alias: 'coordinator-1',
          workspaceId: 'workspace-1',
          siteId: 'site-1',
          deviceId: 'device-1',
          sessionGeneration: 7,
        ),
        throwsA(_securityCode('platform_enrollment_request_digest_mismatch')),
      );

      messenger.setMockMethodCallHandler(channel, (_) async {
        final value = _enrollmentRequestJson(deviceId: 'device-2');
        return value;
      });
      await expectLater(
        adapter.prepareIdentity(
          alias: 'coordinator-1',
          workspaceId: 'workspace-1',
          siteId: 'site-1',
          deviceId: 'device-1',
          sessionGeneration: 7,
        ),
        throwsA(_securityCode('platform_enrollment_request_binding_mismatch')),
      );
    },
  );

  test('enrollment request rejects non-canonical shape and nonce', () {
    expect(
      () => ConnectedPlatformEnrollmentRequest.fromJson({
        ..._enrollmentRequestJson(),
        'unexpected': true,
      }),
      throwsA(_securityCode('platform_enrollment_request_invalid')),
    );
    final invalidNonce = _enrollmentRequestJson();
    invalidNonce['nonceBase64Url'] = '${invalidNonce['nonceBase64Url']}=';
    final unsigned = Map<String, Object>.from(invalidNonce)
      ..remove('requestDigest');
    invalidNonce['requestDigest'] = connectedSiteSha256(unsigned);
    expect(
      () => ConnectedPlatformEnrollmentRequest.fromJson(invalidNonce),
      throwsA(_securityCode('platform_enrollment_nonce_invalid')),
    );
  });

  test('complete identity consumes bundle and binds native identity', () async {
    late Uint8List channelCertificate;
    messenger.setMockMethodCallHandler(channel, (call) async {
      expect(call.method, 'completeIdentityEnrollment');
      final arguments = call.arguments! as Map<Object?, Object?>;
      expect(
        arguments['schema'],
        'supermega.connected-platform-complete-request.v1',
      );
      expect(
        arguments['enrollmentSchema'],
        'supermega.connected-platform-enrollment-bundle.v1',
      );
      channelCertificate = arguments['certificateChainPem']! as Uint8List;
      expect(channelCertificate, isNot(everyElement(0)));
      return _identityJson();
    });
    final bundle = _enrollmentBundle();
    final originalCertificate = bundle.certificateChainPem;
    final adapter = MethodChannelConnectedPlatformSecurity(channel: channel);
    final identity = await adapter.completeIdentityEnrollment(bundle: bundle);
    expect(identity.alias, 'coordinator-1');
    expect(bundle.isDisposed, isTrue);
    expect(originalCertificate, everyElement(0));
    // The codec may copy the argument; the owned source buffer is always wiped.
    expect(channelCertificate.length, greaterThan(0));
  });

  test(
    'complete identity wipes certificate bundle on every failure path',
    () async {
      final adapter = MethodChannelConnectedPlatformSecurity(channel: channel);
      messenger.setMockMethodCallHandler(channel, (_) async {
        return {..._identityJson(), 'sealedTlsMaterialId': 'tls-other'};
      });
      final mismatch = _enrollmentBundle();
      final mismatchBytes = mismatch.certificateChainPem;
      await expectLater(
        adapter.completeIdentityEnrollment(bundle: mismatch),
        throwsA(_securityCode('platform_identity_enrollment_mismatch')),
      );
      expect(mismatchBytes, everyElement(0));

      messenger.setMockMethodCallHandler(channel, (_) async {
        throw PlatformException(code: 'synthetic');
      });
      final channelFailure = _enrollmentBundle();
      final channelFailureBytes = channelFailure.certificateChainPem;
      await expectLater(
        adapter.completeIdentityEnrollment(bundle: channelFailure),
        throwsA(_securityCode('platform_security_operation_failed')),
      );
      expect(channelFailureBytes, everyElement(0));
    },
  );

  test('malformed enrollment bundle zeroizes provided certificate bytes', () {
    final value = _enrollmentBundleJson();
    final certificate = value['certificateChainPem']! as Uint8List;
    value['certificateChainSha256'] = '0' * 64;
    expect(
      () => ConnectedPlatformEnrollmentBundle.fromJson(value),
      throwsA(_securityCode('platform_certificate_chain_invalid')),
    );
    expect(certificate, everyElement(0));

    final extraKey = _enrollmentBundleJson()..['unexpected'] = true;
    final extraKeyCertificate = extraKey['certificateChainPem']! as Uint8List;
    expect(
      () => ConnectedPlatformEnrollmentBundle.fromJson(extraKey),
      throwsA(_securityCode('platform_enrollment_bundle_invalid')),
    );
    expect(extraKeyCertificate, everyElement(0));
  });

  test('enrollment bundle bounds certificate bytes and validity', () {
    final tooLarge = _enrollmentBundleJson();
    final tooLargeBytes = Uint8List(64 * 1024 + 1);
    tooLarge['certificateChainPem'] = tooLargeBytes;
    tooLarge['certificateChainSha256'] = crypto.sha256
        .convert(tooLargeBytes)
        .toString();
    expect(
      () => ConnectedPlatformEnrollmentBundle.fromJson(tooLarge),
      throwsA(_securityCode('platform_certificate_chain_invalid')),
    );
    expect(tooLargeBytes, everyElement(0));

    final invalidValidity = _enrollmentBundleJson()
      ..['expiresAt'] = '2026-10-31T00:00:00.000Z';
    final validityBytes = invalidValidity['certificateChainPem']! as Uint8List;
    expect(
      () => ConnectedPlatformEnrollmentBundle.fromJson(invalidValidity),
      throwsA(_securityCode('platform_enrollment_validity_invalid')),
    );
    expect(validityBytes, everyElement(0));
  });

  test('abort identity requires native cleanup confirmation', () async {
    final calls = <MethodCall>[];
    messenger.setMockMethodCallHandler(channel, (call) async {
      calls.add(call);
      return true;
    });
    final adapter = MethodChannelConnectedPlatformSecurity(channel: channel);
    await adapter.abortIdentity(
      alias: 'coordinator-1',
      requestDigest: 'a' * 64,
    );
    expect(calls.single.method, 'abortIdentity');
    expect(calls.single.arguments, {
      'schema': 'supermega.connected-platform-abort-request.v1',
      'alias': 'coordinator-1',
      'requestDigest': 'a' * 64,
    });
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
    late Uint8List certificateBytes;
    late Uint8List privateKeyBytes;
    messenger.setMockMethodCallHandler(channel, (call) async {
      expect(call.method, 'openTlsIdentity');
      certificateBytes = Uint8List.fromList(utf8.encode('CERTIFICATE'));
      privateKeyBytes = Uint8List.fromList(utf8.encode('PRIVATE-KEY'));
      return {
        'schema': 'supermega.connected-platform-tls-identity.v1',
        'certificatePem': certificateBytes,
        'privateKeyPem': privateKeyBytes,
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
    // StandardMethodCodec can copy typed data. Assert buffer ownership at the
    // parser boundary as well as zeroization of the decoded channel value.
    final ownedCertificate = Uint8List.fromList(certificateBytes);
    final ownedPrivateKey = Uint8List.fromList(privateKeyBytes);
    final owned = parseConnectedPlatformTlsIdentity({
      'schema': 'supermega.connected-platform-tls-identity.v1',
      'certificatePem': ownedCertificate,
      'privateKeyPem': ownedPrivateKey,
      'certificateFingerprintSha256': 'b' * 64,
    });
    owned.dispose();
    expect(ownedPrivateKey, everyElement(0));
    expect(ownedCertificate, everyElement(0));
  });

  test('malformed TLS response zeroizes returned secret buffers', () async {
    final certificateBytes = Uint8List.fromList(utf8.encode('CERTIFICATE'));
    final privateKeyBytes = Uint8List.fromList(utf8.encode('PRIVATE-KEY'));
    expect(
      () => parseConnectedPlatformTlsIdentity({
        'schema': 'wrong-schema',
        'certificatePem': certificateBytes,
        'privateKeyPem': privateKeyBytes,
        'certificateFingerprintSha256': 'b' * 64,
      }),
      throwsA(_securityCode('platform_tls_material_invalid')),
    );
    expect(privateKeyBytes, everyElement(0));
    expect(certificateBytes, everyElement(0));
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

Map<String, Object> _enrollmentRequestJson({String deviceId = 'device-1'}) {
  final signingKey = Uint8List.fromList(List<int>.generate(32, (i) => i));
  final tlsSpki = Uint8List.fromList(List<int>.generate(91, (i) => i + 1));
  final payload = <String, Object>{
    'schema': 'supermega.connected-platform-enrollment-request.v1',
    'alias': 'coordinator-1',
    'workspaceId': 'workspace-1',
    'siteId': 'site-1',
    'deviceId': deviceId,
    'sessionGeneration': 7,
    'signingKeyId': 'key-1',
    'signingAlgorithm': 'ed25519',
    'signingPublicKeyBase64': base64Encode(signingKey),
    'signingPublicKeyFingerprintSha256': crypto.sha256
        .convert(signingKey)
        .toString(),
    'tlsKeyId': 'tls-key-1',
    'tlsAlgorithm': 'ecdsa-p256',
    'tlsPublicKeySpkiBase64': base64Encode(tlsSpki),
    'tlsPublicKeyFingerprintSha256': crypto.sha256.convert(tlsSpki).toString(),
    'sealedTlsMaterialId': 'tls-1',
    'nonceBase64Url': base64UrlEncode(Uint8List(32)).replaceAll('=', ''),
    'createdAt': '2026-11-01T00:00:00.000Z',
  };
  return {...payload, 'requestDigest': connectedSiteSha256(payload)};
}

ConnectedPlatformEnrollmentBundle _enrollmentBundle() =>
    ConnectedPlatformEnrollmentBundle.fromJson(_enrollmentBundleJson());

Map<String, Object> _enrollmentBundleJson() {
  final certificate = Uint8List.fromList(
    ascii.encode(
      '-----BEGIN CERTIFICATE-----\nU1lOVEhFVElD\n-----END CERTIFICATE-----\n',
    ),
  );
  return <String, Object>{
    'schema': 'supermega.connected-platform-enrollment-bundle.v1',
    'requestDigest': _enrollmentRequestJson()['requestDigest']! as String,
    'alias': 'coordinator-1',
    'workspaceId': 'workspace-1',
    'siteId': 'site-1',
    'deviceId': 'device-1',
    'sessionGeneration': 7,
    'signingKeyId': 'key-1',
    'signingPublicKeyFingerprintSha256':
        _identityJson()['publicKeyFingerprintSha256']! as String,
    'tlsKeyId': 'tls-key-1',
    'tlsPublicKeyFingerprintSha256':
        _enrollmentRequestJson()['tlsPublicKeyFingerprintSha256']! as String,
    'sealedTlsMaterialId': 'tls-1',
    'nonceBase64Url': base64UrlEncode(Uint8List(32)).replaceAll('=', ''),
    'issuerKeyId': 'issuer-1',
    'certificateChainPem': certificate,
    'certificateChainSha256': crypto.sha256.convert(certificate).toString(),
    'tlsCertificateFingerprintSha256': 'b' * 64,
    'issuedAt': '2026-11-01T00:00:00.000Z',
    'expiresAt': '2027-01-01T00:00:00.000Z',
    'signatureAlgorithm': 'ed25519',
    'issuerSignatureBase64Url': base64UrlEncode(
      Uint8List.fromList(List<int>.generate(64, (i) => i)),
    ).replaceAll('=', ''),
  };
}

Matcher _securityCode(String code) => isA<ConnectedPlatformSecurityException>()
    .having((error) => error.code, 'code', code);
