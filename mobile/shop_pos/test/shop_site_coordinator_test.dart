import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart' as crypto;
import 'package:cryptography/cryptography.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:supermega_shop/shop_connected_coordinator_host.dart';
import 'package:supermega_shop/shop_connected_site_contracts.dart';
import 'package:supermega_shop/shop_connected_trusted_time_authority.dart';
import 'package:supermega_shop/shop_connected_trusted_time_contract.dart';
import 'package:supermega_shop/shop_connected_runtime.dart';
import 'package:supermega_shop/shop_offline_staff_lease.dart';
import 'package:supermega_shop/shop_site_coordinator.dart';
import 'package:supermega_shop/shop_staff_authorization.dart';

late SimpleKeyPair _clientKeyPair;
late SimplePublicKey _clientPublicKey;
late String _encodedClientPublicKey;
late String _fingerprint;
late Directory _tlsFixtureDirectory;
late String _testCertificatePem;
late String _testPrivateKeyPem;
final _now = DateTime.utc(2026, 10, 31, 12);
const _digest =
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const _eventDigest =
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';

void main() {
  setUpAll(() async {
    _clientKeyPair = await Ed25519().newKeyPair();
    _clientPublicKey = await _clientKeyPair.extractPublicKey();
    _encodedClientPublicKey = base64Url
        .encode(_clientPublicKey.bytes)
        .replaceAll('=', '');
    _fingerprint = crypto.sha256.convert(_clientPublicKey.bytes).toString();
    final fixture = await _createEphemeralTlsFixture();
    _tlsFixtureDirectory = fixture.directory;
    _testCertificatePem = fixture.certificatePem;
    _testPrivateKeyPem = fixture.privateKeyPem;
  });
  tearDownAll(() async => _tlsFixtureDirectory.delete(recursive: true));
  group('coordinator bind policy', () {
    test('transport requires the server runtime write gate', () {
      SiteCoordinatorServer serverFor(ShopConnectedSharedWriteGate writes) {
        final keys = _ClientKeys();
        return SiteCoordinatorServer(
          runtimeEnabled: true,
          sharedWriteAvailability: writes,
          pairing: _NonceStore(),
          requestAuthenticator: Ed25519CoordinatorRequestAuthenticator(
            clients: keys,
            nonces: _RequestNonces(),
            now: () => _now,
          ),
          commands: _Commands(),
          replication: _Replication(),
          health: _Health(),
          pairingResponse: _pairing(),
          now: () => _now,
        );
      }

      final writes = ShopConnectedSharedWriteGate();
      final server = serverFor(writes);
      expect(
        SiteCoordinatorServerTransport(
          server: server,
          sharedWrites: writes,
        ).sharedWrites,
        same(writes),
      );
      expect(
        () => SiteCoordinatorServerTransport(
          server: server,
          sharedWrites: ShopConnectedSharedWriteGate(),
        ),
        throwsA(
          isA<StateError>().having(
            (error) => error.message,
            'message',
            'connected_transport_shared_write_gate_mismatch',
          ),
        ),
      );
    });

    test('accepts private addresses and rejects wildcard/public addresses', () {
      expect(
        isPermittedCoordinatorBindAddress(InternetAddress('192.168.10.4')),
        isTrue,
      );
      expect(
        isPermittedCoordinatorBindAddress(InternetAddress('10.1.2.3')),
        isTrue,
      );
      expect(
        isPermittedCoordinatorBindAddress(InternetAddress('8.8.8.8')),
        isFalse,
      );
      expect(
        isPermittedCoordinatorBindAddress(InternetAddress.anyIPv4),
        isFalse,
      );
      expect(
        isPermittedCoordinatorBindAddress(InternetAddress.loopbackIPv4),
        isFalse,
      );
      expect(
        isPermittedCoordinatorBindAddress(
          InternetAddress.loopbackIPv4,
          allowLoopbackForSimulation: true,
        ),
        isTrue,
      );
    });

    test(
      'derives TLS identity from leaf PEM and rejects QR mismatch before bind',
      () async {
        final identity = CoordinatorTlsIdentity.fromPem(
          certificateChainPem: Uint8List.fromList(
            utf8.encode(_testCertificatePem),
          ),
          privateKeyPem: Uint8List.fromList(utf8.encode(_testPrivateKeyPem)),
        );
        expect(
          identity.leafCertificateSha256,
          matches(RegExp(r'^[0-9a-f]{64}$')),
        );
        expect(identity.leafCertificateSha256, isNot(_digest));
        final keys = _ClientKeys();
        final server = SiteCoordinatorServer(
          runtimeEnabled: true,
          pairing: _NonceStore(),
          requestAuthenticator: Ed25519CoordinatorRequestAuthenticator(
            clients: keys,
            nonces: _RequestNonces(),
            now: () => _now,
          ),
          commands: _Commands(),
          replication: _Replication(),
          health: _Health(),
          pairingResponse: _pairing(),
          now: () => _now,
        );
        await expectLater(
          server.start(
            address: InternetAddress.loopbackIPv4,
            port: 0,
            tlsIdentity: identity,
            allowLoopbackForSimulation: true,
          ),
          throwsA(
            isA<StateError>().having(
              (error) => error.message,
              'message',
              'connected_site_tls_identity_mismatch',
            ),
          ),
        );
        expect(server.isRunning, isFalse);
      },
    );

    test(
      'forced stop drains an incomplete TLS request before returning',
      () async {
        final identity = CoordinatorTlsIdentity.fromPem(
          certificateChainPem: Uint8List.fromList(
            utf8.encode(_testCertificatePem),
          ),
          privateKeyPem: Uint8List.fromList(utf8.encode(_testPrivateKeyPem)),
        );
        final keys = _ClientKeys();
        final server = SiteCoordinatorServer(
          runtimeEnabled: true,
          pairing: _NonceStore(),
          requestAuthenticator: Ed25519CoordinatorRequestAuthenticator(
            clients: keys,
            nonces: _RequestNonces(),
            now: () => _now,
          ),
          commands: _Commands(),
          replication: _Replication(),
          health: _Health(),
          pairingResponse: _pairing(
            certificateSha256: identity.leafCertificateSha256,
          ),
          now: () => _now,
        );
        await server.start(
          address: InternetAddress.loopbackIPv4,
          port: 0,
          tlsIdentity: identity,
          allowLoopbackForSimulation: true,
        );
        final client = HttpClient()..badCertificateCallback = (_, _, _) => true;
        try {
          final request = await client.postUrl(
            Uri.parse('https://127.0.0.1:${server.boundPort}/v1/pair'),
          );
          request.contentLength = 10;
          request.add(const [1]);
          await request.flush();

          await server.stop().timeout(const Duration(seconds: 2));
          expect(server.isRunning, isFalse);
          await server.stop();
        } finally {
          client.close(force: true);
          if (server.isRunning) await server.stop();
        }
      },
    );
  });

  group('coordinator protocol dispatcher (loopback-free simulation)', () {
    late _NonceStore nonces;
    late _ClientKeys clientKeys;
    late _RequestNonces requestNonces;
    late CoordinatorRequestAuthenticator authenticator;
    late _Enrollment enrollment;
    late _SiteAuthorization siteAuthorization;
    late _Capabilities capabilities;
    late _WriteAvailability writes;
    late _Commands commands;
    late _Replication replication;
    late SiteCoordinatorServer coordinator;

    setUp(() {
      nonces = _NonceStore();
      clientKeys = _ClientKeys();
      requestNonces = _RequestNonces();
      authenticator = Ed25519CoordinatorRequestAuthenticator(
        clients: clientKeys,
        nonces: requestNonces,
        now: () => _now,
      );
      commands = _Commands();
      replication = _Replication();
      enrollment = _Enrollment();
      siteAuthorization = _SiteAuthorization();
      capabilities = _Capabilities();
      writes = _WriteAvailability()..available = true;
      coordinator = SiteCoordinatorServer(
        runtimeEnabled: true,
        sharedWriteAvailability: writes,
        pairing: nonces,
        requestAuthenticator: authenticator,
        commands: commands,
        commandSignatureVerifier: Ed25519SiteCommandSignatureVerifier(
          clients: clientKeys,
          coordinatorDeviceId: 'device_counter',
        ),
        deviceEnrollment: enrollment,
        siteAuthorization: siteAuthorization,
        commandCapabilities: capabilities,
        replication: replication,
        health: _Health(),
        pairingResponse: _pairing(),
        now: () => _now,
      );
    });

    test('default-off coordinator rejects every request', () async {
      final disabled = SiteCoordinatorServer(
        pairing: nonces,
        requestAuthenticator: authenticator,
        commands: commands,
        commandSignatureVerifier: Ed25519SiteCommandSignatureVerifier(
          clients: clientKeys,
          coordinatorDeviceId: 'device_counter',
        ),
        replication: replication,
        health: _Health(),
        pairingResponse: _pairing(),
        now: () => _now,
      );
      final result = await disabled.dispatch(
        _request('GET', connectedSiteHealthPath),
      );
      expect(result.statusCode, HttpStatus.serviceUnavailable);
      expect(result.body['error'], 'connected_site_disabled');
    });

    test(
      'trusted-time v2 is separately default-off and dependency silent',
      () async {
        final authority = _TimeAuthority();
        final server = SiteCoordinatorServer(
          runtimeEnabled: true,
          trustedTimeAuthority: authority,
          pairing: nonces,
          requestAuthenticator: authenticator,
          commands: commands,
          replication: replication,
          health: _Health(),
          pairingResponse: _pairing(),
          now: () => _now,
        );

        final response = await server.dispatch(
          _request('POST', connectedTrustedTimeV2Path),
        );

        expect(response.statusCode, HttpStatus.notFound);
        expect(authority.calls, 0);
        expect(requestNonces.consumed, isEmpty);
      },
    );

    test(
      'trusted-time v2 authenticates exact scope and returns canonical wire',
      () async {
        _enroll(clientKeys);
        final authority = _TimeAuthority();
        final server = SiteCoordinatorServer(
          runtimeEnabled: true,
          trustedTimeV2Enabled: true,
          trustedTimeAuthority: authority,
          pairing: nonces,
          requestAuthenticator: authenticator,
          commands: commands,
          deviceEnrollment: enrollment,
          replication: replication,
          health: _Health(),
          pairingResponse: _pairing(),
          now: () => _now,
        );
        final wire = _trustedTimeWire();

        final signed = await _signedRequest(
          'POST',
          connectedTrustedTimeV2Path,
          body: wire.canonicalBytes,
          contentType: true,
          nonce: 'request_nonce_trusted_time_v2_01',
          protocolVersion: connectedTrustedTimeWireProtocolVersion,
        );
        final response = await server.dispatch(signed);
        final replay = await server.dispatch(signed);

        expect(response.statusCode, HttpStatus.ok);
        expect(response.canonicalJson, isTrue);
        final decoded = ConnectedTrustedTimeWireResponseV2.fromJson(
          response.body,
          request: wire,
        );
        expect(
          decoded.observation.challenge.requestDigest,
          wire.request.challenge.requestDigest,
        );
        expect(authority.calls, 1);
        expect(replay.statusCode, HttpStatus.forbidden);
        expect(siteAuthorization.calls, 0);
        expect(commands.handled, 0);
      },
    );

    test(
      'trusted-time proof version and route cannot be substituted',
      () async {
        _enroll(clientKeys);
        final authority = _TimeAuthority();
        final server = SiteCoordinatorServer(
          runtimeEnabled: true,
          trustedTimeV2Enabled: true,
          trustedTimeAuthority: authority,
          pairing: nonces,
          requestAuthenticator: authenticator,
          commands: commands,
          deviceEnrollment: enrollment,
          replication: replication,
          health: _Health(),
          pairingResponse: _pairing(),
          now: () => _now,
        );
        final wire = _trustedTimeWire();

        final v1Proof = await server.dispatch(
          await _signedRequest(
            'POST',
            connectedTrustedTimeV2Path,
            body: wire.canonicalBytes,
            contentType: true,
            nonce: 'request_nonce_trusted_time_v1_01',
          ),
        );
        final v2OnV1 = await _signedProof(
          method: 'GET',
          target: connectedSiteSnapshotPath,
          body: const [],
          nonce: 'request_nonce_trusted_time_route_01',
          protocolVersion: connectedTrustedTimeWireProtocolVersion,
        );

        expect(v1Proof.statusCode, HttpStatus.forbidden);
        expect(await authenticator.verifyAndConsume(v2OnV1), isFalse);
        expect(authority.calls, 0);
        expect(requestNonces.consumed, isEmpty);
      },
    );

    test(
      'trusted-time malformed, substituted and unavailable paths fail closed',
      () async {
        _enroll(clientKeys);
        SiteCoordinatorServer serverFor(
          ConnectedTrustedTimeCoordinatorAuthority authority,
        ) => SiteCoordinatorServer(
          runtimeEnabled: true,
          trustedTimeV2Enabled: true,
          trustedTimeAuthority: authority,
          pairing: nonces,
          requestAuthenticator: authenticator,
          commands: commands,
          deviceEnrollment: enrollment,
          replication: replication,
          health: _Health(),
          pairingResponse: _pairing(),
          now: () => _now,
        );
        final malformed = await serverFor(_TimeAuthority()).dispatch(
          await _signedRequest(
            'POST',
            connectedTrustedTimeV2Path,
            body: utf8.encode('{}'),
            contentType: true,
            nonce: 'request_nonce_trusted_time_bad_01',
            protocolVersion: connectedTrustedTimeWireProtocolVersion,
          ),
        );
        final wrongScope = _trustedTimeWire(siteId: 'site_2');
        final scopeResponse = await serverFor(_TimeAuthority()).dispatch(
          await _signedRequest(
            'POST',
            connectedTrustedTimeV2Path,
            body: wrongScope.canonicalBytes,
            contentType: true,
            nonce: 'request_nonce_trusted_time_scope_01',
            protocolVersion: connectedTrustedTimeWireProtocolVersion,
          ),
        );
        final wire = _trustedTimeWire();
        final unavailable =
            await serverFor(
              const UnavailableConnectedTrustedTimeCoordinatorAuthority(),
            ).dispatch(
              await _signedRequest(
                'POST',
                connectedTrustedTimeV2Path,
                body: wire.canonicalBytes,
                contentType: true,
                nonce: 'request_nonce_trusted_time_unavailable_01',
                protocolVersion: connectedTrustedTimeWireProtocolVersion,
              ),
            );
        final substituted =
            await serverFor(_TimeAuthority(substituteChallenge: true)).dispatch(
              await _signedRequest(
                'POST',
                connectedTrustedTimeV2Path,
                body: wire.canonicalBytes,
                contentType: true,
                nonce: 'request_nonce_trusted_time_substitute_01',
                protocolVersion: connectedTrustedTimeWireProtocolVersion,
              ),
            );

        expect(malformed.statusCode, HttpStatus.badRequest);
        expect(scopeResponse.statusCode, HttpStatus.forbidden);
        expect(unavailable.statusCode, HttpStatus.serviceUnavailable);
        expect(substituted.statusCode, HttpStatus.internalServerError);
        expect(
          substituted.body['error'],
          'trusted_time_observation_binding_failed',
        );
      },
    );

    test(
      'command dispatch stays paused until runtime resumes writes',
      () async {
        _enroll(clientKeys);
        writes.available = false;
        final command = await _command();

        final response = await coordinator.dispatch(
          await _signedJsonRequest(
            'POST',
            connectedSiteCommandsPath,
            command.toJson(),
            nonce: 'request_nonce_gate_paused_01',
          ),
        );

        expect(response.statusCode, HttpStatus.serviceUnavailable);
        expect(response.body['error'], 'connected_site_shared_writes_paused');
        expect(siteAuthorization.calls, 0);
        expect(commands.handled, 0);
      },
    );

    test('omitting the application write gate fails closed', () async {
      _enroll(clientKeys);
      final command = await _command();
      final server = SiteCoordinatorServer(
        runtimeEnabled: true,
        pairing: nonces,
        requestAuthenticator: authenticator,
        commands: commands,
        commandSignatureVerifier: Ed25519SiteCommandSignatureVerifier(
          clients: clientKeys,
          coordinatorDeviceId: 'device_counter',
        ),
        deviceEnrollment: enrollment,
        siteAuthorization: siteAuthorization,
        commandCapabilities: capabilities,
        replication: replication,
        health: _Health(),
        pairingResponse: _pairing(),
        now: () => _now,
      );

      final response = await server.dispatch(
        await _signedJsonRequest(
          'POST',
          connectedSiteCommandsPath,
          command.toJson(),
          nonce: 'request_nonce_gate_default_01',
        ),
      );

      expect(response.statusCode, HttpStatus.serviceUnavailable);
      expect(response.body['error'], 'connected_site_shared_writes_paused');
      expect(siteAuthorization.calls, 0);
      expect(commands.handled, 0);
    });

    test('pause during authorization prevents database mutation', () async {
      _enroll(clientKeys);
      siteAuthorization.onAuthorize = () => writes.available = false;
      final command = await _command();

      final response = await coordinator.dispatch(
        await _signedJsonRequest(
          'POST',
          connectedSiteCommandsPath,
          command.toJson(),
          nonce: 'request_nonce_gate_race_0001',
        ),
      );

      expect(response.statusCode, HttpStatus.serviceUnavailable);
      expect(response.body['error'], 'connected_site_shared_writes_paused');
      expect(siteAuthorization.calls, 1);
      expect(commands.handled, 0);
    });

    test(
      'timed out command keeps write lease until raw handler completes',
      () async {
        _enroll(clientKeys);
        final gate = ShopConnectedSharedWriteGate();
        await gate.resume();
        final delayedCommands = _Commands()..barrier = Completer<void>();
        final server = SiteCoordinatorServer(
          runtimeEnabled: true,
          sharedWriteAvailability: gate,
          requestTimeout: const Duration(milliseconds: 100),
          pairing: nonces,
          requestAuthenticator: authenticator,
          commands: delayedCommands,
          commandSignatureVerifier: Ed25519SiteCommandSignatureVerifier(
            clients: clientKeys,
            coordinatorDeviceId: 'device_counter',
          ),
          deviceEnrollment: enrollment,
          siteAuthorization: siteAuthorization,
          commandCapabilities: capabilities,
          replication: replication,
          health: _Health(),
          pairingResponse: _pairing(),
          now: () => _now,
        );
        final command = await _command();

        final response = await server.dispatch(
          await _signedJsonRequest(
            'POST',
            connectedSiteCommandsPath,
            command.toJson(),
            nonce: 'request_nonce_gate_timeout_01',
          ),
        );
        expect(response.statusCode, HttpStatus.gatewayTimeout);
        expect(delayedCommands.handled, 1);
        expect(gate.activeWrites, 1);

        var pauseCompleted = false;
        final pause = gate
            .pause('connected_runtime_stopping')
            .then((_) => pauseCompleted = true);
        await Future<void>.delayed(Duration.zero);
        expect(pauseCompleted, isFalse);

        delayedCommands.barrier!.complete();
        await pause;
        expect(pauseCompleted, isTrue);
        expect(gate.activeWrites, 0);
      },
    );

    test(
      'consumes pairing nonce once and returns no issuer authority',
      () async {
        final first = await coordinator.dispatch(
          _jsonRequest('POST', connectedSitePairPath, {
            'schema': 'supermega.connected-site.pair-request.v1',
            'protocolVersion': 1,
            'nonce': 'nonce_abcdefghijklmnopqrstu',
            'clientFingerprint': _fingerprint,
            'clientPublicKey': _encodedClientPublicKey,
            'keyAlgorithm': 'ed25519',
          }),
        );
        final replay = await coordinator.dispatch(
          _jsonRequest('POST', connectedSitePairPath, {
            'schema': 'supermega.connected-site.pair-request.v1',
            'protocolVersion': 1,
            'nonce': 'nonce_abcdefghijklmnopqrstu',
            'clientFingerprint': _fingerprint,
            'clientPublicKey': _encodedClientPublicKey,
            'keyAlgorithm': 'ed25519',
          }),
        );

        expect(first.statusCode, HttpStatus.ok);
        expect(first.body['enrollmentState'], 'pending');
        expect(first.body, isNot(contains('paired')));
        expect(first.body, isNot(contains('token')));
        expect(first.body, isNot(contains('lease')));
        expect(nonces.lastClaim?.workspaceId, 'workspace_1');
        expect(nonces.lastClaim?.siteId, 'site_1');
        expect(nonces.lastClaim?.coordinatorDeviceId, 'device_counter');
        expect(nonces.lastClaim?.expiresAt, DateTime.utc(2026, 10, 31, 12, 2));
        expect(replay.statusCode, HttpStatus.forbidden);
        expect(replay.body['error'], 'pairing_denied');
      },
    );

    test('unavailable verified time denies pairing before nonce use', () async {
      final unavailable = SiteCoordinatorServer(
        runtimeEnabled: true,
        sharedWriteAvailability: writes,
        pairing: nonces,
        requestAuthenticator: authenticator,
        commands: commands,
        replication: replication,
        health: _Health(),
        pairingResponse: _pairing(),
        now: () async => throw StateError('trusted_time_unavailable'),
      );
      final result = await unavailable.dispatch(
        _jsonRequest('POST', connectedSitePairPath, {
          'schema': 'supermega.connected-site.pair-request.v1',
          'protocolVersion': 1,
          'nonce': 'nonce_abcdefghijklmnopqrstu',
          'clientFingerprint': _fingerprint,
          'clientPublicKey': _encodedClientPublicKey,
          'keyAlgorithm': 'ed25519',
        }),
      );

      expect(result.statusCode, HttpStatus.internalServerError);
      expect(nonces.consumed, isEmpty);
    });

    test('rejects bearer, cookie and API-key ambient authority', () async {
      for (final header in ['authorization', 'cookie', 'x-api-key', 'apikey']) {
        final result = await coordinator.dispatch(
          _request(
            'GET',
            connectedSiteHealthPath,
            headers: {header: 'secret-value'},
          ),
        );
        expect(result.statusCode, HttpStatus.badRequest, reason: header);
        expect(result.body['error'], 'ambient_authority_rejected');
      }
    });

    test('rejects a pairing key that does not match its fingerprint', () async {
      final result = await coordinator.dispatch(
        _jsonRequest('POST', connectedSitePairPath, {
          'schema': 'supermega.connected-site.pair-request.v1',
          'protocolVersion': 1,
          'nonce': 'nonce_differentabcdefghijkl',
          'clientFingerprint': _digest,
          'clientPublicKey': _encodedClientPublicKey,
          'keyAlgorithm': 'ed25519',
        }),
      );
      expect(result.statusCode, HttpStatus.badRequest);
      expect(nonces.consumed, isEmpty);
    });

    test('rejects non-canonical Ed25519 public-key length', () async {
      final bytes = List<int>.generate(33, (index) => index);
      final result = await coordinator.dispatch(
        _jsonRequest('POST', connectedSitePairPath, {
          'schema': 'supermega.connected-site.pair-request.v1',
          'protocolVersion': 1,
          'nonce': 'nonce_abcdefghijklmnopqrstu',
          'clientFingerprint': crypto.sha256.convert(bytes).toString(),
          'clientPublicKey': base64Url.encode(bytes).replaceAll('=', ''),
          'keyAlgorithm': 'ed25519',
        }),
      );
      expect(result.statusCode, HttpStatus.badRequest);
      expect(nonces.consumed, isEmpty);
    });

    test(
      'rejects wrong nonce, key algorithm, scope and expired pairing',
      () async {
        Future<SiteCoordinatorResponse> pairWith(
          SiteCoordinatorServer server, {
          String nonce = 'nonce_abcdefghijklmnopqrstu',
          String keyAlgorithm = 'ed25519',
        }) => server.dispatch(
          _jsonRequest('POST', connectedSitePairPath, {
            'schema': 'supermega.connected-site.pair-request.v1',
            'protocolVersion': 1,
            'nonce': nonce,
            'clientFingerprint': _fingerprint,
            'clientPublicKey': _encodedClientPublicKey,
            'keyAlgorithm': keyAlgorithm,
          }),
        );

        expect(
          (await pairWith(
            coordinator,
            nonce: 'nonce_wrong_abcdefghijklmnop',
          )).statusCode,
          HttpStatus.badRequest,
        );
        expect(
          (await pairWith(coordinator, keyAlgorithm: 'x25519')).statusCode,
          HttpStatus.badRequest,
        );

        final wrongScope = SiteCoordinatorServer(
          runtimeEnabled: true,
          pairing: _NonceStore(),
          requestAuthenticator: authenticator,
          commands: commands,
          deviceEnrollment: enrollment,
          siteAuthorization: siteAuthorization,
          commandCapabilities: capabilities,
          commandSignatureVerifier: Ed25519SiteCommandSignatureVerifier(
            clients: clientKeys,
            coordinatorDeviceId: 'device_counter',
          ),
          replication: replication,
          health: _Health(),
          pairingResponse: _pairing(workspaceId: 'workspace_other'),
          now: () => _now,
        );
        expect((await pairWith(wrongScope)).statusCode, HttpStatus.forbidden);

        final expired = SiteCoordinatorServer(
          runtimeEnabled: true,
          pairing: _NonceStore(),
          requestAuthenticator: authenticator,
          commands: commands,
          commandSignatureVerifier: Ed25519SiteCommandSignatureVerifier(
            clients: clientKeys,
            coordinatorDeviceId: 'device_counter',
          ),
          replication: replication,
          health: _Health(),
          pairingResponse: _pairing(
            issuedAt: '2026-10-31T11:50:00.000Z',
            expiresAt: '2026-10-31T11:55:00.000Z',
          ),
          now: () => _now,
        );
        expect((await pairWith(expired)).statusCode, HttpStatus.badRequest);
      },
    );

    test('requires a valid paired-key proof for commands', () async {
      final command = await _command();
      final denied = await coordinator.dispatch(
        _jsonRequest('POST', connectedSiteCommandsPath, command.toJson()),
      );
      _enroll(clientKeys);
      final invalidSignature = await coordinator.dispatch(
        _jsonRequest(
          'POST',
          connectedSiteCommandsPath,
          command.toJson(),
          headers: {
            ..._proofHeaders(
              issuedAt: _now,
              nonce: 'request_nonce_invalid_0001',
              signature: 'A' * 86,
            ),
          },
        ),
      );

      expect(denied.statusCode, HttpStatus.forbidden);
      expect(invalidSignature.statusCode, HttpStatus.forbidden);

      final signed = await _signedJsonRequest(
        'POST',
        connectedSiteCommandsPath,
        command.toJson(),
        nonce: 'request_nonce_command_0001',
      );
      final accepted = await coordinator.dispatch(signed);
      expect(accepted.statusCode, HttpStatus.ok);
      expect(accepted.body['state'], 'accepted');
      expect(commands.handled, 1);

      final replay = await coordinator.dispatch(signed);
      expect(replay.statusCode, HttpStatus.forbidden);
      expect(commands.handled, 1);
    });

    test(
      'pending enrollment and approved device without lease stay denied',
      () async {
        _enroll(clientKeys);
        enrollment.state = CoordinatorDeviceEnrollmentState.pending;
        final pending = await coordinator.dispatch(
          await _signedJsonRequest(
            'POST',
            connectedSiteCommandsPath,
            (await _command()).toJson(),
            nonce: 'request_nonce_pending_0001',
          ),
        );
        expect(pending.statusCode, HttpStatus.forbidden);
        expect(pending.body['error'], 'client_not_authorized');

        enrollment.state = CoordinatorDeviceEnrollmentState.approved;
        siteAuthorization.allowed = false;
        final noLease = await coordinator.dispatch(
          await _signedJsonRequest(
            'POST',
            connectedSiteCommandsPath,
            (await _command()).toJson(),
            nonce: 'request_nonce_no_lease_0001',
          ),
        );
        final noReadLease = await coordinator.dispatch(
          await _signedRequest(
            'GET',
            '$connectedSiteDeltaPath?after=0',
            nonce: 'request_nonce_no_lease_0002',
          ),
        );
        expect(noLease.statusCode, HttpStatus.forbidden);
        expect(noLease.body['error'], 'site_authorization_denied');
        expect(noReadLease.statusCode, HttpStatus.forbidden);
        expect(commands.handled, 0);
      },
    );

    test('same key cannot submit a command for another workspace or site', () async {
      _enroll(clientKeys);
      for (final command in [
        await _command(workspaceId: 'workspace_other'),
        await _command(siteId: 'site_other'),
      ]) {
        final result = await coordinator.dispatch(
          await _signedJsonRequest(
            'POST',
            connectedSiteCommandsPath,
            command.toJson(),
            nonce:
                'request_nonce_cross_scope_${command.workspaceId}_${command.siteId}',
          ),
        );
        expect(result.statusCode, HttpStatus.forbidden);
        expect(result.body['error'], 'command_scope_mismatch');
      }
      expect(commands.handled, 0);
      expect(siteAuthorization.calls, 0);
    });

    test(
      'fails closed when handler acknowledgment is not command-bound',
      () async {
        _enroll(clientKeys);
        commands.bindCorrectly = false;
        final result = await coordinator.dispatch(
          await _signedJsonRequest(
            'POST',
            connectedSiteCommandsPath,
            (await _command()).toJson(),
            nonce: 'request_nonce_command_0002',
          ),
        );
        expect(result.statusCode, HttpStatus.internalServerError);
        expect(result.body['error'], 'command_ack_binding_failed');
      },
    );

    test(
      'requires the inner command signature verifier and paired key id',
      () async {
        _enroll(clientKeys);
        final unsignedServer = SiteCoordinatorServer(
          runtimeEnabled: true,
          sharedWriteAvailability: _WriteAvailability()..available = true,
          pairing: nonces,
          requestAuthenticator: authenticator,
          commands: commands,
          deviceEnrollment: enrollment,
          siteAuthorization: siteAuthorization,
          commandCapabilities: capabilities,
          replication: replication,
          health: _Health(),
          pairingResponse: _pairing(),
          now: () => _now,
        );
        final command = await _command();
        final unavailable = await unsignedServer.dispatch(
          await _signedJsonRequest(
            'POST',
            connectedSiteCommandsPath,
            command.toJson(),
            nonce: 'request_nonce_inner_0001',
          ),
        );
        expect(unavailable.statusCode, HttpStatus.serviceUnavailable);
        expect(
          unavailable.body['error'],
          'command_signature_verifier_unavailable',
        );

        final corrupt = await _command(corruptSignature: true);
        final invalid = await coordinator.dispatch(
          await _signedJsonRequest(
            'POST',
            connectedSiteCommandsPath,
            corrupt.toJson(),
            nonce: 'request_nonce_inner_0002',
          ),
        );
        expect(invalid.statusCode, HttpStatus.forbidden);
        expect(invalid.body['error'], 'command_signature_invalid');

        final wrongKey = await _command(signingKeyId: 'device_key_other');
        final wrongKeyResult = await coordinator.dispatch(
          await _signedJsonRequest(
            'POST',
            connectedSiteCommandsPath,
            wrongKey.toJson(),
            nonce: 'request_nonce_inner_0003',
          ),
        );
        expect(wrongKeyResult.statusCode, HttpStatus.forbidden);
        expect(commands.handled, 0);
      },
    );

    test('strictly validates delta cursor and binds returned cursor', () async {
      _enroll(clientKeys);
      final invalid = await coordinator.dispatch(
        await _signedRequest(
          'GET',
          '$connectedSiteDeltaPath?after=01',
          nonce: 'request_nonce_delta_0001',
        ),
      );
      final valid = await coordinator.dispatch(
        await _signedRequest(
          'GET',
          '$connectedSiteDeltaPath?after=0',
          nonce: 'request_nonce_delta_0002',
        ),
      );
      replication.returnWrongCursor = true;
      final mismatched = await coordinator.dispatch(
        await _signedRequest(
          'GET',
          '$connectedSiteDeltaPath?after=2',
          nonce: 'request_nonce_delta_0003',
        ),
      );

      expect(invalid.statusCode, HttpStatus.badRequest);
      expect(valid.statusCode, HttpStatus.ok);
      expect(valid.body['afterCursor'], 0);
      expect(mismatched.statusCode, HttpStatus.internalServerError);
      expect(mismatched.body['error'], 'delta_cursor_binding_failed');
    });

    test(
      'returns authorized snapshot and minimal unauthenticated health',
      () async {
        _enroll(clientKeys);
        final snapshot = await coordinator.dispatch(
          await _signedRequest(
            'GET',
            connectedSiteSnapshotPath,
            nonce: 'request_nonce_snapshot_0001',
          ),
        );
        final health = await coordinator.dispatch(
          _request('GET', connectedSiteHealthPath),
        );

        expect(snapshot.statusCode, HttpStatus.ok);
        expect(snapshot.body['siteId'], 'site_1');
        expect(health.statusCode, HttpStatus.ok);
        expect(health.body['schema'], 'supermega.connected-site.health.v1');
        expect(health.body, isNot(contains('workspaceId')));
        expect(health.body, isNot(contains('deviceId')));
        expect(health.body, isNot(contains('sharedWritesAvailable')));
        expect(health.body, isNot(contains('internetAvailable')));
        expect(
          (await coordinator.readLocalHealth()).sharedWritesAvailable,
          isTrue,
        );
      },
    );

    test('rejects stale signed requests before command handling', () async {
      _enroll(clientKeys);
      final result = await coordinator.dispatch(
        await _signedJsonRequest(
          'POST',
          connectedSiteCommandsPath,
          (await _command()).toJson(),
          issuedAt: _now.subtract(const Duration(minutes: 3)),
          nonce: 'request_nonce_stale_000001',
        ),
      );
      expect(result.statusCode, HttpStatus.forbidden);
      expect(commands.handled, 0);
      expect(requestNonces.consumed, isEmpty);
    });

    test('signature binds method, target, body and device', () async {
      _enroll(clientKeys);
      Future<void> expectRejected(CoordinatorRequestProof changed) async {
        final ok = await authenticator.verifyAndConsume(changed);
        expect(ok, isFalse);
      }

      final base = await _signedProof(
        method: 'POST',
        target: connectedSiteCommandsPath,
        body: utf8.encode(jsonEncode((await _command()).toJson())),
        nonce: 'request_nonce_binding_0001',
      );
      await expectRejected(_copyProof(base, method: 'GET'));
      await expectRejected(
        _copyProof(base, canonicalTarget: '$connectedSiteCommandsPath?x=1'),
      );
      await expectRejected(_copyProof(base, bodySha256: _digest));
      await expectRejected(_copyProof(base, claimedDeviceId: 'device_2'));
      expect(requestNonces.consumed, isEmpty);
    });

    test(
      'unavailable verified time denies authentication before nonce use',
      () async {
        _enroll(clientKeys);
        final unavailable = Ed25519CoordinatorRequestAuthenticator(
          clients: clientKeys,
          nonces: requestNonces,
          now: () async => throw StateError('trusted_time_unavailable'),
        );
        final proof = await _signedProof(
          method: 'POST',
          target: connectedSiteCommandsPath,
          body: utf8.encode(jsonEncode((await _command()).toJson())),
          nonce: 'request_nonce_time_unavailable_1',
        );

        expect(await unavailable.verifyAndConsume(proof), isFalse);
        expect(requestNonces.consumed, isEmpty);
      },
    );

    test('v1 request-proof signing bytes remain byte-identical', () {
      final proof = CoordinatorRequestProof(
        workspaceId: 'workspace_1',
        siteId: 'site_1',
        coordinatorDeviceId: 'device_counter',
        clientFingerprint: 'a' * 64,
        claimedDeviceId: 'device_1',
        issuedAt: DateTime.utc(2026, 10, 31, 12),
        nonce: 'request_nonce_v1_golden_0001',
        method: 'POST',
        canonicalTarget: connectedSiteCommandsPath,
        bodySha256: 'b' * 64,
        signature: '',
      );

      expect(
        utf8.decode(proof.signingBytes),
        '{"bodySha256":"${'b' * 64}",'
        '"canonicalTarget":"/v1/commands",'
        '"claimedDeviceId":"device_1",'
        '"clientFingerprint":"${'a' * 64}",'
        '"coordinatorDeviceId":"device_counter",'
        '"issuedAt":"2026-10-31T12:00:00.000Z",'
        '"method":"POST",'
        '"nonce":"request_nonce_v1_golden_0001",'
        '"protocolVersion":1,'
        '"siteId":"site_1",'
        '"workspaceId":"workspace_1"}',
      );
    });

    test(
      'rejects unknown routes, methods, query fields and oversized bodies',
      () async {
        expect(
          (await coordinator.dispatch(_request('GET', '/v1/unknown')))
              .statusCode,
          HttpStatus.notFound,
        );
        expect(
          (await coordinator.dispatch(_request('PUT', connectedSiteHealthPath)))
              .statusCode,
          HttpStatus.notFound,
        );
        expect(
          (await coordinator.dispatch(
            _request('GET', '$connectedSiteHealthPath?debug=true'),
          )).statusCode,
          HttpStatus.notFound,
        );
        final small = SiteCoordinatorServer(
          runtimeEnabled: true,
          maxBodyBytes: 4,
          pairing: nonces,
          requestAuthenticator: authenticator,
          commands: commands,
          commandSignatureVerifier: Ed25519SiteCommandSignatureVerifier(
            clients: clientKeys,
            coordinatorDeviceId: 'device_counter',
          ),
          replication: replication,
          health: _Health(),
          pairingResponse: _pairing(),
          now: () => _now,
        );
        expect(
          (await small.dispatch(
            _request(
              'POST',
              connectedSitePairPath,
              body: Uint8List.fromList(utf8.encode('12345')),
            ),
          )).statusCode,
          HttpStatus.requestEntityTooLarge,
        );
      },
    );
  });

  group('offline lease site authorization', () {
    late SimpleKeyPair issuerKey;
    late List<int> issuerPublicKey;

    setUpAll(() async {
      issuerKey = await Ed25519().newKeyPairFromSeed(
        List<int>.generate(32, (index) => 100 + index),
      );
      issuerPublicKey = (await issuerKey.extractPublicKey()).bytes;
    });

    OfflineLeaseCoordinatorSiteAuthorizer authorizer(
      _LeaseSource source, {
      CoordinatorStationReadPolicy stationPolicy =
          const CoordinatorStationReadPolicyUnavailable(),
      FutureOr<int> Function()? nowMillis,
      ShopOfflineStaffLeaseSignatureVerifier? signatureVerifier,
    }) => OfflineLeaseCoordinatorSiteAuthorizer(
      leases: source,
      verifier: ShopOfflineStaffLeaseVerifier(
        signatureVerifier:
            signatureVerifier ??
            PinnedEd25519ShopOfflineStaffLeaseSignatureVerifier(
              publicKeys: {'lease-key-1': issuerPublicKey},
            ),
      ),
      stationReadPolicy: stationPolicy,
      nowMillis: nowMillis ?? () => _now.millisecondsSinceEpoch,
    );

    test('valid capability authorizes read and command', () async {
      final lease = await _signedLease(
        issuerKey,
        capabilities: const ['counterSale', 'managementRead'],
      );
      final source = _LeaseSource(
        CoordinatorLeaseMaterial(
          lease: lease,
          sessionGeneration: 4,
          revocationGeneration: 9,
        ),
      );
      expect(
        await authorizer(source).authorize(
          _authorizationRequest(
            operation: CoordinatorSiteOperation.deltaRead,
            capability: ShopStaffCapability.managementRead,
          ),
        ),
        isTrue,
      );
      expect(
        await authorizer(source).authorize(
          _authorizationRequest(
            operation: CoordinatorSiteOperation.command,
            capability: ShopStaffCapability.counterSale,
            actorId: 'actor_1',
            leaseDigest: lease.payloadDigest,
          ),
        ),
        isTrue,
      );
    });

    test('wrong role, site, revocation and expiry deny', () async {
      final wrongRole = await _signedLease(
        issuerKey,
        role: ShopStaffRole.cafeWaiter.name,
        capabilities: const ['counterSale'],
      );
      final wrongSite = await _signedLease(issuerKey, siteId: 'site_2');
      final revoked = await _signedLease(issuerKey);
      final expired = await _signedLease(
        issuerKey,
        issuedAt: _now.subtract(const Duration(hours: 1)),
        expiresAt: _now,
      );
      for (final material in [
        CoordinatorLeaseMaterial(
          lease: wrongRole,
          sessionGeneration: 4,
          revocationGeneration: 9,
        ),
        CoordinatorLeaseMaterial(
          lease: wrongSite,
          sessionGeneration: 4,
          revocationGeneration: 9,
        ),
        CoordinatorLeaseMaterial(
          lease: revoked,
          sessionGeneration: 4,
          revocationGeneration: 10,
        ),
        CoordinatorLeaseMaterial(
          lease: expired,
          sessionGeneration: 4,
          revocationGeneration: 9,
        ),
      ]) {
        expect(
          await authorizer(_LeaseSource(material)).authorize(
            _authorizationRequest(
              operation: CoordinatorSiteOperation.command,
              capability: ShopStaffCapability.counterSale,
              actorId: 'actor_1',
              leaseDigest: material.lease.payloadDigest,
            ),
          ),
          isFalse,
        );
      }
    });

    test('unavailable verified time denies lease authorization', () async {
      final lease = await _signedLease(
        issuerKey,
        capabilities: const ['counterSale'],
      );
      final source = _LeaseSource(
        CoordinatorLeaseMaterial(
          lease: lease,
          sessionGeneration: 4,
          revocationGeneration: 9,
        ),
      );
      final value = authorizer(
        source,
        nowMillis: () async => throw StateError('trusted_time_unavailable'),
      );

      expect(
        await value.authorize(
          _authorizationRequest(
            operation: CoordinatorSiteOperation.command,
            capability: ShopStaffCapability.counterSale,
            actorId: 'actor_1',
            leaseDigest: lease.payloadDigest,
          ),
        ),
        isFalse,
      );
    });

    test('signature verifier defects are not masked as time denial', () async {
      final lease = await _signedLease(
        issuerKey,
        capabilities: const ['counterSale'],
      );
      final source = _LeaseSource(
        CoordinatorLeaseMaterial(
          lease: lease,
          sessionGeneration: 4,
          revocationGeneration: 9,
        ),
      );
      final value = authorizer(
        source,
        signatureVerifier: const _ThrowingLeaseSignatureVerifier(),
      );

      await expectLater(
        value.authorize(
          _authorizationRequest(
            operation: CoordinatorSiteOperation.command,
            capability: ShopStaffCapability.counterSale,
            actorId: 'actor_1',
            leaseDigest: lease.payloadDigest,
          ),
        ),
        throwsA(
          isA<StateError>().having(
            (error) => error.message,
            'message',
            'signature_verifier_broken',
          ),
        ),
      );
    });

    test(
      'explicit station policy can grant reads but never commands',
      () async {
        final policy = _StationPolicy();
        final value = authorizer(_LeaseSource(null), stationPolicy: policy);
        expect(
          await value.authorize(
            _authorizationRequest(
              operation: CoordinatorSiteOperation.snapshotRead,
              capability: ShopStaffCapability.managementRead,
            ),
          ),
          isTrue,
        );
        expect(
          await value.authorize(
            _authorizationRequest(
              operation: CoordinatorSiteOperation.command,
              capability: ShopStaffCapability.counterSale,
              actorId: 'actor_1',
              leaseDigest: _digest,
            ),
          ),
          isFalse,
        );
      },
    );
  });
}

