import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;
import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_platform_security.dart';
import 'package:supermega_shop/shop_connected_site_attempt_store.dart';
import 'package:supermega_shop/shop_connected_site_client.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_connected_site_device_signer.dart';
import 'package:supermega_shop/shop_site_coordinator.dart';

void main() {
  late SimpleKeyPair keyPair;
  late SimplePublicKey publicKey;
  late ConnectedPlatformIdentity identity;

  setUp(() async {
    keyPair = await Ed25519().newKeyPairFromSeed(
      List<int>.generate(32, (index) => index + 1),
    );
    publicKey = await keyPair.extractPublicKey();
    identity = _identity(publicKey.bytes);
  });

  test(
    'maps retained public identity and signs through platform custody',
    () async {
      final security = _Security(identity: identity, keyPair: keyPair);
      final signer = ConnectedPlatformDeviceSigner(
        identity: identity,
        deviceId: 'device-1',
        platformSecurity: security,
      );
      final message = <int>[1, 2, 3, 4];

      final encoded = await signer.sign(message);
      final signature = base64Url.decode(base64Url.normalize(encoded));

      expect(signer.deviceId, 'device-1');
      expect(signer.signingKeyId, identity.publicKeyFingerprintSha256);
      expect(signer.clientFingerprint, identity.publicKeyFingerprintSha256);
      expect(
        signer.publicKeyBase64Url,
        base64UrlEncode(publicKey.bytes).replaceAll('=', ''),
      );
      expect(security.aliases, [
        'platform-alias',
        'platform-alias',
        'platform-alias',
      ]);
      expect(security.signedPayload, [1, 2, 3, 4]);
      expect(message, [1, 2, 3, 4]);
      expect(
        await Ed25519().verify(
          message,
          signature: Signature(signature, publicKey: publicKey),
        ),
        isTrue,
      );
    },
  );

  test('copies message bytes before handing them to platform code', () async {
    final security = _Security(
      identity: identity,
      keyPair: keyPair,
      mutateSigningPayload: true,
    );
    final signer = ConnectedPlatformDeviceSigner(
      identity: identity,
      deviceId: 'device-1',
      platformSecurity: security,
    );
    final message = <int>[8, 9, 10];

    await signer.sign(message);

    expect(message, [8, 9, 10]);
  });

  test('snapshots caller bytes before awaiting platform identity', () async {
    final allowLoad = Completer<void>();
    final loadStarted = Completer<void>();
    final security = _Security(
      identity: identity,
      keyPair: keyPair,
      allowFirstLoad: allowLoad,
      firstLoadStarted: loadStarted,
    );
    final signer = ConnectedPlatformDeviceSigner(
      identity: identity,
      deviceId: 'device-1',
      platformSecurity: security,
    );
    final message = <int>[5, 6, 7];

    final signing = signer.sign(message);
    await loadStarted.future;
    message[0] = 99;
    allowLoad.complete();
    final encoded = await signing;

    expect(security.signedPayload, [5, 6, 7]);
    expect(
      await Ed25519().verify(
        [5, 6, 7],
        signature: Signature(
          base64Url.decode(base64Url.normalize(encoded)),
          publicKey: publicKey,
        ),
      ),
      isTrue,
    );
  });

  test('rejects identity substitution before or after signing', () async {
    final foreignPair = await Ed25519().newKeyPairFromSeed(
      List<int>.generate(32, (index) => 32 - index),
    );
    final foreignIdentity = _identity(
      (await foreignPair.extractPublicKey()).bytes,
      alias: 'foreign-alias',
    );

    for (final sequence in <List<ConnectedPlatformIdentity>>[
      [foreignIdentity],
      [identity, foreignIdentity],
    ]) {
      final signer = ConnectedPlatformDeviceSigner(
        identity: identity,
        deviceId: 'device-1',
        platformSecurity: _Security(
          identity: identity,
          keyPair: keyPair,
          loadSequence: sequence,
        ),
      );
      await expectLater(
        signer.sign([1]),
        throwsA(
          isA<ConnectedPlatformSecurityException>().having(
            (error) => error.code,
            'code',
            'platform_signing_identity_substituted',
          ),
        ),
      );
    }
  });

  test('rejects malformed platform signatures and invalid inputs', () async {
    final signer = ConnectedPlatformDeviceSigner(
      identity: identity,
      deviceId: 'device-1',
      platformSecurity: _Security(
        identity: identity,
        keyPair: keyPair,
        signatureOverride: Uint8List(63),
      ),
    );

    await expectLater(
      signer.sign([1]),
      throwsA(
        isA<ConnectedPlatformSecurityException>().having(
          (error) => error.code,
          'code',
          'platform_signature_invalid',
        ),
      ),
    );
    await expectLater(
      signer.sign([256]),
      throwsA(
        isA<ConnectedPlatformSecurityException>().having(
          (error) => error.code,
          'code',
          'platform_signing_payload_invalid',
        ),
      ),
    );
    expect(
      () => ConnectedPlatformDeviceSigner(
        identity: identity,
        deviceId: ' device-1',
        platformSecurity: const UnavailableConnectedPlatformSecurity(),
      ),
      throwsArgumentError,
    );
    for (final invalid in ['device 1', 'device/1', 'device\n1']) {
      expect(
        () => ConnectedPlatformDeviceSigner(
          identity: identity,
          deviceId: invalid,
          platformSecurity: const UnavailableConnectedPlatformSecurity(),
        ),
        throwsArgumentError,
      );
    }
  });

  test('rejects a valid-length signature made by another key', () async {
    final foreignPair = await Ed25519().newKeyPairFromSeed(
      List<int>.generate(32, (index) => 32 - index),
    );
    final signer = ConnectedPlatformDeviceSigner(
      identity: identity,
      deviceId: 'device-1',
      platformSecurity: _Security(identity: identity, keyPair: foreignPair),
    );

    await expectLater(
      signer.sign([1, 2, 3]),
      throwsA(
        isA<ConnectedPlatformSecurityException>().having(
          (error) => error.code,
          'code',
          'platform_signature_identity_mismatch',
        ),
      ),
    );
  });

  test('produces a valid signed SiteCoordinatorClient request proof', () async {
    final security = _Security(identity: identity, keyPair: keyPair);
    final signer = ConnectedPlatformDeviceSigner(
      identity: identity,
      deviceId: 'device-1',
      platformSecurity: security,
    );
    final transport = _Transport();
    final pairing = _pairing();
    final client = SiteCoordinatorClient(
      pairing: pairing,
      bindingDigest: 'a' * 64,
      signer: signer,
      attempts: _Attempts(signer),
      transport: transport,
      runtimeEnabled: true,
      now: () => DateTime.utc(2026, 11, 2, 12),
      nonce: () => 'request_nonce_abcdefghijklmnop',
    );

    await client.readHealth();

    final request = transport.request!;
    final proof = CoordinatorRequestProof(
      workspaceId: pairing.workspaceId,
      siteId: pairing.siteId,
      coordinatorDeviceId: pairing.coordinatorDeviceId,
      clientFingerprint: signer.clientFingerprint,
      claimedDeviceId: signer.deviceId,
      issuedAt: DateTime.parse(request.headers['x-supermega-issued-at']!),
      nonce: request.headers['x-supermega-request-nonce']!,
      method: request.method,
      canonicalTarget: request.uri.path,
      bodySha256: crypto.sha256.convert(request.body).toString(),
      signature: request.headers['x-supermega-request-signature']!,
    );
    expect(
      await Ed25519().verify(
        proof.signingBytes,
        signature: Signature(
          base64Url.decode(base64Url.normalize(proof.signature)),
          publicKey: publicKey,
        ),
      ),
      isTrue,
    );
  });
}