SiteCoordinatorRequest _request(
  String method,
  String path, {
  Map<String, String> headers = const {},
  Uint8List? body,
}) => SiteCoordinatorRequest(
  method: method,
  path: path,
  headers: headers,
  body: body,
);

SiteCoordinatorRequest _jsonRequest(
  String method,
  String path,
  Map<String, Object?> body, {
  Map<String, String> headers = const {},
}) => _request(
  method,
  path,
  headers: {'content-type': 'application/json; charset=utf-8', ...headers},
  body: Uint8List.fromList(utf8.encode(jsonEncode(body))),
);

Future<SiteCoordinatorRequest> _signedJsonRequest(
  String method,
  String path,
  Map<String, Object?> body, {
  required String nonce,
  DateTime? issuedAt,
  String deviceId = 'device_1',
  int protocolVersion = connectedSiteProtocolVersion,
}) async {
  final bytes = utf8.encode(jsonEncode(body));
  return _signedRequest(
    method,
    path,
    body: bytes,
    nonce: nonce,
    issuedAt: issuedAt,
    deviceId: deviceId,
    protocolVersion: protocolVersion,
    contentType: true,
  );
}

Future<SiteCoordinatorRequest> _signedRequest(
  String method,
  String path, {
  List<int> body = const [],
  required String nonce,
  DateTime? issuedAt,
  String deviceId = 'device_1',
  bool contentType = false,
  int protocolVersion = connectedSiteProtocolVersion,
}) async {
  final proof = await _signedProof(
    method: method,
    target: path,
    body: body,
    nonce: nonce,
    issuedAt: issuedAt,
    deviceId: deviceId,
    protocolVersion: protocolVersion,
  );
  return _request(
    method,
    path,
    headers: {
      if (contentType) 'content-type': 'application/json; charset=utf-8',
      ..._proofHeaders(
        issuedAt: proof.issuedAt,
        nonce: proof.nonce,
        signature: proof.signature,
        deviceId: proof.claimedDeviceId,
      ),
    },
    body: Uint8List.fromList(body),
  );
}

Future<CoordinatorRequestProof> _signedProof({
  required String method,
  required String target,
  required List<int> body,
  required String nonce,
  DateTime? issuedAt,
  String deviceId = 'device_1',
  int protocolVersion = connectedSiteProtocolVersion,
}) async {
  final unsigned = CoordinatorRequestProof(
    workspaceId: 'workspace_1',
    siteId: 'site_1',
    coordinatorDeviceId: 'device_counter',
    clientFingerprint: _fingerprint,
    claimedDeviceId: deviceId,
    issuedAt: issuedAt ?? _now,
    nonce: nonce,
    method: method,
    canonicalTarget: target,
    bodySha256: crypto.sha256.convert(body).toString(),
    signature: '',
    protocolVersion: protocolVersion,
  );
  final signature = await Ed25519().sign(
    unsigned.signingBytes,
    keyPair: _clientKeyPair,
  );
  return _copyProof(
    unsigned,
    signature: base64Url.encode(signature.bytes).replaceAll('=', ''),
  );
}

CoordinatorRequestProof _copyProof(
  CoordinatorRequestProof source, {
  String? claimedDeviceId,
  String? method,
  String? canonicalTarget,
  String? bodySha256,
  String? signature,
  int? protocolVersion,
}) => CoordinatorRequestProof(
  workspaceId: source.workspaceId,
  siteId: source.siteId,
  coordinatorDeviceId: source.coordinatorDeviceId,
  clientFingerprint: source.clientFingerprint,
  claimedDeviceId: claimedDeviceId ?? source.claimedDeviceId,
  issuedAt: source.issuedAt,
  nonce: source.nonce,
  method: method ?? source.method,
  canonicalTarget: canonicalTarget ?? source.canonicalTarget,
  bodySha256: bodySha256 ?? source.bodySha256,
  signature: signature ?? source.signature,
  protocolVersion: protocolVersion ?? source.protocolVersion,
);