ConnectedPlatformIdentity _identity(
  List<int> publicKey, {
  String alias = 'platform-alias',
}) => ConnectedPlatformIdentity(
  alias: alias,
  keyId: 'native-key-id',
  algorithm: 'ed25519',
  publicKeyBase64: base64Encode(publicKey),
  publicKeyFingerprintSha256: crypto.sha256.convert(publicKey).toString(),
  tlsCertificateFingerprintSha256: 'b' * 64,
  sealedTlsMaterialId: 'sealed-tls-id',
);

CoordinatorPairingV1 _pairing() => CoordinatorPairingV1(
  workspaceId: 'workspace-1',
  siteId: 'site-1',
  coordinatorDeviceId: 'coordinator-1',
  certificateSha256: 'c' * 64,
  address: '192.168.10.4',
  port: 9443,
  nonce: 'pairing_nonce_abcdefghijklmnop',
  issuedAt: DateTime.utc(2026, 11, 2, 11, 59).toIso8601String(),
  expiresAt: DateTime.utc(2026, 11, 2, 12, 2).toIso8601String(),
);

class _Security extends UnavailableConnectedPlatformSecurity {
  _Security({
    required this.identity,
    required this.keyPair,
    this.loadSequence = const [],
    this.signatureOverride,
    this.mutateSigningPayload = false,
    this.allowFirstLoad,
    this.firstLoadStarted,
  });