Map<String, String> _proofHeaders({
  required DateTime issuedAt,
  required String nonce,
  required String signature,
  String deviceId = 'device_1',
}) => {
  'x-supermega-client-fingerprint': _fingerprint,
  'x-supermega-device-id': deviceId,
  'x-supermega-issued-at': issuedAt.toUtc().toIso8601String(),
  'x-supermega-request-nonce': nonce,
  'x-supermega-request-signature': signature,
};

ConnectedTrustedTimeWireRequestV2 _trustedTimeWire({
  String siteId = 'site_1',
}) => ConnectedTrustedTimeWireRequestV2(
  request: ConnectedTrustedTimeObservationRequestV1(
    approvalDigest: '5' * 64,
    challenge: ConnectedTrustedTimeChallengeV1(
      workspaceId: 'workspace_1',
      siteId: siteId,
      coordinatorDeviceId: 'device_counter',
      clientDeviceId: 'device_1',
      clientFingerprint: _fingerprint,
      sessionGeneration: 1,
      coordinatorBindingDigest: '6' * 64,
      coordinatorBindingGeneration: 1,
      nonce: 'trusted_time_endpoint_nonce_1',
      bootSessionId: '7' * 64,
      startedMonotonicMillis: 5000,
    ),
  ),
);

CoordinatorPairingV1 _pairing({
  String workspaceId = 'workspace_1',
  String issuedAt = '2026-10-31T11:58:00.000Z',
  String expiresAt = '2026-10-31T12:02:00.000Z',
  String certificateSha256 = _digest,
}) => CoordinatorPairingV1(
  workspaceId: workspaceId,
  siteId: 'site_1',
  coordinatorDeviceId: 'device_counter',
  certificateSha256: certificateSha256,
  address: '192.168.10.4',
  port: 9443,
  nonce: 'nonce_abcdefghijklmnopqrstu',
  issuedAt: issuedAt,
  expiresAt: expiresAt,
);

Future<SiteCommandV1> _command({
  String workspaceId = 'workspace_1',
  String siteId = 'site_1',
  String deviceId = 'device_1',
  String signingKeyId = 'device_key_1',
  bool corruptSignature = false,
}) async {
  final payload = <String, Object?>{'productId': 'product_1', 'quantity': 1};
  final unsigned = SiteCommandV1(
    commandId: 'command_1',
    workspaceId: workspaceId,
    siteId: siteId,
    actorId: 'actor_1',
    deviceId: deviceId,
    aggregateType: 'stock',
    aggregateId: 'product_1',
    expectedVersion: 0,
    commandType: 'reserve_stock',
    payload: payload,
    payloadDigest: connectedSiteSha256(payload),
    leaseDigest: _digest,
    issuedAt: '2026-10-31T00:00:00.000Z',
    signingKeyId: signingKeyId,
    signatureAlgorithm: 'ed25519',
    signature: 'A' * 86,
  );
  final signature = await Ed25519().sign(
    utf8.encode(canonicalConnectedSiteJson(unsigned.signingPayload)),
    keyPair: _clientKeyPair,
  );
  return SiteCommandV1(
    commandId: unsigned.commandId,
    workspaceId: unsigned.workspaceId,
    siteId: unsigned.siteId,
    actorId: unsigned.actorId,
    deviceId: unsigned.deviceId,
    aggregateType: unsigned.aggregateType,
    aggregateId: unsigned.aggregateId,
    expectedVersion: unsigned.expectedVersion,
    commandType: unsigned.commandType,
    payload: unsigned.payload,
    payloadDigest: unsigned.payloadDigest,
    leaseDigest: unsigned.leaseDigest,
    issuedAt: unsigned.issuedAt,
    signingKeyId: unsigned.signingKeyId,
    signatureAlgorithm: unsigned.signatureAlgorithm,
    signature: corruptSignature
        ? 'A' * 86
        : base64Url.encode(signature.bytes).replaceAll('=', ''),
  );
}