  final ConnectedPlatformIdentity identity;
  final SimpleKeyPair keyPair;
  final List<ConnectedPlatformIdentity> loadSequence;
  final Uint8List? signatureOverride;
  final bool mutateSigningPayload;
  final Completer<void>? allowFirstLoad;
  final Completer<void>? firstLoadStarted;
  final aliases = <String>[];
  List<int>? signedPayload;
  var _loads = 0;

  @override
  Future<ConnectedPlatformIdentity> loadIdentity({
    required String alias,
  }) async {
    aliases.add(alias);
    if (alias != identity.alias) {
      throw const ConnectedPlatformSecurityException(
        'platform_identity_not_found',
      );
    }
    if (_loads == 0 && allowFirstLoad != null) {
      firstLoadStarted?.complete();
      await allowFirstLoad!.future;
    }
    if (_loads < loadSequence.length) return loadSequence[_loads++];
    _loads += 1;
    return identity;
  }

  @override
  Future<Uint8List> sign({
    required String alias,
    required Uint8List payload,
  }) async {
    aliases.add(alias);
    if (alias != identity.alias) {
      throw const ConnectedPlatformSecurityException(
        'platform_identity_not_found',
      );
    }
    signedPayload = List<int>.from(payload);
    final signature =
        signatureOverride ??
        Uint8List.fromList(
          (await Ed25519().sign(payload, keyPair: keyPair)).bytes,
        );
    if (mutateSigningPayload) payload.fillRange(0, payload.length, 0);
    return Uint8List.fromList(signature);
  }
}

class _Attempts extends UnavailableConnectedSiteCommandAttemptStore {
  const _Attempts(this.signer);

  final ConnectedSiteDeviceSigner signer;

  @override
  Future<ConnectedSiteApprovedBinding> resolveActiveBinding({
    required String bindingDigest,
    required String workspaceId,
    required String siteId,
    required String clientDeviceId,
    required String clientFingerprint,
    required String clientSigningKeyId,
  }) async {
    if (bindingDigest != 'a' * 64 ||
        workspaceId != 'workspace-1' ||
        siteId != 'site-1' ||
        clientDeviceId != signer.deviceId ||
        clientFingerprint != signer.clientFingerprint ||
        clientSigningKeyId != signer.signingKeyId) {
      throw StateError('binding_substituted');
    }
    return ConnectedSiteApprovedBinding(
      bindingDigest: bindingDigest,
      workspaceId: workspaceId,
      siteId: siteId,
      coordinatorDeviceId: 'coordinator-1',
      clientDeviceId: clientDeviceId,
      clientFingerprint: clientFingerprint,
      clientSigningKeyId: clientSigningKeyId,
      approvalGeneration: 1,
      address: '192.168.10.4',
      port: 9443,
      certificateSha256: 'c' * 64,
    );
  }
}

class _Request {
  const _Request(this.uri, this.method, this.headers, this.body);
  final Uri uri;
  final String method;
  final Map<String, String> headers;
  final Uint8List body;
}

class _Transport implements ConnectedSiteHttpTransport {
  _Request? request;

  @override
  Future<ConnectedSiteHttpResponse> send({
    required Uri uri,
    required String method,
    required Map<String, String> headers,
    required Uint8List body,
    required String certificateSha256,
  }) async {
    request = _Request(
      uri,
      method,
      Map<String, String>.unmodifiable(headers),
      Uint8List.fromList(body),
    );
    return ConnectedSiteHttpResponse(
      statusCode: 200,
      contentType: 'application/json',
      body: Uint8List.fromList(
        utf8.encode(
          canonicalConnectedSiteJson({
            'schema': 'supermega.connected-site.health.v1',
            'protocolVersion': connectedSiteProtocolVersion,
            'status': 'alive',
          }),
        ),
      ),
    );
  }
}