class _NonceStore implements PairingNonceStore {
  final consumed = <String>{};
  PairingNonceClaim? lastClaim;

  @override
  Future<bool> consumeAndCreatePending(PairingNonceClaim claim) async {
    lastClaim = claim;
    return claim.workspaceId == 'workspace_1' &&
        claim.siteId == 'site_1' &&
        claim.coordinatorDeviceId == 'device_counter' &&
        claim.keyAlgorithm == 'ed25519' &&
        claim.expiresAt == DateTime.utc(2026, 10, 31, 12, 2) &&
        consumed.add(claim.nonce);
  }
}

void _enroll(_ClientKeys store) {
  store.client = EnrolledCoordinatorClientV1(
    workspaceId: 'workspace_1',
    siteId: 'site_1',
    coordinatorDeviceId: 'device_counter',
    deviceId: 'device_1',
    fingerprint: _fingerprint,
    signingKeyId: 'device_key_1',
    publicKey: _clientPublicKey,
    active: true,
  );
}

class _ClientKeys implements CoordinatorClientKeyStore {
  EnrolledCoordinatorClientV1? client;

  @override
  Future<EnrolledCoordinatorClientV1?> find({
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required String deviceId,
    required String fingerprint,
  }) async {
    final value = client;
    if (value == null ||
        value.workspaceId != workspaceId ||
        value.siteId != siteId ||
        value.coordinatorDeviceId != coordinatorDeviceId ||
        value.deviceId != deviceId ||
        value.fingerprint != fingerprint) {
      return null;
    }
    return value;
  }
}

class _RequestNonces implements CoordinatorRequestNonceStore {
  final consumed = <String>{};

  @override
  Future<bool> consume({
    required String clientFingerprint,
    required String nonce,
    required DateTime expiresAt,
  }) async => consumed.add('$clientFingerprint:$nonce');
}

class _Enrollment implements CoordinatorDeviceEnrollmentAuthorizer {
  CoordinatorDeviceEnrollmentState state =
      CoordinatorDeviceEnrollmentState.approved;

  @override
  Future<CoordinatorDeviceEnrollmentState> stateFor({
    required String workspaceId,
    required String siteId,
    required String coordinatorDeviceId,
    required String deviceId,
    required String clientFingerprint,
  }) async => state;
}

class _TimeAuthority implements ConnectedTrustedTimeCoordinatorAuthority {
  _TimeAuthority({this.substituteChallenge = false});

  final bool substituteChallenge;
  int calls = 0;

  @override
  Future<ConnectedTrustedTimeObservationV1> observe(
    ConnectedTrustedTimeObservationRequestV1 request,
  ) async {
    calls += 1;
    final source = request.challenge;
    final challenge = substituteChallenge
        ? ConnectedTrustedTimeChallengeV1(
            workspaceId: source.workspaceId,
            siteId: 'site_2',
            coordinatorDeviceId: source.coordinatorDeviceId,
            clientDeviceId: source.clientDeviceId,
            clientFingerprint: source.clientFingerprint,
            sessionGeneration: source.sessionGeneration,
            coordinatorBindingDigest: source.coordinatorBindingDigest,
            coordinatorBindingGeneration: source.coordinatorBindingGeneration,
            nonce: source.nonce,
            bootSessionId: source.bootSessionId,
            startedMonotonicMillis: source.startedMonotonicMillis,
          )
        : source;
    return ConnectedTrustedTimeObservationV1(
      challenge: challenge,
      authorityKeyId: 'trusted_time_key_1',
      authorityKeyFingerprint: '8' * 64,
      authorityKeyGeneration: 1,
      authorityEpoch: 1,
      authoritySequence: 1,
      observedAtMillis: 1800000000000,
      validUntilMillis: 1800000060000,
      authoritySignature: 'A' * 86,
    );
  }
}

class _SiteAuthorization implements CoordinatorSiteAuthorizer {
  bool allowed = true;
  int calls = 0;
  void Function()? onAuthorize;

  @override
  Future<bool> authorize(CoordinatorSiteAuthorizationRequest request) async {
    calls += 1;
    onAuthorize?.call();
    return allowed;
  }
}

class _WriteAvailability implements CoordinatorSharedWriteAvailability {
  bool available = false;
  int active = 0;

  @override
  bool get sharedWritesAvailable => available;

  @override
  bool tryBeginSharedWrite() {
    if (!available) return false;
    active += 1;
    return true;
  }

  @override
  void endSharedWrite() {
    if (active <= 0) throw StateError('write_not_started');
    active -= 1;
  }
}

class _Capabilities implements SiteCommandCapabilityResolver {
  @override
  ShopStaffCapability? requiredCapability(SiteCommandV1 command) =>
      ShopStaffCapability.counterSale;
}

class _Commands implements SiteCommandHandler {
  var handled = 0;
  var bindCorrectly = true;
  Completer<void>? barrier;

  @override
  Future<SiteCommandAckV1> handle(
    String clientFingerprint,
    SiteCommandV1 command,
  ) async {
    handled += 1;
    await barrier?.future;
    return SiteCommandAckV1(
      commandId: command.commandId,
      commandDigest: bindCorrectly ? command.commandDigest : _digest,
      state: SiteCommandAckState.accepted,
      canonicalVersion: command.expectedVersion + 1,
      eventDigest: _eventDigest,
    );
  }
}

class _Replication implements SiteReplicationReader {
  var returnWrongCursor = false;

  @override
  Future<SiteDeltaV1> readDelta(
    String clientFingerprint,
    int afterCursor,
  ) async {
    final resultAfter = returnWrongCursor ? afterCursor + 1 : afterCursor;
    return SiteDeltaV1(
      workspaceId: 'workspace_1',
      siteId: 'site_1',
      afterCursor: resultAfter,
      nextCursor: resultAfter,
      events: const [],
    );
  }

  @override
  Future<SiteSnapshotV1> readSnapshot(String clientFingerprint) async {
    final unsigned = <String, Object?>{
      'protocolVersion': connectedSiteProtocolVersion,
      'workspaceId': 'workspace_1',
      'siteId': 'site_1',
      'version': 1,
      'continuationCursor': 0,
      'projections': const <String, Object?>{},
    };
    return SiteSnapshotV1(
      workspaceId: 'workspace_1',
      siteId: 'site_1',
      version: 1,
      continuationCursor: 0,
      projections: const {},
      checkpointDigest: connectedSiteSha256(unsigned),
    );
  }
}

class _Health implements CoordinatorHealthProvider {
  @override
  Future<CoordinatorHealthV1> readHealth() async => const CoordinatorHealthV1(
    sharedWritesAvailable: true,
    internetAvailable: false,
    cloudSyncHealthy: false,
    backupCurrent: true,
    pendingConflictCount: 0,
  );
}

CoordinatorSiteAuthorizationRequest _authorizationRequest({
  required CoordinatorSiteOperation operation,
  required ShopStaffCapability capability,
  String? actorId,
  String? leaseDigest,
}) => CoordinatorSiteAuthorizationRequest(
  workspaceId: 'workspace_1',
  siteId: 'site_1',
  coordinatorDeviceId: 'device_counter',
  deviceId: 'device_1',
  clientFingerprint: _fingerprint,
  operation: operation,
  requiredCapability: capability,
  actorId: actorId,
  leaseDigest: leaseDigest,
);

Future<OfflineStaffLeaseV1> _signedLease(
  SimpleKeyPair issuerKey, {
  String siteId = 'site_1',
  String role = 'owner',
  List<String> capabilities = const ['counterSale'],
  DateTime? issuedAt,
  DateTime? expiresAt,
}) async {
  final issued = issuedAt ?? _now.subtract(const Duration(hours: 1));
  final expires = expiresAt ?? _now.add(const Duration(hours: 1));
  final unsigned = <String, Object>{
    'protocolVersion': connectedSiteProtocolVersion,
    'leaseId': 'lease_1',
    'workspaceId': 'workspace_1',
    'siteId': siteId,
    'actorId': 'actor_1',
    'role': role,
    'capabilities': capabilities,
    'deviceId': 'device_1',
    'sessionGeneration': 4,
    'revocationGeneration': 9,
    'issuedAt': issued.toUtc().toIso8601String(),
    'expiresAt': expires.toUtc().toIso8601String(),
    'issuerKeyId': 'lease-key-1',
  };
  final digest = connectedSiteSha256(unsigned);
  final signature = await Ed25519().sign(
    utf8.encode(canonicalConnectedSiteJson(unsigned)),
    keyPair: issuerKey,
  );
  return OfflineStaffLeaseV1(
    leaseId: 'lease_1',
    workspaceId: 'workspace_1',
    siteId: siteId,
    actorId: 'actor_1',
    role: role,
    capabilities: capabilities,
    deviceId: 'device_1',
    sessionGeneration: 4,
    revocationGeneration: 9,
    issuedAt: issued.toUtc().toIso8601String(),
    expiresAt: expires.toUtc().toIso8601String(),
    issuerKeyId: 'lease-key-1',
    payloadDigest: digest,
    signature: base64Url.encode(signature.bytes).replaceAll('=', ''),
  );
}

class _LeaseSource implements CoordinatorLeaseSource {
  _LeaseSource(this.material);

  final CoordinatorLeaseMaterial? material;

  @override
  Future<CoordinatorLeaseMaterial?> find({
    required String workspaceId,
    required String siteId,
    required String deviceId,
    String? leaseDigest,
  }) async {
    final value = material;
    if (value == null ||
        (leaseDigest != null && value.lease.payloadDigest != leaseDigest)) {
      return null;
    }
    return value;
  }
}

class _ThrowingLeaseSignatureVerifier
    implements ShopOfflineStaffLeaseSignatureVerifier {
  const _ThrowingLeaseSignatureVerifier();

  @override
  Future<bool> verify({
    required String keyId,
    required List<int> message,
    required String signature,
  }) => throw StateError('signature_verifier_broken');
}

class _StationPolicy implements CoordinatorStationReadPolicy {
  @override
  Future<bool> allows(CoordinatorSiteAuthorizationRequest request) async =>
      request.operation != CoordinatorSiteOperation.command &&
      request.deviceId == 'device_1' &&
      request.siteId == 'site_1';
}

class _TlsFixture {
  const _TlsFixture({
    required this.directory,
    required this.certificatePem,
    required this.privateKeyPem,
  });

  final Directory directory;
  final String certificatePem;
  final String privateKeyPem;
}

/// Creates a fresh self-signed identity for this process. Keeping private key
/// bytes out of source control prevents a test fixture from being mistaken for
/// a reusable credential while still exercising the platform TLS parser.
Future<_TlsFixture> _createEphemeralTlsFixture() async {
  final directory = await Directory.systemTemp.createTemp(
    'supermega-coordinator-tls-',
  );
  final certificate = File('${directory.path}/certificate.pem');
  final privateKey = File('${directory.path}/private-key.pem');
  final result = await Process.run('openssl', <String>[
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    privateKey.path,
    '-out',
    certificate.path,
    '-subj',
    '/CN=supermega-test.invalid',
    '-days',
    '1',
  ]);
  if (result.exitCode != 0) {
    await directory.delete(recursive: true);
    throw StateError('openssl_test_identity_failed:${result.exitCode}');
  }
  return _TlsFixture(
    directory: directory,
    certificatePem: await certificate.readAsString(),
    privateKeyPem: await privateKey.readAsString(),
  );
}
